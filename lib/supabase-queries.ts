import { isMockMode } from "./supabase";
import { createSupabaseServer } from "./supabase-server";
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
const TABELA_PISTAS = "leads";

const CORES_EQUIPE = ["#3B82F6", "#22C55E", "#D4A636", "#EF4444", "#8B5CF6"];

// =====================================================================
// HELPERS DE MAPEAMENTO
// =====================================================================

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function corDaEquipe(index: number): string {
  return CORES_EQUIPE[index % CORES_EQUIPE.length];
}

function comoStatus(v: unknown): LeadStatus {
  const validos: LeadStatus[] = [
    "novo",
    "em_contato",
    "visita",
    "proposta",
    "fechado",
    "perdido",
  ];
  return validos.includes(v as LeadStatus) ? (v as LeadStatus) : "novo";
}

function comoOrigem(v: unknown): LeadSource {
  const validos: LeadSource[] = ["Instagram", "Facebook", "Outro"];
  return validos.includes(v as LeadSource) ? (v as LeadSource) : "Outro";
}

// =====================================================================
// PERFIL DO USUÁRIO ATUAL
// =====================================================================

export interface UsuarioAtual {
  id: string;
  imobiliariaId: string;
  role: "admin" | "gestor" | "corretor";
  nome: string;
  equipeId: string | null;
}

export async function fetchUsuarioAtual(): Promise<UsuarioAtual | null> {
  if (isMockMode) {
    return { id: "mock-user", imobiliariaId: "mock-imob", role: "gestor", nome: "Gerente Demo", equipeId: null };
  }

  const sb = createSupabaseServer();
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) return null;

  const { data } = await sb
    .from("usuarios")
    .select("id, imobiliaria_id, role, nome, equipe_id")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!data) return null;

  return {
    id: String(data.id),
    imobiliariaId: String(data.imobiliaria_id),
    role: data.role as "admin" | "gestor" | "corretor",
    nome: data.nome as string,
    equipeId: data.equipe_id ? String(data.equipe_id) : null,
  };
}


// =====================================================================
// QUERIES BASE
// =====================================================================
// Regra de fallback:
//   - Sem env Supabase → retorna mock (modo desenvolvimento sem banco).
//   - Com env Supabase → qualquer erro de query lança exceção clara.
//     O fallback silencioso foi removido: em produção, erros devem aparecer.
// =====================================================================

export async function fetchEquipes(): Promise<Equipe[]> {
  if (isMockMode) return mock.equipes;

  const sb = createSupabaseServer();
  const { data, error } = await sb
    .from("equipes")
    .select("id, nome, gerente, created_at")
    .order("created_at", { ascending: true });

  if (error || !data) {
    throw new Error(`fetchEquipes: ${error?.message ?? "sem dados"}`);
  }

  return data.map((row, i) => ({
    id: String(row.id),
    nome: row.nome ?? "—",
    gerenteId: row.gerente ?? "—",
    cor: corDaEquipe(i),
  }));
}

export async function fetchCorretores(): Promise<Corretor[]> {
  if (isMockMode) return mock.corretores;

  const sb = createSupabaseServer();
  const { data, error } = await sb
    .from("corretores")
    .select(
      "id, nome, equipe_id, ordem_plantao, ativo, em_plantao, ultimo_lead_recebido_em, usuario_id, created_at"
    )
    .order("ordem_plantao", { ascending: true });

  if (error || !data) {
    throw new Error(`fetchCorretores: ${error?.message ?? "sem dados"}`);
  }

  return data.map((row) => ({
    id: String(row.id),
    nome: row.nome ?? "—",
    equipeId: String(row.equipe_id),
    ordemPlantao: row.ordem_plantao ?? 0,
    emPlantao: Boolean(row.em_plantao),
    ativo: Boolean(row.ativo),
    avatarIniciais: iniciais(row.nome ?? "?"),
  }));
}

export async function fetchPistas(): Promise<Lead[]> {
  if (isMockMode) return mock.leads;

  const sb = createSupabaseServer();
  const { data, error } = await sb
    .from(TABELA_PISTAS)
    .select(
      "id, nome, telefone, origem, interesse, faixa_valor, equipe_id, corretor_id, status, observacoes, created_at, distribuido_em"
    )
    .order("created_at", { ascending: false });

  if (error || !data) {
    throw new Error(`fetchPistas: ${error?.message ?? "sem dados"}`);
  }

  return data.map((row) => ({
    id: String(row.id),
    nome: row.nome ?? "—",
    telefone: row.telefone ?? "",
    origem: comoOrigem(row.origem),
    interesse: row.interesse ?? "",
    regiao: "",
    faixaValor: row.faixa_valor ?? "",
    status: comoStatus(row.status),
    equipeId: String(row.equipe_id),
    corretorId: row.corretor_id ? String(row.corretor_id) : null,
    captadorNome: "",
    criadoEm: row.created_at ?? new Date().toISOString(),
    distribuidoEm: row.distribuido_em ?? null,
    motivoPerda:
      comoStatus(row.status) === "perdido"
        ? row.observacoes ?? undefined
        : undefined,
  }));
}

export async function fetchVendas(): Promise<Venda[]> {
  if (isMockMode) return mock.vendas;

  const sb = createSupabaseServer();
  const { data, error } = await sb
    .from("vendas")
    .select("id, corretor_id, lead_id, valor_vgv, data_venda, created_at")
    .order("data_venda", { ascending: false });

  if (error || !data) {
    throw new Error(`fetchVendas: ${error?.message ?? "sem dados"}`);
  }

  return data.map((row) => ({
    id: String(row.id),
    leadId: row.lead_id ? String(row.lead_id) : "",
    corretorId: String(row.corretor_id),
    equipeId: "",
    imovel: "",
    vgv: Number(row.valor_vgv ?? 0),
    fechadoEm: row.data_venda ?? row.created_at ?? new Date().toISOString(),
  }));
}

// =====================================================================
// AGREGADO
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
// ESCOPO POR ROLE
// =====================================================================

export interface DadosEscopados {
  dados: DadosLeadMaster;
  usuario: UsuarioAtual | null;
  semEquipe: boolean;
}

export async function fetchTudoEscopado(): Promise<DadosEscopados> {
  const [dados, usuario] = await Promise.all([fetchTudo(), fetchUsuarioAtual()]);

  if (isMockMode || !usuario || usuario.role === "admin") {
    return { dados, usuario, semEquipe: false };
  }

  if (usuario.role === "gestor") {
    if (!usuario.equipeId) {
      return {
        dados: { equipes: [], corretores: [], pistas: [], vendas: [] },
        usuario,
        semEquipe: true,
      };
    }
    const { equipeId } = usuario;
    const equipes = dados.equipes.filter((e) => e.id === equipeId);
    const corretores = dados.corretores.filter((c) => c.equipeId === equipeId);
    const corretoresIds = new Set(corretores.map((c) => c.id));
    const pistas = dados.pistas.filter((l) => l.equipeId === equipeId);
    const vendas = dados.vendas.filter((v) => corretoresIds.has(v.corretorId));
    return {
      dados: { equipes, corretores, pistas, vendas },
      usuario,
      semEquipe: false,
    };
  }

  // corretor: sem acesso a dados globais
  return {
    dados: { equipes: [], corretores: [], pistas: [], vendas: [] },
    usuario,
    semEquipe: false,
  };
}

// =====================================================================
// DERIVADAS
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

export function getFunil(
  dados: DadosLeadMaster,
  equipeId?: string
): Record<LeadStatus, number> {
  const base = equipeId
    ? dados.pistas.filter((l) => l.equipeId === equipeId)
    : dados.pistas;
  const contagem = {
    novo: 0,
    em_contato: 0,
    visita: 0,
    proposta: 0,
    fechado: 0,
    perdido: 0,
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

export function getKPIs(dados: DadosLeadMaster) {
  const totalLeads = dados.pistas.length + dados.vendas.length;
  const vgvTotal = dados.vendas.reduce((s, v) => s + v.vgv, 0);
  const qtdVendas = dados.vendas.length;
  const conversao = totalLeads ? (qtdVendas / totalLeads) * 100 : 0;
  const naFila = dados.pistas.filter((l) => l.corretorId === null).length;
  return { totalLeads, vgvTotal, qtdVendas, conversao, naFila };
}

export function getProximoPlantao(
  dados: DadosLeadMaster,
  equipeId: string
): Corretor | null {
  const fila = dados.corretores
    .filter((c) => c.equipeId === equipeId && c.emPlantao && c.ativo)
    .sort((a, b) => a.ordemPlantao - b.ordemPlantao);
  return fila[0] ?? null;
}
