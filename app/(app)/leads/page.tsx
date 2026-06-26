import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { NovoLeadModal } from "@/components/NovoLeadModal";
import { ComingSoonButton } from "@/components/ui/ComingSoonButton";
import {
  fetchTudoEscopado,
  getProximoPlantao,
} from "@/lib/supabase-queries";
import { timeAgo } from "@/lib/format";

export default async function LeadsPage() {
  const { dados, usuario, semEquipe } = await fetchTudoEscopado();

  if (usuario?.role === "corretor") {
    return (
      <>
        <PageHeader
          eyebrow="Captação"
          title="Leads"
          description="Gestão de leads e distribuição automática."
        />
        <div className="rounded-2xl border border-base-border bg-base-surface px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink-muted">Área restrita</p>
          <p className="mt-1 text-xs text-ink-muted">
            O cadastro de leads está disponível para gestores e administradores.
          </p>
        </div>
      </>
    );
  }

  if (semEquipe) {
    return (
      <>
        <PageHeader
          eyebrow="Captação"
          title="Leads"
          description="O gerente cadastra o lead e o sistema distribui automaticamente ao próximo corretor de plantão."
        />
        <div className="rounded-2xl border border-warn/30 bg-warn/10 px-6 py-10 text-center">
          <svg
            viewBox="0 0 24 24"
            className="mx-auto mb-3 h-8 w-8 text-warn"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm font-semibold text-warn">
            Conta sem equipe vinculada
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            Sua conta de gestor ainda não foi associada a uma equipe.
            Solicite ao administrador que preencha o campo{" "}
            <span className="font-medium text-ink">equipe_id</span> na tabela{" "}
            <span className="font-medium text-ink">usuarios</span>.
          </p>
        </div>
      </>
    );
  }

  // Dados já escopados por fetchTudoEscopado:
  //   admin  → todas as equipes e todos os leads
  //   gestor → apenas a própria equipe
  const equipesVisiveis = dados.equipes;
  const leadsVisiveis = dados.pistas;
  const corretoresParaModal = dados.corretores;

  // Corretor já foi tratado no early return acima; admin e gestor podem ver o form
  const podeVerForm = usuario !== null;

  const getCorretorInfo = (id: string | null) =>
    id ? dados.corretores.find((c) => c.id === id) ?? null : null;
  const getEquipeInfo = (id: string) => dados.equipes.find((e) => e.id === id);
  const proximoPlantao = (equipeId: string) =>
    getProximoPlantao(dados, equipeId);

  const naFila = leadsVisiveis.filter((l) => l.corretorId === null);
  const distribuidos = leadsVisiveis.filter((l) => l.corretorId !== null);

  return (
    <>
      <PageHeader
        eyebrow="Captação"
        title="Leads"
        description="O gerente cadastra o lead e o sistema distribui automaticamente ao próximo corretor de plantão."
        action={
          podeVerForm ? (
            <NovoLeadModal equipes={equipesVisiveis} corretores={corretoresParaModal} />
          ) : null
        }
      />

      {/* Fila de distribuição por equipe */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {equipesVisiveis.map((eq) => {
          const fila = naFila.filter((l) => l.equipeId === eq.id);
          const proximo = proximoPlantao(eq.id);
          return (
            <Card key={eq.id}>
              <CardHeader
                title={`Fila — ${eq.nome}`}
                subtitle={`${fila.length} ${fila.length === 1 ? "lead aguardando" : "leads aguardando"} distribuição`}
                action={
                  <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: `${eq.cor}1A`, color: eq.cor }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: eq.cor }} />
                    {fila.length}
                  </span>
                }
              />
              {proximo && fila.length > 0 && (
                <div className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  <span className="text-xs text-ink-muted">
                    Próximo de plantão: <span className="font-semibold text-gold-soft">{proximo.nome}</span>
                  </span>
                </div>
              )}
              <div className="space-y-2 p-5">
                {fila.length === 0 && (
                  <div className="rounded-xl border border-dashed border-base-border py-8 text-center text-sm text-ink-faint">
                    Sem leads na fila. Cadastre um lead para esta equipe.
                  </div>
                )}
                {fila.map((lead) => (
                  <div key={lead.id} className="flex items-center gap-3 rounded-xl border border-base-border bg-base-raised/40 px-3 py-3">
                    <Avatar iniciais={lead.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")} cor={eq.cor} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{lead.nome}</div>
                      <div className="truncate text-xs text-ink-muted">{lead.interesse} • {lead.origem}</div>
                    </div>
                    <div className="hidden text-right text-xs text-ink-faint sm:block">{timeAgo(lead.criadoEm)}</div>
                    <ComingSoonButton className="rounded-lg bg-action px-3 py-1.5 text-xs font-medium text-white hover:bg-action/90">
                      Distribuir
                    </ComingSoonButton>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Tabela completa */}
      <Card className="mt-6">
        <CardHeader title="Todos os leads" subtitle={`${leadsVisiveis.length} no total • ${distribuidos.length} distribuídos`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border text-left text-xs uppercase tracking-wider text-ink-faint">
                <th className="px-5 py-3 font-medium">Lead</th>
                <th className="px-5 py-3 font-medium">Origem</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Equipe</th>
                <th className="hidden px-5 py-3 font-medium md:table-cell">Corretor</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="hidden px-5 py-3 font-medium sm:table-cell">Entrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-border">
              {leadsVisiveis.map((lead) => {
                const corretor = getCorretorInfo(lead.corretorId);
                const equipe = getEquipeInfo(lead.equipeId);
                return (
                  <tr key={lead.id} className="hover:bg-base-raised/40">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{lead.nome}</div>
                      <div className="text-xs text-ink-muted">{lead.telefone}</div>
                    </td>
                    <td className="px-5 py-3 text-ink-muted">{lead.origem}</td>
                    <td className="hidden px-5 py-3 md:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-ink-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: equipe?.cor }} />
                        {equipe?.nome}
                      </span>
                    </td>
                    <td className="hidden px-5 py-3 text-ink-muted md:table-cell">
                      {corretor ? corretor.nome : <span className="text-warn">Na fila</span>}
                    </td>
                    <td className="px-5 py-3"><StatusPill status={lead.status} /></td>
                    <td className="hidden px-5 py-3 text-ink-faint sm:table-cell">{timeAgo(lead.criadoEm)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
