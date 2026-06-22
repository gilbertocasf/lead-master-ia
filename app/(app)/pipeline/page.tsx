import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { fetchTudo } from "@/lib/supabase-queries";
import { PIPELINE_ORDER, STATUS_LABEL, LeadStatus } from "@/lib/types";
import { StatusDropdown } from "@/components/pipeline/StatusDropdown";

const COLUMN_ACCENT: Record<LeadStatus, string> = {
  novo: "#3B82F6",
  em_contato: "#F59E0B",
  visita: "#D4A636",
  proposta: "#E8C875",
  fechado: "#22C55E",
  perdido: "#EF4444",
};

export default async function PipelinePage() {
  const dados = await fetchTudo();
  const leads = dados.pistas;
  const getCorretor = (id: string | null) =>
    id ? dados.corretores.find((c) => c.id === id) ?? null : null;
  const getEquipe = (id: string) => dados.equipes.find((e) => e.id === id);
  return (
    <>
      <PageHeader
        eyebrow="Acompanhamento"
        title="Pipeline"
        description="Movimente cada lead pelas etapas até o fechamento. Cada coluna é um estágio do funil."
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_ORDER.map((status) => {
          const cards = leads.filter((l) => l.status === status);
          const accent = COLUMN_ACCENT[status];
          return (
            <div key={status} className="flex w-72 shrink-0 flex-col">
              {/* Cabeçalho da coluna */}
              <div className="mb-3 flex items-center justify-between rounded-xl border border-base-border bg-base-surface px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="text-sm font-semibold text-ink">{STATUS_LABEL[status]}</span>
                </div>
                <span className="tnum rounded-full bg-base-raised px-2 py-0.5 text-xs font-medium text-ink-muted">
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2.5">
                {cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-base-border py-6 text-center text-xs text-ink-faint">
                    Sem leads
                  </div>
                )}
                {cards.map((lead) => {
                  const corretor = getCorretor(lead.corretorId);
                  const equipe = getEquipe(lead.equipeId);
                  return (
                    <div
                      key={lead.id}
                      className="rounded-xl border border-base-border bg-base-surface p-3 shadow-card transition-colors hover:border-base-raised"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{lead.nome}</span>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: equipe?.cor }} title={equipe?.nome} />
                      </div>
                      <p className="mb-3 text-xs text-ink-muted">{lead.interesse}</p>
                      <div className="mb-3 text-xs text-ink-faint">{lead.regiao} • {lead.faixaValor}</div>
                      <div className="flex items-center justify-between border-t border-base-border pt-2.5">
                        {corretor ? (
                          <div className="flex items-center gap-2">
                            <Avatar iniciais={corretor.avatarIniciais} cor={equipe?.cor} size={24} />
                            <span className="text-xs text-ink-muted">{corretor.nome.split(" ")[0]}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-warn">Aguardando distribuição</span>
                        )}
                      </div>
                      <div className="mt-2.5">
                        <StatusDropdown leadId={lead.id} statusAtual={lead.status} />
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
