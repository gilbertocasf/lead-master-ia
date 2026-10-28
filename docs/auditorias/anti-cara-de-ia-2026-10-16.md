# Auditoria anti "cara de IA" (2026-10-16)

Branch: `feat/prontidao-meta-leads`. Referência: guia da Vibehub Academy com 9 sinais de app feito por IA.

Escopo: `app/(app)/**`, `components/**`, `app/admin/**`, `lib/supabase-queries.ts`, `lib/alertas.ts`.
Fora do escopo desta passada (outro agente está editando): `app/layout.tsx`, `app/not-found.tsx`,
`app/robots.ts`, `app/privacidade/**`, `middleware.ts`, `app/login/**`. Os achados nesses arquivos
ficam registrados abaixo como "repassar".

Paleta (tailwind.config.ts): `base-*` fundos, `ink-*` textos, `action` #3B82F6 (azul de ação),
`gold` #D4A636 (premiação/VGV), `win`/`loss`/`warn` semânticas. `action` sólido e `gold` são a marca: mantidos.

## Resumo por sinal

| # | Sinal | Itens encontrados | Corrigidos | Mantidos |
|---|-------|------------------:|-----------:|---------:|
| 1 | Gradiente azul/roxo | 2 (ambos dourado→dourado) | 0 | 2 |
| 2 | Travessões em texto visível | 34 | 32 | 2 (repassar) |
| 3 | Quebra em 375px | 12 | 12 | 0 |
| 4 | Pílulas/selos genéricos | 1 | 1 | 0 |
| 5 | Emoji como enfeite | 0 | 0 | 0 |
| 6 | Copy vazia / afirmações falsas | 7 | 7 | 0 |
| 7 | Sobra de placeholder/demo | 6 | 5 | 1 (repassar) |
| 8 | Centralizado/sombra gigante | 13 | 13 | 0 |
| 9 | Colunas iguais sem dado | 2 | 0 | 2 |
| + | Título próprio por página | 8 páginas sem `metadata` | 8 | 0 |

## Inventário

### 1. Gradiente azul e roxo

Busca: `from-(purple|violet|indigo|fuchsia|blue)`, `via-`, `bg-gradient`, `linear-gradient`. Nenhum gradiente azul→roxo.

| Onde | O que | Decisão |
|------|-------|---------|
| `app/(app)/page.tsx:421` | pódio do 1º lugar `from-gold/30 to-gold/5` | Manter: gradiente monocromático da cor da marca (dourado), é exatamente o fix sugerido pelo guia |
| `app/(app)/ranking/page.tsx:175` | card do campeão `from-gold/15 to-transparent` | Manter: idem |

### 2. Travessões (— e –) em texto visível

Comentários de código, `docs/` e mensagens de `console.*` não entram.

| Onde | O que | Decisão |
|------|-------|---------|
| `app/(app)/page.tsx:115, 215, 316, 317` | descrições do cabeçalho com "—" | Corrigir: dois pontos / frase nova |
| `app/(app)/ranking/page.tsx:76` | "Considera apenas vendas — locações..." | Corrigir: frase nova |
| `app/(app)/equipes/page.tsx:101` | "Gerente: —" | Corrigir: "Não informado" |
| `app/(app)/leads/page.tsx:144` | equipe vazia "—" | Corrigir: "Sem equipe" |
| `app/(app)/leads/page.tsx:152, 404` | corretor vazio "—" | Corrigir: "Sem corretor" / "Corretor inativo" |
| `app/(app)/leads/page.tsx:290` | título "Fila — {equipe}" | Corrigir: "Fila: {equipe}" |
| `app/(app)/leads/[id]/page.tsx:45, 50, 68` | helpers devolvem "—" | Corrigir: "Não informado" / "Sem resposta" |
| `app/(app)/leads/[id]/page.tsx:237–242, 247, 270, 273, 279, 285` | campos vazios "—" | Corrigir: "Não informado" e variantes |
| `app/(app)/integracoes/page.tsx:335, 341` | nome de Página/formulário vazio | Corrigir: "Sem nome" |
| `app/(app)/integracoes/page.tsx:404` | formulário vazio na tabela | Corrigir: "Sem formulário" |
| `app/(app)/integracoes/page.tsx:414` | último erro vazio | Corrigir: "Nenhum" |
| `app/(app)/integracoes/page.tsx:422` | lead vazio | Corrigir: "Sem lead" |
| `components/Sidebar.tsx:110` | iniciais do avatar sem perfil "—" | Corrigir: ícone SVG de pessoa |
| `components/ExcluirEquipeModal.tsx:130` | lista "...bloqueada — transfira-os" | Corrigir: dois pontos |
| `components/NovoLeadModal.tsx:323` | placeholder "R$ 400–600 mil" | Corrigir: "R$ 400 a 600 mil" |
| `lib/supabase-queries.ts:122, 146, 176, 279, 301, 423` | nome ausente vira "—" (aparece na UI) | Corrigir: "Sem nome" |
| `lib/supabase-queries.ts:123` | `gerenteId` ausente vira "—" (aparece como "Gerente: —") | Corrigir: string vazia; a página mostra "Não informado" |
| `lib/supabase-queries.ts:468` | `equipeNome` ausente "—" (ranking) | Corrigir: "Sem equipe" |
| `app/admin/page.tsx:44` | "Lead Master IA — Operação interna" | Corrigir: "Lead Master IA · Operação interna" |
| `lib/alertas.ts:90` | assinatura do e-mail de alerta "— Alerta automático" | Corrigir: sem o travessão (texto que o cliente lê) |
| `app/layout.tsx:19` | `title: "Lead Master IA — Gestão imobiliária"` | Repassar: arquivo do outro agente (ele vai trocar pelo template) |
| `app/login/**` | (não auditado a fundo) | Repassar |

### 3. Quebra no celular (375px)

| Onde | O que | Decisão |
|------|-------|---------|
| 7 modais (`components/*Modal.tsx`) | painel sem altura máxima nem rolagem: em 375×667 o formulário de lead passa da tela e o botão "Cadastrar" fica inalcançável | Corrigir: `max-h-[calc(100dvh-2rem)] overflow-y-auto` no painel |
| `components/NovoLeadModal.tsx:258` | `grid-cols-2` (Origem + Equipe) aperta os selects em 300px | Corrigir: `grid-cols-1 sm:grid-cols-2` |
| `components/NovoCorretorModal.tsx:195` | `grid-cols-2` (E-mail + Telefone) | Corrigir: idem |
| `app/(app)/ranking/page.tsx:254` | abas de equipe em `flex` sem quebra: com 3+ equipes estoura a largura da página | Corrigir: `flex-wrap` |
| `components/ui/Card.tsx:29` | `CardHeader` com título + ações sem `min-w-0`/quebra (fila com botão "Distribuir fila" + contador) | Corrigir: `flex-wrap` e `min-w-0` |
| `app/(app)/leads/page.tsx:343` | linha da fila: avatar + nome + selo "Na fila" + botão "Atribuir" em 343px | Corrigir: selo some abaixo de `sm` (o card já se chama "Fila") |

Tabelas largas já estavam dentro de `overflow-x-auto` (leads, ranking, integrações); o Kanban do pipeline rola dentro do próprio contêiner. Sem mudança.

### 4. Pílulas e selos genéricos

| Onde | O que | Decisão |
|------|-------|---------|
| `components/Sidebar.tsx:75` | subtítulo da marca "Gestão imobiliária" (genérico; o produto é distribuidor de leads) | Corrigir: "Distribuição de leads" |
| `components/Sidebar.tsx:73` | "IA" em dourado | Manter: faz parte do nome do produto, não é selo decorativo |

Não há "Beta", "New", "v1.0" nem "AI-Powered".

### 5. Emoji como enfeite

Busca por faixas Unicode de emoji em `app/`, `components/`, `lib/`: nenhum. Ícones já são SVG inline.

### 6. Copy vazia ou que afirma o que o sistema não faz

| Onde | O que | Decisão |
|------|-------|---------|
| `components/Topbar.tsx:19-25` | filtro "Junho 2026" fixo, comentado como "mock visual": não filtra nada e mostra mês errado | Corrigir: remover (ver sinal 7) |
| `app/(app)/page.tsx:322` | "vendas no mês": as vendas não são filtradas por mês | Corrigir: "vendas fechadas" |
| `app/(app)/page.tsx:122, 238` e descrições "do período" | não existe filtro de período | Corrigir: "total cadastrado", "acumulado" |
| `app/(app)/ranking/page.tsx:76, 111` | "no período" | Corrigir: remover a referência |
| `app/(app)/equipes/page.tsx:244` | "Cada gerente distribui os leads da sua fila": a distribuição é automática | Corrigir: dizer o que o sistema faz (corretor de plantão há mais tempo sem receber lead) |
| `app/(app)/leads/page.tsx:55, 276` | "O gerente cadastra o lead..." (lead também entra pela Meta) | Corrigir: "Cada lead cadastrado ou recebido da Meta..." |
| `app/(app)/pipeline/page.tsx:94` | "Cada coluna é um estágio do funil." (óbvio) | Corrigir: cortar |

Não há "Potencialize", "Experiência fluida", "Inteligência que transforma".

### 7. Sobra de placeholder e textos de demo

| Onde | O que | Decisão |
|------|-------|---------|
| `components/Topbar.tsx:24` | "Junho 2026" fixo | Corrigir: remover o falso filtro |
| `components/Sidebar.tsx:114-117` | "Modo Dev" / "sem autenticação" aparece também em produção quando o perfil não carrega | Corrigir: em modo real mostra "Perfil não carregado" e "Entre novamente" |
| `app/(app)/pipeline/page.tsx:142` | `{lead.regiao} • {lead.faixaValor}`: `regiao` vem sempre vazia do banco e sobra " • " solto | Corrigir: só junta partes preenchidas |
| `components/NovoCorretorModal.tsx:205` | placeholder "corretor@imob.com" | Corrigir: "E-mail do corretor" |
| `app/admin/SetupClienteForm.tsx:101, 113` | "Ex.: João Silva", "admin@imobiliaria.com" | Corrigir: "Nome completo", "E-mail do administrador" |
| `app/login/page.tsx:63` | "seu@email.com" | Repassar ao agente do login |
| `lib/mock-data.ts` | nomes fictícios | Manter: só carregado em modo mock local (`isMockMode` é falso em produção) |
| `components/ui/ComingSoonButton.tsx` | "Disponível em breve" | Manter: componente não é usado em nenhuma página (sem refatoração nesta passada) |

### 8. Tudo centralizado, arredondado, com a mesma sombra gigante

| Onde | O que | Decisão |
|------|-------|---------|
| 7 modais `shadow-2xl` | sombra gigante sobre fundo já escurecido a 60% | Corrigir: `shadow-card` (a mesma das superfícies) |
| Avisos "Conta sem equipe" / "Usuário não vinculado" em `page.tsx`, `leads`, `pipeline`, `corretores`, `equipes`, `ranking` (6 telas, 2 variantes cada quando aplicável) | bloco centralizado com ícone grande em cima | Corrigir: alinhado à esquerda, ícone ao lado do título |
| Blocos "Área administrativa" (`ranking`, `corretores`, `equipes`, `integracoes`) | idem | Corrigir: alinhado à esquerda |
| `app/(app)/integracoes/page.tsx` `Aviso` | idem | Corrigir: alinhado à esquerda |

Mantidos: estados vazios curtos dentro de cards ("Nenhum lead...") seguem centralizados, é o padrão esperado para vazio em lista.

### 9. Colunas iguais sem dado

| Onde | O que | Decisão |
|------|-------|---------|
| `app/(app)/page.tsx` KPIs (4 cards) | grade igual, mas o VGV já tem peso maior (`accent` dourado) e todos mostram dado real | Manter |
| `app/(app)/ranking/page.tsx` pódio (3 cards) | o 1º lugar já é maior, elevado e dourado | Manter; corrigido só o vazio (sem vendas, a tela ficava em branco) |

### Título da aba

Nenhuma página de `app/(app)/*` exportava `metadata`. Todas recebem título curto; o template
"%s · Lead Master IA" fica no layout raiz (outro agente). `/leads/[id]` usa título fixo "Lead"
(o nome exigiria repetir a consulta ao banco em `generateMetadata`).

## Antes → depois

Só mudanças visuais e de texto. Nenhuma rota, prop, chamada de API ou estrutura de dados mudou.

| Arquivo | Antes | Depois |
|---------|-------|--------|
| `components/Topbar.tsx` | barra fixa em todas as larguras com filtro falso "Junho 2026" | barra só no celular (`lg:hidden`) com botão de menu e o nome "Lead Master IA"; filtro removido |
| `components/Sidebar.tsx` | subtítulo "Gestão imobiliária"; sem perfil mostrava "—", "Modo Dev", "sem autenticação" | "Distribuição de leads"; ícone SVG de pessoa; "Modo local / Dados de exemplo, sem banco" só em modo mock, senão "Perfil não carregado / Entre novamente"; botão Sair com `aria-label` |
| `components/ui/Card.tsx` | `CardHeader` sem quebra de linha | `flex-wrap` + `min-w-0`: ações descem para a linha de baixo no celular |
| 7 modais em `components/*Modal.tsx` | painel `shadow-2xl`, sem rolagem | `shadow-card` e `max-h-[calc(100dvh-2rem)] overflow-y-auto` |
| `components/NovoLeadModal.tsx` | Origem/Equipe em 2 colunas fixas; placeholder "R$ 400–600 mil" | 1 coluna no celular, 2 a partir de `sm`; "R$ 400 a 600 mil" |
| `components/NovoCorretorModal.tsx` | E-mail/Telefone em 2 colunas fixas; placeholder "corretor@imob.com" | 1 coluna no celular; "E-mail do corretor" |
| `components/ExcluirEquipeModal.tsx` | "bloqueada — transfira-os" | "bloqueada: transfira-os" |
| `app/(app)/page.tsx` | descrições com "—" e "do período"; "vendas no mês"; `<a href="/ranking">`; pódio e recentes vazios ficavam em branco; avisos centralizados | descrições com dois pontos e "acumulados"; "vendas fechadas"; `next/link`; mensagens de vazio; nome no pódio trunca; avisos à esquerda; `metadata` "Dashboard" |
| `app/(app)/leads/page.tsx` | "Fila — Equipe"; "—" para equipe/corretor; texto "O gerente cadastra..."; selo "Na fila" sempre visível | "Fila: Equipe"; "Sem equipe", "Sem corretor", "Corretor inativo"; texto cita cadastro e Meta; selo some no celular; avisos à esquerda; `metadata` "Leads" |
| `app/(app)/leads/[id]/page.tsx` | 14 campos vazios com "—" | "Não informado", "Sem equipe", "Corretor inativo", "Ainda não distribuído", "Sem resposta", "Sem status"; `metadata` "Lead" |
| `app/(app)/pipeline/page.tsx` | " • R$ ..." com região sempre vazia; "Cada coluna é um estágio do funil." | só mostra partes preenchidas; "Cada mudança de status fica registrada no histórico do lead."; avisos à esquerda; `metadata` "Pipeline" |
| `app/(app)/corretores/page.tsx` | selo "Fora"; equipe sem fallback; lista vazia em branco | "Fora do plantão"; "Sem equipe"; mensagem de vazio; avisos à esquerda; `metadata` "Corretores" |
| `app/(app)/equipes/page.tsx` | "Gerente: —"; "Cada gerente distribui os leads da sua fila" | "Gerente: Não informado"; texto descreve a regra real de distribuição; equipe sem corretor mostra aviso; nomes truncam; `metadata` "Equipes" |
| `app/(app)/ranking/page.tsx` | "no período", travessão; abas `<a>` sem quebra; sem vendas a tela ficava vazia | texto direto; abas `next/link` com `flex-wrap`; mensagem de vazio e tabela só com dados; `metadata` "Ranking VGV" |
| `app/(app)/integracoes/page.tsx` | "—" em 5 células; avisos centralizados | "Sem nome", "Sem formulário", "Nenhum", "Sem lead"; avisos à esquerda; `metadata` "Integrações" |
| `app/admin/page.tsx` | "Lead Master IA — Operação interna" | "Lead Master IA · Operação interna" |
| `app/admin/SetupClienteForm.tsx` | "Ex.: João Silva", "admin@imobiliaria.com" | "Nome completo", "E-mail do administrador" |
| `lib/supabase-queries.ts` | nome ausente "—"; `gerenteId` "—"; equipe do ranking "—" | "Sem nome"; string vazia; "Sem equipe" |
| `lib/alertas.ts` | assinatura do e-mail "— Alerta automático..." | "Alerta automático..." |

### Repassar ao agente do layout/login

- `app/login/page.tsx:63`: placeholder "seu@email.com" (sinal 7).
- `app/layout.tsx`: o título antigo tinha travessão; na última verificação já tinha sido trocado.

### Validação

- `tsc -p /tmp/claude-0/tscheck/tsconfig.json`: zero erros.
- Sem `npm run build`/`lint` neste ambiente: rodar fora daqui antes de mesclar.
- Conferir visualmente em 375px: modal "Cadastrar lead" rola até o botão; fila de leads com botão "Atribuir"; abas do ranking com 3+ equipes.
