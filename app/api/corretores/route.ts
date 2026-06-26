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

  // 2. Perfil — apenas admin pode criar corretor
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
  const equipe_id = typeof body.equipe_id === "string" ? body.equipe_id.trim() : "";
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  const telefone = typeof body.telefone === "string" && body.telefone.trim() ? body.telefone.trim() : null;
  const em_plantao = body.em_plantao === true;
  const ativo = body.ativo !== false;

  if (!nome) {
    return NextResponse.json({ erro: "nome_obrigatorio" }, { status: 400 });
  }
  if (!equipe_id) {
    return NextResponse.json({ erro: "equipe_obrigatorio" }, { status: 400 });
  }

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[POST /api/corretores] createSupabaseAdmin:", err);
    return NextResponse.json(
      { erro: "servico_indisponivel", detalhe: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 503 }
    );
  }

  // 4. Validar que a equipe pertence à mesma imobiliária
  const { data: equipeCheck } = await admin
    .from("equipes")
    .select("id")
    .eq("id", equipe_id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .single();

  if (!equipeCheck) {
    return NextResponse.json({ erro: "equipe_invalida" }, { status: 400 });
  }

  // 5. Calcular próxima ordem_plantao para a equipe
  const { data: ultimaOrdem } = await admin
    .from("corretores")
    .select("ordem_plantao")
    .eq("equipe_id", equipe_id)
    .order("ordem_plantao", { ascending: false })
    .limit(1)
    .maybeSingle();

  const proximaOrdem = (ultimaOrdem?.ordem_plantao ?? 0) + 1;

  // 6. Criar corretor com imobiliaria_id do admin (não aceita do payload)
  const { data: novoCorretor, error: insertError } = await admin
    .from("corretores")
    .insert({
      nome,
      email,
      telefone,
      equipe_id,
      imobiliaria_id: usuario.imobiliaria_id,
      ordem_plantao: proximaOrdem,
      em_plantao,
      ativo,
    })
    .select("id, nome, equipe_id")
    .single();

  if (insertError || !novoCorretor) {
    console.error("[POST /api/corretores]", insertError);
    if (insertError?.message?.includes("unique") || insertError?.code === "23505") {
      return NextResponse.json({ erro: "email_ja_cadastrado" }, { status: 409 });
    }
    return NextResponse.json(
      { erro: "erro_interno", detalhe: insertError?.message, codigo: insertError?.code },
      { status: 500 }
    );
  }

  // 7. Revalidar páginas afetadas
  revalidatePath("/");
  revalidatePath("/corretores");
  revalidatePath("/equipes");
  revalidatePath("/leads");
  revalidatePath("/ranking");

  return NextResponse.json({ status: "criado", corretor: novoCorretor }, { status: 201 });
}
