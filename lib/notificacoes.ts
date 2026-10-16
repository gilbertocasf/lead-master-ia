// Notificação por e-mail dos corretores que receberam leads — server-side
// exclusivo. Usada pelo processamento da Meta, pelo cron, pela distribuição
// da fila e pelo plantão. Nunca lança exceção: falha de e-mail não pode
// derrubar a operação que distribuiu o lead.

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { notificarCorretorNovoLead } from "@/lib/email";

type AdminClient = ReturnType<typeof createSupabaseAdmin>;

function textoErro(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 200) : "erro_desconhecido";
}

/** Notifica um corretor (da imobiliária informada) de que recebeu um lead. */
export async function notificarCorretor(
  admin: AdminClient,
  corretorId: string,
  imobiliariaId: string
): Promise<void> {
  try {
    const { data } = await admin
      .from("corretores")
      .select("email")
      .eq("id", corretorId)
      .eq("imobiliaria_id", imobiliariaId)
      .maybeSingle();
    const email = typeof data?.email === "string" ? data.email.trim() : "";
    if (email && email.includes("@")) {
      await notificarCorretorNovoLead(email);
    }
  } catch (err) {
    console.error("[meta] notificação do corretor falhou:", textoErro(err));
  }
}

/** Notifica os corretores de uma lista de atribuições (um e-mail por lead). */
export async function notificarAtribuicoes(
  admin: AdminClient,
  imobiliariaId: string,
  corretorIds: string[]
): Promise<void> {
  for (const id of corretorIds) {
    await notificarCorretor(admin, id, imobiliariaId);
  }
}

/** Extrai os corretor_id de `atribuicoes` devolvidas por distribuir_fila_equipe. */
export function corretoresDasAtribuicoes(atribuicoes: unknown): string[] {
  if (!Array.isArray(atribuicoes)) return [];
  return atribuicoes
    .map((a) =>
      a && typeof a === "object" && (a as { corretor_id?: unknown }).corretor_id
        ? String((a as { corretor_id?: unknown }).corretor_id)
        : ""
    )
    .filter((id) => id.length > 0);
}
