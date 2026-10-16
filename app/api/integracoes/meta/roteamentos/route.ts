import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { funcaoAusente, RESPOSTA_MIGRATION_PENDENTE } from "@/lib/rpc";
import { ehOperadorInterno } from "@/lib/operador-interno";

// Cria ou atualiza o vínculo Página/formulário da Meta → equipe.
// Corpo: { page_id, page_nome?, form_id? | null, form_nome?, equipe_id }
// form_id null/ausente = regra padrão da Página.
// Também atualiza a Página em integracoes_meta. Cadastrar uma Página nova
// (page_id ainda inexistente) é exclusivo de operadores internos
// (INTERNAL_OWNER_EMAILS): o admin do cliente só vincula Páginas já
// liberadas para a imobiliária dele — impede tomar a Página de terceiros.

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_META_RE = /^\d{1,32}$/;

function textoOpcional(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function idMeta(v: unknown): string | null | "invalido" {
  if (v === null || v === undefined) return null;
  const t = typeof v === "number" && Number.isSafeInteger(v) ? String(v) : v;
  if (typeof t !== "string") return "invalido";
  const limpo = t.trim();
  if (!limpo) return null;
  return ID_META_RE.test(limpo) ? limpo : "invalido";
}

export async function POST(req: NextRequest) {
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

  let body: Record<string, unknown>;
  try {
    const json: unknown = await req.json();
    if (typeof json !== "object" || json === null || Array.isArray(json)) throw new Error();
    body = json as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }

  const pageId = idMeta(body.page_id);
  const formId = idMeta(body.form_id);
  const pageNome = textoOpcional(body.page_nome, 200);
  const formNome = textoOpcional(body.form_nome, 200);
  const equipeId = typeof body.equipe_id === "string" ? body.equipe_id.trim() : "";

  if (!pageId || pageId === "invalido") {
    return NextResponse.json({ erro: "page_id_invalido" }, { status: 400 });
  }
  if (formId === "invalido") {
    return NextResponse.json({ erro: "form_id_invalido" }, { status: 400 });
  }
  if (!UUID_RE.test(equipeId)) {
    return NextResponse.json({ erro: "equipe_invalida" }, { status: 400 });
  }

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch (err) {
    console.error("[POST /api/integracoes/meta/roteamentos] createSupabaseAdmin:", err);
    return NextResponse.json({ erro: "servico_indisponivel" }, { status: 503 });
  }

  const imobId = usuario.imobiliaria_id;

  // Equipe precisa ser da imobiliária e estar ativa.
  const { data: equipe } = await admin
    .from("equipes")
    .select("id, nome, ativo")
    .eq("id", equipeId)
    .eq("imobiliaria_id", imobId)
    .maybeSingle();
  if (!equipe || equipe.ativo === false) {
    return NextResponse.json({ erro: "equipe_invalida" }, { status: 400 });
  }

  // ── Página (integracoes_meta) ───────────────────────────────────────
  const { data: paginaExistente, error: erroPagina } = await admin
    .from("integracoes_meta")
    .select("id, imobiliaria_id")
    .eq("page_id", pageId)
    .maybeSingle();

  if (erroPagina) {
    if (funcaoAusente(erroPagina)) {
      return NextResponse.json(RESPOSTA_MIGRATION_PENDENTE, { status: 503 });
    }
    console.error("[POST /api/integracoes/meta/roteamentos] integracoes_meta:", erroPagina.code);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  // Uma Página já cadastrada por outra imobiliária não pode ser tomada.
  if (paginaExistente && String(paginaExistente.imobiliaria_id) !== String(imobId)) {
    return NextResponse.json({ erro: "pagina_de_outra_imobiliaria" }, { status: 409 });
  }

  if (!paginaExistente && !ehOperadorInterno(user.email)) {
    return NextResponse.json(
      {
        erro: "pagina_nao_liberada",
        detalhe:
          "Esta Página ainda não foi liberada para a sua imobiliária. Fale com o suporte do Lead Master.",
      },
      { status: 403 }
    );
  }

  let paginaNova = false;
  if (paginaExistente) {
    const atualizacao: Record<string, unknown> = { ativo: true };
    if (pageNome) atualizacao.page_nome = pageNome;
    const { error } = await admin
      .from("integracoes_meta")
      .update(atualizacao)
      .eq("id", paginaExistente.id)
      .eq("imobiliaria_id", imobId);
    if (error) {
      console.error("[POST /api/integracoes/meta/roteamentos] update página:", error.code);
      return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
    }
  } else {
    const { error } = await admin
      .from("integracoes_meta")
      .insert({ imobiliaria_id: imobId, page_id: pageId, page_nome: pageNome, ativo: true });
    if (error) {
      if (error.code === "23505") {
        // Corrida: outra requisição cadastrou a mesma Página agora.
        return NextResponse.json({ erro: "pagina_de_outra_imobiliaria" }, { status: 409 });
      }
      if (funcaoAusente(error)) {
        return NextResponse.json(RESPOSTA_MIGRATION_PENDENTE, { status: 503 });
      }
      console.error("[POST /api/integracoes/meta/roteamentos] insert página:", error.code);
      return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
    }
    paginaNova = true;
  }

  // ── Roteamento (meta_roteamento) ────────────────────────────────────
  // O índice único é (page_id, coalesce(form_id, '')): o PostgREST não faz
  // upsert por expressão, então a busca é manual.
  let busca = admin
    .from("meta_roteamento")
    .select("id, imobiliaria_id")
    .eq("page_id", pageId);
  busca = formId ? busca.eq("form_id", formId) : busca.is("form_id", null);
  const { data: regraExistente, error: erroRegra } = await busca.maybeSingle();

  if (erroRegra) {
    if (funcaoAusente(erroRegra)) {
      return NextResponse.json(RESPOSTA_MIGRATION_PENDENTE, { status: 503 });
    }
    console.error("[POST /api/integracoes/meta/roteamentos] meta_roteamento:", erroRegra.code);
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }
  if (regraExistente && String(regraExistente.imobiliaria_id) !== String(imobId)) {
    return NextResponse.json({ erro: "pagina_de_outra_imobiliaria" }, { status: 409 });
  }

  const colunas = "id, page_id, form_id, form_nome, equipe_id, ativo, created_at, updated_at";
  let roteamento: Record<string, unknown> | null = null;

  if (regraExistente) {
    const atualizacao: Record<string, unknown> = {
      equipe_id: equipeId,
      ativo: true,
      updated_at: new Date().toISOString(),
    };
    if (formNome) atualizacao.form_nome = formNome;
    const { data, error } = await admin
      .from("meta_roteamento")
      .update(atualizacao)
      .eq("id", regraExistente.id)
      .eq("imobiliaria_id", imobId)
      .select(colunas)
      .single();
    if (error) {
      console.error("[POST /api/integracoes/meta/roteamentos] update regra:", error.code);
      return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
    }
    roteamento = data as Record<string, unknown>;
  } else {
    const { data, error } = await admin
      .from("meta_roteamento")
      .insert({
        imobiliaria_id: imobId,
        page_id: pageId,
        form_id: formId,
        form_nome: formNome,
        equipe_id: equipeId,
        ativo: true,
      })
      .select(colunas)
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ erro: "conflito_concorrente" }, { status: 409 });
      }
      console.error("[POST /api/integracoes/meta/roteamentos] insert regra:", error.code);
      return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
    }
    roteamento = data as Record<string, unknown>;
  }

  // Página recém-cadastrada: eventos que chegaram antes do cadastro (sem
  // imobiliária) passam a pertencer a esta imobiliária e voltam para a fila
  // como "recebido", prontos para o próximo processamento.
  if (paginaNova) {
    const { error } = await admin
      .from("meta_eventos")
      .update({ imobiliaria_id: imobId, status: "recebido", proxima_tentativa_em: null })
      .eq("page_id", pageId)
      .is("imobiliaria_id", null)
      .in("status", ["recebido", "erro"]);
    if (error) {
      console.error("[POST /api/integracoes/meta/roteamentos] eventos órfãos:", error.code);
    }
  }

  revalidatePath("/integracoes");

  return NextResponse.json(
    {
      status: "ok",
      roteamento: { ...roteamento, equipe_nome: equipe.nome ?? null },
    },
    { status: 200 }
  );
}
