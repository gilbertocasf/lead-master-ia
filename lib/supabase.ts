// Flag compartilhada: true quando as variáveis de ambiente do Supabase estão presentes.
// Usado pelas queries para decidir entre dados reais e mock-data.
// Os clients de acesso real ficam em supabase-browser.ts, supabase-server.ts e supabase-admin.ts.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabaseEnv = Boolean(url && anonKey);
