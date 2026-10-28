import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isMockMode } from "@/lib/supabase";
import { fetchUsuarioAtual } from "@/lib/supabase-queries";
import { STATUS_LABEL, type LeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = { title: "Lead" };

const VAZIO = "Não informado";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CANAL_ROTULO: Record<string, string> = {
  manual: "Cadastro manual",
  meta_lead_ads: "Meta Lead Ads",
};

const CRIADO_POR_ROTULO: Record<string, string> = {
  sistema: "Sistema",
  formulario: "Formulário",
  webhook: "Integração",
  usuario: "Usuário",
};

const EVENTO_ROTULO: Record<string, string> = {
  lead_criado: "Lead criado",
  lead_roteado: "Encaminhado para a equipe",
  lead_distribuido: "Distribuído a um corretor",
  distribuicao_falhou: "Aguardando corretor",
  status_alterado: "Status alterado",
  lead_redistribuido: "Redistribuído",
  lead_reentrada: "Novo contato do mesmo telefone",
};

type Dados = Record<string, unknown>;

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function statusLabel(v: unknown): string {
  const s = texto(v);
  if (!s) return "Sem status";
  return STATUS_LABEL[s as LeadStatus] ?? s;
}

function quando(iso: string | null | undefined, vazio: string = VAZIO): string {
  if (!iso) return vazio;
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function humanizar(chave: string): string {
  const s = chave.replace(/_/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : chave;
}

function valorTexto(v: unknown): string {
  if (Array.isArray(v)) return v.map(valorTexto).join(", ");
  if (v === null || v === undefined) return "Sem resposta";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Aceita objeto {pergunta: resposta} ou lista [{name, values}] (formato da Meta)
function respostasComoLista(v: unknown): { pergunta: string; resposta: string }[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v
      .map((item) => {
        const o = (item ?? {}) as Dados;
        const nome = texto(o.name) ?? texto(o.pergunta);
        if (!nome) return null;
        return { pergunta: humanizar(nome), resposta: valorTexto(o.values ?? o.resposta ?? o.value) };
      })
      .filter((x): x is { pergunta: string; resposta: string } => x !== null);
  }
  if (typeof v === "object") {
    return Object.entries(v as Dados).map(([k, val]) => ({ pergunta: humanizar(k), resposta: valorTexto(val) }));
  }
  return [];
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{rotulo}</div>
      <div className="mt-0.5 break-words text-sm text-ink">{children}</div>
    </div>
  );
}

export default async function LeadDetalhePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (isMockMode || !UUID_RE.test(params.id)) notFound();

  const sb = createSupabaseServer();

  // Consulta 1: colunas base (RLS decide se o perfil enxerga o lead)
  const { data: lead } = await sb
    .from("leads")
    .select(
      "id, nome, telefone, origem, interesse, faixa_valor, equipe_id, corretor_id, status, observacoes, created_at, distribuido_em"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (!lead) notFound();

  // Gestor só vê leads da própria equipe (mesmo antes da migration 009 na RLS).
  const usuario = await fetchUsuarioAtual();
  if (
    usuario?.role === "gestor" &&
    (!usuario.equipeId || String(lead.equipe_id ?? "") !== usuario.equipeId)
  ) {
    notFound();
  }

  // Consulta 2: colunas da Meta (podem não existir antes da migration 010)
  let meta: Dados | null = null;
  {
    const { data, error } = await sb
      .from("leads")
      .select(
        "canal, plataforma, meta_form_id, meta_ad_id, meta_campaign_id, meta_ad_nome, meta_campanha_nome, meta_criado_em, respostas_formulario"
      )
      .eq("id", params.id)
      .maybeSingle();
    if (!error && data) meta = data as Dados;
  }

  const [histRes, equipeRes, corretorRes] = await Promise.all([
    sb
      .from("historico_leads")
      .select("id, tipo_evento, descricao, dados, criado_por, created_at")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: true }),
    lead.equipe_id
      ? sb.from("equipes").select("id, nome").eq("id", lead.equipe_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead.corretor_id
      ? sb.from("corretores").select("id, nome").eq("id", lead.corretor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const historico = (histRes.data ?? []) as {
    id: string;
    tipo_evento: string;
    descricao: string | null;
    dados: Dados | null;
    criado_por: string | null;
    created_at: string;
  }[];
  const equipeNome = equipeRes.data ? String((equipeRes.data as Dados).nome) : null;
  const corretorNome = corretorRes.data ? String((corretorRes.data as Dados).nome) : null;

  const canal = texto(meta?.canal) ?? "manual";
  const ehMeta = canal === "meta_lead_ads";
  const status = lead.status as LeadStatus;
  const respostas = respostasComoLista(meta?.respostas_formulario);

  function detalheEvento(tipo: string, d: Dados): string | null {
    const partes: string[] = [];
    const corretor = texto(d.corretor_nome);
    const motivo = texto(d.motivo);
    switch (tipo) {
      case "lead_criado": {
        const c = texto(d.canal);
        if (c) partes.push(`Canal: ${CANAL_ROTULO[c] ?? c}`);
        const o = texto(d.origem);
        if (o) partes.push(`Origem: ${o}`);
        break;
      }
      case "lead_roteado": {
        const eq = texto(d.equipe_nome);
        if (eq) partes.push(`Equipe: ${eq}`);
        break;
      }
      case "lead_distribuido":
      case "lead_redistribuido":
        if (corretor) partes.push(`Corretor: ${corretor}`);
        if (motivo === "fila") partes.push("Saiu da fila de espera");
        break;
      case "distribuicao_falhou":
        partes.push(
          motivo === "sem_corretor_em_plantao"
            ? "Nenhum corretor em plantão na equipe; o lead aguarda na fila"
            : "Não foi possível distribuir agora"
        );
        break;
      case "status_alterado":
        partes.push(`${statusLabel(d.status_anterior)} → ${statusLabel(d.status_novo)}`);
        break;
      case "lead_reentrada": {
        const c = texto(d.canal);
        if (c) partes.push(`Canal: ${CANAL_ROTULO[c] ?? c}`);
        const o = texto(d.origem);
        if (o) partes.push(`Origem: ${o}`);
        partes.push("Nenhum lead novo foi criado");
        break;
      }
    }
    return partes.length ? partes.join(" · ") : null;
  }

  return (
    <>
      <Link
        href="/leads"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        Voltar para leads
      </Link>

      <PageHeader
        eyebrow="Lead"
        title={String(lead.nome)}
        description={`Entrada em ${quando(lead.created_at)}`}
        action={<StatusPill status={status} />}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card>
            <CardHeader title="Dados do lead" />
            <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1">
              <Campo rotulo="Telefone">{lead.telefone ?? VAZIO}</Campo>
              <Campo rotulo="Origem">{lead.origem ?? VAZIO}</Campo>
              <Campo rotulo="Canal">{CANAL_ROTULO[canal] ?? canal}</Campo>
              <Campo rotulo="Interesse">{lead.interesse ?? VAZIO}</Campo>
              <Campo rotulo="Faixa de valor">{lead.faixa_valor ?? VAZIO}</Campo>
              <Campo rotulo="Equipe">{equipeNome ?? "Sem equipe"}</Campo>
              <Campo rotulo="Corretor">
                {lead.corretor_id === null ? (
                  <span className="text-warn">Na fila</span>
                ) : (
                  corretorNome ?? "Corretor inativo"
                )}
              </Campo>
              <Campo rotulo="Distribuído em">{quando(lead.distribuido_em, "Ainda não distribuído")}</Campo>
              {lead.observacoes && (
                <div className="sm:col-span-2 lg:col-span-1">
                  <Campo rotulo="Observações">
                    <span className="whitespace-pre-wrap">{lead.observacoes}</span>
                  </Campo>
                </div>
              )}
            </div>
          </Card>

          {ehMeta && (
            <Card>
              <CardHeader title="Origem do anúncio" subtitle="Dados enviados pela Meta" />
              <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-1">
                <Campo rotulo="Plataforma">
                  {meta?.plataforma === "instagram"
                    ? "Instagram"
                    : meta?.plataforma === "facebook"
                      ? "Facebook"
                      : "Não informada"}
                </Campo>
                <Campo rotulo="Campanha">
                  {texto(meta?.meta_campanha_nome) ?? VAZIO}
                  {texto(meta?.meta_campaign_id) && (
                    <div className="tnum text-xs text-ink-faint">{texto(meta?.meta_campaign_id)}</div>
                  )}
                </Campo>
                <Campo rotulo="Anúncio">
                  {texto(meta?.meta_ad_nome) ?? VAZIO}
                  {texto(meta?.meta_ad_id) && (
                    <div className="tnum text-xs text-ink-faint">{texto(meta?.meta_ad_id)}</div>
                  )}
                </Campo>
                <Campo rotulo="Formulário">
                  <span className="tnum">{texto(meta?.meta_form_id) ?? VAZIO}</span>
                </Campo>
                <Campo rotulo="Preenchido na Meta em">{quando(texto(meta?.meta_criado_em))}</Campo>
              </div>
              {respostas.length > 0 && (
                <div className="border-t border-base-border p-5">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                    Respostas do formulário
                  </div>
                  <dl className="space-y-2.5">
                    {respostas.map((r, i) => (
                      <div key={`${r.pergunta}-${i}`}>
                        <dt className="text-xs text-ink-faint">{r.pergunta}</dt>
                        <dd className="break-words text-sm text-ink">{r.resposta}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </Card>
          )}
        </div>

        <Card className="lg:col-span-2">
          <CardHeader title="Linha do tempo" subtitle="Tudo o que aconteceu com este lead, do mais antigo ao mais recente." />
          {historico.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-ink-faint">
              Nenhum evento registrado para este lead.
            </div>
          ) : (
            <ol className="space-y-0 p-5">
              {historico.map((ev, i) => {
                const detalhe = detalheEvento(ev.tipo_evento, ev.dados ?? {});
                const ultimo = i === historico.length - 1;
                return (
                  <li key={ev.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {!ultimo && <span className="absolute left-[5px] top-4 h-full w-px bg-base-border" aria-hidden />}
                    <span className="relative mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full bg-action ring-4 ring-base-surface" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="text-sm font-medium text-ink">
                          {EVENTO_ROTULO[ev.tipo_evento] ?? ev.tipo_evento}
                        </span>
                        <span className="tnum text-xs text-ink-faint">{quando(ev.created_at)}</span>
                      </div>
                      {detalhe && <p className="mt-0.5 text-sm text-ink-muted">{detalhe}</p>}
                      {ev.criado_por && (
                        <p className="mt-0.5 text-[11px] text-ink-faint">
                          Por: {CRIADO_POR_ROTULO[ev.criado_por] ?? ev.criado_por}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
