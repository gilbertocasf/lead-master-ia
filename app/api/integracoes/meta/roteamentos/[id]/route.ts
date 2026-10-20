import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { funcaoAusente, RESPOSTA_MIGRATION_PENDENTE } from "@/lib/rpc";

// Remove um vínculo Página/formulário → equipe da imobiliária do admin.
// A Página continua cadastrada em integracoes_meta (leads novos dela, sem
// vínculo, vão para o rodízio entre equipes com alerta).

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
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
    return NextResponse.json({ erro: "roteamento_nao_encontrado" }, { status: 404 });
  }

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[DELETE /api/integracoes/meta/roteamentos/[id]] createSupabaseAdmin:", err);
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 503 });
  }

  const { data, error } = await admin
    .from("meta_roteamento")
    .delete()
    .eq("id", id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .select("id");

  if (error) {
    if (funcaoAusente(error)) {
      return NextResponse.json(RESPOSTA_MIGRATION_PENDENTE, { status: 503 });
    }
    console.error("[DELETE /api/integracoes/meta/roteamentos/[id]]", error.code, error.message);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ erro: "roteamento_nao_encontrado" }, { status: 404 });
  }

  revalidatePath("/integracoes");

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
