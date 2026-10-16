# Prontidão para leads da Meta: relatório da entrega

Data: 2026-10-15. Branch: `feat/prontidao-meta-leads` (a partir de `main` 633c230).

## O que foi feito (por commit)

- `a88d1cb` Contrato técnico, normalização de telefone e utilitário de RPC.
- `1e8b266` Plantão pelo app, distribuição da fila e atribuição manual (rotas e botões).
- `538026a` Tela `/integracoes` e página do lead com histórico (`/leads/[id]`).
- `daa3510` Migrations 009 a 011: segurança por equipe, estrutura Meta, RPCs de distribuição.
- `fb051db` Receptor de leads da Meta (webhook), reprocessamento, reconciliação (cron) e alertas.
- Documentação desta etapa (ainda sem commit): `docs/integracao-meta/configuracao.md`, `docs/integracao-meta/checklist-go-live.md`, `docs/roteiro-demo.md` atualizado, `CLAUDE.md` (estado e riscos), este relatório.

## O que depende do dono

1. **Migrations**: aplicar 009, 010 e 011 em sequência (`docs/setup/aplicar-migrations-009-011.md`); antes, conferir gestores sem equipe.
2. **Build e lint**: rodar `npm run build` e `npm run lint` fora deste ambiente e corrigir o que aparecer. Nada foi compilado.
3. **Variáveis na Vercel**: `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_ACCESS_TOKEN`, `CRON_SECRET`, `ALERTA_EMAILS` (e `RESEND_API_KEY`/`EMAIL_FROM`), com novo deploy.
4. **Meta**: criar o app, webhook, token de Usuário do Sistema, instalar o app na Página, liberar acesso a leads se pedido. Acesso Avançado só para Páginas de terceiros.
5. **Cron**: Vercel Pro (`vercel.json` a cada 5 min) ou agendador externo. No Hobby, cron frequente quebra o deploy.
6. **Planos**: Vercel Pro se quiser cron nativo; confirmar limites do plano do Supabase para o volume esperado.
7. **Cadastro** de Página e formulários em `/integracoes`; plantão ligado para os corretores.

## Riscos conhecidos

- Código novo sem build, lint nem teste automatizado.
- Aplicar a 009 deixa gestor sem equipe sem ver dados.
- Entre a 010 e a 011, a detecção de telefone repetido pode falhar em leads antigos; aplicar juntas.
- Token de 60 dias expira (alerta por e-mail avisa, mas a leitura para até a troca).
- A reconciliação cobre só as últimas 3 h; leads mais antigos perdidos exigem cadastro manual.
- Lead de teste da Meta pode não trazer dados de anúncio/campanha.

## Próximos passos

1. Build e lint, correções.
2. Aplicar migrations e validar com o roteiro (plantão, fila, atribuição).
3. Configurar a Meta e o cron; testar com a ferramenta de leads de teste.
4. Revisar, mesclar em `main` e publicar.
5. Ensaiar a demo com o roteiro novo.
6. Depois: notificação por WhatsApp, avaliar Acesso Avançado se houver clientes com Páginas próprias.
