import {
  Corretor,
  Equipe,
  Lead,
  LeadStatus,
  RankingItem,
  Venda,
  PIPELINE_ORDER,
} from "./types";

// ──────────────────────────────────────────────
// EQUIPES — a imobiliária tem duas equipes
// ──────────────────────────────────────────────
export const equipes: Equipe[] = [
  { id: "eq-azul", nome: "Equipe Atlântico", gerenteId: "g1", cor: "#3B82F6" },
  { id: "eq-verde", nome: "Equipe Horizonte", gerenteId: "g2", cor: "#22C55E" },
];

// ──────────────────────────────────────────────
// CORRETORES — ~6 por equipe, com ordem de plantão
// ──────────────────────────────────────────────
export const corretores: Corretor[] = [
  // Equipe Atlântico
  { id: "c1", nome: "Rafael Mendes", equipeId: "eq-azul", ordemPlantao: 1, emPlantao: true, ativo: true, avatarIniciais: "RM" },
  { id: "c2", nome: "Beatriz Lima", equipeId: "eq-azul", ordemPlantao: 2, emPlantao: true, ativo: true, avatarIniciais: "BL" },
  { id: "c3", nome: "Diego Farias", equipeId: "eq-azul", ordemPlantao: 3, emPlantao: false, ativo: true, avatarIniciais: "DF" },
  { id: "c4", nome: "Camila Souza", equipeId: "eq-azul", ordemPlantao: 4, emPlantao: true, ativo: true, avatarIniciais: "CS" },
  { id: "c5", nome: "Henrique Alves", equipeId: "eq-azul", ordemPlantao: 5, emPlantao: true, ativo: true, avatarIniciais: "HA" },
  { id: "c6", nome: "Patrícia Rocha", equipeId: "eq-azul", ordemPlantao: 6, emPlantao: false, ativo: true, avatarIniciais: "PR" },
  // Equipe Horizonte
  { id: "c7", nome: "Lucas Pereira", equipeId: "eq-verde", ordemPlantao: 1, emPlantao: true, ativo: true, avatarIniciais: "LP" },
  { id: "c8", nome: "Aline Castro", equipeId: "eq-verde", ordemPlantao: 2, emPlantao: true, ativo: true, avatarIniciais: "AC" },
  { id: "c9", nome: "Marcos Vieira", equipeId: "eq-verde", ordemPlantao: 3, emPlantao: true, ativo: true, avatarIniciais: "MV" },
  { id: "c10", nome: "Juliana Dias", equipeId: "eq-verde", ordemPlantao: 4, emPlantao: false, ativo: true, avatarIniciais: "JD" },
  { id: "c11", nome: "Felipe Nunes", equipeId: "eq-verde", ordemPlantao: 5, emPlantao: true, ativo: true, avatarIniciais: "FN" },
  { id: "c12", nome: "Sofia Barros", equipeId: "eq-verde", ordemPlantao: 6, emPlantao: true, ativo: true, avatarIniciais: "SB" },
];

export const gerentes = [
  { id: "g1", nome: "Roberto Tavares", equipeId: "eq-azul" },
  { id: "g2", nome: "Cláudia Menezes", equipeId: "eq-verde" },
];

// helper de data ISO a partir de "dias atrás"
const diasAtras = (d: number) =>
  new Date(Date.now() - d * 86_400_000).toISOString();
const horasAtras = (h: number) =>
  new Date(Date.now() - h * 3_600_000).toISOString();

// ──────────────────────────────────────────────
// LEADS — alguns na fila (corretorId null), outros distribuídos
// ──────────────────────────────────────────────
export const leads: Lead[] = [
  // Fila Atlântico (aguardando distribuição do gerente)
  { id: "l1", nome: "Marina Costa", telefone: "(62) 99812-3344", origem: "Instagram", interesse: "Compra • Apto 2 quartos", regiao: "Setor Bueno", faixaValor: "R$ 400–600 mil", status: "novo", equipeId: "eq-azul", corretorId: null, captadorNome: "Tiago (captador)", criadoEm: horasAtras(3) },
  { id: "l2", nome: "Eduardo Ramos", telefone: "(62) 99744-1290", origem: "Facebook", interesse: "Compra • Casa 3 quartos", regiao: "Jardim Goiás", faixaValor: "R$ 800 mil–1,2 mi", status: "novo", equipeId: "eq-azul", corretorId: null, captadorNome: "Tiago (captador)", criadoEm: horasAtras(9) },
  // Fila Horizonte
  { id: "l3", nome: "Fernanda Aguiar", telefone: "(62) 99655-7781", origem: "Instagram", interesse: "Compra • Cobertura", regiao: "Setor Marista", faixaValor: "R$ 1,5–2 mi", status: "novo", equipeId: "eq-verde", corretorId: null, captadorNome: "Tiago (captador)", criadoEm: horasAtras(5) },
  { id: "l4", nome: "Gustavo Lemos", telefone: "(62) 99533-4412", origem: "Facebook", interesse: "Compra • Apto 1 quarto", regiao: "Setor Oeste", faixaValor: "R$ 250–350 mil", status: "novo", equipeId: "eq-verde", corretorId: null, captadorNome: "Tiago (captador)", criadoEm: horasAtras(20) },

  // Distribuídos e em andamento — Atlântico
  { id: "l5", nome: "Paula Andrade", telefone: "(62) 99411-8820", origem: "Instagram", interesse: "Compra • Apto 3 quartos", regiao: "Setor Bueno", faixaValor: "R$ 600–800 mil", status: "em_contato", equipeId: "eq-azul", corretorId: "c1", captadorNome: "Tiago (captador)", criadoEm: diasAtras(2) },
  { id: "l6", nome: "Ricardo Maia", telefone: "(62) 99322-1170", origem: "Facebook", interesse: "Compra • Casa condomínio", regiao: "Aldeia do Vale", faixaValor: "R$ 1,2–1,8 mi", status: "visita", equipeId: "eq-azul", corretorId: "c2", captadorNome: "Tiago (captador)", criadoEm: diasAtras(4) },
  { id: "l7", nome: "Tatiane Reis", telefone: "(62) 99288-6655", origem: "Instagram", interesse: "Compra • Apto 2 quartos", regiao: "Setor Sul", faixaValor: "R$ 450–550 mil", status: "proposta", equipeId: "eq-azul", corretorId: "c1", captadorNome: "Tiago (captador)", criadoEm: diasAtras(6) },
  { id: "l8", nome: "André Fontes", telefone: "(62) 99177-2244", origem: "Facebook", interesse: "Compra • Casa 4 quartos", regiao: "Jardim Goiás", faixaValor: "R$ 1–1,5 mi", status: "perdido", equipeId: "eq-azul", corretorId: "c4", captadorNome: "Tiago (captador)", criadoEm: diasAtras(8), motivoPerda: "Comprou com concorrente" },

  // Distribuídos e em andamento — Horizonte
  { id: "l9", nome: "Vanessa Pires", telefone: "(62) 99066-3311", origem: "Instagram", interesse: "Compra • Cobertura", regiao: "Setor Marista", faixaValor: "R$ 2–3 mi", status: "em_contato", equipeId: "eq-verde", corretorId: "c7", captadorNome: "Tiago (captador)", criadoEm: diasAtras(3) },
  { id: "l10", nome: "Bruno Teixeira", telefone: "(62) 98955-4400", origem: "Facebook", interesse: "Compra • Apto 2 quartos", regiao: "Setor Oeste", faixaValor: "R$ 350–500 mil", status: "visita", equipeId: "eq-verde", corretorId: "c8", captadorNome: "Tiago (captador)", criadoEm: diasAtras(5) },
  { id: "l11", nome: "Larissa Gomes", telefone: "(62) 98844-7788", origem: "Instagram", interesse: "Compra • Apto 3 quartos", regiao: "Setor Bueno", faixaValor: "R$ 700–900 mil", status: "proposta", equipeId: "eq-verde", corretorId: "c9", captadorNome: "Tiago (captador)", criadoEm: diasAtras(7) },
];

// ──────────────────────────────────────────────
// VENDAS FECHADAS — base do ranking VGV (sem locação)
// ──────────────────────────────────────────────
export const vendas: Venda[] = [
  { id: "v1", leadId: "l-old1", corretorId: "c1", equipeId: "eq-azul", imovel: "Apto Setor Bueno • 92m²", vgv: 620_000, fechadoEm: diasAtras(12) },
  { id: "v2", leadId: "l-old2", corretorId: "c1", equipeId: "eq-azul", imovel: "Casa Jardim Goiás • 210m²", vgv: 1_150_000, fechadoEm: diasAtras(20) },
  { id: "v3", leadId: "l-old3", corretorId: "c2", equipeId: "eq-azul", imovel: "Cobertura Setor Marista", vgv: 1_980_000, fechadoEm: diasAtras(9) },
  { id: "v4", leadId: "l-old4", corretorId: "c7", equipeId: "eq-verde", imovel: "Casa Aldeia do Vale • 320m²", vgv: 2_450_000, fechadoEm: diasAtras(6) },
  { id: "v5", leadId: "l-old5", corretorId: "c7", equipeId: "eq-verde", imovel: "Apto Setor Oeste • 88m²", vgv: 540_000, fechadoEm: diasAtras(15) },
  { id: "v6", leadId: "l-old6", corretorId: "c9", equipeId: "eq-verde", imovel: "Apto Setor Bueno • 110m²", vgv: 780_000, fechadoEm: diasAtras(3) },
  { id: "v7", leadId: "l-old7", corretorId: "c5", equipeId: "eq-azul", imovel: "Apto Setor Sul • 75m²", vgv: 460_000, fechadoEm: diasAtras(22) },
  { id: "v8", leadId: "l-old8", corretorId: "c8", equipeId: "eq-verde", imovel: "Casa condomínio • 280m²", vgv: 1_320_000, fechadoEm: diasAtras(11) },
  { id: "v9", leadId: "l-old9", corretorId: "c2", equipeId: "eq-azul", imovel: "Apto Jardim Goiás • 130m²", vgv: 890_000, fechadoEm: diasAtras(2) },
  { id: "v10", leadId: "l-old10", corretorId: "c11", equipeId: "eq-verde", imovel: "Apto Setor Marista • 95m²", vgv: 670_000, fechadoEm: diasAtras(18) },
];

// ──────────────────────────────────────────────
// FUNÇÕES DERIVADAS
// ──────────────────────────────────────────────
export function getEquipe(id: string) {
  return equipes.find((e) => e.id === id);
}

export function getCorretor(id: string | null) {
  if (!id) return null;
  return corretores.find((c) => c.id === id) ?? null;
}

// Ranking VGV — soma de vendas fechadas por corretor, ordem decrescente
export function buildRanking(equipeId?: string): RankingItem[] {
  const filtradas = equipeId
    ? vendas.filter((v) => v.equipeId === equipeId)
    : vendas;

  const mapa = new Map<string, { total: number; qtd: number }>();
  for (const v of filtradas) {
    const atual = mapa.get(v.corretorId) ?? { total: 0, qtd: 0 };
    atual.total += v.vgv;
    atual.qtd += 1;
    mapa.set(v.corretorId, atual);
  }

  const itens: RankingItem[] = [];
  for (const [corretorId, dados] of mapa) {
    const c = getCorretor(corretorId);
    if (!c) continue;
    const eq = getEquipe(c.equipeId);
    itens.push({
      corretorId,
      nome: c.nome,
      equipeNome: eq?.nome ?? "—",
      equipeCor: eq?.cor ?? "#8A96AD",
      avatarIniciais: c.avatarIniciais,
      vgvTotal: dados.total,
      qtdVendas: dados.qtd,
      ticketMedio: dados.total / dados.qtd,
      posicao: 0,
    });
  }

  itens.sort((a, b) => b.vgvTotal - a.vgvTotal);
  itens.forEach((item, i) => (item.posicao = i + 1));
  return itens;
}

// Contagem de leads por status (funil) — exclui perdidos do funil ativo
export function funilPorStatus(equipeId?: string): Record<LeadStatus, number> {
  const base = equipeId ? leads.filter((l) => l.equipeId === equipeId) : leads;
  const contagem = {
    novo: 0, em_contato: 0, visita: 0, proposta: 0, fechado: 0, perdido: 0,
  } as Record<LeadStatus, number>;
  for (const l of base) contagem[l.status] += 1;
  // soma das vendas fechadas reais como "fechado" do período
  contagem.fechado += (equipeId ? vendas.filter((v) => v.equipeId === equipeId) : vendas).length;
  return contagem;
}

// KPIs do dashboard
export function dashboardKPIs() {
  const totalLeads = leads.length + vendas.length;
  const vgvTotal = vendas.reduce((s, v) => s + v.vgv, 0);
  const qtdVendas = vendas.length;
  const conversao = (qtdVendas / totalLeads) * 100;
  const naFila = leads.filter((l) => l.corretorId === null).length;
  return { totalLeads, vgvTotal, qtdVendas, conversao, naFila };
}

// Próximo corretor de plantão sugerido para uma equipe (round-robin de plantão)
export function proximoPlantao(equipeId: string): Corretor | null {
  const fila = corretores
    .filter((c) => c.equipeId === equipeId && c.emPlantao && c.ativo)
    .sort((a, b) => a.ordemPlantao - b.ordemPlantao);
  return fila[0] ?? null;
}

export { PIPELINE_ORDER };
