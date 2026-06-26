# Diagnóstico — Falhas de Escrita nas APIs

**Data:** 2026-06-26  
**Escopo:** `POST /api/equipes`, `POST /api/corretores`, `POST /api/leads`

---

## Causa raiz

`SUPABASE_SERVICE_ROLE_KEY` **não está definida** no `.env.local`.

Cadeia de falha:

1. Modal chama `fetch("/api/equipes", { method: "POST", ... })`
2. Route handler chega em `const admin = createSupabaseAdmin()`
3. `createSupabaseAdmin()` detecta que `SUPABASE_SERVICE_ROLE_KEY` está ausente e **lança uma exceção**
4. A exceção não está capturada dentro do handler → Next.js retorna **página HTML 500** (não JSON)
5. O modal executa `const data = await res.json()` sobre um HTML → **SyntaxError**
6. O `catch` do modal captura o SyntaxError e exibe `"Erro de conexão"` — mascarando o erro real

---

## Problemas encontrados por arquivo

### `lib/supabase-admin.ts`
- Comportamento correto: lança erro claro quando `SUPABASE_SERVICE_ROLE_KEY` está ausente.
- Problema: a exceção não é tratada em nenhum route handler.

### `app/api/equipes/route.ts`
- **Bug:** `createSupabaseAdmin()` na linha 54 é chamada sem try/catch.
- Se lançar, o handler não retorna JSON → Next.js retorna HTML.
- Erro do insert (linha 66-68) omite `detalhe` e `codigo`.

### `app/api/corretores/route.ts`
- **Bug:** `createSupabaseAdmin()` na linha 57 é chamada sem try/catch.
- Erro do insert (linha 98-104) omite `detalhe` e `codigo`.

### `app/api/leads/route.ts`
- **Bug:** `createSupabaseAdmin()` na linha 123 é chamada sem try/catch.
- Erro da RPC (linha 176-190) omite `detalhe` e `codigo` no fallback genérico.

### `components/NovaEquipeModal.tsx`
- **Bug:** `const data = await res.json()` está dentro do mesmo try/catch que reporta "Erro de conexão".
- Se o servidor retorna HTML (500), `res.json()` lança e o catch exibe mensagem errada.

### `components/NovoCorretorModal.tsx`
- **Bug:** mesma estrutura do modal acima.

### `components/NovoLeadModal.tsx`
- **Bug:** mesma estrutura, porém a mensagem fallback é `"Erro ao cadastrar lead"`.

---

## O que está correto

- Estrutura das routes (`NextRequest` / `NextResponse`, export `POST`)
- URLs chamadas pelos modais (`/api/equipes`, `/api/corretores`, `/api/leads`) batem com os arquivos
- Payloads enviados batem com os campos esperados pelas APIs
- `imobiliaria_id` é resolvido pelo usuário autenticado (não aceito do payload) — correto
- `createSupabaseServer()` lê sessão via cookies SSR — correto
- `createSupabaseAdmin()` só é importado no servidor — correto
- RPC `criar_e_distribuir_lead` corresponde à migration 005 (v2 com corretor_id)
- Colunas usadas (`telefone_normalizado`, `imobiliaria_id`, `distribuido_em`, `em_plantao`, `ultimo_lead_recebido_em`) existem graças à migration 002

---

## Correções aplicadas

### APIs (equipes, corretores, leads)
- `createSupabaseAdmin()` envolto em try/catch → retorna `{ erro: "servico_indisponivel", detalhe: "..." }` com status 503
- Erros de insert/RPC incluem agora `detalhe` e `codigo` no JSON retornado

### Modais (NovaEquipeModal, NovoCorretorModal, NovoLeadModal)
- `res.json()` movido para try/catch interno separado
- Resposta não-JSON (HTML) agora exibe "Erro interno" em vez de "Erro de conexão"
- Código `servico_indisponivel` mapeado para mensagem descritiva

---

## Ação necessária do operador

Para as escritas funcionarem, adicionar ao `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=<chave-service-role-do-projeto-supabase>
```

Nunca usar prefixo `NEXT_PUBLIC_` nessa variável.
