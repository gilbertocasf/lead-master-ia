import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { LeadStatus } from "@/lib/types";

const STATUS_VALIDOS: LeadStatus[] = [
  "novo",
  "em_contato",
  "visita",
  "proposta",
  "fechado",
  "perdido",
];

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

  // 2. Buscar perfil do usuário autenticado
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

  // 3. Validar payload
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }

  const status_novo =
    typeof body.status_novo === "string" ? body.status_novo : "";

  if (!STATUS_VALIDOS.includes(status_novo as LeadStatus)) {
    return NextResponse.json({ erro: "status_invalido" }, { status: 400 });
  }

  const lead_id = params.id;
  const admin = createSupabaseAdmin();

  // 4. Se corretor, verificar que o lead pertence a ele
  if (usuario.role === "corretor") {
    const [{ data: lead }, { data: corretor }] = await Promise.all([
      admin
        .from("leads")
        .select("corretor_id")
        .eq("id", lead_id)
        .eq("imobiliaria_id", usuario.imobiliaria_id)
        .single(),
      admin
        .from("corretores")
        .select("id")
        .eq("usuario_id", usuario.id)
        .eq("imobiliaria_id", usuario.imobiliaria_id)
        .single(),
    ]);

    if (!lead || !corretor || lead.corretor_id !== corretor.id) {
      return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
    }
  }

  // 5. Chamar RPC atômica
  const { data, error: rpcError } = await admin.rpc("alterar_status_lead", {
    p: {
      lead_id,
      status_novo,
      imobiliaria_id: usuario.imobiliaria_id,
      usuario_id: usuario.id,
    },
  });

  if (rpcError) {
    console.error(
      "[PATCH /api/leads/[id]/status] RPC error:",
      rpcError.message
    );
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  const result = data as {
    status: string;
    lead_id?: string;
    status_anterior?: string;
    status_novo?: string;
  };

  if (result.status === "lead_nao_encontrado") {
    return NextResponse.json({ erro: "lead_nao_encontrado" }, { status: 404 });
  }

  if (result.status === "status_igual") {
    return NextResponse.json({ erro: "status_igual" }, { status: 409 });
  }

  return NextResponse.json(result, { status: 200 });
}
