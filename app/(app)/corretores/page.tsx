import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { ComingSoonButton } from "@/components/ui/ComingSoonButton";
import { fetchTudoEscopado, getRanking } from "@/lib/supabase-queries";
import { formatBRLCompact } from "@/lib/format";

export default async function CorretoresPage() {
  const { dados, usuario, semEquipe } = await fetchTudoEscopado();

  if (usuario?.role === "corretor") {
    return (
      <>
        <PageHeader
          eyebrow="Equipe comercial"
          title="Corretores"
          description="Quadro de corretores por equipe."
        />
        <div className="rounded-2xl border border-base-border bg-base-surface px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink-muted">Área restrita</p>
          <p className="mt-1 text-xs text-ink-muted">
            Esta seção está disponível para gestores e administradores.
          </p>
        </div>
      </>
    );
  }

  if (semEquipe) {
    return (
      <>
        <PageHeader
          eyebrow="Equipe comercial"
          title="Corretores"
          description="Quadro de corretores por equipe."
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
          <p className="text-sm font-semibold text-warn">Conta sem equipe vinculada</p>
          <p className="mt-1 text-xs text-ink-muted">
            Sua conta de gestor ainda não foi associada a uma equipe. Solicite ao
            administrador que preencha o campo{" "}
            <span className="font-medium text-ink">equipe_id</span> na tabela{" "}
            <span className="font-medium text-ink">usuarios</span>.
          </p>
        </div>
      </>
    );
  }

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

  // Botão "Adicionar corretor" apenas para admin
  const isAdmin = usuario?.role === "admin";

  return (
    <>
      <PageHeader
        eyebrow="Equipe comercial"
        title="Corretores"
        description="Quadro de corretores por equipe, com status de plantão e desempenho de vendas."
        action={
          isAdmin ? (
            <ComingSoonButton className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Adicionar corretor
            </ComingSoonButton>
          ) : null
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
