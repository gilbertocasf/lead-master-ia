import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { ComingSoonButton } from "@/components/ui/ComingSoonButton";
import { fetchTudo, getRanking } from "@/lib/supabase-queries";
import { formatBRLCompact } from "@/lib/format";

export default async function EquipesPage() {
  const dados = await fetchTudo();
  const equipes = dados.equipes;
  const corretores = dados.corretores;
  const leads = dados.pistas;
  // O banco guarda o nome do gerente em equipe.gerenteId (texto).
  // Reconstruímos a lista no formato que o JSX espera (.nome / .equipeId).
  const gerentes = equipes.map((e) => ({
    id: e.id,
    nome: e.gerenteId,
    equipeId: e.id,
  }));
  const buildRanking = (equipeId?: string) => getRanking(dados, equipeId);

  return (
    <>
      <PageHeader
        eyebrow="Organização"
        title="Equipes"
        description="A imobiliária opera com duas equipes. Cada gerente distribui os leads da sua fila seguindo a ordem de plantão."
        action={
          <ComingSoonButton className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Nova equipe
          </ComingSoonButton>
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

              {/* Resumo da equipe */}
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

              {/* Lista ordenada de plantão */}
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
