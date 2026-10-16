import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { funcaoAusente, RESPOSTA_MIGRATION_PENDENTE } from "@/lib/rpc";
import { obterConfigMeta } from "@/lib/meta";
import { alertasConfigurados } from "@/lib/alertas";

// Estado da integração Meta da imobiliária do admin autenticado.
// Nunca devolve tokens/segredos (só booleans) nem o payload dos eventos.

export const dynamic = "force-dynamic";

const STATUS_EVENTO = [
  "recebido",
  "processando",
  "processado",
  "duplicado",
  "ignorado",
  "erro",
] as const;

function urlDoWebhook(req: NextRequest): string {
  const hostBruto =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim() ||
    req.nextUrl.host;
  const host = /^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(hostBruto) ? hostBruto : req.nextUrl.host;
  const protoBruto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto =
    protoBruto === "http" || protoBruto === "https"
      ? protoBruto
      : req.nextUrl.protocol.replace(":", "") || "https";
  return `${proto}://${host}/api/webhooks/meta`;
}

export async function GET(req: NextRequest) {
  if (isMockMode) {
    return NextResponse.json({ erro: "supabase_nao_configurado" }, { status: 503 });
  }

  const sbServer = createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await sbServer.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  const { data: usuario } = await sbServer
    .from("usuarios")
    .select("id, imobiliaria_id, role")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json({ erro: "usuario_sem_imobiliaria" }, { status: 403 });
  }
  if (usuario.role !== "admin") {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[GET /api/integracoes/meta] createSupabaseAdmin:", err);
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 503 });
  }

  const imobId = usuario.imobiliaria_id;
  const config = obterConfigMeta();

  const [paginasRes, roteamentosRes, eventosRes, equipesRes] = await Promise.all([
    admin
      .from("integracoes_meta")
      .select("id, page_id, page_nome, ativo, ultimo_evento_em, ultimo_erro, ultimo_erro_em, created_at")
      .eq("imobiliaria_id", imobId)
      .order("created_at", { ascending: true }),
    admin
      .from("meta_roteamento")
      .select("id, page_id, form_id, form_nome, equipe_id, ativo, created_at, updated_at")
      .eq("imobiliaria_id", imobId)
      .order("page_id", { ascending: true })
      .order("created_at", { ascending: true }),
    admin
      .from("meta_eventos")
      .select("id, recebido_em, origem, page_id, form_id, status, tentativas, ultimo_erro, lead_id")
      .eq("imobiliaria_id", imobId)
      .order("recebido_em", { ascending: false })
      .limit(50),
    admin.from("equipes").select("id, nome, ativo").eq("imobiliaria_id", imobId),
  ]);

  const erroTabela = [paginasRes.error, roteamentosRes.error, eventosRes.error].find(
    (e) => e !== null
  );
  if (erroTabela) {
    if (funcaoAusente(erroTabela)) {
      return NextResponse.json(RESPOSTA_MIGRATION_PENDENTE, { status: 503 });
    }
    console.error("[GET /api/integracoes/meta]", erroTabela.code, erroTabela.message);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  const equipes = new Map<string, { nome: string; ativo: boolean }>();
  for (const e of (equipesRes.data ?? []) as { id: string; nome: string; ativo: boolean }[]) {
    equipes.set(String(e.id), { nome: e.nome, ativo: e.ativo !== false });
  }

  const roteamentos = ((roteamentosRes.data ?? []) as {
    id: string;
    page_id: string;
    form_id: string | null;
    form_nome: string | null;
    equipe_id: string;
    ativo: boolean;
    created_at: string;
    updated_at: string | null;
  }[]).map((r) => ({
    ...r,
    equipe_nome: equipes.get(String(r.equipe_id))?.nome ?? null,
    equipe_ativa: equipes.get(String(r.equipe_id))?.ativo ?? false,
  }));

  const contagens = await Promise.all(
    STATUS_EVENTO.map((s) =>
      admin
        .from("meta_eventos")
        .select("id", { count: "exact", head: true })
        .eq("imobiliaria_id", imobId)
        .eq("status", s)
    )
  );
  const contagem: Record<string, number> = {};
  STATUS_EVENTO.forEach((s, i) => {
    contagem[s] = contagens[i].count ?? 0;
  });

  return NextResponse.json(
    {
      configurado: {
        app_secret: Boolean(config.appSecret),
        verify_token: Boolean(config.verifyToken),
        access_token: Boolean(config.accessToken),
        cron_secret: Boolean((process.env.CRON_SECRET ?? "").trim()),
        alertas: alertasConfigurados(),
      },
      graph_versao: config.versao,
      webhook_url: urlDoWebhook(req),
      paginas: paginasRes.data ?? [],
      roteamentos,
      eventos: eventosRes.data ?? [],
      contagem,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } }
  );
}
