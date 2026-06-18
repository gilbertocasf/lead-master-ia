import { supabase, hasSupabaseEnv } from "./supabase";
import {
  Corretor,
  Equipe,
  Lead,
  LeadSource,
  LeadStatus,
  RankingItem,
  Venda,
} from "./types";
import * as mock from "./mock-data";

// =====================================================================
// CONFIG
// =====================================================================
// Nome real da tabela de leads no Supabase (auditoria 2026-06-18: tabela é "leads", não "pistas").
const TABELA_PISTAS = "leads";

// Paleta de cores das equipes (o banco não armazena cor; derivamos por ordem).
const CORES_EQUIPE = ["#3B82F6", "#22C55E", "#D4A636", "#EF4444", "#8B5CF6"];

// =====================================================================
// HELPERS DE MAPEAMENTO
// =====================================================================

// Iniciais a partir do nome: "Rafael Mendes" -> "RM"
function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Cor estável para uma equipe, baseada na posição na lista.
function corDaEquipe(index: number): string {
  return CORES_EQUIPE[index % CORES_EQUIPE.length];
}

// Garante que um valor caia em um LeadStatus válido (fallback "novo").
function comoStatus(v: unknown): LeadStatus {
  const validos: LeadStatus[] = [
    "novo", "em_contato", "visita", "proposta", "fechado", "perdido",
  ];
  return validos.includes(v as LeadStatus) ? (v as LeadStatus) : "novo";
}

function comoOrigem(v: unknown): LeadSource {
  const validos: LeadSource[] = ["Instagram", "Facebook", "Outro"];
  return validos.includes(v as LeadSource) ? (v as LeadSource) : "Outro";
}

// =====================================================================
// QUERIES BASE
// =====================================================================
// Cada função: se não há env do Supabase, retorna o mock; caso contrário
// busca no banco e mapeia as colunas para os tipos que a app já usa.
// Em caso de erro de rede/permissão, também cai no mock (degrada com graça).
// =====================================================================

export async function fetchEquipes(): Promise<Equipe[]> {
  if (!hasSupabaseEnv || !supabase) return mock.equipes;

  const { data, error } = await supabase
    .from("equipes")
    .select("id, nome, gerente, created_at")
    .order("created_at", { ascending: true });

  if (error || !data) return mock.equipes;

  return data.map((row, i) => ({
    id: String(row.id),
    nome: row.nome ?? "—",
    gerenteId: row.gerente ?? "—", // banco guarda o nome do gerente como texto
    cor: corDaEquipe(i),
  }));
}

export async function fetchCorretores(): Promise<Corretor[]> {
  if (!hasSupabaseEnv || !supabase) return mock.corretores;

  const { data, error } = await supabase
    .from("corretores")
    .select("id, nome, equipe_id, ordem_plantao, ativo, created_at")
    .order("ordem_plantao", { ascending: true });

  if (error || !data) return mock.corretores;

  return data.map((row) => ({
    id: String(row.id),
    nome: row.nome ?? "—",
    equipeId: String(row.equipe_id),
    ordemPlantao: row.ordem_plantao ?? 0,
    // O banco não tem coluna de "em plantão"; usamos "ativo" como proxy visual.
    emPlantao: Boolean(row.ativo),
    ativo: Boolean(row.ativo),
    avatarIniciais: iniciais(row.nome ?? "?"),
  }));
}

// Lê da tabela "pistas" e mapeia para o tipo Lead da aplicação.
export async function fetchPistas(): Promise<Lead[]> {
  if (!hasSupabaseEnv || !supabase) return mock.leads;

  const { data, error } = await supabase
    .from(TABELA_PISTAS)
    .select(
      "id, nome, telefone, origem, interesse, faixa_valor, equipe_id, corretor_id, status, observacoes, created_at"
    )
    .order("created_at", { ascending: false });

  if (error || !data) return mock.leads;

  return data.map((row) => ({
    id: String(row.id),
    nome: row.nome ?? "—",
    telefone: row.telefone ?? "",
    origem: comoOrigem(row.origem),
    interesse: row.interesse ?? "",
    // "pistas" não tem coluna de região; campo opcional na UI, fica vazio.
    regiao: "",
    faixaValor: row.faixa_valor ?? "",
    status: comoStatus(row.status),
    equipeId: String(row.equipe_id),
    corretorId: row.corretor_id ? String(row.corretor_id) : null,
    // "pistas" não tem captador; usamos a observação como apoio textual.
    captadorNome: "",
    criadoEm: row.created_at ?? new Date().toISOString(),
    // observacoes vira motivo de perda quando o status é "perdido".
    motivoPerda:
      comoStatus(row.status) === "perdido"
        ? row.observacoes ?? undefined
        : undefined,
  }));
}

export async function fetchVendas(): Promise<Venda[]> {
  if (!hasSupabaseEnv || !supabase) return mock.vendas;

  const { data, error } = await supabase
    .from("vendas")
    .select("id, corretor_id, lead_id, valor_vgv, data_venda, created_at")
    .order("data_venda", { ascending: false });

  if (error || !data) return mock.vendas;

  return data.map((row) => ({
    id: String(row.id),
    leadId: row.lead_id ? String(row.lead_id) : "",
    corretorId: String(row.corretor_id),
    // "vendas" não guarda equipe_id; resolvido depois via corretor (ver getRanking).
    equipeId: "",
    imovel: "",
    vgv: Number(row.valor_vgv ?? 0),
    fechadoEm: row.data_venda ?? row.created_at ?? new Date().toISOString(),
  }));
}

// =====================================================================
// AGREGADO — carrega tudo de uma vez (as páginas usam isto)
// =====================================================================

export interface DadosLeadMaster {
  equipes: Equipe[];
  corretores: Corretor[];
  pistas: Lead[];
  vendas: Venda[];
}

export async function fetchTudo(): Promise<DadosLeadMaster> {
  const [equipes, corretores, pistas, vendas] = await Promise.all([
    fetchEquipes(),
    fetchCorretores(),
    fetchPistas(),
    fetchVendas(),
  ]);
  return { equipes, corretores, pistas, vendas };
}

// =====================================================================
// DERIVADAS — mesma lógica do mock-data, operando sobre dados recebidos
// =====================================================================

export function getEquipe(equipes: Equipe[], id: string): Equipe | undefined {
  return equipes.find((e) => e.id === id);
}

export function getCorretor(
  corretores: Corretor[],
  id: string | null
): Corretor | null {
  if (!id) return null;
  return corretores.find((c) => c.id === id) ?? null;
}

// Ranking VGV — soma de vendas por corretor, ordem decrescente.
// Resolve a equipe de cada venda a partir do corretor.
export function getRanking(
  dados: DadosLeadMaster,
  equipeId?: string
): RankingItem[] {
  const { corretores, equipes, vendas } = dados;

  const mapa = new Map<string, { total: number; qtd: number }>();
  for (const v of vendas) {
    const corretor = corretores.find((c) => c.id === v.corretorId);
    if (!corretor) continue;
    if (equipeId && corretor.equipeId !== equipeId) continue;
    const atual = mapa.get(v.corretorId) ?? { total: 0, qtd: 0 };
    atual.total += v.vgv;
    atual.qtd += 1;
    mapa.set(v.corretorId, atual);
  }

  const itens: RankingItem[] = [];
  for (const [corretorId, d] of mapa) {
    const c = corretores.find((x) => x.id === corretorId);
    if (!c) continue;
    const eq = equipes.find((e) => e.id === c.equipeId);
    itens.push({
      corretorId,
      nome: c.nome,
      equipeNome: eq?.nome ?? "—",
      equipeCor: eq?.cor ?? "#8A96AD",
      avatarIniciais: c.avatarIniciais,
      vgvTotal: d.total,
      qtdVendas: d.qtd,
      ticketMedio: d.qtd ? d.total / d.qtd : 0,
      posicao: 0,
    });
  }

  itens.sort((a, b) => b.vgvTotal - a.vgvTotal);
  itens.forEach((item, i) => (item.posicao = i + 1));
  return itens;
}

// Funil por status (espelha mock.funilPorStatus)
export function getFunil(
  dados: DadosLeadMaster,
  equipeId?: string
): Record<LeadStatus, number> {
  const base = equipeId
    ? dados.pistas.filter((l) => l.equipeId === equipeId)
    : dados.pistas;
  const contagem = {
    novo: 0, em_contato: 0, visita: 0, proposta: 0, fechado: 0, perdido: 0,
  } as Record<LeadStatus, number>;
  for (const l of base) contagem[l.status] += 1;

  const vendasFiltradas = equipeId
    ? dados.vendas.filter((v) => {
        const c = dados.corretores.find((x) => x.id === v.corretorId);
        return c?.equipeId === equipeId;
      })
    : dados.vendas;
  contagem.fechado += vendasFiltradas.length;
  return contagem;
}

// KPIs do dashboard (espelha mock.dashboardKPIs)
export function getKPIs(dados: DadosLeadMaster) {
  const totalLeads = dados.pistas.length + dados.vendas.length;
  const vgvTotal = dados.vendas.reduce((s, v) => s + v.vgv, 0);
  const qtdVendas = dados.vendas.length;
  const conversao = totalLeads ? (qtdVendas / totalLeads) * 100 : 0;
  const naFila = dados.pistas.filter((l) => l.corretorId === null).length;
  return { totalLeads, vgvTotal, qtdVendas, conversao, naFila };
}

// Próximo de plantão (espelha mock.proximoPlantao)
export function getProximoPlantao(
  dados: DadosLeadMaster,
  equipeId: string
): Corretor | null {
  const fila = dados.corretores
    .filter((c) => c.equipeId === equipeId && c.emPlantao && c.ativo)
    .sort((a, b) => a.ordemPlantao - b.ordemPlantao);
  return fila[0] ?? null;
}
