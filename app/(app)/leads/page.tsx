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
  const { dados, usuario, semEquipe, semCorretorVinculado } =
    await fetchTudoEscopado();

  // Corretor sem vínculo em corretores.usuario_id
  if (semCorretorVinculado) {
    return (
      <>
        <PageHeader
          eyebrow="Captação"
          title="Leads"
          description="Seus leads atribuídos."
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
          <p className="text-sm font-semibold text-warn">Usuário não vinculado</p>
          <p className="mt-1 text-xs text-ink-muted">
            Seu usuário ainda não está vinculado a um cadastro de corretor.
            Solicite ao administrador que preencha o campo{" "}
            <span className="font-medium text-ink">usuario_id</span> na tabela{" "}
            <span className="font-medium text-ink">corretores</span>.
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

  const isCorretor = usuario?.role === "corretor";
  const leadsVisiveis = dados.pistas;
  const equipesVisiveis = dados.equipes;
  const corretoresParaModal = dados.corretores;

  const getEquipeInfo = (id: string) => dados.equipes.find((e) => e.id === id);

  // Painel do corretor: mostra apenas os próprios leads (sem fila, sem botão de cadastrar)
  if (isCorretor) {
    return (
      <>
        <PageHeader
          eyebrow="Captação"
          title="Meus Leads"
          description="Leads atribuídos a você. Acompanhe o status e histórico de cada oportunidade."
        />

        <Card>
          <CardHeader
            title="Leads atribuídos"
            subtitle={`${leadsVisiveis.length} ${leadsVisiveis.length === 1 ? "lead" : "leads"} no total`}
          />
          <div className="overflow-x-auto">
            {leadsVisiveis.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-ink-faint">
                Nenhum lead atribuído ainda.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-border text-left text-xs uppercase tracking-wider text-ink-faint">
                    <th className="px-5 py-3 font-medium">Lead</th>
                    <th className="px-5 py-3 font-medium">Origem</th>
                    <th className="hidden px-5 py-3 font-medium md:table-cell">Interesse</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="hidden px-5 py-3 font-medium sm:table-cell">Entrada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base-border">
                  {leadsVisiveis.map((lead) => {
                    const equipe = getEquipeInfo(lead.equipeId);
                    return (
                      <tr key={lead.id} className="hover:bg-base-raised/40">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar
                              iniciais={lead.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                              cor={equipe?.cor}
                            />
                            <div>
                              <div className="font-medium text-ink">{lead.nome}</div>
                              <div className="text-xs text-ink-muted">{lead.telefone}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-ink-muted">{lead.origem}</td>
                        <td className="hidden px-5 py-3 text-ink-muted md:table-cell">{lead.interesse}</td>
                        <td className="px-5 py-3">
                          <StatusPill status={lead.status} />
                        </td>
                        <td className="hidden px-5 py-3 text-ink-faint sm:table-cell">
                          {timeAgo(lead.criadoEm)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </>
    );
  }

  // Admin / gestor — visão completa com fila e botão de cadastrar
  const proximoPlantao = (equipeId: string) =>
    getProximoPlantao(dados, equipeId);

  const getCorretorInfo = (id: string | null) =>
    id ? dados.corretores.find((c) => c.id === id) ?? null : null;

  const naFila = leadsVisiveis.filter((l) => l.corretorId === null);
  const distribuidos = leadsVisiveis.filter((l) => l.corretorId !== null);

  return (
    <>
      <PageHeader
        eyebrow="Captação"
        title="Leads"
        description="O gerente cadastra o lead e o sistema distribui automaticamente ao próximo corretor de plantão."
        action={
          <NovoLeadModal equipes={equipesVisiveis} corretores={corretoresParaModal} />
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
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: `${eq.cor}1A`, color: eq.cor }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: eq.cor }} />
                    {fila.length}
                  </span>
                }
              />
              {proximo && fila.length > 0 && (
                <div className="mx-5 mt-4 flex items-center gap-3 rounded-xl border border-gold/30 bg-gold/10 px-3 py-2.5">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  <span className="text-xs text-ink-muted">
                    Próximo de plantão:{" "}
                    <span className="font-semibold text-gold-soft">{proximo.nome}</span>
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
                  <div
                    key={lead.id}
                    className="flex items-center gap-3 rounded-xl border border-base-border bg-base-raised/40 px-3 py-3"
                  >
                    <Avatar
                      iniciais={lead.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                      cor={eq.cor}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{lead.nome}</div>
                      <div className="truncate text-xs text-ink-muted">
                        {lead.interesse} • {lead.origem}
                      </div>
                    </div>
                    <div className="hidden text-right text-xs text-ink-faint sm:block">
                      {timeAgo(lead.criadoEm)}
                    </div>
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
        <CardHeader
          title="Todos os leads"
          subtitle={`${leadsVisiveis.length} no total • ${distribuidos.length} distribuídos`}
        />
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
                      {lead.corretorId === null
                        ? <span className="text-warn">Na fila</span>
                        : corretor
                          ? corretor.nome
                          : <span className="text-ink-faint">—</span>
                      }
                    </td>
                    <td className="px-5 py-3">
                      <StatusPill status={lead.status} />
                    </td>
                    <td className="hidden px-5 py-3 text-ink-faint sm:table-cell">
                      {timeAgo(lead.criadoEm)}
                    </td>
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
