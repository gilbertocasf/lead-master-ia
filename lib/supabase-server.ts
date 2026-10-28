import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createSupabaseServer() {
  // Chamar cookies() aqui, e não só dentro de getAll, é o que marca a rota como
  // dinâmica no build. A Promise é aguardada nos métodos abaixo.
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return (await cookieStore).getAll();
        },
        async setAll(cookiesToSet) {
          try {
            const store = await cookieStore;
            cookiesToSet.forEach(({ name, value, options }) =>
              store.set(name, value, options)
            );
          } catch {
            // Server Component: cookies são read-only; o middleware refresh cuida da sessão.
          }
        },
      },
    }
  );
}
