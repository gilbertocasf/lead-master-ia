# Fase 7 — Plano de Implementação: Captura e Distribuição
**Data:** 2026-06-19  
**Status:** Aguardando aprovação  
**Referência:** docs/auditorias/fase-7-auditoria-escrita.md

---

## 1. API Route ou RPC SQL?

**Ambos — em camadas separadas.**

O Supabase JS client (`@supabase/supabase-js`) não suporta `BEGIN/COMMIT` explícito. Transação real só existe dentro de uma função PostgreSQL. Por isso:

- **`app/api/leads/route.ts`** — camada HTTP: recebe o payload, valida, normaliza o telefone, chama o RPC, formata a resposta.
- **`supabase/migrations/003_rpc_criar_lead.sql`** — function PostgreSQL `criar_e_distribuir_lead()`: executa todos os passos de DB em uma única transação implícita.

A API route chama `createSupabaseAdmin().rpc('criar_e_distribuir_lead', payload)`. Todo o risco de atomicidade e concorrência fica no banco, onde pertence.

---

## 2. Como garantir atomicidade?

A function PostgreSQL roda em uma transação implícita. Se qualquer passo falhar (dedup, INSERT, UPDATE), tudo é revertido automaticamente. O chamador (API route) recebe erro e retorna HTTP 409 ou 500. Nenhuma gravação parcial chega ao banco.

Estrutura interna da função:

```
criar_e_distribuir_lead(payload JSONB) RETURNS JSONB
  -- Passo 1: advisory lock por telefone (bloqueia concurrent request com mesmo número)
  -- Passo 2: dedup check (SELECT leads WHERE telefone_normalizado AND 24h)
  -- Passo 3: resolver equipe_id (payload ou rodízio)
  -- Passo 4: INSERT leads
  -- Passo 5: INSERT historico_leads (lead_criado)
  -- Passo 6: SELECT corretor (FOR UPDATE SKIP LOCKED)
  -- Passo 7a: corretor encontrado → UPDATE leads, corretores, equipes + historico (lead_distribuido)
  -- Passo 7b: sem corretor → historico (distribuicao_falhou)
  -- Passo 8: RETURN lead criado como JSON
```

---

## 3. Como reduzir race condition no round-robin?

Dois mecanismos combinados:

**a) Deduplicação — advisory lock por telefone:**
No início da function, `pg_advisory_xact_lock(hashtext($telefone_normalizado))`. Duas requisições com o mesmo telefone ficam serializadas em fila no banco — a segunda espera a primeira terminar antes de checar a dedup. Elimina a race condition de duplicata.

**b) Seleção do corretor — `FOR UPDATE SKIP LOCKED`:**
```sql
SELECT id FROM corretores
WHERE equipe_id = $equipe_id AND em_plantao = true AND ativo = true
ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC, ordem_plantao ASC
LIMIT 1
FOR UPDATE SKIP LOCKED;
```
Se dois leads chegarem simultaneamente para a mesma equipe, cada um pega o próximo corretor disponível na fila sem conflito. O `SKIP LOCKED` garante que o segundo lead pule o corretor que o primeiro já está atualizando.

---

## 4. Quais arquivos serão criados?

| Arquivo | Tipo | Propósito |
|---------|------|----------|
| `app/api/leads/route.ts` | API Route (Next.js) | Receber POST, validar, chamar RPC, responder |
| `supabase/migrations/003_rpc_criar_lead.sql` | Migration SQL | Stored procedure `criar_e_distribuir_lead()` |
| `components/NovoLeadModal.tsx` | Client Component | Formulário modal de cadastro manual |

---

## 5. Quais arquivos serão alterados?

| Arquivo | O que muda |
|---------|-----------|
| `app/(app)/leads/page.tsx` | Adicionar o botão "Novo Lead" que abre o modal (hoje o botão existe visualmente mas não faz nada) |

Nenhum outro arquivo existente precisa ser alterado na primeira iteração. `lib/supabase-admin.ts` já está pronto. `lib/supabase-queries.ts` não muda — é camada de leitura.

---

## 6. Alguma migration adicional é necessária?

**Uma migration de schema: não.** Todas as colunas necessárias já existem pós-migration 002:
- `leads.telefone_normalizado` ✓
- `leads.distribuido_em` ✓
- `corretores.em_plantao` ✓
- `corretores.ultimo_lead_recebido_em` ✓
- `equipes.ultimo_lead_recebido_em` ✓
- `historico_leads` ✓

**Uma migration de função: sim.** A `migration 003` cria a stored procedure `criar_e_distribuir_lead()`. Não altera nenhuma tabela.

**Uma ação manual no banco antes de testar:** `UPDATE corretores SET em_plantao = true WHERE ativo = true`. Sem isso, o algoritmo não encontra nenhum corretor e todos os leads ficam na fila. Isso não é migration — é dado operacional.

---

## Ordem de execução quando aprovado

```
1. Aplicar migration 003 no Supabase (stored procedure)
2. Executar UPDATE corretores SET em_plantao = true WHERE ativo = true
3. Criar app/api/leads/route.ts
4. Criar components/NovoLeadModal.tsx
5. Alterar app/(app)/leads/page.tsx (botão → modal)
6. npm run build — confirmar sem erros
7. Testar: POST manual via curl → lead aparece na fila
8. Testar: formulário UI → lead aparece na fila com corretor atribuído
```
