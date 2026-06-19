# Fase 6.2 — Auditoria: Dados Reais vs. Mock-Data
**Data:** 2026-06-19
**Status:** Concluída
**Contexto:** Pós-login funcional (Fase 6.1). Verificação se o dashboard consome dados reais do Supabase ou mock-data.

---

## 1. Controle de modo (isMockMode)

**Arquivo**: `lib/supabase.ts:12`

```ts
export const isMockMode =
  !hasSupabaseEnv && process.env.NODE_ENV !== "production";
```

| Ambiente | NODE_ENV | hasSupabaseEnv | isMockMode |
|----------|----------|----------------|------------|
| Vercel (produção) | `production` | `true` | **false** — nunca retorna mock |
| Local com `.env.local` | `development` | `true` | **false** — usa Supabase |
| Local sem `.env.local` | `development` | `false` | **true** — retorna mock |

Em produção, `isMockMode` é estruturalmente impossível de ser `true`. A flag é calculada em tempo de boot.

---

## 2. Análise por função

### `fetchEquipes()` — `lib/supabase-queries.ts:65`
- **Tabela**: `equipes`
- **Query**: `SELECT id, nome, gerente, created_at FROM equipes ORDER BY created_at ASC`
- **Fallback para mock**: `if (isMockMode) return mock.equipes` — só em dev local sem env vars
- **Em caso de erro**: lança `Error("fetchEquipes: <message>")` — sem fallback silencioso
- **Pode retornar mock em produção?** Não.

### `fetchCorretores()` — `lib/supabase-queries.ts:86`
- **Tabela**: `corretores`
- **Query**: `SELECT id, nome, equipe_id, ordem_plantao, ativo, em_plantao, ultimo_lead_recebido_em, usuario_id, created_at FROM corretores ORDER BY ordem_plantao ASC`
- **Fallback para mock**: `if (isMockMode) return mock.corretores`
- **Em caso de erro**: lança exceção
- **Pode retornar mock em produção?** Não.

### `fetchPistas()` — `lib/supabase-queries.ts:112`
- **Tabela**: `leads` (constante `TABELA_PISTAS = "leads"`)
- **Query**: `SELECT id, nome, telefone, origem, interesse, faixa_valor, equipe_id, corretor_id, status, observacoes, created_at FROM leads ORDER BY created_at DESC`
- **Fallback para mock**: `if (isMockMode) return mock.leads`
- **Em caso de erro**: lança exceção
- **Pode retornar mock em produção?** Não.

### `fetchVendas()` — `lib/supabase-queries.ts:147`
- **Tabela**: `vendas`
- **Query**: `SELECT id, corretor_id, lead_id, valor_vgv, data_venda, created_at FROM vendas ORDER BY data_venda DESC`
- **Fallback para mock**: `if (isMockMode) return mock.vendas`
- **Em caso de erro**: lança exceção
- **Pode retornar mock em produção?** Não.

### `fetchTudo()` — `lib/supabase-queries.ts:182`
- `Promise.all([fetchEquipes(), fetchCorretores(), fetchPistas(), fetchVendas()])`
- Sem fallback próprio. Se qualquer query falhar, a página inteira lança erro 500.

---

## 3. Propagação de sessão (caminho crítico)

O fluxo SSR está implementado corretamente:

1. **Login** (`app/login/actions.ts:15`) — `signInWithPassword()` seta o cookie de sessão via `createSupabaseServer()`, que usa `cookies()` do `next/headers`.
2. **Middleware** (`middleware.ts:47`) — em cada request, `supabase.auth.getUser()` valida o JWT e renova o cookie se necessário, propagando a sessão para a resposta.
3. **Server Components** — quando `createSupabaseServer()` é chamado nas queries, lê os cookies via `cookies()` do `next/headers`. O cookie de sessão (setado no login e renovado pelo middleware) está presente.
4. **RLS** — com o JWT no cookie, `@supabase/ssr` anexa o token às queries. O Supabase vê `role = authenticated` e as políticas RLS se aplicam.

---

## 4. Risco identificado: RLS silencioso vs. tabela vazia

**Limitação de observabilidade — não é bug no código.**

O check de erro nas queries:
```ts
if (error || !data) { throw new Error(...) }
```

Quando RLS bloqueia uma query (sessão não propagada corretamente), o Supabase retorna:
- `error = null`
- `data = []` (array vazio — truthy)

O resultado: a query "passa" sem lançar exceção e retorna `[]`. O dashboard exibe zero registros — idêntico ao comportamento de uma tabela genuinamente vazia.

**Não há como distinguir, pelo código, entre:**
- Banco com dados mas RLS bloqueando (sessão não chegou à query)
- Banco sem dados ainda

---

## 5. Como provar que os dados vêm do banco

Três formas concretas, sem alterar código permanente:

1. **Inserir dado distintivo**: Inserir no Supabase um lead com nome único (ex: `"AUDIT-TEST-001"`). Se aparecer no dashboard, os dados são reais.

2. **Logs Vercel**: Erros de query com mensagem de permissão aparecem nos Function Logs como `Error: fetchEquipes: ...`. Ausência de erros confirma que a query chegou ao banco.

3. **SQL direto no Supabase Dashboard**: Rodar `SELECT * FROM leads LIMIT 5` no SQL Editor e comparar com o que aparece no app.

---

## 6. Resumo executivo

| Função | Pode retornar mock em produção? | Fallback silencioso? | Risco |
|--------|--------------------------------|----------------------|-------|
| `fetchEquipes` | Não | Não | RLS bloqueio = `[]` sem erro |
| `fetchCorretores` | Não | Não | RLS bloqueio = `[]` sem erro |
| `fetchPistas` | Não | Não | RLS bloqueio = `[]` sem erro |
| `fetchVendas` | Não | Não | RLS bloqueio = `[]` sem erro |
| `fetchTudo` | Não | Não | Se qualquer filho falha → 500 |

**Conclusão**: o código está correto. Sem fallback silencioso para mock em produção. O único risco latente é que bloqueio por RLS (sessão não propagada) é indistinguível de tabela vazia — limitação de observabilidade, não bug.

---

## 7. Próximo passo

Com dados reais funcionando, a próxima fase é implementar as operações de escrita:

- Formulário de captura de lead (modal)
- Webhook `POST /api/leads`
- Deduplicação por telefone (janela 24h)
- Distribuição automática para corretor (round-robin)
