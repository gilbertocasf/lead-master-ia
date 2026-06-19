# Criação do Primeiro Administrador
**Data:** 2026-06-19  
**Fase:** 6.1 — Auth SSR  
**Atualizado:** 2026-06-19 — corrigido para refletir o banco real (migration 002, não schema.v2)

---

## Pré-requisitos

- Migration `supabase/migrations/002_security_rls_multitenancy.sql` aplicada no banco
  - Cria: `imobiliarias`, `usuarios`, RLS em todas as tabelas, funções helper
  - **Não dropa, não renomeia colunas existentes**
- Variáveis de ambiente configuradas no Vercel e no `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (sem prefixo `NEXT_PUBLIC_` — nunca expor no client)

---

## Passo a passo

### 1. Verificar (e renomear) a imobiliária existente

A migration 002 **já cria automaticamente** uma imobiliária padrão se não existir nenhuma:

```sql
-- Verificar se existe:
SELECT id, nome FROM imobiliarias ORDER BY created_at ASC;
```

**Resultado esperado:** uma linha com nome `Imobiliária Padrão — Renomear após setup`.

Se existir, renomear com o nome real:

```sql
UPDATE imobiliarias
SET nome = 'Nome Real da Imobiliária'
WHERE nome LIKE 'Imobiliária Padrão%';
```

Se **não existir nenhuma** (migration 002 não foi aplicada, ou banco está em estado diferente):

```sql
INSERT INTO imobiliarias (nome)
VALUES ('Nome da Imobiliária')
RETURNING id;
```

**Anote o UUID da imobiliária** — usado nos passos seguintes.

---

### 2. Criar o usuário no Supabase Auth

No painel do Supabase → **Authentication → Users → Invite user** (ou **Add user**):

- E-mail: `admin@suaimobiliaria.com`
- Senha: escolha uma senha forte

> Se usar "Invite user", o usuário recebe um e-mail de convite e define a senha ao aceitar. Se usar "Add user" diretamente, a senha é definida agora.

Anote o `id` do usuário criado — UUID visível na lista de usuários em Authentication.

---

### 3. Inserir o perfil na tabela `usuarios`

A tabela `usuarios` criada pela migration 002 tem as colunas:
`id, auth_user_id, imobiliaria_id, nome, email, role, ativo, created_at`

A coluna `ativo` tem `DEFAULT true`. As funções RLS filtram por `ativo = true` — um usuário com `ativo = false` consegue fazer login mas não acessa dado nenhum.

Execute no **SQL Editor** do Supabase:

```sql
INSERT INTO usuarios (auth_user_id, imobiliaria_id, nome, email, role)
VALUES (
  '<uuid-do-auth.users>',           -- UUID obtido no passo 2 (Authentication → Users)
  (SELECT id FROM imobiliarias ORDER BY created_at ASC LIMIT 1),
  'Nome do Administrador',
  'admin@suaimobiliaria.com',
  'admin'
);
```

> `ativo` não é informado porque o padrão (`DEFAULT true`) é o correto. Não altere para `false` — isso bloqueia todas as queries RLS do usuário.

---

### 4. Colocar corretores em plantão

Após a migration 002, todos os corretores existentes têm `em_plantao = false` (default).
Para que a distribuição automática funcione, é necessário marcar quais estão de plantão:

```sql
-- Opção A: todos os ativos entram em plantão
UPDATE corretores SET em_plantao = true WHERE ativo = true;

-- Opção B: apenas um corretor específico
UPDATE corretores SET em_plantao = true WHERE nome = 'Nome do Corretor';
```

---

### 5. Testar o login

1. Acesse `/login` no app
2. Insira o e-mail e senha criados no passo 2
3. Confirme que o dashboard carrega com dados reais do banco
4. Em uma janela anônima (sem login), confirme que é redirecionado para `/login`

---

### 6. Verificação de RLS

Após o login, as políticas RLS devem permitir leitura dos dados da imobiliária.

Se as queries retornarem arrays vazios (sem erro de console), verifique:

```sql
-- Verificar se o usuário tem perfil na tabela usuarios
SELECT * FROM usuarios WHERE email = 'admin@suaimobiliaria.com';

-- Verificar se auth_user_id corresponde ao usuário no Auth
-- (comparar com o UUID em Authentication → Users)

-- Verificar se imobiliaria_id bate com a imobiliária dos dados
SELECT u.email, u.role, u.ativo, i.nome AS imobiliaria
FROM usuarios u
JOIN imobiliarias i ON i.id = u.imobiliaria_id
WHERE u.email = 'admin@suaimobiliaria.com';
```

Se as funções helper retornarem NULL, o problema está em um dos três campos:
- `auth_user_id` diferente do `auth.users.id`
- `imobiliaria_id` não corresponde à imobiliária dos dados
- `ativo = false` (bloqueio silencioso)

As políticas RLS estão documentadas na migration `supabase/migrations/002_security_rls_multitenancy.sql` Seção L.

---

## Riscos e observações

| Item | Observação |
|------|------------|
| `ativo = false` em `usuarios` | Usuário consegue fazer login mas não vê dado nenhum. As funções RLS filtram por `ativo = true`. Garantir `ativo = true` ao criar o admin. |
| Imobiliária duplicada | Se executar o INSERT de imobiliária do Passo 1 sem verificar antes, podem existir duas imobiliárias. Os dados (equipes, corretores, leads) foram associados à primeira. Usar `ORDER BY created_at ASC LIMIT 1` na subquery do Passo 3 garante o UUID correto. |
| Corretores sem `em_plantao = true` | Distribuição automática não funciona. Executar o UPDATE do Passo 4 antes de testar a distribuição. |
| `schema.v2.sql` não deve ser aplicado | O arquivo `supabase/schema.v2.sql` começa com `DROP TABLE ... CASCADE`. Se executado sobre o banco com dados, apaga tudo. O banco atual usa a migration 002 (incremental), não o schema.v2. |
| `valor_vgv` em `vendas` | A coluna continua sendo `valor_vgv` no banco atual. A migration 002 não renomeia colunas. `fetchVendas()` em `lib/supabase-queries.ts` seleciona `valor_vgv` — correto. |
