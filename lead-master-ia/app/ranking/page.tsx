import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { fetchTudo, getRanking } from "@/lib/supabase-queries";
import { formatBRL, formatBRLCompact } from "@/lib/format";
import { RankingItem } from "@/lib/types";

export default async function RankingPage() {
  const dados = await fetchTudo();
  const ranking = getRanking(dados);
  const [primeiro, segundo, terceiro] = ranking;

  return (
    <>
      <PageHeader
        eyebrow="Reconhecimento"
        title="Ranking VGV"
        description="Classificação por valor de vendas fechadas no período. Considera apenas vendas — locações não entram no ranking."
        action={
          <div className="flex gap-1 rounded-xl border border-base-border bg-base-surface p-1 text-sm">
            <button className="rounded-lg bg-action px-3 py-1.5 font-medium text-white">Geral</button>
            <button className="rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink">Atlântico</button>
            <button className="rounded-lg px-3 py-1.5 text-ink-muted hover:text-ink">Horizonte</button>
          </div>
        }
      />

      {/* Pódio destacado */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {segundo && <PodiumCard item={segundo} place="2º" />}
        {primeiro && <PodiumCard item={primeiro} place="1º" champion />}
        {terceiro && <PodiumCard item={terceiro} place="3º" />}
      </div>

      {/* Tabela completa */}
      <Card className="mt-6">
        <CardHeader title="Classificação completa" subtitle={`${ranking.length} corretores com vendas no período`} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-border text-left text-xs uppercase tracking-wider text-ink-faint">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Corretor</th>
                <th className="hidden px-5 py-3 font-medium sm:table-cell">Equipe</th>
                <th className="px-5 py-3 text-right font-medium">VGV</th>
                <th className="hidden px-5 py-3 text-right font-medium md:table-cell">Vendas</th>
                <th className="hidden px-5 py-3 text-right font-medium lg:table-cell">Ticket médio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-border">
              {ranking.map((r) => {
                const top3 = r.posicao <= 3;
                return (
                  <tr key={r.corretorId} className={top3 ? "bg-gold/5 hover:bg-gold/10" : "hover:bg-base-raised/40"}>
                    <td className="px-5 py-3">
                      <span className={`tnum font-display font-bold ${top3 ? "text-gold" : "text-ink-faint"}`}>
                        {r.posicao}º
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar iniciais={r.avatarIniciais} cor={top3 ? "#D4A636" : r.equipeCor} size={32} />
                        <span className="font-medium text-ink">{r.nome}</span>
                      </div>
                    </td>
                    <td className="hidden px-5 py-3 sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 text-ink-muted">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.equipeCor }} />
                        {r.equipeNome}
                      </span>
                    </td>
                    <td className={`tnum px-5 py-3 text-right font-semibold ${top3 ? "text-gold-soft" : "text-ink"}`}>
                      {formatBRL(r.vgvTotal)}
                    </td>
                    <td className="tnum hidden px-5 py-3 text-right text-ink-muted md:table-cell">{r.qtdVendas}</td>
                    <td className="tnum hidden px-5 py-3 text-right text-ink-muted lg:table-cell">{formatBRLCompact(r.ticketMedio)}</td>
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

function PodiumCard({
  item,
  place,
  champion = false,
}: {
  item: RankingItem;
  place: string;
  champion?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center rounded-2xl border p-6 text-center ${
        champion
          ? "order-first border-gold/50 bg-gradient-to-b from-gold/15 to-transparent shadow-gold sm:order-none sm:-mt-3"
          : "border-base-border bg-base-surface shadow-card"
      }`}
    >
      <div className={`font-display text-3xl font-bold ${champion ? "text-gold" : "text-ink-muted"}`}>{place}</div>
      <div className="my-3">
        <Avatar iniciais={item.avatarIniciais} cor={champion ? "#D4A636" : item.equipeCor} size={champion ? 64 : 52} />
      </div>
      <div className={`font-medium ${champion ? "text-gold-soft" : "text-ink"}`}>{item.nome}</div>
      <div className="mb-3 flex items-center gap-1.5 text-xs text-ink-muted">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.equipeCor }} />
        {item.equipeNome}
      </div>
      <div className="tnum font-display text-2xl font-bold tracking-tight text-gold-soft">{formatBRLCompact(item.vgvTotal)}</div>
      <div className="text-xs text-ink-faint">{item.qtdVendas} vendas fechadas</div>
    </div>
  );
}
