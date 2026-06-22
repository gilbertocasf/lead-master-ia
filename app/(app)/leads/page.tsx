import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { NovoLeadModal } from "@/components/NovoLeadModal";
import { ComingSoonButton } from "@/components/ui/ComingSoonButton";
import {
  fetchTudo,
  getProximoPlantao,
} from "@/lib/supabase-queries";
import { timeAgo } from "@/lib/format";

export default async function LeadsPage() {
  const dados = await fetchTudo();
  const leads = dados.pistas;
  const equipes = dados.equipes;
  const getCorretor = (id: string | null) =>
    id ? dados.corretores.find((c) => c.id === id) ?? null : null;
  const getEquipe = (id: string) => dados.equipes.find((e) => e.id === id);
  const proximoPlantao = (equipeId: string) =>
    getProximoPlantao(dados, equipeId);

  const naFila = leads.filter((l) => l.corretorId === null);
  const distribuidos = leads.filter((l) => l.corretorId !== null);

  return (
    <>
      <PageHeader
        eyebrow="Captação"
        title="Leads"
        description="O captador cadastra o lead já com a equipe de destino. O gerente daquela equipe distribui ao corretor de plantão."
        action={<NovoLeadModal equipes={equipes} />}
      />

      {/* Fila de distribuição por equipe */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {equipes.map((eq) => {
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
              {/* Sugestão de plantão */}
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
        <CardHeader title="Todos os leads" subtitle={`${leads.length} no total • ${distribuidos.length} distribuídos`} />
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
              {leads.map((lead) => {
                const corretor = getCorretor(lead.corretorId);
                const equipe = getEquipe(lead.equipeId);
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
