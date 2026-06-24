# Análise arquitetural — Botão "Novo Lead" global vs. local

## Diagnóstico real da duplicação

O botão global existe em `components/Topbar.tsx` (linha 28), renderizado em todas as páginas protegidas via `app/(app)/layout.tsx`. Atualmente é **não funcional** — tem visual mas nenhum `onClick`.

O botão local existe em `app/(app)/leads/page.tsx` via `<NovoLeadModal equipes={equipes} />` — é o único ponto de entrada funcional para cadastro manual de leads.

---

## Avaliação das alternativas

### Alternativa A — Remover o botão global, manter apenas o local em /leads

**Coerência para um distribuidor de leads imobiliário**

O fluxo operacional do produto é: lead entra → vai para a fila → é distribuído para o corretor de plantão. A página `/leads` é o hub operacional — a fila está visível lá, o contexto é claro. O captador vai naturalmente para `/leads` para registrar um lead. Um botão global implica que a ação é frequente de qualquer contexto, mas a entrada primária do sistema é via webhook (automática). O cadastro manual é fallback, e faz sentido que esse fallback viva em `/leads`.

**Dívida técnica:** mínima. Uma remoção de 6 linhas em `Topbar.tsx`. Sem novas dependências, sem novos fluxos de dados.

**Duplicação de UI:** eliminada completamente. Um botão, uma página, um fluxo.

**Alterações na arquitetura:** nenhuma. O componente `NovoLeadModal` continua onde está, com os dados que já tem.

---

### Alternativa B — Tornar o botão global funcional, remover o botão local de /leads

**Coerência para um distribuidor de leads imobiliário**

Tem apelo de "quick capture" — o gestor está na tela de Pipeline e precisa registrar um lead sem navegar. Mas isso pressupõe um perfil de uso que conflita com o modelo do produto: a entrada primária é webhook, e o cadastro manual é uma operação contextual (captador olhando a fila). Tirar o botão de `/leads` e colocar só no Topbar descontextualiza a ação.

**Dívida técnica:** significativa.

O `NovoLeadModal` precisa de `equipes: Equipe[]` como prop. Atualmente essa prop vem de `fetchTudo()` chamado dentro de `app/(app)/leads/page.tsx`. Para o modal funcionar no Topbar:

1. `app/(app)/layout.tsx` precisaria chamar `fetchEquipes()` ou `fetchTudo()` — adicionando uma busca de dados no nível de layout, que hoje não existe.
2. `AppShell` (Client Component) precisaria receber `equipes` como prop e repassar para o Topbar.
3. `Topbar` precisaria receber `equipes` e controlar o estado `open` do modal.

Isso adiciona acoplamento entre o layout, AppShell, Topbar e o modal — uma cadeia de props que não existe hoje.

**Alternativa dentro da B:** fazer o modal buscar as equipes internamente (via `fetch('/api/equipes')` quando aberto). Isso eliminaria a cadeia de props, mas cria um endpoint novo e uma busca assíncrona dentro do modal.

**Duplicação de UI:** eliminada, mas ao custo de mover a responsabilidade de um lugar contextual para um lugar global.

**Alterações na arquitetura:** 4-5 arquivos afetados, novo fluxo de dados no layout ou novo endpoint.

---

## Recomendação: Alternativa A

| Critério | A | B |
|----------|---|---|
| Coerência com o modelo do produto | Sim | Parcial |
| Dívida técnica | Mínima | Significativa |
| Duplicação de UI eliminada | Sim | Sim |
| Arquivos afetados | 1 | 4–5 |
| Risco de quebrar fluxo atual | Nenhum | Baixo a médio |

A Alternativa A é a escolha correta. O botão global no Topbar foi adicionado como intenção visual, não como decisão de UX validada. Removê-lo é a ação mais limpa e consistente com a arquitetura atual.

---

## Plano de execução atualizado — Mini Fase Pré-Demo

### Escopo revisado

| Item | Ação | Mudança em relação ao plano anterior |
|------|------|--------------------------------------|
| Remover botão "Novo Lead" do Topbar | Deletar linhas 27-33 de `Topbar.tsx` | **Substitui** o item "Botão Novo Lead redirecionar para /leads" |
| Filtros do Ranking VGV | Tornar funcionais via URL search params | Sem mudança |
| Botão "Distribuir" (Leads) | Substituir por feedback "Disponível em breve" | Sem mudança |
| Botão "Adicionar corretor" (Corretores) | Substituir por feedback "Disponível em breve" | Sem mudança |
| Botão "Nova equipe" (Equipes) | Substituir por feedback "Disponível em breve" | Sem mudança |

### Arquivos tocados (revisado)

| Arquivo | Tipo de mudança |
|---------|----------------|
| `components/Topbar.tsx` | **MODIFICAR** — remover botão "Novo lead" (linhas 27-33) |
| `components/ui/ComingSoonButton.tsx` | **CRIAR** — componente client para feedback |
| `app/(app)/ranking/page.tsx` | **MODIFICAR** — searchParams + links dinâmicos |
| `app/(app)/leads/page.tsx` | **MODIFICAR** — trocar botão "Distribuir" por `ComingSoonButton` |
| `app/(app)/corretores/page.tsx` | **MODIFICAR** — trocar "Adicionar corretor" por `ComingSoonButton` |
| `app/(app)/equipes/page.tsx` | **MODIFICAR** — trocar "Nova equipe" por `ComingSoonButton` |

Total: **1 arquivo criado, 5 modificados**. O Dashboard (`app/(app)/page.tsx`) não é mais tocado.

### O que NÃO muda

- `NovoLeadModal` permanece exclusivamente em `/leads`, sem alterações.
- Nenhuma migration, nenhuma alteração em `package.json`, nenhum push.
- A lógica de cadastro de lead existente não é tocada.
