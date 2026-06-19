import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// True quando ambas as variáveis estão presentes e não vazias.
// As queries usam isto para decidir entre Supabase real e mock-data.
export const hasSupabaseEnv = Boolean(url && anonKey);

// Cliente único. Fica null quando não há credenciais — nesse caso as
// funções de query caem no fallback de mock e nunca tocam neste cliente.
export const supabase: SupabaseClient | null = hasSupabaseEnv
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: false }, // sem login nesta fase
    })
  : null;
