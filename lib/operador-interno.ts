// Operadores internos do Lead Master (equipe que configura clientes).
// Mesma regra de app/admin: e-mail presente em INTERNAL_OWNER_EMAILS
// (lista separada por vírgula, comparação em minúsculas). Server-side.

export function emailsOperadoresInternos(): string[] {
  const raw = process.env.INTERNAL_OWNER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function ehOperadorInterno(email: string | null | undefined): boolean {
  if (!email) return false;
  const autorizados = emailsOperadoresInternos();
  return autorizados.length > 0 && autorizados.includes(email.trim().toLowerCase());
}
