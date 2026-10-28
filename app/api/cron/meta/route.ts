import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { funcaoAusente } from "@/lib/rpc";
import { enviarAlerta } from "@/lib/alertas";
import {
  MetaApiErro,
  compararTextoSeguro,
  idMetaValido,
  listarLeadsDoFormulario,
  obterConfigMeta,
} from "@/lib/meta";
import {
  gravarEventos,
  notificarAtribuicoes,
  processarLista,
  processarPendentes,
  type NovoEventoMeta,
  type ResumoProcessamento,
} from "@/lib/meta-processar";

// Rotina periódica da integração Meta. Protegida por
// Authorization: Bearer ${CRON_SECRET} (a Vercel envia esse header nos crons).
//   1. Reprocessa eventos recebido/erro vencidos (até 50).
//   2. Distribui filas paradas (leads sem corretor em equipes ativas).
//   3. Reconcilia as últimas 3 h de cada formulário mapeado (leads que a Meta
//      não avisou ou cujo aviso se perdeu).
// Resposta: resumo sem dados pessoais.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const PRAZO_TOTAL_MS = 50000;
const PRAZO_PENDENTES_MS = 20000;
const PRAZO_FILAS_MS = 30000; // acumulado desde o início
const JANELA_RECONCILIACAO_S = 3 * 60 * 60;
const MAX_FORMULARIOS = 50;

interface RpcFila {
  status?: string;
  distribuidos?: number;
  restantes?: number;
  atribuicoes?: { lead_id?: string; corretor_id?: string }[];
}

export async function GET(req: NextRequest) {
  const inicio = Date.now();

  const segredo = (process.env.CRON_SECRET ?? "").trim();
  if (!segredo) {
    return NextResponse.json({ erro: "cron_nao_configurado" }, { status: 503 });
  }
  if (!compararTextoSeguro(req.headers.get("authorization") ?? "", `Bearer ${segredo}`)) {
    return NextResponse.json({ erro: "nao_autorizado" }, { status: 401 });
  }

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 503 });
  }

  const avisos: string[] = [];
  let migrationPendente = false;

  // ── 1. Eventos pendentes ─────────────────────────────────────────────
  const pendentes: ResumoProcessamento = await processarPendentes(50, PRAZO_PENDENTES_MS, { admin });
  if (pendentes.migration_pendente) {
    migrationPendente = true;
    avisos.push("meta_eventos_ausente");
  }
  if (pendentes.falha_banco) avisos.push("falha_banco_eventos");

  // ── 2. Filas paradas ────────────────────────────────────────────────
  const filas = { equipes: 0, distribuidos: 0, restantes: 0, erros: 0 };
  {
    const { data: parados, error } = await admin
      .from("leads")
      .select("imobiliaria_id, equipe_id")
      .is("corretor_id", null)
      .not("status", "in", "(fechado,perdido)")
      .limit(2000);

    if (error) {
      console.error("[cron meta] leitura de leads parados:", error.code, error.message);
      avisos.push("falha_leitura_filas");
    } else {
      const pares = new Map<string, string>(); // equipe_id → imobiliaria_id
      for (const row of (parados ?? []) as { imobiliaria_id: string; equipe_id: string | null }[]) {
        if (row.equipe_id) pares.set(String(row.equipe_id), String(row.imobiliaria_id));
      }

      const equipeIds = Array.from(pares.keys());
      const ativas = new Set<string>();
      if (equipeIds.length > 0) {
        const { data: equipes, error: erroEq } = await admin
          .from("equipes")
          .select("id, imobiliaria_id")
          .in("id", equipeIds)
          .eq("ativo", true);
        if (erroEq) {
          console.error("[cron meta] leitura de equipes:", erroEq.code, erroEq.message);
          avisos.push("falha_leitura_equipes");
        }
        for (const eq of (equipes ?? []) as { id: string; imobiliaria_id: string }[]) {
          if (pares.get(String(eq.id)) === String(eq.imobiliaria_id)) ativas.add(String(eq.id));
        }
      }

      for (const equipeId of Array.from(ativas)) {
        if (Date.now() - inicio > PRAZO_FILAS_MS) {
          avisos.push("filas_interrompidas_por_prazo");
          break;
        }
        const imobId = pares.get(equipeId)!;
        const { data, error: rpcErro } = await admin.rpc("distribuir_fila_equipe", {
          p: { imobiliaria_id: imobId, equipe_id: equipeId },
        });
        if (rpcErro) {
          if (funcaoAusente(rpcErro)) {
            migrationPendente = true;
            avisos.push("distribuir_fila_equipe_ausente");
            break;
          }
          console.error("[cron meta] distribuir_fila_equipe:", equipeId, rpcErro.code, rpcErro.message);
          filas.erros += 1;
          continue;
        }
        const r = (data ?? {}) as RpcFila;
        if (r.status !== "ok") continue;
        filas.equipes += 1;
        filas.distribuidos += Number(r.distribuidos ?? 0);
        filas.restantes += Number(r.restantes ?? 0);

        const corretores = (r.atribuicoes ?? [])
          .map((a) => (a.corretor_id ? String(a.corretor_id) : ""))
          .filter((id) => id.length > 0);
        if (corretores.length > 0) {
          await notificarAtribuicoes(admin, imobId, corretores);
        }
      }
    }
  }

  // ── 3. Reconciliação ────────────────────────────────────────────────
  const reconciliacao = {
    formularios: 0,
    leads_lidos: 0,
    eventos_criados: 0,
    erros_graph: 0,
    truncados: 0,
    processamento: null as ResumoProcessamento | null,
  };

  const config = obterConfigMeta();
  if (pendentes.migration_pendente) {
    avisos.push("reconciliacao_ignorada_migration_pendente");
  } else if (!config.accessToken || !config.appSecret) {
    avisos.push("reconciliacao_ignorada_meta_nao_configurada");
  } else {
    const { data: regras, error: erroRegras } = await admin
      .from("meta_roteamento")
      .select("page_id, form_id")
      .eq("ativo", true)
      .not("form_id", "is", null);

    if (erroRegras) {
      if (funcaoAusente(erroRegras)) {
        migrationPendente = true;
        avisos.push("meta_roteamento_ausente");
      } else {
        console.error("[cron meta] leitura meta_roteamento:", erroRegras.code, erroRegras.message);
        avisos.push("falha_leitura_roteamento");
      }
    } else {
      // Só Páginas cadastradas e ativas.
      const lista = ((regras ?? []) as { page_id: string; form_id: string | null }[]).filter(
        (r) => idMetaValido(r.page_id) && idMetaValido(r.form_id)
      );
      const paginas = Array.from(new Set(lista.map((r) => r.page_id)));
      const paginasAtivas = new Set<string>();
      if (paginas.length > 0) {
        const { data: integ, error: erroInteg } = await admin
          .from("integracoes_meta")
          .select("page_id")
          .in("page_id", paginas)
          .eq("ativo", true);
        if (erroInteg) avisos.push("falha_leitura_integracoes");
        for (const i of (integ ?? []) as { page_id: string }[]) paginasAtivas.add(String(i.page_id));
      }

      const formularios = new Map<string, string>(); // form_id → page_id
      for (const r of lista) {
        if (r.form_id && paginasAtivas.has(r.page_id) && !formularios.has(r.form_id)) {
          formularios.set(r.form_id, r.page_id);
        }
      }
      if (formularios.size > MAX_FORMULARIOS) avisos.push("reconciliacao_limitada_formularios");

      const desde = Math.floor(Date.now() / 1000) - JANELA_RECONCILIACAO_S;
      const novosEventos: NovoEventoMeta[] = [];

      for (const [formId, pageId] of Array.from(formularios).slice(0, MAX_FORMULARIOS)) {
        const restante = inicio + PRAZO_TOTAL_MS - Date.now();
        if (restante < 8000) {
          avisos.push("reconciliacao_interrompida_por_prazo");
          break;
        }
        try {
          const res = await listarLeadsDoFormulario(formId, desde, config, {
            maxPaginas: 5,
            limitePorPagina: 100,
            prazoFinal: Date.now() + Math.min(10000, restante - 6000),
          });
          reconciliacao.formularios += 1;
          reconciliacao.leads_lidos += res.leads.length;
          if (res.truncado) reconciliacao.truncados += 1;
          for (const l of res.leads) {
            novosEventos.push({
              leadgen_id: l.id,
              page_id: pageId,
              form_id: l.form_id ?? formId,
              ad_id: l.ad_id,
              adgroup_id: null,
              origem: "reconciliacao",
              payload: {
                fonte: "reconciliacao",
                leadgen_id: l.id,
                form_id: l.form_id ?? formId,
                ad_id: l.ad_id,
                created_time: l.created_time,
              },
            });
          }
        } catch (err) {
          reconciliacao.erros_graph += 1;
          if (err instanceof MetaApiErro) {
            console.warn("[cron meta] reconciliação do formulário", formId, err.codigoCurto());
            if (err.tipo === "token") {
              await enviarAlerta(
                "Token de acesso da Meta inválido ou expirado",
                `A reconciliação de leads falhou com ${err.codigoCurto()}. Gere um novo ` +
                  `META_ACCESS_TOKEN, atualize a variável na Vercel e faça um novo deploy.`
              );
              avisos.push("token_meta_invalido");
              break;
            }
          } else {
            console.error("[cron meta] reconciliação: erro inesperado no formulário", formId);
          }
        }
      }

      if (novosEventos.length > 0) {
        const gravacao = await gravarEventos(admin, novosEventos);
        if (!gravacao.ok) {
          avisos.push("falha_gravacao_reconciliacao");
          if (gravacao.migration_pendente) migrationPendente = true;
        } else {
          reconciliacao.eventos_criados = gravacao.novos.length;
          if (gravacao.novos.length > 0) {
            reconciliacao.processamento = await processarLista(
              admin,
              gravacao.novos.map((n) => n.id),
              inicio + PRAZO_TOTAL_MS
            );
          }
        }
      }
    }
  }

  const resumo = {
    status: migrationPendente ? "migration_pendente" : "ok",
    duracao_ms: Date.now() - inicio,
    pendentes,
    filas,
    reconciliacao,
    avisos,
  };

  console.info(
    `[cron meta] pendentes=${pendentes.selecionados} processados=${pendentes.processados} ` +
      `filas=${filas.distribuidos} reconciliados=${reconciliacao.eventos_criados} ` +
      `avisos=${avisos.join("|") || "-"} ms=${resumo.duracao_ms}`
  );

  return NextResponse.json(resumo, { status: migrationPendente ? 503 : 200 });
}
