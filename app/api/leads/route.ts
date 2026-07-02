import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { notificarCorretorNovoLead, type EmailStatus } from "@/lib/email";

const ORIGENS_VALIDAS = ["Instagram", "Facebook", "Outro"] as const;

function normalizarTelefone(tel: string): string {
  return tel.replace(/\D/g, "");
}

// Tipos do retorno da RPC criar_e_distribuir_lead
interface RpcLead {
  id: string;
  nome: string;
  equipe_id: string;
  corretor_id: string | null;
  corretor_nome: string | null;
  distribuido_em: string | null;
  atribuicao_tipo?: string;
}

interface RpcResultCriado {
  status: "criado";
  distribuido: boolean;
  motivo: string | null;
  lead: RpcLead;
}

interface RpcResultDuplicata {
  status: "duplicata";
  lead_existente: { id: string; nome: string; created_at: string };
}

type RpcResult = RpcResultCriado | RpcResultDuplicata;

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

  // 2. Buscar perfil do usuário autenticado (id + imobiliaria_id + role + equipe_id)
  const { data: usuario } = await sbServer
    .from("usuarios")
    .select("id, imobiliaria_id, role, equipe_id")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json(
      { erro: "usuario_sem_imobiliaria" },
      { status: 403 }
    );
  }

  // Corretor comum não cadastra lead — admin, gestor e captador podem
  if (usuario.role === "corretor") {
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
  const telefone =
    typeof body.telefone === "string" ? body.telefone.trim() : "";
  const origem = typeof body.origem === "string" ? body.origem : "";
  const equipe_id_payload =
    typeof body.equipe_id === "string" ? body.equipe_id.trim() : null;
  const interesse =
    typeof body.interesse === "string" ? body.interesse.trim() : null;
  const faixa_valor =
    typeof body.faixa_valor === "string" ? body.faixa_valor.trim() : null;
  const observacoes =
    typeof body.observacoes === "string" ? body.observacoes.trim() : null;

  // corretor_id é opcional: presente no Cenário A (captador conhecido).
  // Apenas admin e gestor podem usar — captador NUNCA escolhe corretor manualmente.
  // Lemos aqui para validar formato, mas o enforcement por role acontece na Seção 4.
  const corretor_id_payload =
    typeof body.corretor_id === "string" && body.corretor_id.trim()
      ? body.corretor_id.trim()
      : null;

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

  // 4. Enforcement de escopo por role
  //
  //  Regras:
  //    Admin   → equipe_id do payload; corretor_id do payload (Cenário A)
  //    Gestor  → equipe_id forçada para usuarios.equipe_id; corretor da própria equipe (Cenário A)
  //    Captador → captador_id = usuarios.id; corretor_id SEMPRE null (sem Cenário A)
  //    Corretor → bloqueado acima (retorna 403)
  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[POST /api/leads] createSupabaseAdmin:", err);
    return NextResponse.json(
      { erro: "servico_indisponivel", detalhe: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." },
      { status: 503 }
    );
  }

  let equipe_id: string | null = equipe_id_payload;
  let corretor_id: string | null = null;
  let captador_id: string | null = null;

  if (usuario.role === "gestor") {
    if (!usuario.equipe_id) {
      return NextResponse.json({ erro: "gestor_sem_equipe" }, { status: 403 });
    }
    equipe_id = String(usuario.equipe_id);

    if (corretor_id_payload) {
      const { data: corretorCheck } = await admin
        .from("corretores")
        .select("id")
        .eq("id", corretor_id_payload)
        .eq("equipe_id", usuario.equipe_id)
        .eq("ativo", true)
        .maybeSingle();

      if (!corretorCheck) {
        return NextResponse.json({ erro: "corretor_invalido" }, { status: 400 });
      }
      corretor_id = corretor_id_payload;
    }

  } else if (usuario.role === "captador") {
    captador_id = String(usuario.id);
    corretor_id = null; // captador nunca escolhe corretor manualmente — ignorar qualquer valor do payload

  } else {
    // admin
    corretor_id = corretor_id_payload;
  }

  // Cenário A (corretor manual) requer equipe_id explícita para a RPC validar o vínculo
  if (corretor_id && !equipe_id) {
    return NextResponse.json(
      { erro: "equipe_obrigatorio_com_corretor" },
      { status: 400 }
    );
  }

  // 5. Chamar RPC atômica (v3: suporta captador_id, valida internamente)
  const { data, error: rpcError } = await admin.rpc(
    "criar_e_distribuir_lead",
    {
      p: {
        imobiliaria_id:       usuario.imobiliaria_id,
        nome,
        telefone,
        telefone_normalizado: telefoneNormalizado,
        origem,
        equipe_id:            equipe_id || null,
        corretor_id:          corretor_id || null,
        captador_id:          captador_id || null,
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
    if (rpcError.message.includes("corretor_invalido_ou_fora_da_equipe")) {
      return NextResponse.json({ erro: "corretor_invalido" }, { status: 400 });
    }
    if (rpcError.message.includes("captador_invalido")) {
      return NextResponse.json({ erro: "captador_invalido" }, { status: 400 });
    }
    console.error(
      "[POST /api/leads] RPC error:",
      rpcError.message,
      rpcError.code
    );
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  const result = data as RpcResult;

  // 5. Tratar duplicata
  if (result.status === "duplicata") {
    return NextResponse.json(
      { erro: "duplicata", lead_existente: result.lead_existente },
      { status: 409 }
    );
  }

  // 6. Notificar corretor por e-mail se o lead foi atribuído
  // Falha de e-mail NÃO impede o retorno de sucesso — lead já está criado.
  let email_notificacao: EmailStatus | "nao_enviado" = "nao_enviado";

  if (result.lead.corretor_id) {
    const { data: corretorData } = await admin
      .from("corretores")
      .select("email")
      .eq("id", result.lead.corretor_id)
      .single();

    const emailCorretor =
      typeof corretorData?.email === "string" ? corretorData.email.trim() : "";

    if (emailCorretor && emailCorretor.includes("@")) {
      email_notificacao = await notificarCorretorNovoLead(emailCorretor);
    }
  }

  return NextResponse.json({ ...result, email_notificacao }, { status: 201 });
}
