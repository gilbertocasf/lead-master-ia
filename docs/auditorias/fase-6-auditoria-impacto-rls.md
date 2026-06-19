# Fase 6 — Auditoria de Impacto: RLS + Auth
**Data:** 2026-06-19  
**Status:** Pré-implementação — relatório de impacto  
**Próximo passo:** aguardando aprovação do plano de execução

---

## 1. Contexto

A migration `002_security_rls_multitenancy.sql` habilitou RLS em 7 tabelas e criou políticas que exigem sessão autenticada (`TO authenticated`) para qualquer leitura ou escrita. O código da aplicação ainda não tem autenticação. Esta auditoria mapeia o que quebra e o que precisa ser adaptado.

---

## 2. Estado atual do `lib/supabase.ts`

```ts
auth: { persistSession: false }  // sessions não são persistidas
```

Consequência direta: mesmo que o usuário "faça login", a sessão não é transmitida nas queries do servidor. O Supabase trata requests sem sessão como role `anon`. As policies de SELECT exigem `authenticated` — nenhuma policy existe para `anon`. **Resultado: todas as queries em modo Supabase retornam arrays vazios ou erros.**

---

## 3. Impacto por query

| Função | Tabela | Policy necessária | Resultado com RLS ativo e sem auth |
|--------|--------|------------------|-------------------------------------|
| `fetchEquipes()` | `equipes` | `equipes_select` (authenticated) | Array vazio — fallback para mock |
| `fetchCorretores()` | `corretores` | `corretores_select_admin_gestor` ou `corretores_select_corretor` (authenticated) | Array vazio — fallback para mock |
| `fetchPistas()` | `leads` | `leads_select_admin_gestor` ou `leads_select_corretor` (authenticated) | Array vazio — fallback para mock |
| `fetchVendas()` | `vendas` | `vendas_select_admin_gestor` ou `vendas_select_corretor` (authenticated) | Array vazio — fallback para mock |

**Importante:** a presença do fallback para mock mascara o problema. Em modo Supabase, quando a query falha por RLS, o sistema silenciosamente retorna dados fictícios. Isso é funcionalmente incorreto e não pode ser aceito em produção.

---

## 4. Impacto por página

| Rota | Função chamada | Resultado sem auth (modo Supabase) |
|------|---------------|------------------------------------|
| `/` (dashboard) | `fetchTudo()` | KPIs zerados, fila vazia, dados mock |
| `/leads` | `fetchTudo()` | Lista vazia ou dados mock |
| `/pipeline` | `fetchTudo()` | Funil vazio ou dados mock |
| `/corretores` | `fetchTudo()` | Lista vazia ou dados mock |
| `/equipes` | `fetchTudo()` | Lista vazia ou dados mock |
| `/ranking` | `fetchTudo()` | Ranking vazio ou dados mock |

**Proteção de rotas:** não existe `middleware.ts`. Qualquer URL é acessível sem login.

---

## 5. Problemas em `lib/types.ts`

O tipo `UserRole` atual define:
```ts
export type UserRole = "admin" | "captador" | "gerente" | "corretor";
```

O schema do banco (`usuario_role` enum) define:
```ts
'admin' | 'gestor' | 'corretor'
```

Divergências:
- `captador` não existe no banco
- `gerente` não existe no banco (o banco usa `gestor`)
- `gestor` não existe no tipo TypeScript

---

## 6. Problemas em `lib/supabase-queries.ts`

| Problema | Localização | Detalhe |
|----------|-------------|---------|
| `auth: { persistSession: false }` | `lib/supabase.ts:14` | Sessions nunca persistem — queries sempre anon |
| `em_plantao` mapeado como `ativo` | `fetchCorretores():99` | `emPlantao: Boolean(row.ativo)` usa coluna errada |
| Colunas não selecionadas | `fetchCorretores():87` | `em_plantao`, `ultimo_lead_recebido_em`, `usuario_id` não são selecionadas |
| Fallback silencioso no erro | Todas as funções | Erro de RLS (dados ausentes) cai no mock sem aviso |

---

## 7. O que não existe e precisa ser criado

| Arquivo | Finalidade |
|---------|-----------|
| `middleware.ts` | Proteger rotas — redirecionar para `/login` se sem sessão |
| `lib/auth.ts` | Helpers: `getCurrentUser()`, `requireAuth()`, `requireRole()` |
| `lib/supabase-server.ts` | Client com service_role para API routes (servidor apenas) |
| `app/login/page.tsx` | Tela de login |
| `app/login/actions.ts` | Server actions: login, logout |

---

## 8. Dependência de pacote

A autenticação SSR com Supabase no Next.js 14 App Router requer o pacote `@supabase/ssr` para gerenciamento correto de cookies entre Server Components e Client Components. **Isso exige alteração em `package.json` — requer confirmação explícita do usuário.**

Sem `@supabase/ssr`, é possível implementar manualmente com `cookies()` do `next/headers`, mas com risco maior de bugs de sessão e mais código boilerplate.

---

## 9. Resumo dos riscos

| Risco | Severidade | Quando resolver |
|-------|-----------|-----------------|
| RLS ativo + sem auth = dados silenciosamente vazios/mock | CRÍTICO | Fase 6 |
| Qualquer URL acessível sem login | ALTO | Fase 6 (middleware) |
| `persistSession: false` impede qualquer auth SSR | CRÍTICO | Fase 6 |
| `UserRole` TypeScript diverge do schema SQL | MÉDIO | Fase 6 |
| `emPlantao` mapeado para coluna errada | MÉDIO | Fase 6 |
| Fallback silencioso mascara erros de RLS | MÉDIO | Fase 6 |

---

## 10. O que NÃO quebra

- **Mock mode:** não há impacto. Sem `NEXT_PUBLIC_SUPABASE_URL`, o app usa mock-data e ignora Supabase completamente.
- **Schema e migrations:** não precisam mudar.
- **UI e componentes:** estrutura visual não muda.
- **Políticas RLS:** estão corretas — o problema é a ausência de auth no lado da aplicação.
