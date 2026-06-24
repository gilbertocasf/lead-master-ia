# Mini Fase Pré-Demo — Implementação

Todas as edições feitas. Build executado.

---

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `components/Topbar.tsx` | Botão "Novo lead" removido |
| `components/ui/ComingSoonButton.tsx` | **Criado** — client component com tooltip "Disponível em breve" |
| `app/(app)/ranking/page.tsx` | `searchParams` adicionado; filtros agora são `<a>` dinâmicos por `dados.equipes`; `getRanking` recebe `equipeAtiva?.id` |
| `app/(app)/leads/page.tsx` | Botão "Distribuir" substituído por `ComingSoonButton` |
| `app/(app)/corretores/page.tsx` | Botão "Adicionar corretor" substituído por `ComingSoonButton` |
| `app/(app)/equipes/page.tsx` | Botão "Nova equipe" substituído por `ComingSoonButton` |

---

## Build

```
✓ Compiled successfully — 0 erros, 0 warnings de tipo.
```
