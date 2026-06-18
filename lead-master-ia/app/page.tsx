import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  fetchTudo,
  getKPIs,
  getRanking,
  getFunil,
} from "@/lib/supabase-queries";
import { formatBRLCompact, formatPercent, timeAgo } from "@/lib/format";
import { PIPELINE_ORDER, STATUS_LABEL, RankingItem } from "@/lib/types";

export default async function DashboardPage() {
  const dados = await fetchTudo();
  const leads = dados.pistas;
  const getCorretor = (id: string | null) =>
    id ? dados.corretores.find((c) => c.id === id) ?? null : null;
  const getEquipe = (id: string) => dados.equipes.find((e) => e.id === id);

  const kpi = getKPIs(dados);
  const ranking = getRanking(dados);
  const podio = ranking.slice(0, 3);
  const funil = getFunil(dados);
  const recentes = [...leads]
    .sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm))
    .slice(0, 5);

  const maxFunil = Math.max(...PIPELINE_ORDER.map((s) => funil[s]), 1);

  return (
    <>
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard"
        description="Desempenho consolidado da imobiliária — leads, conversão e VGV do período."
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="VGV fechado" value={formatBRLCompact(kpi.vgvTotal)} hint={`${kpi.qtdVendas} vendas no mês`} accent />
        <KpiCard label="Leads totais" value={String(kpi.totalLeads)} hint={`${kpi.naFila} aguardando distribuição`} />
        <KpiCard label="Conversão" value={formatPercent(kpi.conversao)} hint="leads → vendas fechadas" />
        <KpiCard label="Vendas" value={String(kpi.qtdVendas)} hint="negócios fechados" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* PÓDIO VGV — elemento assinatura */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Pódio VGV"
            subtitle="Top 3 corretores por valor de vendas fechadas"
            action={
              <a href="/ranking" className="text-sm font-medium text-action hover:underline">
                Ver ranking completo
              </a>
            }
          />
          <div className="grid grid-cols-3 items-end gap-3 px-5 py-8 sm:gap-6 sm:px-8">
            {/* 2º lugar */}
            {podio[1] && <PodiumStep item={podio[1]} height="h-24" medal="2" />}
            {/* 1º lugar */}
            {podio[0] && <PodiumStep item={podio[0]} height="h-32" medal="1" champion />}
            {/* 3º lugar */}
            {podio[2] && <PodiumStep item={podio[2]} height="h-16" medal="3" />}
          </div>
        </Card>

        {/* Funil */}
        <Card>
          <CardHeader title="Funil de pipeline" subtitle="Leads por etapa" />
          <div className="space-y-3 px-5 py-5">
            {PIPELINE_ORDER.map((status) => (
              <div key={status}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-ink-muted">{STATUS_LABEL[status]}</span>
                  <span className="tnum font-medium text-ink">{funil[status]}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-base-raised">
                  <div
                    className="h-full rounded-full bg-action"
                    style={{ width: `${(funil[status] / maxFunil) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="mt-4 flex items-center justify-between rounded-xl bg-loss/10 px-3 py-2 text-sm">
              <span className="text-loss">Perdidos</span>
              <span className="tnum font-medium text-loss">{funil.perdido}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Atividade recente */}
      <Card className="mt-6">
        <CardHeader title="Leads recentes" subtitle="Últimas entradas no sistema" />
        <div className="divide-y divide-base-border">
          {recentes.map((lead) => {
            const corretor = getCorretor(lead.corretorId);
            const equipe = getEquipe(lead.equipeId);
            return (
              <div key={lead.id} className="flex items-center gap-4 px-5 py-3.5">
                <Avatar iniciais={lead.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")} cor={equipe?.cor} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{lead.nome}</div>
                  <div className="truncate text-xs text-ink-muted">{lead.interesse}</div>
                </div>
                <div className="hidden text-right text-xs text-ink-muted sm:block">
                  {corretor ? corretor.nome : <span className="text-warn">Na fila</span>}
                  <div className="text-ink-faint">{timeAgo(lead.criadoEm)}</div>
                </div>
                <StatusPill status={lead.status} />
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}

function PodiumStep({
  item,
  height,
  medal,
  champion = false,
}: {
  item: RankingItem;
  height: string;
  medal: string;
  champion?: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <Avatar iniciais={item.avatarIniciais} cor={champion ? "#D4A636" : item.equipeCor} size={champion ? 52 : 42} />
      <div className="mt-2 text-center">
        <div className={`truncate text-sm font-medium ${champion ? "text-gold-soft" : "text-ink"}`}>
          {item.nome.split(" ")[0]}
        </div>
        <div className="tnum text-xs text-ink-muted">{formatBRLCompact(item.vgvTotal)}</div>
      </div>
      <div
        className={`mt-3 flex w-full items-start justify-center rounded-t-xl pt-3 font-display text-2xl font-bold ${height} ${
          champion
            ? "bg-gradient-to-b from-gold/30 to-gold/5 text-gold ring-1 ring-gold/40"
            : "bg-base-raised text-ink-muted"
        }`}
      >
        {medal}º
      </div>
    </div>
  );
}
