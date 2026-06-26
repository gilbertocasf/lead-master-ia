import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

export async function POST(req: NextRequest) {
  if (isMockMode) {
    return NextResponse.json({ erro: "supabase_nao_configurado" }, { status: 503 });
  }

  // 1. Autenticação
  const sbServer = createSupabaseServer();
  const { data: { user }, error: authError } = await sbServer.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  // 2. Perfil — apenas admin pode criar equipe
  const { data: usuario } = await sbServer
    .from("usuarios")
    .select("imobiliaria_id, role")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json({ erro: "usuario_sem_imobiliaria" }, { status: 403 });
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

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const gerente = typeof body.gerente === "string" ? body.gerente.trim() : "";

  if (!nome) {
    return NextResponse.json({ erro: "nome_obrigatorio" }, { status: 400 });
  }
  if (!gerente) {
    return NextResponse.json({ erro: "gerente_obrigatorio" }, { status: 400 });
  }

  // 4. Criar equipe com imobiliaria_id do admin (não aceita do payload)
  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[POST /api/equipes] createSupabaseAdmin:", err);
    return NextResponse.json(
      { erro: "servico_indisponivel", detalhe: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 503 }
    );
  }

  const { data: novaEquipe, error: insertError } = await admin
    .from("equipes")
    .insert({
      nome,
      gerente,
      imobiliaria_id: usuario.imobiliaria_id,
      ativo: true,
    })
    .select("id, nome, gerente")
    .single();

  if (insertError || !novaEquipe) {
    console.error("[POST /api/equipes]", insertError);
    return NextResponse.json(
      { erro: "erro_interno", detalhe: insertError?.message, codigo: insertError?.code },
      { status: 500 }
    );
  }

  // 5. Revalidar páginas afetadas
  revalidatePath("/");
  revalidatePath("/equipes");
  revalidatePath("/corretores");
  revalidatePath("/leads");
  revalidatePath("/ranking");

  return NextResponse.json({ status: "criado", equipe: novaEquipe }, { status: 201 });
}
