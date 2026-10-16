// Normalização de telefone — Lead Master IA
//
// Regra única usada pelo app (cadastro manual e webhook da Meta) e pela
// função SQL normalizar_telefone_br() da migration 010. As duas implementações
// precisam produzir exatamente o mesmo resultado, senão a deduplicação falha.
//
// Resultado: só dígitos, com código do país. Para o Brasil: "55" + DDD + número.
//   "(62) 99999-0001"      → "5562999990001"
//   "+55 62 99999-0001"    → "5562999990001"
//   "062 99999-0001"       → "5562999990001"
//   "62 3333-0001"         → "556233330001"
//   "+1 650 555 1234"      → "16505551234"   (internacional: mantém como veio)
//
// Passos:
//   1. Se o texto começa com "+", o número já traz o país: devolve só os dígitos.
//   2. Remove tudo que não é dígito e os zeros à esquerda (ex.: "0" de DDD).
//   3. 10 ou 11 dígitos (DDD + número brasileiro) → prefixa "55".
//   4. Qualquer outro tamanho → devolve os dígitos como estão.

export function normalizarTelefone(bruto: string): string {
  const texto = (bruto ?? "").trim();
  const digitos = texto.replace(/\D/g, "");

  if (texto.startsWith("+")) {
    return digitos;
  }

  const semZeros = digitos.replace(/^0+/, "");

  if (semZeros.length === 10 || semZeros.length === 11) {
    return "55" + semZeros;
  }

  return semZeros;
}

// Telefone mínimo aceito: DDD + número fixo (10 dígitos) ou, com país, 12+.
export function telefoneValido(normalizado: string): boolean {
  return normalizado.length >= 10 && normalizado.length <= 15;
}
