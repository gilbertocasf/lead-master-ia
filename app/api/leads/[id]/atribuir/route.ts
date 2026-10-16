import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { funcaoAusente, RESPOSTA_MIGRATION_PENDENTE } from "@/lib/rpc";
import { notificarCorretorNovoLead, type EmailStatus } from "@/lib/email";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RpcAtribuir {
  status: string;
  tipo?: "distribuido" | "redistribuido";
  corretor_id?: string;
  corretor_nome?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    .select("id, imobiliaria_id, role, equipe_id")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json({ erro: "usuario_sem_imobiliaria" }, { status: 403 });
  }
  if (usuario.role !== "admin" && usuario.role !== "gestor") {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }
  if (usuario.role === "gestor" && !usuario.equipe_id) {
    return NextResponse.json({ erro: "gestor_sem_equipe" }, { status: 403 });
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ erro: "lead_nao_encontrado" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    const json: unknown = await req.json();
    if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error();
    body = json as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }
  const corretor_id =
    typeof body.corretor_id === "string" ? body.corretor_id.trim() : "";
  if (!corretor_id) {
    return NextResponse.json({ erro: "corretor_obrigatorio" }, { status: 400 });
  }
  if (!UUID_RE.test(corretor_id)) {
    return NextResponse.json({ erro: "corretor_invalido" }, { status: 400 });
  }

  const lead_id = params.id;

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[POST /api/leads/[id]/atribuir] createSupabaseAdmin:", err);
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 503 });
  }

  // O lead precisa pertencer à imobiliária (e, para gestor, à própria equipe)
  const { data: lead } = await admin
    .from("leads")
    .select("id, equipe_id")
    .eq("id", lead_id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ erro: "lead_nao_encontrado" }, { status: 404 });
  }
  if (
    usuario.role === "gestor" &&
    String(lead.equipe_id) !== String(usuario.equipe_id)
  ) {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }

  const { data, error: rpcError } = await admin.rpc("atribuir_lead_manual", {
    p: {
      imobiliaria_id: usuario.imobiliaria_id,
      lead_id,
      corretor_id,
      usuario_id: usuario.id,
    },
  });

  if (rpcError) {
    if (funcaoAusente(rpcError)) {
      return NextResponse.json(RESPOSTA_MIGRATION_PENDENTE, { status: 503 });
    }
    console.error(
      "[POST /api/leads/[id]/atribuir] RPC error:",
      rpcError.message,
      rpcError.code
    );
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  const result = data as RpcAtribuir | null;
  if (!result) {
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }
  if (result.status === "lead_nao_encontrado") {
    return NextResponse.json({ erro: "lead_nao_encontrado" }, { status: 404 });
  }
  if (result.status === "corretor_invalido") {
    return NextResponse.json({ erro: "corretor_invalido" }, { status: 400 });
  }
  if (result.status !== "ok") {
    console.error("[POST /api/leads/[id]/atribuir] status inesperado:", result.status);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  // Notificação por e-mail: falha não derruba a resposta
  let email_notificacao: EmailStatus | "nao_enviado" = "nao_enviado";
  try {
    const corretorAtribuido = result.corretor_id ?? corretor_id;
    const { data: corretorData } = await admin
      .from("corretores")
      .select("email")
      .eq("id", corretorAtribuido)
      .eq("imobiliaria_id", usuario.imobiliaria_id)
      .maybeSingle();
    const emailCorretor =
      typeof corretorData?.email === "string" ? corretorData.email.trim() : "";
    if (emailCorretor && emailCorretor.includes("@")) {
      email_notificacao = await notificarCorretorNovoLead(emailCorretor);
    }
  } catch (err) {
    console.error(
      "[POST /api/leads/[id]/atribuir] notificação:",
      err instanceof Error ? err.message : "erro"
    );
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${lead_id}`);
  revalidatePath("/pipeline");
  revalidatePath("/corretores");

  return NextResponse.json(
    {
      status: "ok",
      tipo: result.tipo ?? "distribuido",
      corretor_nome: result.corretor_nome ?? null,
      email_notificacao,
    },
    { status: 200 }
  );
}
