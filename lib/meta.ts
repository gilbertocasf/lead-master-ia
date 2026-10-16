// Cliente da Graph API da Meta (Lead Ads) — server-side exclusivo.
//
// Este arquivo NÃO importa nada de "@/..." nem pacotes: só o módulo crypto do
// Node e o fetch global. Assim as funções puras (assinatura, mapeamento de
// field_data, backoff, interpretação do webhook) podem ser testadas isoladas.
//
// Segurança:
//   - O access token e o app secret nunca aparecem em logs, mensagens de erro
//     ou respostas. URLs com token nunca são registradas.
//   - Os dados pessoais do lead (field_data) nunca são registrados.

import { createHash, createHmac, timingSafeEqual } from "crypto";

export const VERSAO_GRAPH_PADRAO = "v25.0";
const GRAPH_HOST = "graph.facebook.com";
const GRAPH_ORIGEM = `https://${GRAPH_HOST}`;

// ─────────────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────────────

export interface ConfigMeta {
  appSecret: string | null;
  verifyToken: string | null;
  accessToken: string | null;
  versao: string;
}

function envLimpa(valor: string | undefined): string | null {
  const t = (valor ?? "").trim();
  return t ? t : null;
}

export function obterConfigMeta(): ConfigMeta {
  const versaoEnv = envLimpa(process.env.META_GRAPH_VERSION);
  const versao =
    versaoEnv && /^v\d{1,3}\.\d{1,2}$/.test(versaoEnv)
      ? versaoEnv
      : VERSAO_GRAPH_PADRAO;
  return {
    appSecret: envLimpa(process.env.META_APP_SECRET),
    verifyToken: envLimpa(process.env.META_VERIFY_TOKEN),
    accessToken: envLimpa(process.env.META_ACCESS_TOKEN),
    versao,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Criptografia
// ─────────────────────────────────────────────────────────────────────

/**
 * Valida o header X-Hub-Signature-256 ("sha256=" + HMAC-SHA256 em hex do corpo
 * bruto, usando o App Secret como chave). Comparação em tempo constante.
 */
export function validarAssinatura(
  corpoBruto: Uint8Array | string, // Buffer com os bytes brutos (ou texto UTF-8)
  header: string | null | undefined,
  appSecret: string | null | undefined
): boolean {
  if (!header || !appSecret) return false;
  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(header.trim());
  if (!m) return false;
  const recebido = Buffer.from(m[1], "hex");
  const esperado = createHmac("sha256", appSecret)
    .update(typeof corpoBruto === "string" ? Buffer.from(corpoBruto, "utf8") : corpoBruto)
    .digest();
  if (recebido.length !== esperado.length || esperado.length !== 32) {
    return false;
  }
  return timingSafeEqual(recebido, esperado);
}

/** appsecret_proof = HMAC-SHA256(access_token, chave = app_secret) em hex. */
export function gerarAppSecretProof(
  accessToken: string,
  appSecret: string
): string {
  return createHmac("sha256", appSecret).update(accessToken, "utf8").digest("hex");
}

/**
 * Compara dois textos (tokens, segredos) em tempo constante, sem vazar o
 * comprimento: compara os SHA-256 de ambos.
 */
export function compararTextoSeguro(
  recebido: string | null | undefined,
  esperado: string | null | undefined
): boolean {
  if (typeof recebido !== "string" || typeof esperado !== "string") return false;
  if (!esperado) return false;
  const a = createHash("sha256").update(recebido, "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b) && recebido.length === esperado.length;
}

// ─────────────────────────────────────────────────────────────────────
// Erros da Graph API
// ─────────────────────────────────────────────────────────────────────

/**
 * token       → token inválido/expirado (code 190, 102). Alertar; tentar de novo depois.
 * permissao   → sem permissão (code 10, 200–299). Alertar; tentar de novo depois.
 * transitorio → limite de taxa (4, 17, 32, 613, 80000–80099), erro temporário
 *               (1, 2, is_transient), HTTP 5xx/429, rede, timeout.
 * permanente  → parâmetro/campo/objeto inválido (100) e demais casos.
 */
export type TipoErroMeta = "token" | "permissao" | "transitorio" | "permanente";

export interface ErroGraph {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  is_transient?: boolean;
}

export function classificarErroMeta(
  httpStatus: number | null,
  erro: ErroGraph | null
): TipoErroMeta {
  const code = typeof erro?.code === "number" ? erro.code : null;

  if (code !== null) {
    if (code === 190 || code === 102) return "token";
    if (
      code === 4 ||
      code === 17 ||
      code === 32 ||
      code === 613 ||
      (code >= 80000 && code <= 80099)
    ) {
      return "transitorio";
    }
    if (code === 1 || code === 2 || erro?.is_transient === true) {
      return "transitorio";
    }
    if (code === 10 || (code >= 200 && code <= 299)) return "permissao";
    if (code === 100) return "permanente";
  }

  if (httpStatus === null) return "transitorio"; // rede / timeout
  if (httpStatus >= 500 || httpStatus === 429) return "transitorio";
  if (httpStatus === 401) return "token";
  if (httpStatus === 403) return "permissao";
  return "permanente";
}

export class MetaApiErro extends Error {
  readonly tipo: TipoErroMeta;
  readonly code: number | null;
  readonly subcode: number | null;
  readonly httpStatus: number | null;

  constructor(
    tipo: TipoErroMeta,
    mensagem: string,
    code: number | null,
    subcode: number | null,
    httpStatus: number | null
  ) {
    super(mensagem);
    this.name = "MetaApiErro";
    this.tipo = tipo;
    this.code = code;
    this.subcode = subcode;
    this.httpStatus = httpStatus;
  }

  /** Código curto, seguro para gravar em ultimo_erro (sem dados pessoais). */
  codigoCurto(): string {
    const partes = [`graph_${this.tipo}`];
    if (this.code !== null) {
      partes.push(
        this.subcode !== null ? `${this.code}/${this.subcode}` : String(this.code)
      );
    } else if (this.httpStatus !== null) {
      partes.push(`http_${this.httpStatus}`);
    } else {
      partes.push(this.message.slice(0, 40));
    }
    return partes.join(":");
  }
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function extrairErroGraph(corpo: unknown): ErroGraph | null {
  if (!ehObjeto(corpo) || !ehObjeto(corpo.error)) return null;
  const e = corpo.error;
  return {
    message: typeof e.message === "string" ? e.message : undefined,
    type: typeof e.type === "string" ? e.type : undefined,
    code: typeof e.code === "number" ? e.code : undefined,
    error_subcode:
      typeof e.error_subcode === "number" ? e.error_subcode : undefined,
    is_transient: typeof e.is_transient === "boolean" ? e.is_transient : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────
// HTTP
// ─────────────────────────────────────────────────────────────────────

const TIMEOUT_MINIMO_MS = 1000;
const TIMEOUT_MAXIMO_MS = 10000;

async function getGraph(url: URL, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const ms = Math.min(TIMEOUT_MAXIMO_MS, Math.max(TIMEOUT_MINIMO_MS, timeoutMs));
  const timer = setTimeout(() => controller.abort(), ms);

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    const abortado =
      controller.signal.aborted ||
      (err instanceof Error && err.name === "AbortError");
    throw new MetaApiErro(
      "transitorio",
      abortado ? "timeout_graph_api" : "falha_rede_graph_api",
      null,
      null,
      null
    );
  } finally {
    clearTimeout(timer);
  }

  let corpo: unknown = null;
  try {
    corpo = await res.json();
  } catch {
    corpo = null;
  }

  const erro = extrairErroGraph(corpo);
  if (!res.ok || erro) {
    const tipo = classificarErroMeta(res.status, erro);
    const mensagem = (erro?.message ?? `http_${res.status}`).slice(0, 200);
    throw new MetaApiErro(
      tipo,
      mensagem,
      typeof erro?.code === "number" ? erro.code : null,
      typeof erro?.error_subcode === "number" ? erro.error_subcode : null,
      res.status
    );
  }
  if (corpo === null) {
    throw new MetaApiErro("transitorio", "resposta_invalida_graph_api", null, null, res.status);
  }
  return corpo;
}

function exigirCredenciais(config: ConfigMeta): { token: string; secret: string } {
  if (!config.accessToken || !config.appSecret) {
    throw new MetaApiErro("token", "meta_nao_configurada", null, null, null);
  }
  return { token: config.accessToken, secret: config.appSecret };
}

function aplicarCredenciais(url: URL, token: string, secret: string): void {
  url.searchParams.set("access_token", token);
  url.searchParams.set("appsecret_proof", gerarAppSecretProof(token, secret));
}

export function idMetaValido(v: unknown): v is string {
  return typeof v === "string" && /^\d{1,32}$/.test(v);
}

// ─────────────────────────────────────────────────────────────────────
// Leitura de leads
// ─────────────────────────────────────────────────────────────────────

export interface CampoMeta {
  name: string;
  values: string[];
}

export interface ConsentimentoMeta {
  checkbox_key: string;
  is_checked: boolean | null;
}

export interface LeadMeta {
  id: string;
  created_time: string | null;
  ad_id: string | null;
  ad_name: string | null;
  adset_id: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  form_id: string | null;
  platform: string | null;
  is_organic: boolean | null;
  field_data: CampoMeta[];
  custom_disclaimer_responses: ConsentimentoMeta[];
}

export const CAMPOS_LEAD_ESTENDIDOS =
  "id,created_time,ad_id,ad_name,adset_id,campaign_id,campaign_name,form_id,platform,is_organic,field_data,custom_disclaimer_responses";
export const CAMPOS_LEAD_BASICOS = "id,created_time,ad_id,form_id,field_data";

function textoOuNull(v: unknown, max = 300): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t.slice(0, max) : null;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function interpretarCampos(v: unknown): CampoMeta[] {
  if (!Array.isArray(v)) return [];
  const campos: CampoMeta[] = [];
  for (const item of v.slice(0, 200)) {
    if (!ehObjeto(item) || typeof item.name !== "string") continue;
    const name = item.name.trim().slice(0, 200);
    if (!name) continue;
    const valores = Array.isArray(item.values) ? item.values : [];
    const values = valores
      .map((x) => textoOuNull(x, 1000))
      .filter((x): x is string => x !== null)
      .slice(0, 50);
    campos.push({ name, values });
  }
  return campos;
}

function interpretarConsentimentos(v: unknown): ConsentimentoMeta[] {
  if (!Array.isArray(v)) return [];
  const lista: ConsentimentoMeta[] = [];
  for (const item of v.slice(0, 50)) {
    if (!ehObjeto(item)) continue;
    const chave = textoOuNull(item.checkbox_key, 200);
    if (!chave) continue;
    const marcado = item.is_checked;
    lista.push({
      checkbox_key: chave,
      is_checked:
        typeof marcado === "boolean"
          ? marcado
          : marcado === "1" || marcado === "true"
          ? true
          : marcado === "0" || marcado === "false"
          ? false
          : null,
    });
  }
  return lista;
}

/** Interpreta o JSON da Graph API para um lead. Lança se não houver id. */
export function interpretarLead(corpo: unknown): LeadMeta {
  if (!ehObjeto(corpo)) {
    throw new MetaApiErro("transitorio", "resposta_invalida_graph_api", null, null, null);
  }
  const id = textoOuNull(corpo.id, 40);
  if (!id) {
    throw new MetaApiErro("permanente", "lead_sem_id", null, null, null);
  }
  return {
    id,
    created_time: textoOuNull(corpo.created_time, 40),
    ad_id: textoOuNull(corpo.ad_id, 40),
    ad_name: textoOuNull(corpo.ad_name, 300),
    adset_id: textoOuNull(corpo.adset_id, 40),
    campaign_id: textoOuNull(corpo.campaign_id, 40),
    campaign_name: textoOuNull(corpo.campaign_name, 300),
    form_id: textoOuNull(corpo.form_id, 40),
    platform: textoOuNull(corpo.platform, 20),
    is_organic: typeof corpo.is_organic === "boolean" ? corpo.is_organic : null,
    field_data: interpretarCampos(corpo.field_data),
    custom_disclaimer_responses: interpretarConsentimentos(
      corpo.custom_disclaimer_responses
    ),
  };
}

/**
 * GET /{versão}/{leadgen_id}. Tenta os campos estendidos; se a Meta recusar
 * algum campo (code 100), repete com os campos básicos.
 */
export async function buscarLead(
  leadgenId: string,
  config: ConfigMeta,
  opcoes: { timeoutMs?: number } = {}
): Promise<LeadMeta> {
  if (!idMetaValido(leadgenId)) {
    throw new MetaApiErro("permanente", "leadgen_id_invalido", null, null, null);
  }
  const { token, secret } = exigirCredenciais(config);
  const timeoutMs = opcoes.timeoutMs ?? 8000;

  const montar = (campos: string): URL => {
    const url = new URL(`${GRAPH_ORIGEM}/${config.versao}/${leadgenId}`);
    url.searchParams.set("fields", campos);
    aplicarCredenciais(url, token, secret);
    return url;
  };

  const inicio = Date.now();
  try {
    return interpretarLead(await getGraph(montar(CAMPOS_LEAD_ESTENDIDOS), timeoutMs));
  } catch (err) {
    if (err instanceof MetaApiErro && err.code === 100) {
      const restante = timeoutMs - (Date.now() - inicio);
      return interpretarLead(
        await getGraph(montar(CAMPOS_LEAD_BASICOS), Math.max(TIMEOUT_MINIMO_MS, restante))
      );
    }
    throw err;
  }
}

export interface LeadResumoMeta {
  id: string;
  created_time: string | null;
  ad_id: string | null;
  form_id: string | null;
}

/**
 * GET /{versão}/{form_id}/leads com filtro time_created > desdeUnix.
 * Segue paging.next até maxPaginas ou até o prazo. Por padrão pede só
 * identificadores (sem field_data): a leitura completa é feita depois, lead a
 * lead, pelo processamento do evento.
 */
export async function listarLeadsDoFormulario(
  formId: string,
  desdeUnix: number,
  config: ConfigMeta,
  opcoes: {
    maxPaginas?: number;
    limitePorPagina?: number;
    prazoFinal?: number;
    campos?: string;
  } = {}
): Promise<{ leads: LeadResumoMeta[]; paginas: number; truncado: boolean }> {
  if (!idMetaValido(formId)) {
    throw new MetaApiErro("permanente", "form_id_invalido", null, null, null);
  }
  const { token, secret } = exigirCredenciais(config);
  const maxPaginas = Math.max(1, Math.min(opcoes.maxPaginas ?? 5, 20));
  const limite = Math.max(1, Math.min(opcoes.limitePorPagina ?? 100, 500));
  const prazoFinal = opcoes.prazoFinal ?? Date.now() + 15000;

  let url: URL | null = new URL(`${GRAPH_ORIGEM}/${config.versao}/${formId}/leads`);
  url.searchParams.set("fields", opcoes.campos ?? "id,created_time,ad_id,form_id");
  url.searchParams.set("limit", String(limite));
  url.searchParams.set(
    "filtering",
    JSON.stringify([
      { field: "time_created", operator: "GREATER_THAN", value: Math.floor(desdeUnix) },
    ])
  );
  aplicarCredenciais(url, token, secret);

  const leads: LeadResumoMeta[] = [];
  let paginas = 0;
  let truncado = false;

  while (url) {
    const restante = prazoFinal - Date.now();
    if (paginas >= maxPaginas || restante < TIMEOUT_MINIMO_MS) {
      truncado = true;
      break;
    }
    const corpo = await getGraph(url, restante);
    paginas += 1;

    if (ehObjeto(corpo) && Array.isArray(corpo.data)) {
      for (const item of corpo.data) {
        if (!ehObjeto(item)) continue;
        const id = textoOuNull(item.id, 40);
        if (!id || !idMetaValido(id)) continue;
        leads.push({
          id,
          created_time: textoOuNull(item.created_time, 40),
          ad_id: textoOuNull(item.ad_id, 40),
          form_id: textoOuNull(item.form_id, 40) ?? formId,
        });
      }
    }

    url = null;
    if (ehObjeto(corpo) && ehObjeto(corpo.paging) && typeof corpo.paging.next === "string") {
      try {
        const proxima = new URL(corpo.paging.next);
        // Só segue links da própria Graph API (evita SSRF por resposta adulterada).
        if (proxima.protocol === "https:" && proxima.hostname === GRAPH_HOST) {
          aplicarCredenciais(proxima, token, secret);
          url = proxima;
        }
      } catch {
        url = null;
      }
    }
  }

  return { leads, paginas, truncado };
}

// ─────────────────────────────────────────────────────────────────────
// Webhook — interpretação do aviso
// ─────────────────────────────────────────────────────────────────────

export interface EventoLeadgen {
  leadgen_id: string;
  page_id: string;
  form_id: string | null;
  ad_id: string | null;
  adgroup_id: string | null;
  created_time: number | null;
  entry_time: number | null;
}

const MAX_EVENTOS_POR_AVISO = 2000;

function idOuNull(v: unknown): string | null {
  const t = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : v;
  return idMetaValido(t) ? t : null;
}

/**
 * Extrai os avisos "leadgen" de um corpo de webhook do objeto Page.
 * Ignora mudanças de outros campos e itens sem leadgen_id/page_id válidos.
 * Deduplica por leadgen_id dentro do mesmo aviso.
 */
export function extrairEventosLeadgen(payload: unknown): {
  eventos: EventoLeadgen[];
  descartados: number;
} {
  const eventos: EventoLeadgen[] = [];
  let descartados = 0;
  if (!ehObjeto(payload) || payload.object !== "page" || !Array.isArray(payload.entry)) {
    return { eventos, descartados };
  }
  const vistos = new Set<string>();

  for (const entry of payload.entry) {
    if (!ehObjeto(entry) || !Array.isArray(entry.changes)) continue;
    const entryPage = idOuNull(entry.id);
    const entryTime = typeof entry.time === "number" ? entry.time : null;

    for (const change of entry.changes) {
      if (!ehObjeto(change) || change.field !== "leadgen") continue;
      const value = ehObjeto(change.value) ? change.value : null;
      const leadgenId = value ? idOuNull(value.leadgen_id) : null;
      const pageId = (value ? idOuNull(value.page_id) : null) ?? entryPage;
      if (!value || !leadgenId || !pageId) {
        descartados += 1;
        continue;
      }
      if (vistos.has(leadgenId)) continue;
      if (eventos.length >= MAX_EVENTOS_POR_AVISO) {
        descartados += 1;
        continue;
      }
      vistos.add(leadgenId);
      eventos.push({
        leadgen_id: leadgenId,
        page_id: pageId,
        form_id: idOuNull(value.form_id),
        ad_id: idOuNull(value.ad_id),
        adgroup_id: idOuNull(value.adgroup_id),
        created_time:
          typeof value.created_time === "number" ? value.created_time : null,
        entry_time: entryTime,
      });
    }
  }
  return { eventos, descartados };
}

// ─────────────────────────────────────────────────────────────────────
// Mapeamento de field_data → lead
// ─────────────────────────────────────────────────────────────────────

export interface DadosMapeados {
  nome: string | null;
  telefoneBruto: string | null;
  email: string | null;
  interesse: string | null;
  faixaValor: string | null;
  /** Respostas que não viraram nome/telefone/e-mail, no formato da Meta. */
  respostas: CampoMeta[];
  /** Resumo legível das respostas para leads.observacoes (≤ LIMITE_RESUMO). */
  resumo: string | null;
}

export const LIMITE_RESUMO = 1000;

/** "Qual é o seu Orçamento?" → "qual_e_o_seu_orcamento" */
export function normalizarChaveCampo(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const CHAVES_NOME_COMPLETO = ["full_name", "nome_completo", "nome", "name"];
const CHAVES_PRIMEIRO_NOME = ["first_name", "primeiro_nome"];
const CHAVES_SOBRENOME = ["last_name", "sobrenome", "ultimo_nome"];
const CHAVES_TELEFONE = [
  "phone_number",
  "phone",
  "telefone",
  "celular",
  "whatsapp",
  "telefone_celular",
  "telefone_whatsapp",
  "numero_de_telefone",
  "numero_de_whatsapp",
  "numero_do_whatsapp",
];
const CHAVES_EMAIL = ["email", "e_mail", "work_email", "email_corporativo"];

function ehChaveInteresse(chave: string): boolean {
  return (
    chave.includes("interesse") ||
    /(^|_)tipo_(de_|do_)?imovel(_|$)/.test(chave) ||
    chave === "finalidade" ||
    chave === "property_type"
  );
}

function ehChaveFaixaValor(chave: string): boolean {
  return (
    chave.includes("faixa") ||
    chave.includes("orcamento") ||
    chave.includes("budget") ||
    /(^|_)valor(_|$)/.test(chave) ||
    /(^|_)preco(_|$)/.test(chave)
  );
}

function primeiroValor(campo: CampoMeta | undefined): string | null {
  if (!campo) return null;
  const v = campo.values.find((x) => x.trim().length > 0);
  return v ? v.trim() : null;
}

function rotuloCampo(nome: string): string {
  const t = nome.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : nome;
}

export function mapearCamposLead(campos: CampoMeta[]): DadosMapeados {
  const porChave = new Map<string, CampoMeta>();
  for (const c of campos) {
    const chave = normalizarChaveCampo(c.name);
    if (chave && !porChave.has(chave)) porChave.set(chave, c);
  }
  const usados = new Set<CampoMeta>();
  const pegar = (chaves: string[]): string | null => {
    for (const chave of chaves) {
      const campo = porChave.get(chave);
      const valor = primeiroValor(campo);
      if (campo && valor) {
        usados.add(campo);
        return valor;
      }
    }
    return null;
  };

  // Nome: full_name; senão first_name + last_name.
  let nome = pegar(CHAVES_NOME_COMPLETO);
  if (!nome) {
    const primeiro = pegar(CHAVES_PRIMEIRO_NOME);
    const ultimo = pegar(CHAVES_SOBRENOME);
    const junto = [primeiro, ultimo].filter(Boolean).join(" ").trim();
    nome = junto || null;
  }
  // Se full_name foi usado, first/last também não entram nas respostas.
  for (const chave of [...CHAVES_PRIMEIRO_NOME, ...CHAVES_SOBRENOME]) {
    const campo = porChave.get(chave);
    if (campo && nome) usados.add(campo);
  }

  const telefoneBruto = pegar(CHAVES_TELEFONE);

  // E-mail: só aproveita se tiver formato válido; senão a resposta continua
  // nas respostas do formulário (para o corretor ver o que foi digitado).
  let email: string | null = null;
  for (const chave of CHAVES_EMAIL) {
    const campo = porChave.get(chave);
    const valor = primeiroValor(campo);
    if (campo && valor) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
        email = valor.toLowerCase().slice(0, 254);
        usados.add(campo);
      }
      break;
    }
  }

  const respostas = campos.filter((c) => !usados.has(c));

  let interesse: string | null = null;
  let faixaValor: string | null = null;
  for (const c of respostas) {
    const chave = normalizarChaveCampo(c.name);
    const valor = c.values.join(", ").trim();
    if (!valor) continue;
    if (!interesse && ehChaveInteresse(chave)) {
      interesse = valor.slice(0, 200);
    } else if (!faixaValor && ehChaveFaixaValor(chave)) {
      faixaValor = valor.slice(0, 200);
    }
  }

  const linhas = respostas
    .map((c) => {
      const valor = c.values.join(", ").trim();
      return valor ? `${rotuloCampo(c.name)}: ${valor}` : null;
    })
    .filter((l): l is string => l !== null);

  let resumo: string | null = null;
  if (linhas.length > 0) {
    const texto = ["Respostas do formulário (Meta):", ...linhas].join("\n");
    resumo =
      texto.length > LIMITE_RESUMO
        ? texto.slice(0, LIMITE_RESUMO - 1).trimEnd() + "…"
        : texto;
  }

  return {
    nome: nome ? nome.slice(0, 200) : null,
    telefoneBruto,
    email,
    interesse,
    faixaValor,
    respostas,
    resumo,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Outros utilitários puros
// ─────────────────────────────────────────────────────────────────────

/** platform 'ig' → Instagram; qualquer outro valor (ou ausente) → Facebook. */
export function origemDaPlataforma(platform: string | null | undefined): {
  origem: "Instagram" | "Facebook";
  plataforma: "instagram" | "facebook" | null;
} {
  const p = (platform ?? "").trim().toLowerCase();
  if (p === "ig" || p === "instagram") {
    return { origem: "Instagram", plataforma: "instagram" };
  }
  if (p === "fb" || p === "facebook") {
    return { origem: "Facebook", plataforma: "facebook" };
  }
  return { origem: "Facebook", plataforma: null };
}

/** Data da Meta ("2026-10-15T12:00:00+0000" ou unix em segundos) → ISO, ou null. */
export function normalizarDataMeta(v: string | number | null | undefined): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d =
    typeof v === "number"
      ? new Date(v * 1000)
      : new Date(v.replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export const BACKOFF_MINUTOS: readonly number[] = [1, 5, 15, 60, 180, 360, 720];
export const MAX_TENTATIVAS = 8;

/**
 * Próxima tentativa após `tentativasRealizadas` falhas (contando a atual).
 * 1 → +1 min, 2 → +5, 3 → +15, 4 → +60, 5 → +180, 6 → +360, 7 → +720,
 * 8 ou mais → null (para de tentar e alerta).
 */
export function calcularProximaTentativa(
  tentativasRealizadas: number,
  agora: Date = new Date()
): Date | null {
  if (!Number.isFinite(tentativasRealizadas) || tentativasRealizadas >= MAX_TENTATIVAS) {
    return null;
  }
  const indice = Math.min(
    Math.max(Math.floor(tentativasRealizadas), 1) - 1,
    BACKOFF_MINUTOS.length - 1
  );
  return new Date(agora.getTime() + BACKOFF_MINUTOS[indice] * 60_000);
}
