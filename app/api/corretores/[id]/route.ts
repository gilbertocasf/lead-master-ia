import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isMockMode) {
    return NextResponse.json(
      { erro: "supabase_nao_configurado" },
      { status: 503 }
    );
  }

  // 1. Autenticação
  const sbServer = createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await sbServer.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  // 2. Buscar perfil — apenas admin pode editar vínculo
  const { data: usuario } = await sbServer
    .from("usuarios")
    .select("id, imobiliaria_id, role")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json(
      { erro: "usuario_sem_imobiliaria" },
      { status: 403 }
    );
  }

  if (usuario.role !== "admin") {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }

  // 3. Validar payload
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }

  const corretor_id = params.id;
  const admin = createSupabaseAdmin();

  // 4. Verificar que o corretor existe e pertence à mesma imobiliária
  const { data: corretorExistente } = await admin
    .from("corretores")
    .select("id")
    .eq("id", corretor_id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .single();

  if (!corretorExistente) {
    return NextResponse.json(
      { erro: "corretor_nao_encontrado" },
      { status: 404 }
    );
  }

  // 5. Construir objeto de atualização
  const updates: Record<string, unknown> = {};

  if ("equipe_id" in body) {
    const equipe_id = body.equipe_id;
    if (equipe_id !== null && equipe_id !== undefined) {
      const { data: equipeCheck } = await admin
        .from("equipes")
        .select("id")
        .eq("id", String(equipe_id))
        .single();
      if (!equipeCheck) {
        return NextResponse.json({ erro: "equipe_invalida" }, { status: 400 });
      }
    }
    updates.equipe_id = equipe_id ?? null;
  }

  if ("usuario_id" in body) {
    const usuario_id = body.usuario_id;
    if (usuario_id !== null && usuario_id !== undefined) {
      // Validar que o usuário existe, está ativo, pertence à mesma imobiliária e tem role=corretor
      const { data: usuarioCheck } = await admin
        .from("usuarios")
        .select("id, role, ativo, imobiliaria_id")
        .eq("id", String(usuario_id))
        .single();

      if (
        !usuarioCheck ||
        usuarioCheck.role !== "corretor" ||
        !usuarioCheck.ativo ||
        usuarioCheck.imobiliaria_id !== usuario.imobiliaria_id
      ) {
        return NextResponse.json(
          { erro: "usuario_invalido" },
          { status: 400 }
        );
      }

      // Verificar que este usuário não está vinculado a outro corretor
      const { data: conflito } = await admin
        .from("corretores")
        .select("id")
        .eq("usuario_id", String(usuario_id))
        .neq("id", corretor_id)
        .maybeSingle();

      if (conflito) {
        return NextResponse.json(
          { erro: "usuario_ja_vinculado" },
          { status: 409 }
        );
      }
    }
    updates.usuario_id = usuario_id ?? null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { erro: "nenhum_campo_para_atualizar" },
      { status: 400 }
    );
  }

  // 6. Aplicar atualização
  const { error: updateError } = await admin
    .from("corretores")
    .update(updates)
    .eq("id", corretor_id);

  if (updateError) {
    console.error("[PATCH /api/corretores/[id]]", updateError.message);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  // 7. Revalidar páginas que exibem dados de corretores
  revalidatePath("/");
  revalidatePath("/corretores");
  revalidatePath("/equipes");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/ranking");

  return NextResponse.json({ status: "ok" }, { status: 200 });
}
