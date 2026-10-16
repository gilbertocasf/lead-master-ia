import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { funcaoAusente, RESPOSTA_MIGRATION_PENDENTE } from "@/lib/rpc";
import { processarEvento } from "@/lib/meta-processar";

// Reprocessa manualmente um evento da Meta (recebido ou com erro) da
// imobiliária do admin autenticado.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRAZO_MS = 9000;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const inicio = Date.now();

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

  const id = params.id;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ erro: "evento_nao_encontrado" }, { status: 404 });
  }

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[POST /api/integracoes/meta/eventos/[id]/reprocessar] createSupabaseAdmin:", err);
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 503 });
  }

  const { data: evento, error } = await admin
    .from("meta_eventos")
    .select("id, status")
    .eq("id", id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .maybeSingle();

  if (error) {
    if (funcaoAusente(error)) {
      return NextResponse.json(RESPOSTA_MIGRATION_PENDENTE, { status: 503 });
    }
    console.error("[POST /api/integracoes/meta/eventos/[id]/reprocessar]", error.code, error.message);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }
  if (!evento) {
    return NextResponse.json({ erro: "evento_nao_encontrado" }, { status: 404 });
  }
  if (evento.status !== "recebido" && evento.status !== "erro") {
    return NextResponse.json(
      { erro: "evento_nao_reprocessavel", status_atual: evento.status },
      { status: 409 }
    );
  }

  const { error: erroReset } = await admin
    .from("meta_eventos")
    .update({ proxima_tentativa_em: null })
    .eq("id", id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .in("status", ["recebido", "erro"]);
  if (erroReset) {
    console.error("[POST /api/integracoes/meta/eventos/[id]/reprocessar] reset:", erroReset.code);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  const resultado = await processarEvento(id, { admin, prazoFinal: inicio + PRAZO_MS });

  revalidatePath("/integracoes");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/");

  return NextResponse.json({ status: "ok", resultado }, { status: 200 });
}
