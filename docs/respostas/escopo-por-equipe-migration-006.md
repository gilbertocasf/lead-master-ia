# Escopo por equipe — Migration 006 e implementação

**Data:** 2026-06-26  
**Sistema:** Lead Master IA · BASILIO IMÓVEIS

---

## O que foi feito

### Migration criada (não aplicada)

`supabase/migrations/006_usuarios_equipe_id.sql`

Adiciona a coluna `usuarios.equipe_id UUID REFERENCES equipes(id) ON DELETE SET NULL` e o índice `idx_usuarios_equipe`.

**Não foi aplicada automaticamente.** Precisa ser executada manualmente no Supabase Dashboard (ver instruções abaixo).

---

### Arquivos alterados

| Arquivo | O que mudou |
|---------|-------------|
| `supabase/migrations/006_usuarios_equipe_id.sql` | Criado — migration nova |
| `lib/supabase-queries.ts` | `UsuarioAtual` recebe `equipeId: string \| null`; `fetchUsuarioAtual()` seleciona `equipe_id` do banco |
| `app/(app)/leads/page.tsx` | Filtra equipes, leads e corretores por role; estado controlado para gestor sem equipe |
| `components/NovoLeadModal.tsx` | Campo equipe fica somente leitura quando há apenas uma equipe visível |
| `app/api/leads/route.ts` | Seleciona `equipe_id` do usuário; bloqueia gestor sem equipe; força `equipe_id` efetivo; valida corretor da equipe do gestor antes da RPC |

---

## Como aplicar a migration manualmente

1. Acesse o **Supabase Dashboard → SQL Editor**.
2. Abra o arquivo `supabase/migrations/006_usuarios_equipe_id.sql`.
3. Execute o conteúdo completo.
4. Verifique: `SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'equipe_id';`

---

## SQL de preenchimento manual após aplicar

Execute separadamente no SQL Editor para vincular cada gestor à sua equipe:

```sql
-- 1. Verificar equipes existentes
SELECT id, nome FROM equipes ORDER BY nome;

-- 2. Verificar usuários gestores
SELECT id, nome, role, auth_user_id, equipe_id FROM usuarios WHERE role = 'gestor';

-- 3. Vincular gestor à equipe (substituir UUIDs reais)
UPDATE usuarios
  SET equipe_id = '<uuid-da-equipe>'
  WHERE auth_user_id = '<uuid-auth-do-gestor>'
    AND role = 'gestor';

-- 4. Confirmar resultado
SELECT u.nome, u.role, u.equipe_id, e.nome AS equipe_nome
FROM usuarios u
LEFT JOIN equipes e ON e.id = u.equipe_id
ORDER BY u.role, u.nome;
```

---

## Regras implementadas

### Front-end (`leads/page.tsx`)

| Role | Equipes visíveis | Leads visíveis | Botão cadastrar |
|------|-----------------|----------------|-----------------|
| admin | Todas | Todos | Sim |
| gestor (com equipe) | Apenas a própria | Apenas da própria equipe | Sim |
| gestor (sem equipe) | — | — | Não (estado de erro) |
| corretor | Todas | Todos | Não |

> Em mock mode (`NEXT_PUBLIC_SUPABASE_URL` não configurado), não há filtro — comportamento de desenvolvimento.

### Modal (`NovoLeadModal.tsx`)

- Se `equipes.length === 1` (gestor com 1 equipe), o campo **Equipe** é exibido como texto somente leitura.
- Se `equipes.length > 1` (admin), mantém o seletor normal.
- O seletor de corretor sempre lista apenas corretores ativos da equipe selecionada no formulário.

### API (`app/api/leads/route.ts`)

- `role = corretor` → 403 `sem_permissao` (mantido).
- `role = gestor` sem `equipe_id` no banco → 403 `gestor_sem_equipe`.
- `role = gestor` com `equipe_id`: ignora o `equipe_id` do payload, força o do banco.
- `role = gestor` com `corretor_id`: valida que o corretor pertence à equipe do gestor antes de chamar a RPC.
- `role = admin`: comportamento anterior mantido sem alterações.

---

## Checklist de teste manual

Após aplicar a migration e preencher `equipe_id` dos gestores:

- [ ] Login com admin → página de leads exibe todas as equipes e todos os leads
- [ ] Login com admin → modal de lead exibe seletor de equipe com todas as equipes
- [ ] Login com gestor (equipe vinculada) → página exibe apenas a própria equipe
- [ ] Login com gestor (equipe vinculada) → modal exibe equipe como somente leitura
- [ ] Login com gestor (equipe vinculada) → seletor de corretor lista apenas corretores da equipe
- [ ] Login com gestor (sem equipe_id no banco) → página exibe estado de erro controlado, sem crash
- [ ] Login com corretor → botão "Cadastrar lead" não aparece na página
- [ ] POST `/api/leads` com token de gestor sem `equipe_id` → 403 `gestor_sem_equipe`
- [ ] POST `/api/leads` com token de gestor e `equipe_id` de outra equipe no payload → API ignora e usa equipe do banco
- [ ] POST `/api/leads` com token de gestor e `corretor_id` de outra equipe → 400 `corretor_invalido`
- [ ] POST `/api/leads` com token de admin → comportamento anterior mantido
- [ ] Cadastro de lead com captador → e-mail ao corretor enviado (se `corretores.email` preenchido)
- [ ] Falha de e-mail → lead é criado normalmente, retorno inclui `email_notificacao: "erro_envio"`

---

## Riscos conhecidos

- **Gestores já cadastrados**: `equipe_id` estará NULL após a migration até o preenchimento manual. Eles verão o estado de erro controlado até que o admin faça o vínculo via SQL.
- **Mock mode**: `fetchUsuarioAtual()` retorna `equipeId: null` para mock. O filtro de escopo é ignorado em mock mode via `isMockMode`, então todos os dados são exibidos normalmente em desenvolvimento.
- **Coluna ainda não existe no banco até a migration ser aplicada**: o campo `equipe_id` no SELECT de `fetchUsuarioAtual()` e no `route.ts` retornará `null`/`undefined` se a coluna não existir — o Supabase ignora colunas inexistentes sem erro, mas a coluna deve ser criada antes do deploy para funcionar corretamente.
