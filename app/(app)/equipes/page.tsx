import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { NovaEquipeModal } from "@/components/NovaEquipeModal";
import { fetchTudoEscopado, getRanking } from "@/lib/supabase-queries";
import { formatBRLCompact } from "@/lib/format";

export default async function EquipesPage() {
  const { dados, usuario, semEquipe } = await fetchTudoEscopado();

  if (usuario?.role === "corretor") {
    return (
      <>
        <PageHeader
          eyebrow="Organização"
          title="Equipes"
          description="Estrutura das equipes comerciais."
        />
        <div className="rounded-2xl border border-base-border bg-base-surface px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink-muted">Área administrativa</p>
          <p className="mt-1 text-xs text-ink-muted">
            Disponível apenas para administradores e gestores.
          </p>
        </div>
      </>
    );
  }

  if (semEquipe) {
    return (
      <>
        <PageHeader
          eyebrow="Organização"
          title="Equipes"
          description="Estrutura das equipes comerciais."
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

  const equipes = dados.equipes;
  const corretores = dados.corretores;
  const leads = dados.pistas;
  const gerentes = equipes.map((e) => ({
    id: e.id,
    nome: e.gerenteId,
    equipeId: e.id,
  }));
  const buildRanking = (equipeId?: string) => getRanking(dados, equipeId);

  const isAdmin = usuario?.role === "admin";

  const descricao =
    usuario?.role === "gestor" && equipes.length === 1
      ? `Você gerencia a equipe ${equipes[0].nome}. Acompanhe os corretores e a ordem de plantão.`
      : "A imobiliária opera com múltiplas equipes. Cada gerente distribui os leads da sua fila seguindo a ordem de plantão.";

  return (
    <>
      <PageHeader
        eyebrow="Organização"
        title="Equipes"
        description={descricao}
        action={
          isAdmin ? <NovaEquipeModal /> : null
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {equipes.map((eq) => {
          const membros = corretores
            .filter((c) => c.equipeId === eq.id)
            .sort((a, b) => a.ordemPlantao - b.ordemPlantao);
          const gerente = gerentes.find((g) => g.equipeId === eq.id);
          const vgvEquipe = buildRanking(eq.id).reduce((s, r) => s + r.vgvTotal, 0);
          const leadsEquipe = leads.filter((l) => l.equipeId === eq.id).length;
          const emPlantao = membros.filter((m) => m.emPlantao).length;

          return (
            <Card key={eq.id}>
              <CardHeader
                title={eq.nome}
                subtitle={`Gerente: ${gerente?.nome ?? "—"}`}
                action={<span className="h-3 w-3 rounded-full" style={{ backgroundColor: eq.cor }} />}
              />

              <div className="grid grid-cols-3 gap-2 px-5 py-4 text-center">
                <div>
                  <div className="tnum font-display text-lg font-bold text-gold-soft">{formatBRLCompact(vgvEquipe)}</div>
                  <div className="text-[11px] text-ink-faint">VGV da equipe</div>
                </div>
                <div>
                  <div className="tnum font-display text-lg font-bold text-ink">{leadsEquipe}</div>
                  <div className="text-[11px] text-ink-faint">Leads</div>
                </div>
                <div>
                  <div className="tnum font-display text-lg font-bold text-ink">{emPlantao}/{membros.length}</div>
                  <div className="text-[11px] text-ink-faint">Em plantão</div>
                </div>
              </div>

              <div className="border-t border-base-border px-5 py-4">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                  Ordem de plantão
                </div>
                <div className="space-y-1.5">
                  {membros.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-base-raised/50">
                      <span className="tnum w-5 text-center text-xs font-semibold text-ink-faint">{m.ordemPlantao}</span>
                      <Avatar iniciais={m.avatarIniciais} cor={eq.cor} size={30} />
                      <span className="flex-1 text-sm text-ink">{m.nome}</span>
                      {m.emPlantao ? (
                        <span className="h-2 w-2 rounded-full bg-win" title="Em plantão" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-base-raised" title="Fora de plantão" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
