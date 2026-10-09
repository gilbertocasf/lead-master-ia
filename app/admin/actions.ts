"use server";

import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export interface SetupResult {
  ok: boolean;
  erro?: string;
  detalhe?: string;
  dados?: {
    imobiliaria_id: string;
    usuario_id: string;
    auth_user_id: string;
  };
}

function emailsAutorizados(): string[] {
  const raw = process.env.INTERNAL_OWNER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function criarCliente(formData: FormData): Promise<SetupResult> {
  // 1. Verificar autenticação do operador
  const sb = createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await sb.auth.getUser();

  if (authError || !user?.email) {
    return { ok: false, erro: "nao_autenticado" };
  }

  // 2. Verificar e-mail do operador está autorizado
  const autorizados = emailsAutorizados();
  if (
    autorizados.length === 0 ||
    !autorizados.includes(user.email.toLowerCase())
  ) {
    return { ok: false, erro: "sem_permissao" };
  }

  // 3. Extrair campos do formulário
  const nomeImobiliaria = String(formData.get("nome_imobiliaria") ?? "").trim();
  const nomeAdmin = String(formData.get("nome_admin") ?? "").trim();
  const emailAdmin = String(formData.get("email_admin") ?? "").trim().toLowerCase();
  const senhaAdmin = String(formData.get("senha_admin") ?? "");

  if (!nomeImobiliaria) return { ok: false, erro: "nome_imobiliaria_obrigatorio" };
  if (!nomeAdmin) return { ok: false, erro: "nome_admin_obrigatorio" };
  if (!emailAdmin || !emailAdmin.includes("@")) return { ok: false, erro: "email_invalido" };
  if (senhaAdmin.length < 8) return { ok: false, erro: "senha_muito_curta" };

  let admin: ReturnType<typeof createSupabaseAdmin>;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return { ok: false, erro: "servico_indisponivel" };
  }

  // 4. Criar imobiliária
  const { data: imobiliaria, error: errImob } = await admin
    .from("imobiliarias")
    .insert({ nome: nomeImobiliaria, ativo: true })
    .select("id")
    .single();

  if (errImob || !imobiliaria?.id) {
    return { ok: false, erro: "erro_criar_imobiliaria", detalhe: errImob?.message };
  }

  const imobiliariaId = String(imobiliaria.id);

  // 5. Criar usuário no Supabase Auth
  // PENDÊNCIA FUTURA: substituir senha manual por invite de e-mail via
  //   admin.auth.admin.generateLink({ type: 'invite', email: emailAdmin })
  // Isso elimina a necessidade de senha temporária e o risco de ela ser
  // transmitida. Por ora, senha manual com confirmação imediata (email_confirm: true).
  // A senha NÃO é logada em nenhum ponto deste fluxo.
  const { data: authData, error: errAuth } =
    await admin.auth.admin.createUser({
      email: emailAdmin,
      password: senhaAdmin,
      email_confirm: true,
    });

  if (errAuth || !authData?.user?.id) {
    // Rollback: remover imobiliaria criada
    await admin.from("imobiliarias").delete().eq("id", imobiliariaId);
    return { ok: false, erro: "erro_criar_auth_user", detalhe: errAuth?.message };
  }

  const authUserId = authData.user.id;

  // 6. Criar registro em usuarios
  const { data: usuario, error: errUser } = await admin
    .from("usuarios")
    .insert({
      auth_user_id: authUserId,
      imobiliaria_id: imobiliariaId,
      nome: nomeAdmin,
      email: emailAdmin,
      role: "admin",
      ativo: true,
    })
    .select("id")
    .single();

  if (errUser || !usuario?.id) {
    // Rollback: remover auth user e imobiliaria
    await admin.auth.admin.deleteUser(authUserId);
    await admin.from("imobiliarias").delete().eq("id", imobiliariaId);
    return { ok: false, erro: "erro_criar_usuario", detalhe: errUser?.message };
  }

  return {
    ok: true,
    dados: {
      imobiliaria_id: imobiliariaId,
      usuario_id: String(usuario.id),
      auth_user_id: authUserId,
    },
  };
}
