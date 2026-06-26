# Auditoria: Escopo operacional por papel (role) e equipe

**Data:** 2026-06-25  
**Solicitante:** Gilberto  
**Status:** ⛔ IMPLEMENTAÇÃO BLOQUEADA — campo faltando no schema

---

## Objetivo

Implementar escopo por equipe para o papel `gestor`:

- Gestor vê apenas leads/corretores da **própria** equipe.
- API rejeita `equipe_id` ou `corretor_id` fora da equipe do gestor.
- Admin mantém acesso irrestrito.
- Corretor continua sem permissão de cadastrar lead.

---

## Resultado da auditoria de schema

### Campos auditados

| Campo | Tabela | Existe? | Tipo | Seguro para escopo? |
|-------|--------|---------|------|---------------------|
| `usuarios.equipe_id` | `usuarios` | ❌ NÃO | — | — |
| `usuarios.equipe_ids` | `usuarios` | ❌ NÃO | — | — |
| `equipes.gerente_usuario_id` | `equipes` | ❌ NÃO | — | — |
| `equipes.gestor_id` | `equipes` | ❌ NÃO | — | — |
| `equipes.gerente_id` | `equipes` | ❌ NÃO | — | — |
| `equipes.gerente` | `equipes` | ✅ SIM | `TEXT` | ❌ Não (é nome, não UUID) |
| `corretores.usuario_id` | `corretores` | ✅ SIM | `UUID → usuarios.id` | ✅ Para corretor |
| `corretores.equipe_id` | `corretores` | ✅ SIM | `UUID → equipes.id` | ✅ Para corretor |
| `usuarios.role` | `usuarios` | ✅ SIM | `usuario_role ENUM` | ✅ Para distinguir papéis |

### Estrutura atual de `usuarios` (migration 002)

```sql
CREATE TABLE IF NOT EXISTS usuarios (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id   UUID         NOT NULL UNIQUE REFERENCES auth.users(id),
  imobiliaria_id UUID         NOT NULL REFERENCES imobiliarias(id),
  nome           TEXT         NOT NULL,
  email          TEXT         NOT NULL,
  role           usuario_role NOT NULL DEFAULT 'corretor',
  ativo          BOOLEAN      NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
```

Não existe nenhum campo que vincule um `gestor` a uma `equipe` específica.

### Estrutura atual de `equipes` (schema.sql + migration 002)

```sql
CREATE TABLE equipes (
  id                       uuid  PRIMARY KEY,
  imobiliaria_id           uuid  NOT NULL REFERENCES imobiliarias(id),
  nome                     text  NOT NULL,
  gerente                  text  NOT NULL,   -- ← nome do gerente como STRING
  ativo                    boolean NOT NULL DEFAULT true,
  ultimo_lead_recebido_em  timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now()
);
```

O campo `equipes.gerente` é um **texto livre** (nome legível para humanos). Não é uma FK para `usuarios.id`. Não pode ser usado como vínculo programático seguro.

---

## Por que o escopo NÃO pode ser implementado agora

Para implementar o escopo do gestor na API (`route.ts`) seria necessário:

```typescript
// O que o código precisaria fazer:
const { data: usuario } = await sb
  .from("usuarios")
  .select("id, imobiliaria_id, role, equipe_id")  // ← equipe_id NÃO EXISTE
  .eq("auth_user_id", user.id)
  .single();

if (usuario.role === "gestor") {
  if (equipe_id !== usuario.equipe_id) {
    return 403; // gestor tentando usar outra equipe
  }
}
```

Sem `usuarios.equipe_id` (ou equivalente), qualquer verificação no servidor teria que:

1. **Tentar cruzar por `equipes.gerente` (nome)** — inseguro: dois gestores com o mesmo nome, ou nome alterado no cadastro da equipe, quebram a lógica silenciosamente.
2. **Confiar apenas no front-end** — não é validação de servidor; qualquer requisição direta à API burla o controle.
3. **Não validar nada** — não implementa o escopo solicitado.

Nenhuma dessas alternativas é aceitável para a operação da BASILIO IMÓVEIS.

---

## Migration mínima recomendada

Adicionar `equipe_id` à tabela `usuarios`:

```sql
-- Migration 006 — Vínculo gestor ↔ equipe
-- NÃO APLICAR sem aprovação explícita.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS equipe_id UUID
    REFERENCES equipes(id)
    ON DELETE SET NULL;

COMMENT ON COLUMN usuarios.equipe_id IS
  'Para role=gestor: equipe que este usuário gerencia. NULL para admin (acesso irrestrito). NULL para corretor (usa corretores.equipe_id via usuario_id).';

-- Índice para lookup na API e RLS
CREATE INDEX IF NOT EXISTS idx_usuarios_equipe
  ON usuarios (equipe_id)
  WHERE equipe_id IS NOT NULL;
```

**Regra de preenchimento após a migration:**

| Role | `equipe_id` |
|------|-------------|
| `admin` | `NULL` (acesso a todas as equipes) |
| `gestor` | UUID da equipe que gerencia |
| `corretor` | `NULL` (equipe resolvida via `corretores.equipe_id → usuario_id`) |

**Ação manual obrigatória após aplicar:**
```sql
-- Preencher equipe_id de cada gestor
UPDATE usuarios
SET equipe_id = '<uuid-da-equipe>'
WHERE auth_user_id = '<uuid-do-auth-user>'
  AND role = 'gestor';
```

---

## O que já funciona hoje (sem a migration)

| Regra | Status |
|-------|--------|
| Corretor não vê botão "Cadastrar lead" | ✅ Implementado (`leads/page.tsx:27`) |
| API retorna 403 para `role = corretor` | ✅ Implementado (`route.ts:73`) |
| Lead sem captador cai em rodízio automático | ✅ Implementado (RPC `criar_e_distribuir_lead`) |
| Lead com captador vai ao corretor captador | ✅ Implementado (RPC, Cenário A) |
| RPC valida que `corretor_id` pertence à `equipe_id` | ✅ Implementado (RPC, Passo 6) |
| E-mail ao corretor quando lead é atribuído | ✅ Implementado (`route.ts:180`) |
| Falha de e-mail não quebra o cadastro | ✅ Implementado (`route.ts:177`) |

---

## O que NÃO funciona e precisa da migration para funcionar

| Regra | Bloqueio |
|-------|---------|
| API rejeita `equipe_id` fora da equipe do gestor | ❌ Sem `usuarios.equipe_id` |
| API rejeita `corretor_id` fora da equipe do gestor | ❌ Sem `usuarios.equipe_id` |
| Modal mostra apenas equipe do gestor | ❌ Sem `usuarios.equipe_id` |
| Modal filtra corretores da equipe do gestor | ❌ Sem `usuarios.equipe_id` |
| `fetchUsuarioAtual()` retorna `equipeId` do gestor | ❌ Sem `usuarios.equipe_id` |
| Página de leads filtra por equipe do gestor | ❌ Sem `usuarios.equipe_id` |

---

## Arquivos a alterar depois da migration (quando autorizado)

### 1. `lib/supabase-queries.ts`

Atualizar `fetchUsuarioAtual()` para incluir `equipe_id`:

```typescript
export interface UsuarioAtual {
  id: string;
  imobiliariaId: string;
  role: "admin" | "gestor" | "corretor";
  nome: string;
  equipeId: string | null;  // ← adicionar
}

// No SELECT:
.select("id, imobiliaria_id, role, nome, equipe_id")

// No return:
equipeId: data.equipe_id ? String(data.equipe_id) : null,
```

---

### 2. `app/api/leads/route.ts`

Adicionar validação de escopo após buscar o usuário:

```typescript
// Buscar perfil incluindo equipe_id
const { data: usuario } = await sbServer
  .from("usuarios")
  .select("imobiliaria_id, role, equipe_id")
  .eq("auth_user_id", user.id)
  .eq("ativo", true)
  .single();

// Para gestor: forçar equipe_id da própria equipe
let equipeIdEfetivo = equipe_id;
if (usuario.role === "gestor") {
  if (!usuario.equipe_id) {
    return NextResponse.json({ erro: "gestor_sem_equipe" }, { status: 403 });
  }
  // Ignora/rejeita qualquer equipe_id enviado pelo front-end
  equipeIdEfetivo = usuario.equipe_id;
}

// Para gestor: validar que corretor_id pertence à equipe do gestor
if (usuario.role === "gestor" && corretor_id) {
  const { data: corr } = await admin
    .from("corretores")
    .select("equipe_id, ativo")
    .eq("id", corretor_id)
    .eq("imobiliaria_id", usuario.imobiliaria_id)
    .single();

  if (!corr || corr.equipe_id !== usuario.equipe_id || !corr.ativo) {
    return NextResponse.json({ erro: "corretor_invalido" }, { status: 403 });
  }
}
```

---

### 3. `app/(app)/leads/page.tsx`

Filtrar equipes e corretores antes de passar para o modal:

```typescript
const usuario = await fetchUsuarioAtual();

// Escopar equipes e corretores pelo role
const equipesVisiveis = usuario?.role === "gestor" && usuario.equipeId
  ? equipes.filter((e) => e.id === usuario.equipeId)
  : equipes;

const corretoresVisiveis = usuario?.role === "gestor" && usuario.equipeId
  ? dados.corretores.filter((c) => c.equipeId === usuario.equipeId)
  : dados.corretores;

// Passar para o modal:
<NovoLeadModal equipes={equipesVisiveis} corretores={corretoresVisiveis} />
```

---

### 4. `components/NovoLeadModal.tsx`

Quando há apenas uma equipe (gestor), travar o seletor:

```tsx
// Mostrar seletor apenas se houver mais de uma equipe disponível
{equipes.length > 1 ? (
  <select value={form.equipe_id} onChange={campo("equipe_id")} ...>
    {equipes.map(eq => <option key={eq.id} value={eq.id}>{eq.nome}</option>)}
  </select>
) : (
  <input readOnly value={equipes[0]?.nome ?? "—"} className={inputCls} />
)}
```

---

### 5. `lib/types.ts`

Atualizar `UsuarioAtual` (já em `supabase-queries.ts`, não em `types.ts` — mas considerar mover):

```typescript
// Nenhuma alteração necessária em types.ts
// UsuarioAtual está definido em supabase-queries.ts
```

---

## Riscos conhecidos

1. **Gestor sem `equipe_id` preenchido após a migration**: a API bloquearia o gestor com 403. Ação manual no banco é obrigatória após aplicar.
2. **Gestor gerenciando mais de uma equipe**: o modelo atual (um `equipe_id` por usuário) não suporta. Para multi-equipe, usar `equipe_ids UUID[]` — fora do escopo MVP.
3. **`equipes.gerente` (TEXT) fica obsoleto**: após a migration, o campo gerente como texto passa a ser apenas exibição. A relação real passa a ser `usuarios.equipe_id`. Não conflita, mas pode causar confusão se não documentado.

---

## Checklist de teste manual (após migration)

- [ ] Admin cria lead para Equipe Atlântico → sucesso
- [ ] Admin cria lead para Equipe Horizonte → sucesso
- [ ] Admin seleciona corretor de qualquer equipe → sucesso
- [ ] Gestor da Equipe Atlântico cria lead → equipe forçada para Atlântico mesmo sem informar
- [ ] Gestor da Equipe Atlântico tenta enviar `equipe_id` da Horizonte → 403
- [ ] Gestor da Equipe Atlântico tenta selecionar corretor da Horizonte → 403
- [ ] Gestor vê no modal apenas a própria equipe (seletor travado)
- [ ] Gestor vê no modal apenas corretores da própria equipe
- [ ] Corretor não vê botão "Cadastrar lead" → sem alteração necessária (já funciona)
- [ ] Corretor tenta POST `/api/leads` → 403 → sem alteração necessária (já funciona)
- [ ] Lead sem captador → rodízio automático na equipe correta → sem alteração necessária
- [ ] Lead com captador → corretor correto recebe → sem alteração necessária
- [ ] E-mail ao corretor → enviado quando atribuído → sem alteração necessária

---

## Próximos passos recomendados

1. **Autorizar a Migration 006** (`usuarios.equipe_id`) — sem isso, nenhuma das regras de escopo do gestor pode ser implementada com segurança.
2. **Após authorização**, aplicar a migration e preencher `equipe_id` de cada gestor manualmente no Supabase Dashboard.
3. **Após preenchimento**, implementar as alterações nos 4 arquivos descritos acima.
4. **Rodar `npm run build`** e corrigir erros TypeScript.
5. **Testar conforme checklist** acima.
