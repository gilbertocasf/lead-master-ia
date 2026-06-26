// Tipos do domínio Lead Master IA — V1 (dados mockados)

export type UserRole = "admin" | "gestor" | "corretor";

export type LeadSource = "Instagram" | "Facebook" | "Outro";

// Pipeline conforme aprovado no documento técnico
export type LeadStatus =
  | "novo"
  | "em_contato"
  | "visita"
  | "proposta"
  | "fechado"
  | "perdido";

export interface Equipe {
  id: string;
  nome: string;
  gerenteId: string;
  cor: string; // cor de identificação visual da equipe
}

export interface Corretor {
  id: string;
  nome: string;
  equipeId: string;
  ordemPlantao: number; // ordem na fila de plantão
  emPlantao: boolean;
  ativo: boolean;
  avatarIniciais: string;
  usuarioId?: string | null; // vínculo com usuarios.id (login)
}

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  origem: LeadSource;
  interesse: string; // ex.: "Compra • Apto 2 quartos"
  regiao: string;
  faixaValor: string;
  status: LeadStatus;
  equipeId: string; // captador já escolhe a equipe de destino
  corretorId: string | null; // null = ainda na fila de distribuição
  captadorNome: string;
  criadoEm: string; // ISO
  distribuidoEm?: string | null; // timestamp do início do SLA
  motivoPerda?: string;
}

// V1: ranking considera apenas vendas FECHADAS (sem locação)
export interface Venda {
  id: string;
  leadId: string;
  corretorId: string;
  equipeId: string;
  imovel: string;
  vgv: number; // valor da venda em R$
  fechadoEm: string; // ISO
}

export interface RankingItem {
  corretorId: string;
  nome: string;
  equipeNome: string;
  equipeCor: string;
  avatarIniciais: string;
  vgvTotal: number;
  qtdVendas: number;
  ticketMedio: number;
  posicao: number;
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: "Novo",
  em_contato: "Em contato",
  visita: "Visita agendada",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
};

// Ordem das colunas do pipeline (perdido fica fora do funil ativo)
export const PIPELINE_ORDER: LeadStatus[] = [
  "novo",
  "em_contato",
  "visita",
  "proposta",
  "fechado",
];
