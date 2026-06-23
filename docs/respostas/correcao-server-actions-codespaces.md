# Correção de Server Actions no Codespaces

## Problema
No ambiente local do GitHub Codespaces, o Next.js 14 valida se o cabeçalho `origin` corresponde ao host encaminhado (`x-forwarded-host`/`host`) em solicitações de Server Actions. Quando o proxy do Codespaces usa um host público diferente (como `*.githubpreview.dev` ou `*.codespaces.app`), a validação falha e o erro `Invalid Server Actions request.` ocorre.

## Correção aplicada
Ajuste realizado em `next.config.mjs` para permitir origens de desenvolvimento conhecidas do Codespaces e do localhost:

- `localhost:3000`
- `127.0.0.1:3000`
- `*.githubpreview.dev`
- `*.github.dev`
- `*.codespaces.app`

Esse valor é aplicado somente em `NODE_ENV === "development"`.

## Impacto
- Resolve validação de CSRF para Server Actions em Codespaces local.
- Mantém comportamento padrão de produção sem permitir origens adicionais.
- Não altera o banco de dados ou esquema.

## Observação
Se o ambiente Codespaces usar outro domínio de encaminhamento, adicione esse domínio à lista de `allowedOrigins` de desenvolvimento.
