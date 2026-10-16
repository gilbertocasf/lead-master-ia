import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { fetchTudoEscopado } from "@/lib/supabase-queries";
import { PIPELINE_ORDER, STATUS_LABEL, LeadStatus } from "@/lib/types";
import { StatusDropdown } from "@/components/pipeline/StatusDropdown";
import { PipelineSlaBadge } from "@/components/pipeline/PipelineSlaBadge";
import { StatusPill } from "@/components/ui/StatusPill";

export const metadata = { title: "Pipeline" };

const COLUMN_ACCENT: Record<LeadStatus, string> = {
  novo: "#3B82F6",
  em_contato: "#F59E0B",
  visita: "#D4A636",
  proposta: "#E8C875",
  fechado: "#22C55E",
  perdido: "#EF4444",
};

export default async function PipelinePage() {
  const { dados, usuario, semEquipe, semCorretorVinculado } =
    await fetchTudoEscopado();

  // Corretor sem vínculo
  if (semCorretorVinculado) {
    return (
      <>
        <PageHeader
          eyebrow="Acompanhamento"
          title="Pipeline"
          description="Acompanhamento por etapas do funil."
        />
        <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-5 py-4">
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 h-5 w-5 shrink-0 text-warn"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-warn">Usuário não vinculado</p>
            <p className="mt-1 text-xs text-ink-muted">
              Seu acesso ainda não foi configurado. Solicite ajuste ao administrador.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (semEquipe) {
    return (
      <>
        <PageHeader
          eyebrow="Acompanhamento"
          title="Pipeline"
          description="Movimente cada lead pelas etapas até o fechamento."
        />
        <div className="flex items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 px-5 py-4">
          <svg
            viewBox="0 0 24 24"
            className="mt-0.5 h-5 w-5 shrink-0 text-warn"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-warn">Conta sem equipe vinculada</p>
            <p className="mt-1 text-xs text-ink-muted">
              Seu acesso ainda não foi configurado. Solicite ajuste ao administrador.
            </p>
          </div>
        </div>
      </>
    );
  }

  const isCorretor = usuario?.role === "corretor";
  const isCaptador = usuario?.role === "captador";
  const leads = dados.pistas;
  const getCorretor = (id: string | null) =>
    id ? dados.corretores.find((c) => c.id === id) ?? null : null;
  const getEquipe = (id: string) => dados.equipes.find((e) => e.id === id);

  const eyebrow = isCorretor ? "Meu pipeline" : isCaptador ? "Acompanhamento (leitura)" : "Acompanhamento";
  const descricao = isCorretor
    ? "Acompanhe o andamento das suas oportunidades e mova cada lead pelas etapas do funil."
    : isCaptador
      ? "Visualize o andamento dos leads que você captou. Alterações de status são feitas pelo corretor ou gestor."
      : "Movimente cada lead pelas etapas até o fechamento. Cada mudança de status fica registrada no histórico do lead.";

  return (
    <>
      <PageHeader eyebrow={eyebrow} title="Pipeline" description={descricao} />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_ORDER.map((status) => {
          const cards = leads.filter((l) => l.status === status);
          const accent = COLUMN_ACCENT[status];
          return (
            <div key={status} className="flex w-72 shrink-0 flex-col">
              <div className="mb-3 flex items-center justify-between rounded-xl border border-base-border bg-base-surface px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="text-sm font-semibold text-ink">{STATUS_LABEL[status]}</span>
                </div>
                <span className="tnum rounded-full bg-base-raised px-2 py-0.5 text-xs font-medium text-ink-muted">
                  {cards.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-base-border py-6 text-center text-xs text-ink-faint">
                    Sem leads
                  </div>
                )}
                {cards.map((lead) => {
                  const corretor = getCorretor(lead.corretorId);
                  const equipe = getEquipe(lead.equipeId);
                  const detalhes = [lead.regiao, lead.faixaValor].filter(Boolean).join(" • ");
                  return (
                    <div
                      key={lead.id}
                      className="rounded-xl border border-base-border bg-base-surface p-3 shadow-card transition-colors hover:border-base-raised"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <Link href={`/leads/${lead.id}`} className="min-w-0 break-words text-sm font-medium text-ink hover:text-action hover:underline">
                          {lead.nome}
                        </Link>
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: equipe?.cor }}
                          title={equipe?.nome ?? "Sem equipe"}
                        />
                      </div>
                      {lead.interesse && (
                        <p className="mb-3 text-xs text-ink-muted">{lead.interesse}</p>
                      )}
                      {detalhes && <div className="mb-3 text-xs text-ink-faint">{detalhes}</div>}
                      <div className="flex items-center justify-between border-t border-base-border pt-2.5">
                        {corretor ? (
                          <div className="flex items-center gap-2">
                            <Avatar iniciais={corretor.avatarIniciais} cor={equipe?.cor} size={24} />
                            <span className="text-xs text-ink-muted">
                              {corretor.nome.split(" ")[0]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-warn">Aguardando distribuição</span>
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-3">
                        {isCaptador ? (
                          <StatusPill status={lead.status} />
                        ) : (
                          <StatusDropdown leadId={lead.id} statusAtual={lead.status} />
                        )}
                        <div className="flex-shrink-0">
                          <PipelineSlaBadge lead={lead} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
