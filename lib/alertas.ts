// Módulo server-side exclusivo — nunca importar em componentes client.
//
// Alertas operacionais por e-mail (Resend), usados pela integração com a Meta:
// token expirado, Página sem cadastro, formulário sem equipe, eventos que
// esgotaram as tentativas etc.
//
// Regras:
//   - Nunca lança exceção (falha de alerta não pode derrubar o processamento).
//   - Nunca incluir dados pessoais do lead (nome, telefone, e-mail) no assunto
//     ou no texto. Use apenas identificadores técnicos (ids de evento, Página,
//     formulário, equipe) e códigos de erro.
//   - Deduplicação simples em memória por assunto: o mesmo assunto não é
//     reenviado em menos de 10 minutos dentro da mesma instância da função.
//     (Instâncias diferentes da Vercel não compartilham memória — pode haver
//     repetição ocasional, o que é aceitável para alertas.)

const JANELA_DEDUP_MS = 10 * 60 * 1000;
const MAX_TEXTO = 4000;

const ultimoEnvioPorAssunto = new Map<string, number>();

export type AlertaStatus =
  | "enviado"
  | "falhou"
  | "nao_configurado"
  | "suprimido";

function destinatarios(): string[] {
  return (process.env.ALERTA_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 3 && e.includes("@"));
}

export function alertasConfigurados(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.EMAIL_FROM &&
      destinatarios().length > 0
  );
}

export async function enviarAlerta(
  assunto: string,
  texto: string
): Promise<AlertaStatus> {
  try {
    const assuntoLimpo = assunto.replace(/\s+/g, " ").trim().slice(0, 150);
    const agora = Date.now();

    const anterior = ultimoEnvioPorAssunto.get(assuntoLimpo);
    if (anterior !== undefined && agora - anterior < JANELA_DEDUP_MS) {
      return "suprimido";
    }

    // Registra no log apenas o assunto (sem dados pessoais por contrato).
    console.warn(`[alerta] ${assuntoLimpo}`);

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    const para = destinatarios();
    if (!apiKey || !from || para.length === 0) {
      return "nao_configurado";
    }

    // Marca antes do envio para não disparar em rajada enquanto a requisição
    // está em andamento.
    ultimoEnvioPorAssunto.set(assuntoLimpo, agora);
    if (ultimoEnvioPorAssunto.size > 200) {
      for (const [chave, quando] of Array.from(ultimoEnvioPorAssunto)) {
        if (agora - quando >= JANELA_DEDUP_MS) ultimoEnvioPorAssunto.delete(chave);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: para,
          subject: `[Lead Master IA] ${assuntoLimpo}`,
          text:
            texto.slice(0, MAX_TEXTO) +
            "\n\nAlerta automático do Lead Master IA (integração Meta).",
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        console.error(`[alerta] Falha ao enviar alerta: HTTP ${res.status}`);
        return "falhou";
      }
      return "enviado";
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error(
      "[alerta] Erro ao enviar alerta:",
      err instanceof Error ? err.message : "erro desconhecido"
    );
    return "falhou";
  }
}
