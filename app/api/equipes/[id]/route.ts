import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isMockMode) {
    return NextResponse.json({ erro: "supabase_nao_configurado" }, { status: 503 });
  }

  const sbServer = createSupabaseServer();
  const { data: { user }, error: authError } = await sbServer.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ sucesso: false, erro: "nao_autenticado", codigo: "nao_autenticado" }, { status: 401 });
  }

  const { data: usuario } = await sbServer
    .from("usuarios")
    .select("id, imobiliaria_id, role")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json({ sucesso: false, erro: "Sem imobiliária vinculada.", codigo: "sem_permissao" }, { status: 403 });
  }

  if (usuario.role !== "admin") {
    return NextResponse.json({ sucesso: false, erro: "Apenas administradores podem remover equipes.", codigo: "sem_permissao" }, { status: 403 });
  }

  const equipe_id = params.id;
  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[DELETE /api/equipes/[id]] createSupabaseAdmin:", err);
    return NextResponse.json({ sucesso: false, erro: "Serviço indisponível.", codigo: "erro_interno" }, { status: 503 });
  }

  const { data: equipeExistente } = await admin
    .from("equipes")
    .select("id, nome, ativo")
    .eq("id", equipe_id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .maybeSingle();

  if (!equipeExistente) {
    return NextResponse.json({ sucesso: false, erro: "Equipe não encontrada.", codigo: "equipe_nao_encontrada" }, { status: 404 });
  }

  // Bloquear se houver corretores ATIVOS vinculados à equipe
  const { data: corretoresAtivos, error: errCorretores } = await admin
    .from("corretores")
    .select("id")
    .eq("equipe_id", equipe_id)
    .eq("ativo", true)
    .limit(1);

  if (errCorretores) {
    console.error("[DELETE /api/equipes/[id]] check corretores:", errCorretores.message);
    return NextResponse.json({ sucesso: false, erro: "Erro ao verificar corretores.", codigo: "erro_supabase" }, { status: 500 });
  }

  if (corretoresAtivos && corretoresAtivos.length > 0) {
    return NextResponse.json(
      {
        sucesso: false,
        erro: "Transfira ou desative os corretores desta equipe antes de remover a equipe.",
        codigo: "equipe_com_corretores",
      },
      { status: 409 }
    );
  }

  // Soft delete: ativo=false — preserva histórico de leads e corretores inativos
  const { error: updateError } = await admin
    .from("equipes")
    .update({ ativo: false })
    .eq("id", equipe_id);

  if (updateError) {
    console.error("[DELETE /api/equipes/[id]]", updateError.message);
    return NextResponse.json({ sucesso: false, erro: "Erro ao desativar equipe.", codigo: "erro_supabase", detalhe: updateError.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/equipes");
  revalidatePath("/corretores");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/ranking");

  return NextResponse.json({ sucesso: true, detalhe: "Equipe desativada. Histórico preservado." }, { status: 200 });
}
