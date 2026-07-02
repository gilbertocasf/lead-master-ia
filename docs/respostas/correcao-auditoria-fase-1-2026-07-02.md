# Correção Auditoria — Fase 1 — 2026-07-02

**Escopo:** Correções de segurança, isolamento multi-tenant e acabamento pré-demo apontadas em `docs/auditorias/auditoria-local-2026-07-02.md`. Nenhuma migration foi criada ou executada, nenhum arquivo de schema/RLS foi alterado, nenhum commit/push/deploy foi feito.

---

## 1. Resumo das correções realizadas

1. **`PATCH /api/leads/[id]/status`** passou a aplicar **deny-by-default**: apenas `admin`, `gestor` e `corretor` seguem para as validações e para a chamada da RPC com `service_role`. `captador` (e qualquer role futura não prevista) recebe `403 { erro: "sem_permissao" }` imediatamente após a resolução do perfil, antes de qualquer leitura de payload ou chamada RPC. As regras já existentes de `gestor` (própria equipe) e `corretor` (próprio lead) foram mantidas sem alteração.

2. **`PATCH /api/corretores/[id]`** reforçado em três pontos de isolamento multi-tenant:
   - a validação de `equipe_id` agora exige `imobiliaria_id = usuario.imobiliaria_id`, impedindo vincular um corretor a uma equipe de outro tenant;
   - a checagem de conflito de `usuario_id` (usuário já vinculado a outro corretor) agora também filtra por `imobiliaria_id`;
   - o `UPDATE` final passou a filtrar por `imobiliaria_id` além de `id`, como defesa adicional.
   - A rota `DELETE` (exclusão segura/soft delete) não foi tocada — já estava correta.

3. **`POST /api/leads`** não devolve mais `rpcError.message` nem `rpcError.code` ao cliente no branch de erro desconhecido da RPC. O detalhe continua sendo logado no servidor via `console.error`; o cliente recebe apenas `{ erro: "erro_interno" }`.

4. **Mensagens técnicas removidas da UI** em 6 páginas (5 previstas + 1 adicional — ver nota abaixo). Textos que citavam `migration 007`, nome de coluna (`usuario_id`, `equipe_id`) ou nome de tabela (`corretores`, `usuarios`) foram trocados por: *"Seu acesso ainda não foi configurado. Solicite ajuste ao administrador."* (estados de vínculo pendente) e a remoção da linha de aviso sobre migration nos estados de lista vazia (mantendo apenas "Nenhum lead cadastrado ainda.").

5. **Botão "Distribuir"** na fila de leads sem corretor (`app/(app)/leads/page.tsx`) deixou de ser um `ComingSoonButton` clicável com popup "Disponível em breve". Foi substituído por um indicador não interativo — *"Aguardando plantão"* — com `title` explicativo (*"A distribuição automática ocorre assim que houver corretor em plantão nesta equipe."*). O componente `ComingSoonButton.tsx` não foi alterado (ficou sem uso ativo no momento, mas preservado para uso futuro).

6. **`fetchUsuarioAtual` (`lib/supabase-queries.ts`)** — o cast do campo `role` no retorno passou a incluir `"captador"`, alinhando com a interface `UsuarioAtual` (que já previa esse valor) e com a regra de negócio real.

---

## 2. Arquivos alterados

```
 app/(app)/corretores/page.tsx      |  5 +----
 app/(app)/equipes/page.tsx         |  5 +----
 app/(app)/leads/page.tsx           | 23 ++++++++---------------
 app/(app)/page.tsx                 | 17 +++--------------
 app/(app)/pipeline/page.tsx        | 10 ++--------
 app/(app)/ranking/page.tsx         |  5 +----
 app/api/corretores/[id]/route.ts   | 10 ++++++++--
 app/api/leads/[id]/status/route.ts | 12 ++++++++++++
 app/api/leads/route.ts             |  9 +++++----
 lib/supabase-queries.ts            |  2 +-
 10 files changed, 42 insertions(+), 56 deletions(-)
```

**Nota sobre escopo:** a tarefa listava 5 arquivos de UI (`leads/page.tsx`, `pipeline/page.tsx`, `page.tsx`, `corretores/page.tsx`, `equipes/page.tsx`). Durante a varredura foi encontrado o mesmo padrão de mensagem técnica em `app/(app)/ranking/page.tsx` (estado "gestor sem equipe vinculada"), que segue a mesma regra ("qualquer menção a... tabela... para usuário final"). Foi corrigido junto, por consistência — texto idêntico ao dos demais arquivos, mesmo risco, mesma correção. Nenhuma outra alteração foi feita fora da lista da tarefa.

---

## 3. Regras de segurança implementadas

- **Deny-by-default por role** em `PATCH /api/leads/[id]/status`: a rota agora enumera explicitamente quem pode prosseguir (`admin`, `gestor`, `corretor`) em vez de bloquear apenas os roles conhecidos como restritos. Qualquer role não listado — incluindo `captador` e qualquer valor futuro — é negado antes de tocar a RPC `service_role`.
- **Isolamento de tenant consistente em `PATCH /api/corretores/[id]`**: as três queries que faltavam `imobiliaria_id` (validação de equipe, checagem de conflito de usuário, update final) agora seguem o mesmo padrão já usado em `POST /api/corretores` e nas demais rotas.
- **Minimização de superfície de erro** em `POST /api/leads`: mensagens de erro específicas e conhecidas (`sem_equipe_disponivel`, `equipe_invalida`, `corretor_invalido`, `captador_invalido`) continuam sendo devolvidas como códigos funcionais. Para qualquer erro não mapeado da RPC/Postgres, o cliente recebe apenas `erro_interno`; texto de exceção, código de erro do Postgres e qualquer nome de tabela/constraint ficam restritos ao log do servidor.
- **Ausência de vazamento de vocabulário interno na UI**: usuário final não vê mais nomes de coluna, tabela ou "migration" em nenhuma tela.

---

## 4. O que foi deliberadamente deixado para fase futura

- **Atualização do Next.js / `npm audit fix`** — fora do escopo desta fase por instrução explícita; achado `C1` da auditoria continua pendente.
- **Distribuição manual real** (endpoint `POST /api/leads/[id]/distribuir`) — não implementada; apenas o estado visual do botão foi corrigido para não parecer quebrado. Item já rastreado como `P1`/V1-#1 em `docs/PROXIMAS-FASES.md`.
- **Fluxo de senha manual do `/setup-cliente`** — não alterado, conforme instrução.
- **Refatoração de leituras do captador com `service_role`** (`fetchTudoEscopado`) — não alterada, conforme instrução. O gap de leitura (I2 da auditoria: `/corretores` e `/equipes` não bloqueavam `captador`) **não fazia parte da lista de correções obrigatórias desta Fase 1** e não foi tocado — permanece como pendência para a próxima fase.
- **Schema, migrations, RLS/policies** — nada alterado, nenhuma migration criada, nenhum SQL aplicado.
- **`.env`, dependências, Vercel/Supabase config** — nada alterado.

---

## 5. Comandos executados

```bash
npm run build
git diff --stat
git diff -- "app/api/leads/[id]/status/route.ts"
git diff -- "app/api/corretores/[id]/route.ts"
git diff -- "app/api/leads/route.ts"
git diff -- "lib/supabase-queries.ts"
git status --short
```

Além de leitura de arquivos (Read/Grep) para localizar precisamente os trechos a corrigir. Nenhum comando de escrita no banco, migration, commit, push ou deploy foi executado.

---

## 6. Resultado do build

`npm run build` — **sucesso**, sem erros de compilação ou de tipo, após todas as 6 correções aplicadas.

```
▲ Next.js 14.2.5
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Generating static pages (14/14)

Route (app)                              Size     First Load JS
┌ ƒ /                                    153 B          87.2 kB
├ ○ /_not-found                          871 B          87.9 kB
├ ƒ /api/corretores                      0 B                0 B
├ ƒ /api/corretores/[id]                 0 B                0 B
├ ƒ /api/equipes                         0 B                0 B
├ ƒ /api/equipes/[id]                    0 B                0 B
├ ƒ /api/leads                           0 B                0 B
├ ƒ /api/leads/[id]/status               0 B                0 B
├ ƒ /corretores                          3.69 kB        90.7 kB
├ ƒ /equipes                             2.58 kB        89.6 kB
├ ƒ /leads                               2.84 kB        89.9 kB
├ ƒ /login                               153 B          87.2 kB
├ ƒ /pipeline                            871 B          87.9 kB
├ ƒ /ranking                             153 B          87.2 kB
└ ƒ /setup-cliente                       1.75 kB        88.8 kB
+ First Load JS shared by all            87.1 kB
ƒ Middleware                             83.2 kB
```

Bundle de `/leads` reduziu de 3.01 kB para 2.84 kB (remoção do `ComingSoonButton` não utilizado mais nessa página).

---

## 7. Pontos que precisam de teste manual

1. **Captador tentando alterar status via API direta** — logar como captador, pegar um `lead_id` qualquer da imobiliária (inclusive um não captado por ele) e chamar `PATCH /api/leads/{id}/status` (via devtools/curl com o cookie de sessão). Esperado: `403 { erro: "sem_permissao" }`.
2. **Gestor e corretor continuam funcionando normalmente** — mover status de um lead da própria equipe (gestor) e do próprio lead atribuído (corretor) pela UI do pipeline. Esperado: comportamento inalterado (sucesso).
3. **Admin movendo `equipe_id` de um corretor** — testar o fluxo normal (mesma imobiliária) pelo modal de vínculo em `/corretores`. Esperado: continua funcionando. Não é possível testar o cenário de cross-tenant sem uma segunda imobiliária de teste — recomenda-se validar isso quando houver um segundo tenant disponível (ex.: criando um via `/setup-cliente`).
4. **Cadastro de lead com erro forçado** — difícil de simular sem acesso ao banco; revisar ao menos visualmente que a tela de erro genérico (`Erro ao cadastrar lead. Tente novamente.`) aparece corretamente quando `erro_interno` é retornado sem `detalhe` (o `NovoLeadModal.tsx` já trata esse caso pelo fallback do `switch`).
5. **Telas de estado vazio/pendente** — conferir visualmente as páginas `/`, `/leads`, `/pipeline`, `/corretores`, `/equipes` e `/ranking` logado como um usuário `gestor` sem `equipe_id` preenchida, e como `corretor` sem vínculo em `corretores.usuario_id`, para confirmar que a nova mensagem genérica aparece corretamente e não há mais nenhum texto técnico residual.
6. **Fila de leads sem corretor (`/leads`, visão admin/gestor)** — confirmar visualmente que o card não interativo "Aguardando plantão" aparece no lugar do antigo botão "Distribuir", e que o `title` (tooltip ao passar o mouse) mostra a explicação.

---

## 8. Confirmação

- Nenhuma migration foi criada ou executada.
- Nenhum SQL foi aplicado no Supabase.
- Nenhuma policy/RLS foi alterada.
- Nenhuma variável de ambiente foi alterada.
- Nenhuma dependência foi instalada, atualizada ou removida.
- `npm audit fix` **não** foi executado.
- Nenhum `git add`, `git commit`, `git push` foi executado.
- Nenhum deploy ou redeploy foi feito.
- Nenhuma configuração da Vercel foi alterada.
- Nenhum segredo/chave foi exposto, impresso ou salvo neste relatório.

O repositório permanece apenas com alterações no working tree (não commitadas) — ver `git status --short` na seção 5 do processo de validação.
