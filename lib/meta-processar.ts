// Processamento de leads da Meta (Lead Ads) — server-side exclusivo.
//
// Fluxo (docs/planejamento/contrato-tecnico-meta-leads.md, "Processamento de
// um lead da Meta"):
//   gravarEventos()      → grava avisos em meta_eventos (idempotente por leadgen_id)
//   processarEvento(id)  → reivindica o evento de forma atômica, lê o lead na
//                          Graph API, roteia para a equipe, chama
//                          criar_e_distribuir_lead e atualiza o evento
//   processarPendentes() → reprocessa eventos recebido/erro vencidos (cron)
//
// Regras:
//   - Nunca registrar em log nome, telefone ou e-mail do lead.
//   - ultimo_erro guarda só códigos técnicos.
//   - Nenhuma função exportada lança exceção para o chamador em caso de falha
//     de processamento: o resultado descreve o que aconteceu.

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { funcaoAusente } from "@/lib/rpc";
import { normalizarTelefone, telefoneValido } from "@/lib/telefone";
import { notificarCorretorNovoLead } from "@/lib/email";
import { enviarAlerta } from "@/lib/alertas";
import {
  MetaApiErro,
  buscarLead,
  calcularProximaTentativa,
  mapearCamposLead,
  normalizarDataMeta,
  obterConfigMeta,
  origemDaPlataforma,
  type LeadMeta,
} from "@/lib/meta";

export type AdminClient = ReturnType<typeof createSupabaseAdmin>;

// Tempo que um evento fica "processando" antes de poder ser reivindicado de
// novo (proteção contra função encerrada no meio do processamento).
const LEASE_MS = 3 * 60 * 1000;
// Tempo mínimo restante para começar a processar um evento.
const TEMPO_MINIMO_MS = 2500;
const TIMEOUT_GRAPH_MAX_MS = 6000;

const COLUNAS_EVENTO =
  "id, imobiliaria_id, page_id, form_id, leadgen_id, ad_id, adgroup_id, status, tentativas, origem";

interface EventoRow {
  id: string;
  imobiliaria_id: string | null;
  page_id: string | null;
  form_id: string | null;
  leadgen_id: string | null;
  ad_id: string | null;
  adgroup_id: string | null;
  status: string;
  tentativas: number | null;
  origem: string | null;
}

export type ResultadoEvento =
  | {
      status: "processado";
      lead_id: string | null;
      distribuido: boolean;
      aviso: string | null;
    }
  | { status: "duplicado"; lead_id: string | null }
  | { status: "ignorado"; motivo: string }
  | {
      status: "erro";
      erro: string;
      retentar: boolean;
      proxima_tentativa_em: string | null;
    }
  | {
      status: "nao_processado";
      motivo:
        | "nao_encontrado"
        | "em_andamento_ou_finalizado"
        | "migration_pendente"
        | "sem_tempo"
        | "falha_banco";
    };

interface Falha {
  codigo: string;
  retentar: boolean;
  alerta?: { assunto: string; texto: string };
}

// ─────────────────────────────────────────────────────────────────────
// Gravação de eventos (webhook e reconciliação)
// ─────────────────────────────────────────────────────────────────────

export interface NovoEventoMeta {
  leadgen_id: string;
  page_id: string;
  form_id: string | null;
  ad_id: string | null;
  adgroup_id: string | null;
  origem: "webhook" | "reconciliacao" | "manual";
  payload: Record<string, unknown>;
}

export type ResultadoGravacao =
  | { ok: true; novos: { id: string; leadgen_id: string }[] }
  | { ok: false; migration_pendente: boolean };

const TAMANHO_LOTE = 200;

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) {
    lotes.push(lista.slice(i, i + tamanho));
  }
  return lotes;
}

/**
 * Grava eventos em meta_eventos, ignorando leadgen_id que já existem.
 * Devolve só os eventos efetivamente inseridos. Falha de banco → ok:false
 * (o webhook responde 500 para a Meta reenviar).
 */
export async function gravarEventos(
  admin: AdminClient,
  eventos: NovoEventoMeta[]
): Promise<ResultadoGravacao> {
  if (eventos.length === 0) return { ok: true, novos: [] };

  // imobiliaria_id resolvido pela Página cadastrada (pode ficar null).
  const pageIds = Array.from(new Set(eventos.map((e) => e.page_id)));
  const imobPorPagina = new Map<string, string>();
  for (const lote of emLotes(pageIds, TAMANHO_LOTE)) {
    const { data, error } = await admin
      .from("integracoes_meta")
      .select("page_id, imobiliaria_id")
      .in("page_id", lote);
    if (error) {
      console.error("[meta] gravarEventos: leitura integracoes_meta:", error.code, error.message);
      return { ok: false, migration_pendente: funcaoAusente(error) };
    }
    for (const row of (data ?? []) as { page_id: string; imobiliaria_id: string }[]) {
      imobPorPagina.set(String(row.page_id), String(row.imobiliaria_id));
    }
  }

  const linhas = eventos.map((e) => ({
    leadgen_id: e.leadgen_id,
    page_id: e.page_id,
    form_id: e.form_id,
    ad_id: e.ad_id,
    adgroup_id: e.adgroup_id,
    origem: e.origem,
    payload: e.payload,
    imobiliaria_id: imobPorPagina.get(e.page_id) ?? null,
    status: "recebido",
  }));

  const novos: { id: string; leadgen_id: string }[] = [];

  for (const lote of emLotes(linhas, 500)) {
    const { data, error } = await admin
      .from("meta_eventos")
      .upsert(lote, { onConflict: "leadgen_id", ignoreDuplicates: true })
      .select("id, leadgen_id");

    if (!error) {
      for (const row of (data ?? []) as { id: string; leadgen_id: string }[]) {
        novos.push({ id: String(row.id), leadgen_id: String(row.leadgen_id) });
      }
      continue;
    }

    // 42P10: o índice único de leadgen_id é parcial (WHERE leadgen_id IS NOT
    // NULL) e o ON CONFLICT gerado pelo PostgREST não o reconhece. Alternativa:
    // consulta os existentes e insere o restante, tolerando corrida (23505).
    if (error.code !== "42P10") {
      console.error("[meta] gravarEventos: upsert meta_eventos:", error.code, error.message);
      return { ok: false, migration_pendente: funcaoAusente(error) };
    }

    const existentes = new Set<string>();
    for (const sub of emLotes(lote, TAMANHO_LOTE)) {
      const { data: ex, error: exErro } = await admin
        .from("meta_eventos")
        .select("leadgen_id")
        .in("leadgen_id", sub.map((l) => l.leadgen_id));
      if (exErro) {
        console.error("[meta] gravarEventos: leitura meta_eventos:", exErro.code, exErro.message);
        return { ok: false, migration_pendente: funcaoAusente(exErro) };
      }
      for (const row of (ex ?? []) as { leadgen_id: string }[]) {
        existentes.add(String(row.leadgen_id));
      }
    }

    const faltantes = lote.filter((l) => !existentes.has(l.leadgen_id));
    if (faltantes.length === 0) continue;

    const { data: ins, error: insErro } = await admin
      .from("meta_eventos")
      .insert(faltantes)
      .select("id, leadgen_id");

    if (!insErro) {
      for (const row of (ins ?? []) as { id: string; leadgen_id: string }[]) {
        novos.push({ id: String(row.id), leadgen_id: String(row.leadgen_id) });
      }
      continue;
    }
    if (insErro.code !== "23505") {
      console.error("[meta] gravarEventos: insert meta_eventos:", insErro.code, insErro.message);
      return { ok: false, migration_pendente: funcaoAusente(insErro) };
    }
    // Corrida com outra entrega do mesmo aviso: insere um a um.
    for (const linha of faltantes) {
      const { data: um, error: umErro } = await admin
        .from("meta_eventos")
        .insert(linha)
        .select("id, leadgen_id")
        .maybeSingle();
      if (umErro) {
        if (umErro.code === "23505") continue;
        console.error("[meta] gravarEventos: insert unitário:", umErro.code, umErro.message);
        return { ok: false, migration_pendente: funcaoAusente(umErro) };
      }
      if (um) novos.push({ id: String(um.id), leadgen_id: String(um.leadgen_id) });
    }
  }

  return { ok: true, novos };
}

// ─────────────────────────────────────────────────────────────────────
// Processamento de um evento
// ─────────────────────────────────────────────────────────────────────

interface RpcLeadV4 {
  id: string;
  equipe_id: string | null;
  corretor_id: string | null;
  corretor_nome?: string | null;
}

interface RpcResultado {
  status?: string;
  distribuido?: boolean;
  motivo?: string | null;
  lead?: RpcLeadV4;
  lead_id?: string;
  lead_existente?: { id?: string };
}

function textoErro(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : "erro_desconhecido";
}

async function finalizarComFalha(
  admin: AdminClient,
  ev: EventoRow,
  tentativa: number,
  falha: Falha,
  imobiliariaId: string | null
): Promise<ResultadoEvento> {
  const agora = new Date();
  const proxima = falha.retentar ? calcularProximaTentativa(tentativa, agora) : null;
  const esgotou = falha.retentar && proxima === null;

  const atualizacao: Record<string, unknown> = {
    status: "erro",
    tentativas: tentativa,
    proxima_tentativa_em: proxima ? proxima.toISOString() : null,
    ultimo_erro: falha.codigo.slice(0, 300),
  };
  if (imobiliariaId) atualizacao.imobiliaria_id = imobiliariaId;

  const { error } = await admin.from("meta_eventos").update(atualizacao).eq("id", ev.id);
  if (error) {
    console.error("[meta] falha ao registrar erro do evento:", ev.id, error.code);
  }

  if (imobiliariaId && ev.page_id) {
    await admin
      .from("integracoes_meta")
      .update({ ultimo_erro: falha.codigo.slice(0, 300), ultimo_erro_em: agora.toISOString() })
      .eq("page_id", ev.page_id)
      .eq("imobiliaria_id", imobiliariaId);
  }

  console.warn(
    `[meta] evento ${ev.id} erro=${falha.codigo} tentativa=${tentativa} retentar=${falha.retentar && !esgotou}`
  );

  if (falha.alerta) {
    await enviarAlerta(falha.alerta.assunto, falha.alerta.texto);
  }
  if (esgotou) {
    await enviarAlerta(
      "Evento da Meta esgotou as tentativas",
      `O evento ${ev.id} (Página ${ev.page_id ?? "?"}, formulário ${ev.form_id ?? "?"}) ` +
        `falhou ${tentativa} vezes e não será mais tentado automaticamente. ` +
        `Último erro: ${falha.codigo}. Corrija a causa e use "Reprocessar" em /integracoes.`
    );
  }

  return {
    status: "erro",
    erro: falha.codigo,
    retentar: falha.retentar && !esgotou,
    proxima_tentativa_em: proxima ? proxima.toISOString() : null,
  };
}

async function finalizarComSucesso(
  admin: AdminClient,
  ev: EventoRow,
  tentativa: number,
  status: "processado" | "duplicado" | "ignorado",
  campos: {
    lead_id?: string | null;
    imobiliaria_id?: string | null;
    form_id?: string | null;
    ad_id?: string | null;
    observacao?: string | null;
  }
): Promise<boolean> {
  const agora = new Date().toISOString();
  const atualizacao: Record<string, unknown> = {
    status,
    tentativas: tentativa,
    proxima_tentativa_em: null,
    ultimo_erro: campos.observacao ? campos.observacao.slice(0, 300) : null,
    processado_em: agora,
  };
  if (campos.lead_id) atualizacao.lead_id = campos.lead_id;
  if (campos.imobiliaria_id) atualizacao.imobiliaria_id = campos.imobiliaria_id;
  if (campos.form_id && !ev.form_id) atualizacao.form_id = campos.form_id;
  if (campos.ad_id && !ev.ad_id) atualizacao.ad_id = campos.ad_id;

  const { error } = await admin.from("meta_eventos").update(atualizacao).eq("id", ev.id);
  if (error) {
    // O lead já foi criado; o evento fica "processando" até o lease vencer e
    // será reivindicado de novo — a RPC v4 devolve ja_processado (idempotente).
    console.error("[meta] falha ao finalizar evento:", ev.id, error.code);
    return false;
  }

  if (campos.imobiliaria_id && ev.page_id && status !== "ignorado") {
    await admin
      .from("integracoes_meta")
      .update({ ultimo_evento_em: agora })
      .eq("page_id", ev.page_id)
      .eq("imobiliaria_id", campos.imobiliaria_id);
  }
  return true;
}

async function notificarCorretor(
  admin: AdminClient,
  corretorId: string,
  imobiliariaId: string
): Promise<void> {
  try {
    const { data } = await admin
      .from("corretores")
      .select("email")
      .eq("id", corretorId)
      .eq("imobiliaria_id", imobiliariaId)
      .maybeSingle();
    const email = typeof data?.email === "string" ? data.email.trim() : "";
    if (email && email.includes("@")) {
      await notificarCorretorNovoLead(email);
    }
  } catch (err) {
    console.error("[meta] notificação do corretor falhou:", textoErro(err));
  }
}

/** Notifica os corretores de uma lista de atribuições (usado pelo cron). */
export async function notificarAtribuicoes(
  admin: AdminClient,
  imobiliariaId: string,
  corretorIds: string[]
): Promise<void> {
  for (const id of corretorIds) {
    await notificarCorretor(admin, id, imobiliariaId);
  }
}

function alertaGraph(err: MetaApiErro, ev: EventoRow): Falha["alerta"] {
  if (err.tipo === "token") {
    return {
      assunto: "Token de acesso da Meta inválido ou expirado",
      texto:
        `A Graph API recusou o META_ACCESS_TOKEN (${err.codigoCurto()}). ` +
        `Os leads da Meta não estão sendo lidos. Gere um novo token de Usuário do Sistema ` +
        `com a permissão leads_retrieval, atualize a variável na Vercel e faça um novo deploy. ` +
        `Os eventos pendentes serão tentados de novo automaticamente.`,
    };
  }
  if (err.tipo === "permissao") {
    return {
      assunto: "Sem permissão para ler leads da Meta",
      texto:
        `A Graph API negou a leitura do lead do evento ${ev.id} (Página ${ev.page_id ?? "?"}): ` +
        `${err.codigoCurto()}. Verifique se o token tem leads_retrieval e acesso à Página ` +
        `(Central de Negócios → Usuários do sistema → Ativos).`,
    };
  }
  if (err.tipo === "permanente") {
    return {
      assunto: "Lead da Meta não pôde ser lido",
      texto:
        `A Graph API recusou a leitura do lead do evento ${ev.id} (Página ${ev.page_id ?? "?"}, ` +
        `formulário ${ev.form_id ?? "?"}): ${err.codigoCurto()}. O evento não será tentado de novo ` +
        `automaticamente; use "Reprocessar" em /integracoes depois de corrigir.`,
    };
  }
  return undefined;
}

/**
 * Processa um evento de meta_eventos. Reivindica o evento de forma atômica
 * (UPDATE ... WHERE status IN ('recebido','erro') ou lease vencido), então
 * duas execuções concorrentes nunca processam o mesmo evento ao mesmo tempo.
 */
export async function processarEvento(
  eventoId: string,
  opcoes: { admin?: AdminClient; prazoFinal?: number } = {}
): Promise<ResultadoEvento> {
  const prazoFinal = opcoes.prazoFinal ?? Date.now() + 8000;
  if (prazoFinal - Date.now() < TEMPO_MINIMO_MS) {
    return { status: "nao_processado", motivo: "sem_tempo" };
  }

  let admin: AdminClient;
  try {
    admin = opcoes.admin ?? createSupabaseAdmin();
  } catch {
    return { status: "nao_processado", motivo: "falha_banco" };
  }

  // 1. Ler o evento
  const { data: lido, error: erroLeitura } = await admin
    .from("meta_eventos")
    .select(COLUNAS_EVENTO)
    .eq("id", eventoId)
    .maybeSingle();

  if (erroLeitura) {
    if (funcaoAusente(erroLeitura)) {
      return { status: "nao_processado", motivo: "migration_pendente" };
    }
    console.error("[meta] leitura do evento:", eventoId, erroLeitura.code);
    return { status: "nao_processado", motivo: "falha_banco" };
  }
  if (!lido) return { status: "nao_processado", motivo: "nao_encontrado" };

  const ev = lido as EventoRow;
  if (!["recebido", "erro", "processando"].includes(ev.status)) {
    return { status: "nao_processado", motivo: "em_andamento_ou_finalizado" };
  }

  // 2. Reivindicar de forma atômica
  const agoraIso = new Date().toISOString();
  const { data: reivindicado, error: erroClaim } = await admin
    .from("meta_eventos")
    .update({
      status: "processando",
      proxima_tentativa_em: new Date(Date.now() + LEASE_MS).toISOString(),
    })
    .eq("id", ev.id)
    .or(
      `status.in.(recebido,erro),and(status.eq.processando,or(proxima_tentativa_em.is.null,proxima_tentativa_em.lt."${agoraIso}"))`
    )
    .select("id");

  if (erroClaim) {
    console.error("[meta] reivindicação do evento:", ev.id, erroClaim.code);
    return {
      status: "nao_processado",
      motivo: funcaoAusente(erroClaim) ? "migration_pendente" : "falha_banco",
    };
  }
  if (!reivindicado || reivindicado.length === 0) {
    return { status: "nao_processado", motivo: "em_andamento_ou_finalizado" };
  }

  const tentativa = (Number(ev.tentativas) || 0) + 1;

  try {
    return await executarProcessamento(admin, ev, tentativa, prazoFinal);
  } catch (err) {
    console.error("[meta] erro inesperado no evento:", ev.id, textoErro(err));
    return finalizarComFalha(
      admin,
      ev,
      tentativa,
      { codigo: "erro_inesperado", retentar: true },
      ev.imobiliaria_id
    );
  }
}

async function executarProcessamento(
  admin: AdminClient,
  ev: EventoRow,
  tentativa: number,
  prazoFinal: number
): Promise<ResultadoEvento> {
  if (!ev.page_id || !ev.leadgen_id) {
    return finalizarComFalha(admin, ev, tentativa, { codigo: "evento_invalido", retentar: false }, null);
  }

  // 3. Imobiliária pela Página cadastrada
  const { data: integracao, error: erroInteg } = await admin
    .from("integracoes_meta")
    .select("id, imobiliaria_id, ativo")
    .eq("page_id", ev.page_id)
    .maybeSingle();

  if (erroInteg) {
    return finalizarComFalha(
      admin,
      ev,
      tentativa,
      { codigo: `banco:integracoes_meta:${erroInteg.code ?? "?"}`, retentar: true },
      null
    );
  }
  if (!integracao) {
    return finalizarComFalha(
      admin,
      ev,
      tentativa,
      {
        codigo: "pagina_nao_cadastrada",
        retentar: true,
        alerta: {
          assunto: "Lead da Meta de Página não cadastrada",
          texto:
            `Chegou um lead da Página ${ev.page_id} (evento ${ev.id}), mas ela não está vinculada ` +
            `a nenhuma imobiliária. Cadastre a Página em /integracoes; o evento será tentado de novo ` +
            `automaticamente.`,
        },
      },
      null
    );
  }

  const imobId = String(integracao.imobiliaria_id);

  if (integracao.ativo === false) {
    await finalizarComSucesso(admin, ev, tentativa, "ignorado", {
      imobiliaria_id: imobId,
      observacao: "pagina_inativa",
    });
    return { status: "ignorado", motivo: "pagina_inativa" };
  }

  // Imobiliária desativada (coluna da migration 008; tolerante a ausência).
  const { data: imob, error: erroImob } = await admin
    .from("imobiliarias")
    .select("ativo")
    .eq("id", imobId)
    .maybeSingle();
  if (!erroImob && imob && imob.ativo === false) {
    await finalizarComSucesso(admin, ev, tentativa, "ignorado", {
      imobiliaria_id: imobId,
      observacao: "imobiliaria_inativa",
    });
    return { status: "ignorado", motivo: "imobiliaria_inativa" };
  }

  // 4. Credenciais
  const config = obterConfigMeta();
  if (!config.accessToken || !config.appSecret) {
    return finalizarComFalha(
      admin,
      ev,
      tentativa,
      {
        codigo: "meta_nao_configurada",
        retentar: true,
        alerta: {
          assunto: "Integração Meta sem credenciais",
          texto:
            "META_ACCESS_TOKEN ou META_APP_SECRET não estão configurados no servidor. " +
            "Os leads da Meta estão sendo recebidos, mas não podem ser lidos.",
        },
      },
      imobId
    );
  }

  // 5. Ler o lead na Graph API
  let lead: LeadMeta;
  try {
    const restante = prazoFinal - Date.now() - 1500;
    lead = await buscarLead(ev.leadgen_id, config, {
      timeoutMs: Math.max(1500, Math.min(TIMEOUT_GRAPH_MAX_MS, restante)),
    });
  } catch (err) {
    if (err instanceof MetaApiErro) {
      return finalizarComFalha(
        admin,
        ev,
        tentativa,
        {
          codigo: err.codigoCurto(),
          retentar: err.tipo !== "permanente",
          alerta: alertaGraph(err, ev),
        },
        imobId
      );
    }
    return finalizarComFalha(
      admin,
      ev,
      tentativa,
      { codigo: "graph_erro_inesperado", retentar: true },
      imobId
    );
  }

  // 6. Mapear field_data
  const dados = mapearCamposLead(lead.field_data);
  const formId = lead.form_id ?? ev.form_id;
  const telefoneNormalizado = dados.telefoneBruto ? normalizarTelefone(dados.telefoneBruto) : "";

  if (!dados.telefoneBruto || !telefoneValido(telefoneNormalizado)) {
    return finalizarComFalha(
      admin,
      ev,
      tentativa,
      {
        codigo: "sem_telefone",
        retentar: false,
        alerta: {
          assunto: "Lead da Meta sem telefone válido",
          texto:
            `O lead do evento ${ev.id} (Página ${ev.page_id}, formulário ${formId ?? "?"}) ` +
            `chegou sem telefone válido e não foi cadastrado. Confira se o formulário pede ` +
            `o número de telefone.`,
        },
      },
      imobId
    );
  }

  // 7. Roteamento: (page_id, form_id) → regra padrão da Página → rodízio
  const { data: regras, error: erroRegras } = await admin
    .from("meta_roteamento")
    .select("id, form_id, equipe_id")
    .eq("imobiliaria_id", imobId)
    .eq("page_id", ev.page_id)
    .eq("ativo", true);

  if (erroRegras) {
    return finalizarComFalha(
      admin,
      ev,
      tentativa,
      { codigo: `banco:meta_roteamento:${erroRegras.code ?? "?"}`, retentar: true },
      imobId
    );
  }

  const listaRegras = (regras ?? []) as { id: string; form_id: string | null; equipe_id: string }[];
  const regraExata = formId ? listaRegras.find((r) => r.form_id === formId) : undefined;
  const regraPadrao = listaRegras.find((r) => r.form_id === null);
  let equipeId: string | null = (regraExata ?? regraPadrao)?.equipe_id ?? null;
  let aviso: string | null = null;

  if (equipeId) {
    const { data: equipe } = await admin
      .from("equipes")
      .select("id, ativo")
      .eq("id", equipeId)
      .eq("imobiliaria_id", imobId)
      .maybeSingle();
    if (!equipe || equipe.ativo === false) {
      aviso = "equipe_roteada_inativa";
      await enviarAlerta(
        "Equipe do formulário da Meta está inativa",
        `O vínculo da Página ${ev.page_id} (formulário ${formId ?? "padrão"}) aponta para a equipe ` +
          `${equipeId}, que não está ativa. O lead do evento ${ev.id} foi para o rodízio entre equipes. ` +
          `Atualize o vínculo em /integracoes.`
      );
      equipeId = null;
    }
  } else {
    aviso = "formulario_sem_equipe";
    await enviarAlerta(
      "Formulário da Meta sem equipe definida",
      `O formulário ${formId ?? "?"} da Página ${ev.page_id} não tem equipe vinculada (nem regra padrão ` +
        `da Página). O lead do evento ${ev.id} foi para o rodízio entre equipes. Defina a equipe em /integracoes.`
    );
  }

  // 8. Criar e distribuir
  const { origem, plataforma } = origemDaPlataforma(lead.platform);
  const payloadBase: Record<string, unknown> = {
    imobiliaria_id: imobId,
    nome: dados.nome ?? "Lead sem nome (Meta)",
    telefone: dados.telefoneBruto,
    telefone_normalizado: telefoneNormalizado,
    origem,
    corretor_id: null,
    captador_id: null,
    interesse: dados.interesse,
    faixa_valor: dados.faixaValor,
    observacoes: dados.resumo,
    criado_por: "webhook",
    email: dados.email,
    canal: "meta_lead_ads",
    plataforma,
    meta_leadgen_id: lead.id,
    meta_page_id: ev.page_id,
    meta_form_id: formId,
    meta_ad_id: lead.ad_id ?? ev.ad_id,
    meta_adset_id: lead.adset_id ?? ev.adgroup_id,
    meta_campaign_id: lead.campaign_id,
    meta_ad_nome: lead.ad_name,
    meta_campanha_nome: lead.campaign_name,
    meta_criado_em: normalizarDataMeta(lead.created_time),
    respostas_formulario: dados.respostas.length > 0 ? dados.respostas : null,
    consentimentos:
      lead.custom_disclaimer_responses.length > 0 ? lead.custom_disclaimer_responses : null,
  };

  let rpc = await admin.rpc("criar_e_distribuir_lead", {
    p: { ...payloadBase, equipe_id: equipeId },
  });

  if (rpc.error && equipeId && rpc.error.message.includes("equipe_nao_pertence_imobiliaria")) {
    aviso = "equipe_roteada_inativa";
    await enviarAlerta(
      "Equipe do formulário da Meta está inativa",
      `A equipe ${equipeId} vinculada à Página ${ev.page_id} (formulário ${formId ?? "padrão"}) foi ` +
        `recusada na criação do lead do evento ${ev.id}. O lead foi para o rodízio entre equipes.`
    );
    equipeId = null;
    rpc = await admin.rpc("criar_e_distribuir_lead", { p: { ...payloadBase, equipe_id: null } });
  }

  if (rpc.error) {
    const e = rpc.error;
    if (funcaoAusente(e)) {
      return finalizarComFalha(admin, ev, tentativa, { codigo: "migration_pendente", retentar: true }, imobId);
    }
    if (e.message.includes("sem_equipe_disponivel")) {
      return finalizarComFalha(
        admin,
        ev,
        tentativa,
        {
          codigo: "sem_equipe_disponivel",
          retentar: true,
          alerta: {
            assunto: "Nenhuma equipe ativa para receber leads da Meta",
            texto:
              `O lead do evento ${ev.id} (Página ${ev.page_id}) não pôde ser criado porque a ` +
              `imobiliária ${imobId} não tem equipe ativa. O evento será tentado de novo.`,
          },
        },
        imobId
      );
    }
    // Erros de validação da v4: indicam bug no payload, não adianta repetir.
    const permanente = ["imobiliaria_obrigatoria", "canal_invalido", "criado_por_invalido"].find(
      (codigo) => e.message.includes(codigo)
    );
    if (permanente) {
      console.error("[meta] RPC recusou o payload:", ev.id, permanente);
      return finalizarComFalha(
        admin,
        ev,
        tentativa,
        {
          codigo: `rpc:${permanente}`,
          retentar: false,
          alerta: {
            assunto: "Lead da Meta recusado pela função de criação",
            texto:
              `criar_e_distribuir_lead recusou o lead do evento ${ev.id} com ${permanente}. ` +
              `Verifique a versão da migration 011 e do app; depois use "Reprocessar" em /integracoes.`,
          },
        },
        imobId
      );
    }
    console.error("[meta] RPC criar_e_distribuir_lead:", ev.id, e.code, e.message);
    return finalizarComFalha(
      admin,
      ev,
      tentativa,
      { codigo: `rpc_erro:${e.code ?? "?"}`, retentar: true },
      imobId
    );
  }

  const resultado = (rpc.data ?? {}) as RpcResultado;

  if (resultado.status === "ja_processado") {
    const leadId = resultado.lead_id ? String(resultado.lead_id) : null;
    await finalizarComSucesso(admin, ev, tentativa, "processado", {
      lead_id: leadId,
      imobiliaria_id: imobId,
      form_id: formId,
      ad_id: lead.ad_id,
      observacao: "ja_processado",
    });
    return { status: "processado", lead_id: leadId, distribuido: false, aviso: "ja_processado" };
  }

  if (resultado.status === "duplicata") {
    const leadId = resultado.lead_existente?.id ? String(resultado.lead_existente.id) : null;
    await finalizarComSucesso(admin, ev, tentativa, "duplicado", {
      lead_id: leadId,
      imobiliaria_id: imobId,
      form_id: formId,
      ad_id: lead.ad_id,
      observacao: "duplicata_telefone_24h",
    });
    return { status: "duplicado", lead_id: leadId };
  }

  if (resultado.status === "criado" && resultado.lead?.id) {
    const leadId = String(resultado.lead.id);
    const corretorId = resultado.lead.corretor_id ? String(resultado.lead.corretor_id) : null;
    const distribuido = Boolean(resultado.distribuido && corretorId);
    if (!distribuido && !aviso) aviso = resultado.motivo ? String(resultado.motivo) : "nao_distribuido";

    await finalizarComSucesso(admin, ev, tentativa, "processado", {
      lead_id: leadId,
      imobiliaria_id: imobId,
      form_id: formId,
      ad_id: lead.ad_id,
      observacao: aviso ? `aviso:${aviso}` : null,
    });

    if (corretorId) {
      await notificarCorretor(admin, corretorId, imobId);
    } else {
      await enviarAlerta(
        "Lead da Meta aguardando corretor em plantão",
        `O lead do evento ${ev.id} foi criado na equipe ${resultado.lead.equipe_id ?? "?"}, mas não ` +
          `havia corretor em plantão. Ele fica na fila e será distribuído quando alguém entrar no plantão.`
      );
    }

    console.info(
      `[meta] evento ${ev.id} processado lead=${leadId} distribuido=${distribuido} origem=${ev.origem ?? "?"}`
    );
    return { status: "processado", lead_id: leadId, distribuido, aviso };
  }

  console.error("[meta] retorno inesperado da RPC:", ev.id, resultado.status ?? "(sem status)");
  return finalizarComFalha(
    admin,
    ev,
    tentativa,
    { codigo: `rpc_retorno_inesperado:${String(resultado.status ?? "")}`.slice(0, 80), retentar: true },
    imobId
  );
}

// ─────────────────────────────────────────────────────────────────────
// Lotes
// ─────────────────────────────────────────────────────────────────────

export interface ResumoProcessamento {
  selecionados: number;
  processados: number;
  duplicados: number;
  ignorados: number;
  erros: number;
  nao_processados: number;
  sem_tempo: number;
  migration_pendente: boolean;
  falha_banco: boolean;
}

function resumoVazio(): ResumoProcessamento {
  return {
    selecionados: 0,
    processados: 0,
    duplicados: 0,
    ignorados: 0,
    erros: 0,
    nao_processados: 0,
    sem_tempo: 0,
    migration_pendente: false,
    falha_banco: false,
  };
}

/** Processa uma lista de eventos em sequência, respeitando o prazo. */
export async function processarLista(
  admin: AdminClient,
  ids: string[],
  prazoFinal: number
): Promise<ResumoProcessamento> {
  const resumo = resumoVazio();
  resumo.selecionados = ids.length;

  for (const id of ids) {
    if (prazoFinal - Date.now() < TEMPO_MINIMO_MS) {
      resumo.sem_tempo += 1;
      continue;
    }
    const r = await processarEvento(id, { admin, prazoFinal });
    switch (r.status) {
      case "processado":
        resumo.processados += 1;
        break;
      case "duplicado":
        resumo.duplicados += 1;
        break;
      case "ignorado":
        resumo.ignorados += 1;
        break;
      case "erro":
        resumo.erros += 1;
        break;
      case "nao_processado":
        if (r.motivo === "sem_tempo") resumo.sem_tempo += 1;
        else resumo.nao_processados += 1;
        if (r.motivo === "migration_pendente") resumo.migration_pendente = true;
        if (r.motivo === "falha_banco") resumo.falha_banco = true;
        break;
    }
  }
  return resumo;
}

/**
 * Reprocessa eventos vencidos: recebido; erro com proxima_tentativa_em vencida;
 * processando com lease vencido. Ordem de chegada.
 */
export async function processarPendentes(
  limite = 50,
  prazoMs = 20000,
  opcoes: { admin?: AdminClient } = {}
): Promise<ResumoProcessamento> {
  const prazoFinal = Date.now() + prazoMs;
  let admin: AdminClient;
  try {
    admin = opcoes.admin ?? createSupabaseAdmin();
  } catch {
    return { ...resumoVazio(), falha_banco: true };
  }

  const agoraIso = new Date().toISOString();
  const { data, error } = await admin
    .from("meta_eventos")
    .select("id")
    .or(
      `status.eq.recebido,and(status.eq.erro,proxima_tentativa_em.lte."${agoraIso}"),and(status.eq.processando,proxima_tentativa_em.lt."${agoraIso}")`
    )
    .order("recebido_em", { ascending: true })
    .limit(Math.max(1, Math.min(limite, 200)));

  if (error) {
    if (funcaoAusente(error)) return { ...resumoVazio(), migration_pendente: true };
    console.error("[meta] processarPendentes: leitura:", error.code, error.message);
    return { ...resumoVazio(), falha_banco: true };
  }

  const ids = ((data ?? []) as { id: string }[]).map((r) => String(r.id));
  return processarLista(admin, ids, prazoFinal);
}
