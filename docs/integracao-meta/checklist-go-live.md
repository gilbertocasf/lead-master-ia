# Checklist de go-live: leads da Meta

Marque cada item. Detalhes em `docs/integracao-meta/configuracao.md`.

## Banco e código

- [ ] Migrations 009, 010 e 011 aplicadas e conferidas (`docs/setup/aplicar-migrations-009-011.md`)
- [ ] Gestores ativos têm equipe definida (senão não veem nada após a 009)
- [ ] `npm run build` e `npm run lint` passam (rodar fora deste ambiente)
- [ ] Branch revisado e publicado na Vercel; login e telas principais funcionando

## Variáveis na Vercel (e novo deploy depois)

- [ ] `META_APP_SECRET`
- [ ] `META_VERIFY_TOKEN` (texto aleatório longo, igual ao do painel da Meta)
- [ ] `META_ACCESS_TOKEN` (Usuário do Sistema, de preferência sem expiração)
- [ ] `CRON_SECRET` (texto aleatório longo)
- [ ] `ALERTA_EMAILS`, `RESEND_API_KEY` e `EMAIL_FROM`
- [ ] `/integracoes` mostra todas as variáveis como configuradas

## Meta

- [ ] App criado, vinculado ao Gerenciador de Negócios, com permissões necessárias
- [ ] Quem administra a Página tem função no app (Acesso Padrão) ou o app tem Acesso Avançado aprovado
- [ ] Webhook verificado (objeto Page, campo `leadgen` assinado)
- [ ] App instalado na Página (`subscribed_apps` com `leadgen` devolveu sucesso)
- [ ] Acesso a Leads liberado para o app, se a Meta exigir
- [ ] Data de renovação do token anotada (se o token não for sem expiração)

## Sistema

- [ ] Página cadastrada em `/integracoes` com regra padrão para uma equipe
- [ ] Formulários importantes com vínculo próprio, se tiverem equipe diferente
- [ ] Equipes de destino ativas, com corretores ativos
- [ ] Cron agendado a cada 5 minutos (Vercel Pro ou agendador externo) e respondendo 200
- [ ] Sem `vercel.json` com cron frequente se o plano for Hobby

## Antes do primeiro lead real

- [ ] Lead de teste da Meta apareceu como Processado em `/integracoes`
- [ ] O lead de teste apareceu em `/leads`, distribuído, com histórico completo
- [ ] Reenvio do mesmo teste não criou lead duplicado
- [ ] Um corretor recebeu o e-mail de novo lead
- [ ] Alerta de teste chegou em `ALERTA_EMAILS` (ex.: provoque `sem_telefone` com formulário de teste)
- [ ] Plantão ligado para pelo menos um corretor por equipe de destino
- [ ] Gestor sabe ligar/desligar plantão e usar Distribuir fila

## Antes da demo

- [ ] Lead de teste da Meta enviado com sucesso nas últimas 24 h (ensaio completo)
- [ ] Aba da ferramenta de teste da Meta aberta e logada, formulário escolhido
- [ ] Corretores de demonstração em plantão; fila vazia
- [ ] Plano B pronto: lead cadastrado manualmente e página do lead com histórico à mão
- [ ] Sessão do app logada como admin (sessão expira em 1 hora)
