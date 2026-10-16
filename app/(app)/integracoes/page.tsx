import Link from "next/link";
import { headers } from "next/headers";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { CopiarTexto } from "@/components/integracoes/CopiarTexto";
import { NovoRoteamentoForm } from "@/components/integracoes/NovoRoteamentoForm";
import { RemoverRoteamentoButton } from "@/components/integracoes/RemoverRoteamentoButton";
import { ReprocessarEventoButton } from "@/components/integracoes/ReprocessarEventoButton";
import { fetchUsuarioAtual } from "@/lib/supabase-queries";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isMockMode } from "@/lib/supabase";
import { ehOperadorInterno } from "@/lib/operador-interno";
import { funcaoAusente } from "@/lib/rpc";

export const dynamic = "force-dynamic";

const STATUS_EVENTO = ["recebido", "processando", "processado", "duplicado", "ignorado", "erro"] as const;
type StatusEvento = (typeof STATUS_EVENTO)[number];

const STATUS_ESTILO: Record<StatusEvento, string> = {
  recebido: "bg-action/15 text-action border-action/30",
  processando: "bg-action/15 text-action border-action/30",
  processado: "bg-win/15 text-win border-win/30",
  duplicado: "bg-base-raised text-ink-muted border-base-border",
  ignorado: "bg-base-raised text-ink-muted border-base-border",
  erro: "bg-loss/15 text-loss border-loss/30",
};

const STATUS_ROTULO: Record<StatusEvento, string> = {
  recebido: "Recebido",
  processando: "Processando",
  processado: "Processado",
  duplicado: "Duplicado",
  ignorado: "Ignorado",
  erro: "Erro",
};

const ORIGEM_ROTULO: Record<string, string> = {
  webhook: "Webhook",
  reconciliacao: "Reconciliação",
  manual: "Manual",
};

const VARIAVEIS: { nome: string; uso: string; obrigatoria: boolean }[] = [
  { nome: "META_APP_SECRET", uso: "Valida a assinatura dos avisos da Meta", obrigatoria: true },
  { nome: "META_VERIFY_TOKEN", uso: "Verificação do webhook no painel da Meta", obrigatoria: true },
  { nome: "META_ACCESS_TOKEN", uso: "Leitura dos dados do lead na Meta", obrigatoria: true },
  { nome: "CRON_SECRET", uso: "Protege a rotina de reprocessamento e reconciliação", obrigatoria: true },
  { nome: "ALERTA_EMAILS", uso: "Destinatários dos alertas de falha", obrigatoria: false },
];

interface Roteamento {
  id: string;
  page_id: string;
  form_id: string | null;
  form_nome: string | null;
  equipe_id: string;
  ativo: boolean;
}

interface Evento {
  id: string;
  recebido_em: string;
  origem: string;
  page_id: string | null;
  form_id: string | null;
  status: string;
  tentativas: number;
  ultimo_erro: string | null;
  lead_id: string | null;
}

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function Aviso({ titulo, texto, tom }: { titulo: string; texto: string; tom: "warn" | "loss" }) {
  const cls = tom === "warn" ? "border-warn/30 bg-warn/10" : "border-loss/30 bg-loss/10";
  const txt = tom === "warn" ? "text-warn" : "text-loss";
  return (
    <div className={`rounded-2xl border px-6 py-8 text-center ${cls}`}>
      <p className={`text-sm font-semibold ${txt}`}>{titulo}</p>
      <p className="mt-1 text-xs text-ink-muted">{texto}</p>
    </div>
  );
}

const EM_CONFIGURACAO = "Integração em configuração pela equipe Lead Master.";

/** Operador interno do Lead Master (INTERNAL_OWNER_EMAILS) logado nesta sessão. */
async function sessaoDeOperadorInterno(): Promise<boolean> {
  if (isMockMode) return false;
  try {
    const {
      data: { user },
    } = await createSupabaseServer().auth.getUser();
    return ehOperadorInterno(user?.email);
  } catch {
    return false;
  }
}

export default async function IntegracoesPage() {
  const usuario = await fetchUsuarioAtual();

  if (usuario?.role !== "admin") {
    return (
      <>
        <PageHeader
          eyebrow="Organização"
          title="Integrações"
          description="Conexão com os formulários de anúncios da Meta."
        />
        <div className="rounded-2xl border border-base-border bg-base-surface px-6 py-10 text-center">
          <p className="text-sm font-semibold text-ink-muted">Área administrativa</p>
          <p className="mt-1 text-xs text-ink-muted">Disponível apenas para administradores.</p>
        </div>
      </>
    );
  }

  // Detalhes técnicos (variáveis, migrations, Vercel) só para a equipe Lead Master.
  const operador = await sessaoDeOperadorInterno();

  const cabecalho = (
    <PageHeader
      eyebrow="Organização"
      title="Integrações"
      description="Receba leads dos formulários do Facebook e Instagram e encaminhe cada formulário para a equipe certa."
    />
  );

  // Estado da configuração (apenas presença; valores nunca são exibidos)
  const configurado: Record<string, boolean> = {};
  for (const v of VARIAVEIS) configurado[v.nome] = Boolean(process.env[v.nome]);

  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const urlWebhook = host ? `https://${host}/api/webhooks/meta` : "/api/webhooks/meta";

  // Leitura com service role: só chega aqui depois de confirmar que é admin
  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return (
      <>
        {cabecalho}
        <Aviso
          tom="loss"
          titulo="Serviço indisponível"
          texto={
            operador
              ? "A chave de serviço do Supabase não está configurada no servidor."
              : "Tente novamente em instantes. Se persistir, fale com o suporte do Lead Master."
          }
        />
      </>
    );
  }

  const imob = usuario.imobiliariaId;

  const [rotRes, eventosRes, equipesRes, paginasRes] = await Promise.all([
    admin
      .from("meta_roteamento")
      .select("id, page_id, form_id, form_nome, equipe_id, ativo")
      .eq("imobiliaria_id", imob)
      .order("created_at", { ascending: true }),
    admin
      .from("meta_eventos")
      .select("id, recebido_em, origem, page_id, form_id, status, tentativas, ultimo_erro, lead_id")
      .eq("imobiliaria_id", imob)
      .order("recebido_em", { ascending: false })
      .limit(50),
    admin.from("equipes").select("id, nome").eq("imobiliaria_id", imob).eq("ativo", true).order("nome"),
    admin.from("integracoes_meta").select("page_id, page_nome").eq("imobiliaria_id", imob),
  ]);

  const erros = [rotRes.error, eventosRes.error, paginasRes.error];
  if (erros.some((e) => funcaoAusente(e))) {
    return (
      <>
        {cabecalho}
        {operador ? (
          <Aviso
            tom="warn"
            titulo="Integração ainda não instalada no banco: aplique as migrations 009 a 011"
            texto="Depois de aplicar, recarregue esta página. O restante do sistema continua funcionando normalmente."
          />
        ) : (
          <Aviso
            tom="warn"
            titulo={EM_CONFIGURACAO}
            texto="O restante do sistema continua funcionando normalmente."
          />
        )}
      </>
    );
  }
  if (erros.some(Boolean) || equipesRes.error) {
    return (
      <>
        {cabecalho}
        <Aviso
          tom="loss"
          titulo="Não foi possível carregar as integrações"
          texto="Tente novamente em instantes. Se persistir, verifique os logs do servidor."
        />
      </>
    );
  }

  const roteamentos = (rotRes.data ?? []) as Roteamento[];
  const eventos = (eventosRes.data ?? []) as Evento[];
  const equipes = (equipesRes.data ?? []).map((e) => ({ id: String(e.id), nome: String(e.nome) }));
  const nomeEquipe = new Map(equipes.map((e) => [e.id, e.nome]));
  const nomePagina = new Map(
    (paginasRes.data ?? []).map((p) => [String(p.page_id), p.page_nome ? String(p.page_nome) : null])
  );

  // Contagem por status (todos os eventos da imobiliária, não só os 50 exibidos)
  const contagens = await Promise.all(
    STATUS_EVENTO.map(async (s) => {
      const { count } = await admin
        .from("meta_eventos")
        .select("id", { count: "exact", head: true })
        .eq("imobiliaria_id", imob)
        .eq("status", s);
      return [s, count ?? 0] as const;
    })
  );

  const obrigatoriasOk = VARIAVEIS.filter((v) => v.obrigatoria).every((v) => configurado[v.nome]);

  return (
    <>
      {cabecalho}

      {/* (a) Estado da configuração */}
      {operador ? (
        <Card>
          <CardHeader
            title="Estado da configuração"
            subtitle={
              obrigatoriasOk
                ? "As variáveis obrigatórias estão definidas no servidor."
                : "Faltam variáveis obrigatórias no servidor (Vercel > Settings > Environment Variables)."
            }
          />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {VARIAVEIS.map((v) => {
              const ok = configurado[v.nome];
              return (
                <div key={v.nome} className="rounded-xl border border-base-border bg-base-raised/40 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <code className="break-all text-xs text-ink">{v.nome}</code>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        ok
                          ? "border-win/30 bg-win/15 text-win"
                          : v.obrigatoria
                            ? "border-loss/30 bg-loss/15 text-loss"
                            : "border-warn/30 bg-warn/15 text-warn"
                      }`}
                    >
                      {ok ? "Definida" : v.obrigatoria ? "Pendente" : "Não definida"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-ink-faint">
                    {v.uso}
                    {!v.obrigatoria && " (opcional)"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="border-t border-base-border px-5 py-4">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              URL do webhook
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 break-all rounded-xl border border-base-border bg-base-raised px-3 py-2 text-xs text-ink">
                {urlWebhook}
              </code>
              <CopiarTexto texto={urlWebhook} />
            </div>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title={obrigatoriasOk ? "Integração ativa" : "Integração em configuração pela equipe Lead Master"}
            subtitle={
              obrigatoriasOk
                ? "Os leads dos formulários vinculados abaixo entram automaticamente no Lead Master."
                : "Você já pode cadastrar os vínculos abaixo; os leads começam a chegar quando a configuração for concluída."
            }
          />
        </Card>
      )}

      {/* (b) Vínculos */}
      <Card className="mt-6">
        <CardHeader
          title="Vínculos Página/formulário → equipe"
          subtitle="Cada formulário envia seus leads para a equipe escolhida. Sem ID de formulário, vale como regra padrão da Página."
        />
        {roteamentos.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-ink-faint">
            Nenhum vínculo cadastrado. Sem vínculo, os leads da Meta não têm equipe definida.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-border text-left text-xs uppercase tracking-wider text-ink-faint">
                  <th className="px-5 py-3 font-medium">Página</th>
                  <th className="px-5 py-3 font-medium">Formulário</th>
                  <th className="px-5 py-3 font-medium">Equipe</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-base-border">
                {roteamentos.map((r) => (
                  <tr key={r.id} className="hover:bg-base-raised/40">
                    <td className="px-5 py-3">
                      <div className="text-ink">{nomePagina.get(r.page_id) ?? "—"}</div>
                      <div className="tnum text-xs text-ink-faint">{r.page_id}</div>
                    </td>
                    <td className="px-5 py-3">
                      {r.form_id ? (
                        <>
                          <div className="text-ink">{r.form_nome ?? "—"}</div>
                          <div className="tnum text-xs text-ink-faint">{r.form_id}</div>
                        </>
                      ) : (
                        <span className="text-ink-muted">Regra padrão da Página</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-ink-muted">
                      {nomeEquipe.get(r.equipe_id) ?? <span className="text-warn">Equipe inativa</span>}
                      {!r.ativo && <span className="ml-2 text-xs text-ink-faint">(desativado)</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <RemoverRoteamentoButton id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <NovoRoteamentoForm equipes={equipes} />
      </Card>

      {/* (c) Eventos recentes */}
      <Card className="mt-6">
        <CardHeader title="Eventos recentes" subtitle="Últimos 50 avisos recebidos da Meta." />
        <div className="flex flex-wrap gap-2 border-b border-base-border px-5 py-3">
          {contagens.map(([s, n]) => (
            <span
              key={s}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_ESTILO[s]}`}
            >
              {STATUS_ROTULO[s]}
              <span className="tnum">{n}</span>
            </span>
          ))}
        </div>
        {eventos.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-faint">Nenhum evento recebido ainda.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-base-border text-left text-xs uppercase tracking-wider text-ink-faint">
                  <th className="px-5 py-3 font-medium">Quando</th>
                  <th className="px-5 py-3 font-medium">Origem</th>
                  <th className="px-5 py-3 font-medium">Formulário</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Tentativas</th>
                  <th className="px-5 py-3 font-medium">Último erro</th>
                  <th className="px-5 py-3 font-medium">Lead</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-base-border">
                {eventos.map((ev) => {
                  const st = (STATUS_EVENTO as readonly string[]).includes(ev.status)
                    ? (ev.status as StatusEvento)
                    : "ignorado";
                  return (
                    <tr key={ev.id} className="hover:bg-base-raised/40">
                      <td className="whitespace-nowrap px-5 py-3 text-ink-muted">{quando(ev.recebido_em)}</td>
                      <td className="px-5 py-3 text-ink-muted">{ORIGEM_ROTULO[ev.origem] ?? ev.origem}</td>
                      <td className="tnum px-5 py-3 text-xs text-ink-muted">{ev.form_id ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_ESTILO[st]}`}
                        >
                          {STATUS_ROTULO[st]}
                        </span>
                      </td>
                      <td className="tnum px-5 py-3 text-ink-muted">{ev.tentativas}</td>
                      <td className="max-w-[260px] px-5 py-3 text-xs text-ink-muted">
                        {ev.ultimo_erro ? <span className="break-words">{ev.ultimo_erro}</span> : "—"}
                      </td>
                      <td className="px-5 py-3">
                        {ev.lead_id ? (
                          <Link href={`/leads/${ev.lead_id}`} className="text-xs font-medium text-action hover:underline">
                            Ver lead
                          </Link>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {ev.status === "erro" && <ReprocessarEventoButton id={ev.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Como conectar */}
      <Card className="mt-6">
        <CardHeader title="Como conectar" subtitle="Passo a passo resumido." />
        <ol className="list-decimal space-y-2 px-9 py-5 text-sm text-ink-muted">
          {operador && (
            <li>Defina as variáveis de ambiente acima na Vercel e publique novamente.</li>
          )}
          {operador && (
            <li>No painel da Meta, cadastre a URL do webhook e o mesmo META_VERIFY_TOKEN, assinando o campo leadgen do objeto Page.</li>
          )}
          <li>
            Instale o app na Página: <code className="text-ink">POST /&#123;page-id&#125;/subscribed_apps</code> com{" "}
            <code className="text-ink">subscribed_fields=leadgen</code>, usando o token da Página. Sem essa instalação a
            Meta não envia os avisos de lead dessa Página.
          </li>
          <li>
            {operador
              ? "Cadastre aqui o vínculo de cada Página (e formulário) com a equipe que atenderá os leads. Página nova só pode ser cadastrada por operador interno."
              : "Cadastre aqui o vínculo de cada Página liberada (e formulário) com a equipe que atenderá os leads."}
          </li>
          <li>Envie um lead de teste pela ferramenta de testes da Meta e confira o evento na lista acima.</li>
        </ol>
        <p className="border-t border-base-border px-5 py-3 text-xs text-ink-faint">
          {operador ? (
            <>
              Detalhes completos em <code className="text-ink-muted">docs/integracao-meta/configuracao.md</code>.
            </>
          ) : (
            "Dúvidas ou Página nova: fale com o suporte do Lead Master."
          )}
        </p>
      </Card>
    </>
  );
}
