# Fase 7 — Auditoria de Implementação
**Data:** 2026-06-19  
**Status:** Concluída  
**Escopo:** Revisão pós-implementação da captura e distribuição de leads

---

## Build e Lint

| Check | Resultado |
|-------|----------|
| `npm run build` | ✓ Compilado sem erros, sem warnings |
| `npm run lint` | ✓ Sem erros ESLint |

---

## Arquivos alterados

O `git diff --stat` mostra 5 arquivos, mas 4 são da Fase 6.1 — já estavam modificados antes desta sessão.

| Arquivo | Origem | O que mudou |
|---------|--------|------------|
| `app/(app)/leads/page.tsx` | **Fase 7** | Import `NovoLeadModal` + substituição do `<button>` estático |
| `app/api/leads/route.ts` | **Fase 7 — novo** | API Route `POST /api/leads` |
| `components/NovoLeadModal.tsx` | **Fase 7 — novo** | Client Component modal + formulário |
| `supabase/migrations/003_rpc_criar_lead.sql` | **Fase 7 — novo** | Stored procedure `criar_e_distribuir_lead()` |
| `lib/supabase.ts` | Fase 6.1 | Adicionou export `isMockMode` |
| `lib/supabase-queries.ts` | Fase 6.1 | `!hasSupabaseEnv` → `isMockMode` |
| `app/login/page.tsx` | Fase 6.1 | `hasSupabaseEnv` → `isMockMode` |
| `middleware.ts` | Fase 6.1 | 503 em produção sem env vars |

---

## RPC `criar_e_distribuir_lead`

| Requisito | Status | Observação |
|-----------|--------|-----------|
| Deduplicação por telefone | ✓ | `WHERE telefone_normalizado = v_tel_norm AND imobiliaria_id = v_imob_id AND created_at > NOW() - INTERVAL '24 hours'` — retorna `status: 'duplicata'` antes de qualquer INSERT |
| Transacional | ✓ | PL/pgSQL com transação implícita. Qualquer `RAISE EXCEPTION` reverte todos os writes automaticamente |
| Advisory lock contra concorrência | ✓ | `pg_advisory_xact_lock(hashtext(v_tel_norm || v_imob_id::TEXT))` serializa requests com mesmo telefone; `FOR UPDATE SKIP LOCKED` no SELECT do corretor evita atribuição dupla |
| Distribui apenas para `ativo=true AND em_plantao=true` | ✓ | Filtros explícitos no SELECT do corretor |
| Não quebra sem corretor disponível | ✓ | Passo 7b: grava `distribuicao_falhou`, lead fica com `corretor_id=NULL`, retorna `{distribuido: false, motivo: 'sem_corretor_em_plantao'}` |
| Payload de retorno claro | ✓ | `{status, distribuido, motivo, lead: {id, nome, equipe_id, corretor_id, corretor_nome, distribuido_em}}` |
| Histórico obrigatório | ✓ | `lead_criado` sempre; `lead_distribuido` ou `distribuicao_falhou` conforme resultado |

**Riscos:**

| Severidade | Item | Detalhe |
|-----------|------|---------|
| BAIXO | `hashtext` retorna int4 | Cast implícito para int8 funciona. Hash 32-bit tem colisão ~1:4B — irrelevante para volume de MVP |
| BAIXO | `v_origem::lead_origem` sem catch no SQL | Valor inválido lança erro de enum. A API route valida origem antes — este caminho é inacessível pelo fluxo normal |
| BAIXO | `equipe_id` não validada contra `imobiliaria_id` | O RPC não verifica que a equipe pertence à imobiliária. Seguro para o formulário (UI fornece apenas equipes do usuário). Para webhook futuro, adicionar validação |

---

## API `POST /api/leads`

| Requisito | Status | Detalhe |
|-----------|--------|---------|
| Valida payload | ✓ | `nome` → 400; `telefone` → 400; `origem` fora do enum → 400; telefone < 10 dígitos → 400 |
| Normaliza telefone | ✓ | `tel.replace(/\D/g, "")` |
| Exige sessão | ✓ | `auth.getUser()` → 401 se sem sessão; query em `usuarios` → 403 se sem imobiliária |
| Chama RPC via admin client | ✓ | `createSupabaseAdmin().rpc(...)` — service_role, bypassa RLS |
| Status corretos | ✓ | 201, 400, 401, 403, 409, 500, 503 |

**Riscos:**

| Severidade | Item | Detalhe |
|-----------|------|---------|
| BAIXO | Detecção de erro por string | `rpcError.message.includes("sem_equipe_disponivel")` — funciona mas é frágil se Supabase envolver a mensagem. Aceitável para MVP |
| BAIXO | `equipe_id` sem validação de formato UUID | UUID inválido via webhook futuro causaria 500 em vez de 400 |

---

## Modal `NovoLeadModal`

| Requisito | Status | Detalhe |
|-----------|--------|---------|
| Sem regra de negócio no client | ✓ | Apenas coleta campos e chama API |
| Loading | ✓ | Botões `disabled`, texto "Cadastrando…" |
| Erro de duplicata | ✓ | 409 → "Telefone já cadastrado" + nome do lead existente; modal permanece aberto |
| Erro genérico | ✓ | `sem_equipe_disponivel` → mensagem específica; outros → mensagem genérica |
| Erro de rede | ✓ | `catch` captura falha de fetch |
| Sucesso | ✓ | `fechar()` reseta form + `router.refresh()` recarrega dados do servidor |

---

## `app/(app)/leads/page.tsx`

Dois changes cirúrgicos — sem risco de regressão:
- Import de `NovoLeadModal`
- `<button>` estático substituído por `<NovoLeadModal equipes={equipes} />`

`equipes: Equipe[]` é serializável — padrão correto de Server → Client Component. ✓

---

## Resumo executivo

| Categoria | Resultado |
|-----------|----------|
| Build | ✓ Limpo |
| Lint | ✓ Sem erros |
| Erros de código | Nenhum |
| Correções necessárias antes de aplicar no banco | **Nenhuma** |
| Riscos bloqueantes | **Nenhum** |
| Riscos não-bloqueantes | 3 de severidade BAIXA |

---

## Pré-requisito operacional antes de testar

Não é correção de código — é dado operacional pendente da migration 002:

```sql
-- Ativar corretores para plantão (migration 002 define em_plantao=false por padrão)
UPDATE corretores SET em_plantao = true WHERE ativo = true;
```

Sem isso, todos os leads cairão em `distribuicao_falhou` porque nenhum corretor tem `em_plantao=true`.

---

## Ordem de ação para ir a produção

```
1. Aplicar supabase/migrations/003_rpc_criar_lead.sql no SQL Editor do Supabase
2. UPDATE corretores SET em_plantao = true WHERE ativo = true
3. Deploy (ou testar localmente com .env.local configurado)
4. Testar: cadastrar lead pelo formulário → verificar aparece na fila/pipeline
5. Testar: cadastrar mesmo telefone novamente → deve retornar 409 no modal
```
