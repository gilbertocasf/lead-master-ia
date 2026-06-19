import { redirect } from "next/navigation";
import { createSupabaseServer } from "./supabase-server";
import type { UserRole } from "./types";

export interface UserProfile {
  id: string;
  authUserId: string;
  imobiliariaId: string;
  nome: string;
  email: string;
  role: UserRole;
}

export async function getCurrentUser() {
  const sb = createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user ?? null;
}

export async function getCurrentProfile(): Promise<UserProfile | null> {
  const sb = createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("usuarios")
    .select("id, auth_user_id, imobiliaria_id, nome, email, role")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !data) return null;

  return {
    id: String(data.id),
    authUserId: String(data.auth_user_id),
    imobiliariaId: String(data.imobiliaria_id),
    nome: data.nome,
    email: data.email,
    role: data.role as UserRole,
  };
}

// Redireciona para /login se não houver sessão ou perfil no banco.
export async function requireAuth(): Promise<UserProfile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

// Como requireAuth, mas valida o role também.
// Redireciona para / se o role não é permitido.
export async function requireRole(roles: UserRole[]): Promise<UserProfile> {
  const profile = await requireAuth();
  if (!roles.includes(profile.role)) redirect("/");
  return profile;
}
