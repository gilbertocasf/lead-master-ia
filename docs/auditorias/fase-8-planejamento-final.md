# Fase 8 — Pipeline Funcional: Planejamento Final

**Data:** 2026-06-22  
**Status:** Aguardando aprovação para implementação

---

## Objetivo

Transformar o pipeline visual em pipeline funcional com escrita real no banco.

Escopo:
- Mover lead entre status via UI
- Atualizar `leads.status` no banco
- Registrar evento `status_alterado` em `historico_leads`
- Refletir mudança no dashboard e pipeline sem reload manual
- Respeitar RLS e autenticação por role

Fora do escopo desta fase:
- Criação de vendas ao fechar lead
- SLA avançado (cálculo de tempo, alertas automáticos)

---

## 1. Como o status do lead será alterado?

Um `<select>` em cada card do pipeline, dentro de um **Client Component** (`StatusDropdown`).

Fluxo:
1. Usuário seleciona novo status no dropdown
2. Componente chama `PATCH /api/leads/[id]/status` com `{ status_novo }`
3. API responde 200
4. Componente chama `router.refresh()` — Server Component re-executa `fetchTudo()` e a tela atualiza

---

## 2. API Route ou RPC SQL?

**Ambos, em camadas separadas de responsabilidade.**

| Camada | Responsabilidade |
|--------|-----------------|
| API Route (`PATCH /api/leads/[id]/status`) | Autenticação, verificação de role, validação do `status_novo` |
| RPC SQL (`alterar_status_lead`) | `UPDATE leads` + `INSERT historico_leads` em uma única transação |

O cliente Supabase JS não suporta transações explícitas (`BEGIN/COMMIT`). A RPC resolve isso — qualquer falha reverte ambas as operações.

---

## 3. Como registrar historico_leads a cada mudança?

A RPC executa dois passos na mesma transação implícita:

```sql
UPDATE leads
SET status = v_status_novo
WHERE id = v_lead_id AND imobiliaria_id = v_imob_id;

INSERT INTO historico_leads (
  lead_id, imobiliaria_id, tipo_evento, criado_por, usuario_id, dados
)
VALUES (
  v_lead_id, v_imob_id,
  'status_alterado', 'usuario', v_usuario_id,
  jsonb_build_object(
    'status_anterior', v_status_anterior,
    'status_novo',     v_status_novo
  )
);
```

O `tipo_evento = 'status_alterado'` já está no CHECK constraint da migration 002 — sem alteração de schema.

---

## 4. Como validar transição de status?

**Sem validação de sequência no MVP.**

Qualquer status → qualquer status é permitido. Gestor precisa de flexibilidade operacional (ex: reverter de `proposta` para `em_contato` se o cliente sumiu). Validações:

- `status_novo` deve ser um valor válido do enum `lead_status`
- `status_novo` não pode ser igual ao `status` atual (sem update desnecessário)

Decisão alinhada com `docs/DECISOES-ARQUITETURA.md` item 13: "não tem pipeline drag-and-drop no MVP — mover status via dropdown é suficiente para V1".

---

## 5. Como evitar que corretor altere lead de outro corretor?

A proteção fica na **API Route** (a escrita usa `service_role`, que bypassa RLS).

Lógica de autorização:

```
role = admin ou gestor
  → pode alterar qualquer lead da mesma imobiliaria_id

role = corretor
  → busca o registro de corretor vinculado ao auth_user_id
  → verifica que leads.corretor_id = corretor.id
  → se não bater → HTTP 403
```

O RLS de SELECT já impede o corretor de ver leads de outros — a API Route adiciona a proteção na escrita.

---

## 6. Quais arquivos serão criados?

| Arquivo | O que faz |
|---------|-----------|
| `supabase/migrations/004_rpc_alterar_status.sql` | Cria a função `alterar_status_lead(JSONB)` — UPDATE + INSERT histórico atômicos |
| `app/api/leads/[id]/status/route.ts` | PATCH endpoint — valida auth, role e chama a RPC |
| `components/pipeline/StatusDropdown.tsx` | Client Component — `<select>` com loading state e `router.refresh()` |

---

## 7. Quais arquivos serão alterados?

| Arquivo | O que muda |
|---------|-----------|
| `app/(app)/pipeline/page.tsx` | Inclui `<StatusDropdown>` em cada card no lugar do status estático |

Nenhuma alteração em `lib/supabase-queries.ts`, `lib/types.ts`, `schema.sql` ou qualquer outro arquivo.

---

## 8. Precisa de migration adicional?

**Sim — Migration 004.**

Cria apenas a função `alterar_status_lead(JSONB)`. Não altera nenhuma tabela, coluna ou índice. É um `CREATE OR REPLACE FUNCTION` — seguro para reaplicar.

Assinatura da função:

```sql
CREATE OR REPLACE FUNCTION alterar_status_lead(p JSONB)
RETURNS JSONB
-- p: { lead_id, status_novo, imobiliaria_id, usuario_id }
-- Retorna: { status: 'ok' | 'status_igual' | 'lead_nao_encontrado' }
```

---

## Ordem de implementação

1. Gerar e aplicar **Migration 004** no Supabase Dashboard
2. Criar **`app/api/leads/[id]/status/route.ts`**
3. Criar **`components/pipeline/StatusDropdown.tsx`**
4. Alterar **`app/(app)/pipeline/page.tsx`** para integrar o componente
5. Rodar `npm run build` e confirmar sem erros

## Critério de conclusão

- Clicar no select muda `leads.status` no banco
- `historico_leads` registra `status_alterado` com status anterior e novo
- A coluna do pipeline atualiza após a mudança
- Corretor não consegue alterar lead de outro corretor (HTTP 403)
- `npm run build` passa sem erros
