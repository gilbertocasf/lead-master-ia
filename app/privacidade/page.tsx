// NOTA INTERNA (não aparece na página): este texto deve ser revisado por um
// advogado antes do uso comercial.

export const metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  const email = process.env.PRIVACIDADE_EMAIL;

  return (
    <div className="min-h-screen bg-base px-4 py-12">
      <article className="mx-auto w-full max-w-2xl">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-gold">
          Lead Master IA
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Política de privacidade
        </h1>
        <p className="mt-2 text-sm text-ink-faint">
          Atualizada em 16 de outubro de 2026.
        </p>

        <Secao titulo="Quem somos neste contexto">
          <p>
            O Lead Master IA é um sistema usado por imobiliárias para receber
            contatos de possíveis clientes (leads) e encaminhá-los à equipe e ao
            corretor responsáveis. A imobiliária que usa o sistema é a
            controladora dos dados dos seus leads, ou seja, ela decide por que e
            como esses dados são usados. O Lead Master IA atua como operador:
            trata os dados em nome da imobiliária e segundo as orientações dela.
          </p>
        </Secao>

        <Secao titulo="Quais dados coletamos">
          <p>
            Coletamos nome, telefone, e-mail e as respostas dadas em formulários
            de interesse em imóveis. Esses dados chegam de duas formas: por
            cadastro manual feito pela equipe da imobiliária ou por formulários
            de anúncios da Meta (Facebook e Instagram) preenchidos por você.
          </p>
          <p>
            Também registramos o andamento do atendimento: quem recebeu o
            contato, mudanças de etapa e anotações da equipe.
          </p>
        </Secao>

        <Secao titulo="Para que usamos os dados">
          <p>
            Usamos os dados para encaminhar seu contato à equipe e ao corretor
            responsável e para registrar o atendimento. Não vendemos dados e não
            os usamos para outras finalidades sem orientação da imobiliária.
          </p>
        </Secao>

        <Secao titulo="Com quem os dados podem ser compartilhados">
          <p>
            Compartilhamos dados apenas com prestadores necessários ao
            funcionamento do sistema:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Vercel, para hospedagem do sistema.</li>
            <li>Supabase, para o banco de dados.</li>
            <li>Resend, para envio de e-mails de alerta.</li>
            <li>
              Meta, como origem dos leads captados em anúncios (os dados saem da
              Meta para o sistema).
            </li>
          </ul>
        </Secao>

        <Secao titulo="Como protegemos os dados">
          <p>
            O acesso ao sistema exige login. Os dados de cada imobiliária ficam
            isolados dos de outras imobiliárias, e dentro de cada uma o acesso é
            limitado por equipe. As ações importantes ficam registradas em um
            histórico.
          </p>
        </Secao>

        <Secao titulo="Por quanto tempo guardamos">
          <p>
            Guardamos os dados enquanto houver relação com a imobiliária ou
            conforme a política dela. Pedidos de exclusão são atendidos.
          </p>
        </Secao>

        <Secao titulo="Seus direitos">
          <p>
            Pelo artigo 18 da Lei Geral de Proteção de Dados (LGPD), você pode
            pedir:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>confirmação de que tratamos seus dados;</li>
            <li>acesso aos dados;</li>
            <li>correção de dados incompletos ou errados;</li>
            <li>anonimização ou eliminação de dados;</li>
            <li>portabilidade dos dados;</li>
            <li>informação sobre com quem os dados foram compartilhados;</li>
            <li>revogação do consentimento.</li>
          </ul>
        </Secao>

        <Secao titulo="Como falar com a gente">
          {email ? (
            <p>
              Para exercer seus direitos ou tirar dúvidas, escreva para{" "}
              <a
                href={`mailto:${email}`}
                className="text-action underline-offset-2 hover:underline"
              >
                {email}
              </a>
              .
            </p>
          ) : (
            <p>
              Para exercer seus direitos ou tirar dúvidas, procure a imobiliária
              com quem você fez contato. Ela é a responsável pelos seus dados e
              nos orientará a atender o pedido.
            </p>
          )}
        </Secao>
      </article>
    </div>
  );
}

function Secao({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold text-ink">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-ink-muted">
        {children}
      </div>
    </section>
  );
}
