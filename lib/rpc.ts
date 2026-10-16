// Utilitários para chamadas RPC ao Supabase — server-side.
//
// funcaoAusente(): detecta quando a função/tabela ainda não existe no banco
// (migration não aplicada). Permite que o código novo seja publicado antes das
// migrations sem quebrar: a rota responde 503 { erro: "migration_pendente" }
// em vez de um erro 500 genérico.

interface ErroSupabase {
  code?: string | null;
  message?: string | null;
}

export function funcaoAusente(erro: ErroSupabase | null | undefined): boolean {
  if (!erro) return false;
  const code = erro.code ?? "";
  const msg = (erro.message ?? "").toLowerCase();
  return (
    code === "PGRST202" || // função não encontrada no schema cache do PostgREST
    code === "PGRST205" || // tabela não encontrada no schema cache
    code === "42883" || // undefined_function
    code === "42P01" || // undefined_table
    code === "42703" || // undefined_column
    msg.includes("could not find the function") ||
    msg.includes("could not find the table")
  );
}

export const RESPOSTA_MIGRATION_PENDENTE = {
  erro: "migration_pendente",
  detalhe:
    "Esta funcionalidade depende das migrations 009 a 011. Aplique-as no Supabase (docs/setup/aplicar-migrations-009-011.md).",
} as const;
