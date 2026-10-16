# Checklist de produção (o que depende do dono)

Itens que o código não resolve sozinho. Marque conforme for concluindo.

## Contratação e infraestrutura

- [ ] Contratar plano pago da Vercel (o plano gratuito tem limites e não permite uso comercial).
- [ ] Contratar plano pago do Supabase (o gratuito pode pausar o projeto por inatividade e tem backups limitados).
- [ ] Testar o backup do banco: restaurar uma cópia em um projeto de teste e conferir se os dados voltam.
- [ ] Domínio próprio (opcional): registrar, apontar para a Vercel e atualizar a URL do webhook na Meta.

## Privacidade e jurídico

- [ ] Definir a variável `PRIVACIDADE_EMAIL` na Vercel com o e-mail que receberá pedidos dos titulares. Sem ela, a página `/privacidade` orienta procurar a imobiliária.
- [ ] Pedir a um advogado que revise a página `/privacidade` antes do uso comercial.

## Segurança e operação

- [ ] Limitar requisições no login (`/login`) e no webhook (`/api/webhooks/meta`) com regras de Rate Limiting no Firewall da Vercel (painel do projeto, aba Firewall).
- [ ] Acompanhar os logs da Vercel e do Supabase com frequência (erros do webhook, do cron e de login).
- [ ] Conferir se o e-mail de alerta (`ALERTA_EMAILS`) está chegando de verdade.

## Decisões que exigem pacote novo (decidir antes)

- [ ] Analytics: o Vercel Web Analytics exige instalar um pacote novo no projeto. Decidir se quer.
- [ ] Testes ponta a ponta com Playwright: próxima etapa recomendada, mas exige dependência nova. Decidir antes de começar.
