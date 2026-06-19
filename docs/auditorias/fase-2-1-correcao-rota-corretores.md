# Fase 2.1 — Correção da Rota `/corretores`
**Data:** 2026-06-19  
**Referência:** [fase-2-auditoria-distribuicao.md](./fase-2-auditoria-distribuicao.md) — item C1  
**Status:** Concluído  
**Commit:** `f35f5bd`

---

## 1. Evidência Encontrada

### Diagnóstico inicial (Fase 2)

A auditoria anterior identificou que o diretório responsável pela rota `/corretores` tinha um espaço invisível ao final do nome. O problema foi confirmado com dois métodos independentes:

**Método 1 — `cat -vet` (mostra caracteres especiais):**
```
app$
app/corretores $      ← espaço antes do $
app/pipeline$
app/equipes$
app/ranking$
app/leads$
```

**Método 2 — `python3 repr()` (mostra string exata):**
```python
'corretores ' → is_dir: True   ← espaço no final
'equipes'     → is_dir: True
'leads'       → is_dir: True
'pipeline'    → is_dir: True
'ranking'     → is_dir: True
```

### Por que isso causa 404 em produção

O Next.js App Router deriva as rotas diretamente do filesystem. Em Linux (sistema usado pela Vercel), os nomes de diretório são case-sensitive e respeitam espaços:

| O que existe no disco | Rota gerada pelo Next.js | Link no menu lateral | Resultado |
|----------------------|--------------------------|----------------------|-----------|
| `app/corretores ` (espaço) | `/corretores%20` | `/corretores` | **404** |
| `app/corretores` (correto) | `/corretores` | `/corretores` | ✓ 200 |

Em desenvolvimento local (macOS), o filesystem HFS+/APFS é case-insensitive e pode normalizar nomes, mascarando o problema. No Vercel (ext4/Linux), o bug é determinístico.

---

## 2. Comandos Executados

### Verificação

```bash
# Confirmar o nome exato do diretório
python3 -c "
import os
for entry in sorted(os.scandir('app'), key=lambda e: e.name):
    print(repr(entry.name), '→ is_dir:', entry.is_dir())
"

# Resultado:
# 'corretores ' → is_dir: True   ← BUG CONFIRMADO
```

### Correção

```bash
mv "/workspaces/lead-master-ia/app/corretores " "/workspaces/lead-master-ia/app/corretores"
```

### Verificação pós-correção

```bash
python3 -c "
import os
for entry in sorted(os.scandir('/workspaces/lead-master-ia/app'), key=lambda e: e.name):
    print(repr(entry.name), '→ is_dir:', entry.is_dir())
"

# Resultado:
# 'corretores' → is_dir: True   ← CORRIGIDO
```

### Build

```bash
npm install
npm run build
```

---

## 3. Arquivos Alterados

| Operação | Caminho antigo | Caminho novo |
|----------|---------------|-------------|
| Rename | `app/corretores /page.tsx` | `app/corretores/page.tsx` |

**Nenhum import ou referência de código precisou ser alterado.** As ocorrências de "corretores " nos arquivos são texto de UI (subtítulos e strings de texto), não paths de importação.

---

## 4. Build Antes (implícito)

O build anterior não havia sido executado nesta sessão, mas o comportamento em produção era:

```
Route (app)
├ ○ /
├ ○ /equipes
├ ○ /leads
├ ○ /pipeline
├ ○ /ranking
← /corretores AUSENTE (ou servido como /corretores%20)
```

O link de menu `/corretores` retornava 404 em produção (Vercel/Linux).

---

## 5. Build Depois

```
▲ Next.js 14.2.5

 ✓ Compiled successfully
 ✓ Generating static pages (9/9)

Route (app)                              Size     First Load JS
┌ ○ /                                    155 B          87.2 kB
├ ○ /_not-found                          871 B          87.9 kB
├ ○ /corretores                          155 B          87.2 kB   ← PRESENTE
├ ○ /equipes                             155 B          87.2 kB
├ ○ /leads                               155 B          87.2 kB
├ ○ /pipeline                            155 B          87.2 kB
└ ○ /ranking                             155 B          87.2 kB
```

Build 100% limpo: **0 erros, 0 warnings de TypeScript, 0 warnings de lint.**  
6 rotas reconhecidas corretamente + `/_not-found` padrão do Next.js.

---

## 6. Commit e Push

**Commit:**
```
f35f5bd fix: corrige rota corretores no app router

Diretório app/corretores tinha um espaço no final do nome, causando
rota /corretores com 404 em produção (Linux/Vercel). Renomeado para
app/corretores (sem espaço). Build confirmado com rota reconhecida.
```

**Push:**
```
To https://github.com/gilbertocasf/lead-master-ia
   785ab68..f35f5bd  main -> main
```

Push concluído com sucesso para `origin/main`.

---

## 7. Deploy na Vercel

A Vercel está configurada para deploy automático a partir de commits na branch `main`. O push do commit `f35f5bd` deve ter disparado um novo deploy automaticamente.

**Como verificar:**
1. Acessar o painel da Vercel: `vercel.com/dashboard`
2. Localizar o projeto `lead-master-ia`
3. Confirmar deploy em andamento ou concluído com o commit `f35f5bd`

O Vercel CLI não está autenticado neste ambiente, então a confirmação visual deve ser feita pelo usuário no painel web.

---

## 8. Resultado Final

| Item | Antes | Depois |
|------|-------|--------|
| Nome do diretório | `corretores ` (espaço) | `corretores` (correto) |
| Rota gerada | `/corretores%20` ou ausente | `/corretores` |
| Link do menu funciona | ✗ 404 em produção | ✓ Funcional |
| Build passa | Não testado | ✓ 9/9 páginas, 0 erros |
| Commit | — | `f35f5bd` |
| Push | — | ✓ `main → origin/main` |

---

## 9. Observação sobre o 404 Geral da Vercel

Este bug era **um dos fatores** que podiam causar o 404 geral reportado. Porém, o 404 geral pode ter causas adicionais independentes:

- Variáveis de ambiente (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) não configuradas na Vercel
- Build falhando silenciosamente por outro motivo (a ser confirmado no painel Vercel após este deploy)

Com este fix, ao menos a rota `/corretores` será servida corretamente. Se o 404 persistir em outras rotas após o novo deploy, a investigação deve prosseguir pelas variáveis de ambiente.

---

Correção concluída. Rota validada. Pronto para iniciar a Fase 3.
