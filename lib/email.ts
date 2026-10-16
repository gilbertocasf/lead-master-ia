// Módulo server-side exclusivo — nunca importar em componentes client.
// As variáveis de ambiente sem prefixo NEXT_PUBLIC_ só existem no servidor.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM;

export type EmailStatus = "enviado" | "falhou" | "nao_configurado";

/**
 * Notifica o corretor que um novo lead foi atribuído a ele.
 * Dispara APENAS o texto obrigatório — sem dados pessoais do lead.
 * Nunca lança exceção: retorna o status do envio para o caller.
 */
export async function notificarCorretorNovoLead(
  email: string
): Promise<EmailStatus> {
  if (!RESEND_API_KEY || !EMAIL_FROM) {
    console.warn(
      "[email] RESEND_API_KEY ou EMAIL_FROM não configurados — notificação não enviada."
    );
    return "nao_configurado";
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject: "Novo lead recebido",
        text: "Você recebeu um novo Lead, acesse o painel para maiores informações",
      }),
    });

    if (!res.ok) {
      // Nunca registrar o endereço do corretor: o corpo da resposta pode
      // repeti-lo, então e-mails são mascarados e o texto é truncado.
      const corpo = await res.text().catch(() => "(sem corpo)");
      const corpoSeguro = corpo
        .replace(/[^\s"'<>@]+@[^\s"'<>@]+/g, "[email]")
        .slice(0, 300);
      console.error(
        `[email] Falha ao notificar corretor: HTTP ${res.status} — ${corpoSeguro}`
      );
      return "falhou";
    }

    return "enviado";
  } catch (err) {
    console.error(
      "[email] Erro de rede ao notificar corretor:",
      err instanceof Error ? err.message.slice(0, 200) : "erro desconhecido"
    );
    return "falhou";
  }
}
