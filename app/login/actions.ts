"use server";

import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=" + encodeURIComponent("Preencha e-mail e senha."));
  }

  const sb = createSupabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    const msg =
      error.message === "Invalid login credentials"
        ? "E-mail ou senha incorretos."
        : "Erro ao autenticar. Tente novamente.";
    redirect("/login?error=" + encodeURIComponent(msg));
  }

  redirect("/");
}

export async function logout() {
  const sb = createSupabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}
