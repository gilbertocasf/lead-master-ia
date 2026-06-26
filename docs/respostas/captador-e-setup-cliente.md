# Perfil Captador e Página Setup Cliente

**Data:** 2026-06-26 (atualizado — verificação final de segurança)
**Fase:** 7 — Operações de escrita
**Status:** Implementado (app) | Migration 007 pendente de aplicação

---

## O que foi feito

### 1. Correção na API de leads — `app/api/leads/route.ts`

**Problema original:** a API aceitava `corretor_id` do payload mesmo quando `usuario.role === "captador"`, violando a regra de que captador nunca escolhe corretor manualmente.

**Correção aplicada:**

| Role      | equipe_id                   | corretor_id                             | captador_id                        |
|-----------|-----------------------------|-----------------------------------------|------------------------------------|
| `admin`   | payload                     | payload (Cenário A, opcional)           | null                               |
| `gestor`  | forçado (própria equipe)    | payload validado na equipe (Cenário A)  | null                               |
| `captador`| payload                     | **sempre null** (ignorado do payload)   | `usuarios.id` (próprio usuário)    |
| `corretor`| —                           | —                                       | — (403 antes desta seção)          |

**Como funciona no código (linhas 164–167):**

```typescript
} else if (usuario.role === "captador") {
    captador_id = String(usuario.id);
    corretor_id = null; // captador nunca escolhe corretor manualmente — ignorar qualquer valor do payload
```

O `corretor_id_payload` é lido do body (para validar formato), mas **nunca repassado à RPC** quando o usuário é captador. A variável `corretor_id` — que é a efetivamente enviada à RPC — é explicitamente `null` no bloco do captador.

Erro `captador_invalido` da RPC é mapeado para `{ erro: "captador_invalido" }` com status 400 (linha 215–218).

---

### 2. Migration 007 endurecida — `supabase/migrations/007_captador_role.sql`

#### Validação interna do captador_id na RPC (segunda linha de defesa)

Após extrair `v_captador_id` do payload JSON, a RPC valida:

```sql
IF v_captador_id IS NOT NULL THEN
  IF NOT EXISTS (
    SELECT 1 FROM usuarios
    WHERE id             = v_captador_id
      AND imobiliaria_id = v_imob_id
      AND role           = 'captador'
      AND ativo          = true
  ) THEN
    RAISE EXCEPTION 'captador_invalido';
  END IF;
END IF;
```

**Por que a validação está na RPC e não só na API:**
A API já bloqueia captador inválido. A validação na RPC é uma segunda linha de defesa para:
- Chamadas diretas à RPC via webhook com payload forjado
- Eventuais ferramentas de banco que acessem a função diretamente

#### Grants/Permissões — decisão documentada

```sql
REVOKE ALL ON FUNCTION criar_e_distribuir_lead(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION criar_e_distribuir_lead(JSONB) TO service_role;
```

**Motivação:** a aplicação chama a RPC exclusivamente via admin client (`SUPABASE_SERVICE_ROLE_KEY`). O `service_role` no Supabase é superusuário e mantém EXECUTE mesmo após `REVOKE FROM PUBLIC`. O `REVOKE` impede que qualquer usuário `authenticated` ou `anon` chame a função diretamente via PostgREST (`/rest/v1/rpc/criar_e_distribuir_lead`), bypassando o enforcement de role da API Route.

Para reverter no futuro (formulário público sem backend):
```sql
GRANT EXECUTE ON FUNCTION criar_e_distribuir_lead(JSONB) TO authenticated;
-- (e adicionar validação de tenant dentro da função)
```

---

### 3. Setup cliente — `app/setup-cliente/actions.ts`

**Confirmações de segurança:**

| Ponto                                | Status | Evidência                                                                             |
|--------------------------------------|--------|---------------------------------------------------------------------------------------|
| `INTERNAL_OWNER_EMAILS` server-side  | ✅     | `process.env.INTERNAL_OWNER_EMAILS` (sem `NEXT_PUBLIC_`), em arquivo `"use server"`  |
| Não exposto no client                | ✅     | `emailsAutorizados()` não é exportada; arquivo `"use server"` não pode ser importado em Client Components |
| Senha não logada                     | ✅     | Nenhum `console.log`/`console.error` toca em `senhaAdmin`; apenas `errAuth?.message` é retornado em caso de falha (não contém a senha) |
| Pendência futura documentada         | ✅     | Comentário no código (linha 78–82): substituir senha manual por invite via `admin.auth.admin.generateLink({ type: 'invite', email })` |

**Não há alterações a fazer em `.env.local`** — variáveis de ambiente são configuração de infraestrutura, não código.

---

## Migration 007 — NÃO FOI APLICADA

A migration `supabase/migrations/007_captador_role.sql` existe no repositório mas **ainda não foi executada no banco de produção**.

O perfil `captador` **não funciona no banco real** até a migration ser aplicada.

### Como aplicar

#### Passo 1 — Executar sozinho (fora de transação)

No Supabase SQL Editor, rodar apenas isso e aguardar confirmação:

```sql
ALTER TYPE usuario_role ADD VALUE IF NOT EXISTS 'captador';
```

> **Importante:** `ALTER TYPE ADD VALUE` não pode rodar dentro de um bloco `BEGIN/COMMIT` no PostgreSQL. Execute separado.

#### Passo 2 — Executar em seguida (pode ser em transação)

Copiar e rodar o restante do arquivo `supabase/migrations/007_captador_role.sql` a partir do `BEGIN;`.

O Passo 2 inclui:
- `ALTER TABLE leads ADD COLUMN IF NOT EXISTS captador_id`
- 3 policies RLS (leads, corretores, vendas)
- RPC `criar_e_distribuir_lead` v3 com validação de captador_id
- `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO service_role`

---

## Como criar usuário captador de teste (após migration)

```sql
-- 1. Criar no Supabase Authentication → Add user
--    Email: captador@teste.local  |  Copiar UUID gerado

-- 2. Inserir em usuarios:
INSERT INTO usuarios (auth_user_id, imobiliaria_id, nome, email, role, ativo)
VALUES (
  '<UUID_DO_AUTH_USER>',
  (SELECT id FROM imobiliarias LIMIT 1),
  'Captador Teste',
  'captador@teste.local',
  'captador',
  true
);

-- 3. Verificar que a policy filtra corretamente (rodar como o usuário captador):
SELECT * FROM leads;
-- Deve retornar apenas leads onde captador_id = id do usuário autenticado
```

---

## Como configurar `INTERNAL_OWNER_EMAILS`

Na Vercel (ou em `.env.local` local):

```env
INTERNAL_OWNER_EMAILS=seu-email@exemplo.com,outro@empresa.com
```

- Separado por vírgula
- Comparação case-insensitive
- Se vazio ou ausente: acesso negado para todos
- **Nunca usar prefixo `NEXT_PUBLIC_`**

---

## Build

```
✓ Compiled successfully
✓ Generating static pages (14/14)
Sem erros de tipo.
```

14 rotas geradas. Todas as API routes compiladas sem aviso.

---

## Git status

```
On branch main
Your branch is up to date with 'origin/main'.
```

### Git status --short

```
 M .env.local.example
 M app/(app)/leads/page.tsx
 M app/(app)/page.tsx
 M app/(app)/pipeline/page.tsx
 M app/(app)/ranking/page.tsx
 M app/api/leads/route.ts
 M components/NovoLeadModal.tsx
 M components/Sidebar.tsx
 M lib/supabase-queries.ts
 M lib/types.ts
?? app/setup-cliente/
?? docs/auditorias/auditoria-completa-codex-2026-06-26.md
?? docs/respostas/captador-e-setup-cliente.md
?? supabase/migrations/007_captador_role.sql
```

### Git diff --name-only (modificados)

```
.env.local.example
app/(app)/leads/page.tsx
app/(app)/page.tsx
app/(app)/pipeline/page.tsx
app/(app)/ranking/page.tsx
app/api/leads/route.ts
components/NovoLeadModal.tsx
components/Sidebar.tsx
lib/supabase-queries.ts
lib/types.ts
```

### Git diff --stat

```
 .env.local.example           |   6 +++
 app/(app)/leads/page.tsx     |  89 ++++++++++++++++++++++++++++++++++
 app/(app)/page.tsx           | 111 +++++++++++++++++++++++++++++++++++++++++++
 app/(app)/pipeline/page.tsx  |  14 ++++--
 app/(app)/ranking/page.tsx   |   2 +-
 app/api/leads/route.ts       |  48 +++++++++++++------
 components/NovoLeadModal.tsx | 107 ++++++++++++++++++++++-------------------
 components/Sidebar.tsx       |   7 +--
 lib/supabase-queries.ts      |  86 ++++++++++++++++++++++++++++++++-
 lib/types.ts                 |   2 +-
 10 files changed, 399 insertions(+), 73 deletions(-)
```

Novos arquivos não rastreados (untracked):
- `app/setup-cliente/` — página de setup de cliente
- `supabase/migrations/007_captador_role.sql` — migration pendente
- `docs/auditorias/auditoria-completa-codex-2026-06-26.md`
- `docs/respostas/captador-e-setup-cliente.md` (este arquivo)

---

## Próximos passos

1. **Aplicar migration 007** no Supabase SQL Editor (Passo 1 e Passo 2 separados).
2. **Criar usuário captador de teste** no Authentication + inserir em `usuarios`.
3. **Testar fluxo completo**: login como captador → cadastrar lead → confirmar que `captador_id` é salvo e `corretor_id` não é escolhido manualmente.
4. **Configurar `INTERNAL_OWNER_EMAILS`** na Vercel antes de usar `/setup-cliente` em produção.
5. **Commitar** quando aprovado pelo usuário.
