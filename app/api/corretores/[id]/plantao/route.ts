import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { funcaoAusente } from "@/lib/rpc";

interface RpcFila {
  status?: string;
  distribuidos?: number;
  restantes?: number;
}

interface RpcPlantao {
  status: string;
  corretor_id?: string;
  equipe_id?: string;
  em_plantao?: boolean;
  fila?: RpcFila | null;
}

function revalidar() {
  revalidatePath("/");
  revalidatePath("/corretores");
  revalidatePath("/equipes");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/ranking");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isMockMode) {
    return NextResponse.json({ erro: "supabase_nao_configurado" }, { status: 503 });
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

  // 2. Perfil do usuário autenticado
  const { data: usuario } = await sbServer
    .from("usuarios")
    .select("id, imobiliaria_id, role, equipe_id")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json({ erro: "usuario_sem_imobiliaria" }, { status: 403 });
  }

  // 3. Somente admin e gestor
  if (usuario.role !== "admin" && usuario.role !== "gestor") {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }
  if (usuario.role === "gestor" && !usuario.equipe_id) {
    return NextResponse.json({ erro: "gestor_sem_equipe" }, { status: 403 });
  }

  // 4. Payload
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }
  if (typeof body.em_plantao !== "boolean") {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }
  const em_plantao = body.em_plantao;
  const corretor_id = params.id;

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[PATCH /api/corretores/[id]/plantao] createSupabaseAdmin:", err);
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 503 });
  }

  // 5. Corretor precisa existir na imobiliária (e, para gestor, na própria equipe)
  const { data: corretor } = await admin
    .from("corretores")
    .select("id, equipe_id, ativo")
    .eq("id", corretor_id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .maybeSingle();

  if (!corretor) {
    return NextResponse.json({ erro: "corretor_nao_encontrado" }, { status: 404 });
  }
  if (
    usuario.role === "gestor" &&
    String(corretor.equipe_id) !== String(usuario.equipe_id)
  ) {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }
  if (em_plantao && !corretor.ativo) {
    return NextResponse.json({ erro: "corretor_inativo" }, { status: 409 });
  }

  // 6. RPC atômica (liga/desliga e, ao ligar, distribui a fila da equipe)
  const { data, error: rpcError } = await admin.rpc("definir_plantao_corretor", {
    p: {
      imobiliaria_id: usuario.imobiliaria_id,
      corretor_id,
      em_plantao,
      usuario_id: usuario.id,
    },
  });

  if (rpcError) {
    if (funcaoAusente(rpcError)) {
      // Fallback seguro enquanto a migration 011 não foi aplicada:
      // apenas alterna o plantão, sem distribuir a fila.
      let q = admin
        .from("corretores")
        .update({ em_plantao })
        .eq("id", corretor_id)
        .eq("imobiliaria_id", usuario.imobiliaria_id);
      if (em_plantao) q = q.eq("ativo", true);

      const { data: atualizados, error: updError } = await q.select("id");
      if (updError) {
        console.error("[PATCH /api/corretores/[id]/plantao] fallback:", updError.message);
        return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
      }
      if (!atualizados || atualizados.length === 0) {
        return NextResponse.json({ erro: "corretor_inativo" }, { status: 409 });
      }
      revalidar();
      return NextResponse.json(
        { status: "ok", em_plantao, fila: null, aviso: "migration_pendente" },
        { status: 200 }
      );
    }
    console.error(
      "[PATCH /api/corretores/[id]/plantao] RPC error:",
      rpcError.message,
      rpcError.code
    );
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  const result = data as RpcPlantao | null;
  if (!result || result.status === "corretor_nao_encontrado") {
    return NextResponse.json({ erro: "corretor_nao_encontrado" }, { status: 404 });
  }
  if (result.status !== "ok") {
    console.error("[PATCH /api/corretores/[id]/plantao] status inesperado:", result.status);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  revalidar();

  const fila =
    result.fila && typeof result.fila === "object"
      ? {
          distribuidos: Number(result.fila.distribuidos ?? 0),
          restantes: Number(result.fila.restantes ?? 0),
        }
      : null;

  return NextResponse.json(
    { status: "ok", em_plantao: result.em_plantao ?? em_plantao, fila },
    { status: 200 }
  );
}
