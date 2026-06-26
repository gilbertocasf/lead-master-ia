import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  fetchTudoEscopado,
  getKPIs,
  getRanking,
  getFunil,
} from "@/lib/supabase-queries";
import { formatBRLCompact, formatPercent, timeAgo } from "@/lib/format";
import { PIPELINE_ORDER, STATUS_LABEL, RankingItem } from "@/lib/types";

export default async function DashboardPage() {
  const { dados, usuario, semEquipe, semCorretorVinculado } =
    await fetchTudoEscopado();

  // Corretor sem vínculo em corretores.usuario_id
  if (semCorretorVinculado) {
    return (
      <>
        <PageHeader
          eyebrow="Painel do corretor"
          title="Dashboard"
          description="Seus leads, conversão e VGV do período."
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
            Usuário não vinculado
          </p>
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

  // Gestor sem equipe vinculada
  if (semEquipe) {
    return (
      <>
        <PageHeader
          eyebrow="Visão geral"
          title="Dashboard"
          description="Painel operacional."
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
            Sua conta de gestor ainda não foi associada a uma equipe. Solicite ao
            administrador que preencha o campo{" "}
            <span className="font-medium text-ink">equipe_id</span> na tabela{" "}
            <span className="font-medium text-ink">usuarios</span>.
          </p>
        </div>
      </>
    );
  }

  const isCorretor = usuario?.role === "corretor";
  const isCaptador = usuario?.role === "captador";
  const leads = dados.pistas;
  const getCorretor = (id: string | null) =>
    id ? dados.corretores.find((c) => c.id === id) ?? null : null;
  const getEquipe = (id: string) => dados.equipes.find((e) => e.id === id);

  const kpi = getKPIs(dados);
  const funil = getFunil(dados);
  const recentes = [...leads]
    .sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm))
    .slice(0, 5);

  const maxFunil = Math.max(...PIPELINE_ORDER.map((s) => funil[s]), 1);

  // Dashboard do captador
  if (isCaptador) {
    const leadsEmAtendimento = leads.filter(
      (l) => l.status !== "fechado" && l.status !== "perdido"
    ).length;
    const leadsConvertidos = leads.filter((l) => l.status === "fechado").length;
    const vgvCaptado = dados.vendas.reduce((s, v) => s + v.vgv, 0);
    const taxaConversao = leads.length ? (leadsConvertidos / leads.length) * 100 : 0;
    const recentes = [...leads]
      .sort((a, b) => +new Date(b.criadoEm) - +new Date(a.criadoEm))
      .slice(0, 5);

    return (
      <>
        <PageHeader
          eyebrow="Painel do captador"
          title="Dashboard"
          description={`Leads captados por você — ${usuario?.nome ?? "Captador"}.`}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Leads captados"
            value={String(leads.length)}
            hint="total no período"
          />
          <KpiCard
            label="Em atendimento"
            value={String(leadsEmAtendimento)}
            hint="aguardando fechamento"
          />
          <KpiCard
            label="Convertidos"
            value={String(leadsConvertidos)}
            hint="leads fechados"
          />
          <KpiCard
            label="VGV gerado"
            value={formatBRLCompact(vgvCaptado)}
            hint={`${formatPercent(taxaConversao)} conversão`}
            accent
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Meu funil" subtitle="Leads por etapa" />
            <div className="space-y-3 px-5 py-5">
              {PIPELINE_ORDER.map((status) => {
                const contagem = leads.filter((l) => l.status === status).length;
                const maxVal = Math.max(...PIPELINE_ORDER.map((s) => leads.filter((l) => l.status === s).length), 1);
                return (
                  <div key={status}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-ink-muted">{STATUS_LABEL[status]}</span>
                      <span className="tnum font-medium text-ink">{contagem}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-base-raised">
                      <div className="h-full rounded-full bg-action" style={{ width: `${(contagem / maxVal) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="mt-4 flex items-center justify-between rounded-xl bg-loss/10 px-3 py-2 text-sm">
                <span className="text-loss">Perdidos</span>
                <span className="tnum font-medium text-loss">{leads.filter((l) => l.status === "perdido").length}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Meus leads recentes" subtitle="Últimos leads que você cadastrou" />
            <div className="divide-y divide-base-border">
              {recentes.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-ink-faint">
                  Nenhum lead cadastrado ainda.{" "}
                  {dados.pistas.length === 0 && (
                    <span className="block mt-1 text-xs text-warn">
                      Migration 007 pode não ter sido aplicada ainda.
                    </span>
                  )}
                </div>
              )}
              {recentes.map((lead) => {
                const corretor = getCorretor(lead.corretorId);
                const equipe = getEquipe(lead.equipeId);
                return (
                  <div key={lead.id} className="flex items-center gap-4 px-5 py-3.5">
                    <Avatar iniciais={lead.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")} cor={equipe?.cor} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{lead.nome}</div>
                      <div className="truncate text-xs text-ink-muted">
                        {corretor ? corretor.nome : <span className="text-warn">Aguardando</span>}
                        {" · "}{equipe?.nome}
                      </div>
                    </div>
                    <div className="hidden text-right text-xs text-ink-faint sm:block">
                      {timeAgo(lead.criadoEm)}
                    </div>
                    <StatusPill status={lead.status} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </>
    );
  }

  // Dashboard individual do corretor
  if (isCorretor) {
    const leadsEmAndamento = leads.filter(
      (l) => l.status !== "fechado" && l.status !== "perdido"
    ).length;
    const nomeCorretor = dados.corretores[0]?.nome ?? "Corretor";

    return (
      <>
        <PageHeader
          eyebrow="Painel do corretor"
          title="Dashboard"
          description={`Seus leads, conversão e VGV do período — ${nomeCorretor}.`}
        />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="VGV fechado"
            value={formatBRLCompact(kpi.vgvTotal)}
            hint={`${kpi.qtdVendas} vendas`}
            accent
          />
          <KpiCard
            label="Leads ativos"
            value={String(leadsEmAndamento)}
            hint="em andamento"
          />
          <KpiCard
            label="Conversão"
            value={formatPercent(kpi.conversao)}
            hint="leads → vendas"
          />
          <KpiCard
            label="Total leads"
            value={String(kpi.totalLeads)}
            hint="no período"
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Funil individual */}
          <Card>
            <CardHeader title="Meu funil" subtitle="Leads por etapa" />
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

          {/* Leads recentes */}
          <Card>
            <CardHeader title="Meus leads recentes" subtitle="Últimas entradas atribuídas a você" />
            <div className="divide-y divide-base-border">
              {recentes.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-ink-faint">
                  Nenhum lead atribuído ainda.
                </div>
              )}
              {recentes.map((lead) => {
                const equipe = getEquipe(lead.equipeId);
                return (
                  <div key={lead.id} className="flex items-center gap-4 px-5 py-3.5">
                    <Avatar iniciais={lead.nome.split(" ").map((n) => n[0]).slice(0, 2).join("")} cor={equipe?.cor} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink">{lead.nome}</div>
                      <div className="truncate text-xs text-ink-muted">{lead.interesse}</div>
                    </div>
                    <div className="hidden text-right text-xs text-ink-faint sm:block">
                      {timeAgo(lead.criadoEm)}
                    </div>
                    <StatusPill status={lead.status} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </>
    );
  }

  // Dashboard admin/gestor
  const ranking = getRanking(dados);
  const podio = ranking.slice(0, 3);

  const nomeEquipeGestor =
    usuario?.role === "gestor" && dados.equipes.length === 1
      ? dados.equipes[0].nome
      : null;

  return (
    <>
      <PageHeader
        eyebrow={nomeEquipeGestor ? `Equipe ${nomeEquipeGestor}` : "Visão geral"}
        title="Dashboard"
        description={
          nomeEquipeGestor
            ? `Desempenho da equipe ${nomeEquipeGestor} — leads, conversão e VGV do período.`
            : "Desempenho consolidado da imobiliária — leads, conversão e VGV do período."
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="VGV fechado" value={formatBRLCompact(kpi.vgvTotal)} hint={`${kpi.qtdVendas} vendas no mês`} accent />
        <KpiCard label="Leads totais" value={String(kpi.totalLeads)} hint={`${kpi.naFila} aguardando distribuição`} />
        <KpiCard label="Conversão" value={formatPercent(kpi.conversao)} hint="leads → vendas fechadas" />
        <KpiCard label="Vendas" value={String(kpi.qtdVendas)} hint="negócios fechados" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
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
            {podio[1] && <PodiumStep item={podio[1]} height="h-24" medal="2" />}
            {podio[0] && <PodiumStep item={podio[0]} height="h-32" medal="1" champion />}
            {podio[2] && <PodiumStep item={podio[2]} height="h-16" medal="3" />}
          </div>
        </Card>

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
