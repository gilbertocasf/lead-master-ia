import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";

const ORIGENS_VALIDAS = ["Instagram", "Facebook", "Outro"] as const;

function normalizarTelefone(tel: string): string {
  return tel.replace(/\D/g, "");
}

export async function POST(req: NextRequest) {
  if (isMockMode) {
    return NextResponse.json(
      { erro: "supabase_nao_configurado" },
      { status: 503 }
    );
  }

  // 1. Verificar autenticação
  const sbServer = createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await sbServer.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  // 2. Buscar imobiliaria_id do usuário autenticado
  const { data: usuario } = await sbServer
    .from("usuarios")
    .select("imobiliaria_id")
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

  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const telefone = typeof body.telefone === "string" ? body.telefone.trim() : "";
  const origem = typeof body.origem === "string" ? body.origem : "";
  const equipe_id = typeof body.equipe_id === "string" ? body.equipe_id.trim() : null;
  const interesse = typeof body.interesse === "string" ? body.interesse.trim() : null;
  const faixa_valor = typeof body.faixa_valor === "string" ? body.faixa_valor.trim() : null;
  const observacoes = typeof body.observacoes === "string" ? body.observacoes.trim() : null;

  if (!nome) {
    return NextResponse.json({ erro: "nome_obrigatorio" }, { status: 400 });
  }
  if (!telefone) {
    return NextResponse.json({ erro: "telefone_obrigatorio" }, { status: 400 });
  }
  if (!ORIGENS_VALIDAS.includes(origem as (typeof ORIGENS_VALIDAS)[number])) {
    return NextResponse.json({ erro: "origem_invalida" }, { status: 400 });
  }

  const telefoneNormalizado = normalizarTelefone(telefone);
  if (telefoneNormalizado.length < 10) {
    return NextResponse.json({ erro: "telefone_invalido" }, { status: 400 });
  }

  // 4. Chamar RPC atômica
  const admin = createSupabaseAdmin();
  const { data, error: rpcError } = await admin.rpc(
    "criar_e_distribuir_lead",
    {
      p: {
        imobiliaria_id:      usuario.imobiliaria_id,
        nome,
        telefone,
        telefone_normalizado: telefoneNormalizado,
        origem,
        equipe_id:            equipe_id || null,
        interesse:            interesse || null,
        faixa_valor:          faixa_valor || null,
        observacoes:          observacoes || null,
        criado_por:           "formulario",
      },
    }
  );

  if (rpcError) {
    if (rpcError.message.includes("sem_equipe_disponivel")) {
      return NextResponse.json(
        { erro: "sem_equipe_disponivel" },
        { status: 503 }
      );
    }
    if (rpcError.message.includes("equipe_nao_pertence_imobiliaria")) {
      return NextResponse.json({ erro: "equipe_invalida" }, { status: 400 });
    }
    console.error("[POST /api/leads] RPC error:", rpcError.message);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  // 5. Retornar resposta estruturada
  if ((data as { status: string }).status === "duplicata") {
    return NextResponse.json(
      {
        erro: "duplicata",
        lead_existente: (data as { lead_existente: unknown }).lead_existente,
      },
      { status: 409 }
    );
  }

  return NextResponse.json(data, { status: 201 });
}
