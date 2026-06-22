import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { ComingSoonButton } from "@/components/ui/ComingSoonButton";
import { fetchTudo, getRanking } from "@/lib/supabase-queries";
import { formatBRLCompact } from "@/lib/format";

export default async function CorretoresPage() {
  const dados = await fetchTudo();
  const corretores = dados.corretores;
  const leads = dados.pistas;
  const getEquipe = (id: string) => dados.equipes.find((e) => e.id === id);
  const ranking = getRanking(dados);

  const dadosPorCorretor = (id: string) => {
    const r = ranking.find((x) => x.corretorId === id);
    const leadsAtivos = leads.filter(
      (l) => l.corretorId === id && l.status !== "fechado" && l.status !== "perdido"
    ).length;
    return {
      vgv: r?.vgvTotal ?? 0,
      vendas: r?.qtdVendas ?? 0,
      leadsAtivos,
    };
  };

  return (
    <>
      <PageHeader
        eyebrow="Equipe comercial"
        title="Corretores"
        description="Quadro de corretores por equipe, com status de plantão e desempenho de vendas."
        action={
          <ComingSoonButton className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Adicionar corretor
          </ComingSoonButton>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {corretores.map((c) => {
          const equipe = getEquipe(c.equipeId);
          const d = dadosPorCorretor(c.id);
          return (
            <Card key={c.id} className="p-5">
              <div className="flex items-start gap-3">
                <Avatar iniciais={c.avatarIniciais} cor={equipe?.cor} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{c.nome}</div>
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: equipe?.cor }} />
                    {equipe?.nome}
                  </div>
                </div>
                {c.emPlantao ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-win/15 px-2 py-0.5 text-[11px] font-medium text-win">
                    <span className="h-1.5 w-1.5 rounded-full bg-win" /> Plantão
                  </span>
                ) : (
                  <span className="rounded-full bg-base-raised px-2 py-0.5 text-[11px] font-medium text-ink-faint">Fora</span>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-base-border pt-4 text-center">
                <div>
                  <div className="tnum font-display text-base font-bold text-gold-soft">{formatBRLCompact(d.vgv)}</div>
                  <div className="text-[11px] text-ink-faint">VGV</div>
                </div>
                <div>
                  <div className="tnum font-display text-base font-bold text-ink">{d.vendas}</div>
                  <div className="text-[11px] text-ink-faint">Vendas</div>
                </div>
                <div>
                  <div className="tnum font-display text-base font-bold text-ink">{d.leadsAtivos}</div>
                  <div className="text-[11px] text-ink-faint">Leads ativos</div>
                </div>
              </div>

              <div className="mt-3 text-[11px] text-ink-faint">
                Ordem de plantão: <span className="text-ink-muted">{c.ordemPlantao}º</span>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
