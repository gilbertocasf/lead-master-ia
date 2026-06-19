import { createClient } from "@supabase/supabase-js";

// Garante que este módulo nunca seja incluído no bundle do browser.
// SUPABASE_SERVICE_ROLE_KEY não tem prefixo NEXT_PUBLIC_, então será undefined no client.
if (typeof window !== "undefined") {
  throw new Error(
    "[supabase-admin] Este módulo só pode ser importado no servidor. " +
      "Remova o import de qualquer Client Component ou arquivo client-side."
  );
}

export function createSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "[supabase-admin] SUPABASE_SERVICE_ROLE_KEY não está definida. " +
        "Adicione a variável no .env.local (nunca com prefixo NEXT_PUBLIC_)."
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
