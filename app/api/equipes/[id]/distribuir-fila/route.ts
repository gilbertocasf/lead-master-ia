import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { funcaoAusente, RESPOSTA_MIGRATION_PENDENTE } from "@/lib/rpc";

interface RpcDistribuirFila {
  status: string;
  distribuidos?: number;
  restantes?: number;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
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
    .select("id, imobiliaria_id, role, equipe_id")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json({ erro: "usuario_sem_imobiliaria" }, { status: 403 });
  }
  if (usuario.role !== "admin" && usuario.role !== "gestor") {
    return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
  }

  const equipe_id = params.id;

  if (usuario.role === "gestor") {
    if (!usuario.equipe_id) {
      return NextResponse.json({ erro: "gestor_sem_equipe" }, { status: 403 });
    }
    if (String(usuario.equipe_id) !== equipe_id) {
      return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
    }
  }

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[POST /api/equipes/[id]/distribuir-fila] createSupabaseAdmin:", err);
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 503 });
  }

  // A equipe precisa pertencer à imobiliária do usuário autenticado
  const { data: equipe } = await admin
    .from("equipes")
    .select("id")
    .eq("id", equipe_id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .maybeSingle();

  if (!equipe) {
    return NextResponse.json({ erro: "equipe_nao_encontrada" }, { status: 404 });
  }

  const { data, error: rpcError } = await admin.rpc("distribuir_fila_equipe", {
    p: {
      imobiliaria_id: usuario.imobiliaria_id,
      equipe_id,
      usuario_id: usuario.id,
    },
  });

  if (rpcError) {
    if (funcaoAusente(rpcError)) {
      return NextResponse.json(RESPOSTA_MIGRATION_PENDENTE, { status: 503 });
    }
    console.error(
      "[POST /api/equipes/[id]/distribuir-fila] RPC error:",
      rpcError.message,
      rpcError.code
    );
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  const result = data as RpcDistribuirFila | null;
  if (!result || result.status === "equipe_invalida") {
    return NextResponse.json({ erro: "equipe_nao_encontrada" }, { status: 404 });
  }
  if (result.status !== "ok") {
    console.error("[POST /api/equipes/[id]/distribuir-fila] status inesperado:", result.status);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  revalidatePath("/corretores");
  revalidatePath("/equipes");

  return NextResponse.json(
    {
      status: "ok",
      distribuidos: Number(result.distribuidos ?? 0),
      restantes: Number(result.restantes ?? 0),
    },
    { status: 200 }
  );
}
