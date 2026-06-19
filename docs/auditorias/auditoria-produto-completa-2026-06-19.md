# Auditoria de Produto — Lead Master IA
**Data:** 2026-06-19  
**Executado por:** Claude Code (claude-sonnet-4-6)  
**Perspectiva:** CTO avaliando MVP para apresentação a uma imobiliária real  
**Branch:** main · Repositório: github.com/gilbertocasf/lead-master-ia  
**Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Supabase (PostgreSQL)

---

## Resumo Executivo

O Lead Master IA tem visual profissional e arquitetura sólida para um MVP. O design system é coerente, a navegação funciona, os dados são exibidos corretamente. Para uma **demonstração estática** o produto está pronto. Para **operação real**, faltam: formulários que persistam dados, distribuição automática de leads, autenticação e ao menos um canal externo de captura.

**Scorecard:**

| Dimensão | Nota | Observação |
|---|---|---|
| Design / UI | 9/10 | Visual polido, responsivo, dark mode consistente |
| Navegação | 8/10 | Todas as rotas funcionam; só 2 links interativos |
| Dados / Backend | 3/10 | Dual-mode funciona, mas zero ações de escrita |
| Funcionalidades | 2/10 | Botões sem implementação, pipeline estático |
| Pronto para demo | 7/10 | Impressiona visualmente, mas nada persiste |
| Pronto para produção | 1/10 | Faltam auth, formulários, integrações |

---

## FASE 1 — Inventário Funcional por Página

### 1.1 Dashboard (`app/page.tsx`)

| Item | Status |
|---|---|
| KPIs calculados (VGV, Leads, Conversão, Vendas) | ✅ Funciona |
| Pódio VGV top 3 | ✅ Funciona |
| Funil de pipeline com barras proporcionais | ✅ Funciona |
| Lista de 5 leads mais recentes | ✅ Funciona |
| Link "Ver ranking completo" → /ranking | ✅ Funciona (único link ativo nesta página) |
| Filtro de período "Junho 2026" | ❌ Visual — hardcoded, sem filtro |
| Dados vindos do Supabase | ⚠️ Condicional — só se `.env` estiver configurado |
| Dados de mock | ✅ Ativo (sem `.env.local`) |

**Diagnóstico:** A página mais completa do sistema. Funciona bem como vitrine.  
**Bug de lógica:** `getKPIs()` calcula `totalLeads = leads.length + vendas.length`, inflando o total. Uma venda fechada é contada duas vezes (como lead + como venda).

---

### 1.2 Leads (`app/leads/page.tsx`)

| Item | Status |
|---|---|
| Fila de distribuição por equipe | ✅ Renderiza |
| Sugestão visual de próximo de plantão | ✅ Renderiza |
| Tabela completa de todos os leads | ✅ Renderiza |
| Indicador "Na fila" vs nome do corretor | ✅ Renderiza |
| Botão "Cadastrar lead" | ❌ Visual — nenhum `onClick`, nenhum formulário |
| Botão "Distribuir" (por card de lead) | ❌ Visual — nenhuma ação real |
| Persistência de dados | ❌ Inexistente |

**Diagnóstico:** É a página mais crítica para uma imobiliária e é a mais incompleta em termos de funcionalidade real.  
**Bug estrutural:** A página é um Server Component assíncrono. Botões dentro de Server Components não podem ter handlers de evento (`onClick`). Para funcionar, precisam virar Client Components ou usar Server Actions (Next.js 14).

---

### 1.3 Pipeline (`app/pipeline/page.tsx`)

| Item | Status |
|---|---|
| Kanban visual com colunas por status | ✅ Renderiza |
| Cards de leads com info básica | ✅ Renderiza |
| Indicador de equipe e corretor | ✅ Renderiza |
| Movimentação de cards (drag-and-drop) | ❌ Não implementado |
| Botão de avançar status | ❌ Não existe |
| Qualquer ação sobre os cards | ❌ Cards são somente-leitura |

**Diagnóstico:** O próprio código admite o estado atual. Linha 91:  
> *"Dica: na versão final, os cards serão arrastáveis entre colunas. Aqui é uma demonstração visual com dados fictícios."*

Esta frase aparece para o usuário final na tela, o que é inadequado para uma apresentação profissional.

---

### 1.4 Corretores (`app/corretores /page.tsx`)

| Item | Status |
|---|---|
| Cards de corretores com equipe e plantão | ✅ Renderiza |
| VGV, vendas e leads ativos por corretor | ✅ Calculado corretamente |
| Indicador de plantão (verde/cinza) | ✅ Renderiza |
| Botão "Adicionar corretor" | ❌ Visual — sem implementação |
| Perfil individual do corretor | ❌ Não existe rota `/corretores/[id]` |
| Editar dados do corretor | ❌ Não existe |

**Bug crítico de infraestrutura:** O diretório chama-se `corretores ` (com espaço no final). Funcionando localmente, mas é uma bomba-relógio: sistemas de arquivo case-sensitive podem rejeitar; scripts de build podem falhar; URLs com espaço são codificadas como `%20` e podem quebrar.

---

### 1.5 Equipes (`app/equipes/page.tsx`)

| Item | Status |
|---|---|
| Cards de equipes com VGV, leads, corretores | ✅ Renderiza |
| Ordem de plantão por equipe | ✅ Renderiza |
| Indicadores de quem está em plantão | ✅ Renderiza |
| Botão "Nova equipe" | ❌ Visual — sem implementação |
| Editar equipe | ❌ Não existe |

**Bug de dados no mock:** A página constrói os gerentes como `{ nome: e.gerenteId }`. No mock, `gerenteId` vale `"g1"` e `"g2"` — os nomes exibidos na tela são literalmente **"g1"** e **"g2"**, não "Roberto Tavares" e "Cláudia Menezes". No Supabase isso funciona corretamente (o banco guarda o nome como texto), mas no mock-data está quebrado.

---

### 1.6 Ranking (`app/ranking/page.tsx`)

| Item | Status |
|---|---|
| Pódio visual top 3 | ✅ Renderiza |
| Tabela completa com VGV, vendas, ticket médio | ✅ Renderiza |
| Cálculo de ranking por VGV | ✅ Correto |
| Botão "Geral" | ❌ Visual — sem filtro |
| Botão "Atlântico" | ❌ Visual — sem filtro por equipe |
| Botão "Horizonte" | ❌ Visual — sem filtro por equipe |

**Diagnóstico:** Os botões de filtro existem como Server Component. Para filtrar, a página precisaria receber `?equipe=atletico` como searchParam e passar o `equipeId` para `getRanking()`. A lógica de `getRanking(dados, equipeId)` já suporta o filtro — só falta conectar a UI.

---

## FASE 2 — Mapa Completo de Botões e Ações

| # | Página | Elemento | Arquivo | `onClick` | Ação real | Persiste dados | Veredicto |
|---|---|---|---|---|---|---|---|
| 1 | Todas (mobile) | Menu hamburguer | `Topbar.tsx:7` | ✅ `onMenu()` | Abre sidebar | Não | **FUNCIONA** |
| 2 | Sidebar | Links de navegação | `Sidebar.tsx:59` | ✅ `<Link>` Next.js | Navega entre páginas | Não | **FUNCIONA** |
| 3 | Dashboard | "Ver ranking completo" | `page.tsx:55` | ✅ `<a href="/ranking">` | Navega para /ranking | Não | **FUNCIONA** |
| 4 | Topbar | "Novo lead" | `Topbar.tsx:28` | ❌ ausente | Nenhuma | Não | **VISUAL** |
| 5 | Topbar | Filtro "Junho 2026" | `Topbar.tsx:20` | ❌ ausente | Nenhuma | Não | **VISUAL** |
| 6 | Leads | "Cadastrar lead" | `leads/page.tsx:31` | ❌ ausente | Nenhuma | Não | **VISUAL** |
| 7 | Leads | "Distribuir" (cada card) | `leads/page.tsx:80` | ❌ ausente | Nenhuma | Não | **VISUAL** |
| 8 | Corretores | "Adicionar corretor" | `corretores /page.tsx:33` | ❌ ausente | Nenhuma | Não | **VISUAL** |
| 9 | Equipes | "Nova equipe" | `equipes/page.tsx:28` | ❌ ausente | Nenhuma | Não | **VISUAL** |
| 10 | Ranking | "Geral" | `ranking/page.tsx:21` | ❌ ausente | Nenhuma | Não | **VISUAL** |
| 11 | Ranking | "Atlântico" | `ranking/page.tsx:22` | ❌ ausente | Nenhuma | Não | **VISUAL** |
| 12 | Ranking | "Horizonte" | `ranking/page.tsx:23` | ❌ ausente | Nenhuma | Não | **VISUAL** |

**Resultado: 3 de 12 elementos têm ação real (25%). Nenhum persiste dados.**

---

## FASE 3 — Fluxo de Leads: Origem, Armazenamento e Distribuição

### 3.1 Como os leads chegam hoje
**Resposta curta: não chegam.** Não há nenhum canal de entrada real.

Os 11 leads visíveis no sistema foram criados em uma de duas formas:
- Inserção direta no banco via `supabase/schema.sql` (seção 8.3 — dados de exemplo)
- Leitura do `lib/mock-data.ts` quando sem `.env.local`

### 3.2 Onde são armazenados
- **Modo mock (atual):** em memória — `lib/mock-data.ts`. Reiniciar o servidor reinicia os dados.
- **Modo Supabase:** tabela `leads` no PostgreSQL. Persistente — mas ninguém consegue inserir via UI.

### 3.3 Como entram no sistema
Não entram. O botão "Cadastrar lead" existe visualmente mas sem implementação. Para inserir um lead no banco é necessário acesso direto ao Supabase Studio ou linha de comando SQL.

### 3.4 Como são distribuídos
A lógica existe: `getProximoPlantao()` identifica o próximo corretor. O botão "Distribuir" existe visualmente. Mas a ação de `UPDATE leads SET corretor_id = {id}` nunca é executada.

### 3.5 O que falta para o fluxo funcionar

```
Canal externo → [MISSING: webhook / formulário]
      ↓
INSERT na tabela leads → [MISSING: Server Action ou API Route]
      ↓
Lead aparece na fila visual → ✅ JÁ EXISTE
      ↓
Gerente clica "Distribuir" → [MISSING: onClick + Server Action]
      ↓
UPDATE corretor_id no banco → [MISSING]
      ↓
Lead aparece no pipeline do corretor → ✅ JÁ EXISTE (visual)
      ↓
Corretor move no pipeline → [MISSING: drag-and-drop ou botões]
      ↓
UPDATE status no banco → [MISSING]
```

---

## FASE 4 — Modelo Realista de Negócio: Suporte a Canais Externos

### 4.1 Canais típicos de uma imobiliária

| Canal | Suportado? | Detalhe |
|---|---|---|
| Facebook Ads | ⚠️ Parcial | `LeadSource` tem enum "Facebook" mas não há webhook |
| Instagram Ads | ⚠️ Parcial | `LeadSource` tem enum "Instagram" mas não há webhook |
| Landing Pages | ❌ Ausente | Nenhuma rota de API para receber POST externo |
| WhatsApp | ❌ Ausente | "WhatsApp" não está no enum `LeadSource` |
| Google Forms | ❌ Ausente | Nenhuma integração |
| Google Sheets | ❌ Ausente | Nenhuma integração |

### 4.2 O que já existe que suporta o modelo

- Modelo de dados adequado (tabela `leads` com campos essenciais)
- Enum `lead_origem` extensível (atualmente só 3 valores)
- Estrutura de equipes/corretores para distribuição
- Pipeline de 6 etapas bem definido
- Cálculo de ranking VGV separado de lead count

### 4.3 O que falta para suportar o modelo real

1. **API Route pública** (`/api/leads` — `POST`) para receber leads de fontes externas
2. **Autenticação de webhook** (token Bearer ou HMAC para validar origem)
3. **Integração Meta Lead Ads** (Facebook/Instagram entrega leads via webhook — requer Facebook App)
4. **Campo `origem` granular** — adicionar "WhatsApp", "Landing Page", "Google Forms", "Indicação"
5. **Autenticação de usuário** — sem auth, qualquer pessoa pode ver todos os dados
6. **RLS no Supabase** — hoje a chave anon permite SELECT em todas as tabelas
7. **Notificações** — gerente precisa saber quando lead chega na fila (email / push / WhatsApp)

---

## FASE 5 — Google Sheets como Fonte Temporária de Leads

### 5.1 Viabilidade
**Alta.** É a integração mais rápida de implementar e a mais familiar para equipes de imobiliária. Risco baixo — Google Sheets já é usado na maioria das operações imobiliárias.

### 5.2 Arquitetura proposta

```
[Formulário: Google Forms ou aba "Entrada" na planilha]
            ↓
[Google Sheets — aba "Leads Brutos"]
            ↓ (trigger: onChange ou onFormSubmit)
[Google Apps Script]
            ↓ HTTP POST
[Next.js API Route: /api/import/sheets]
            ↓ valida + transforma
[Supabase: INSERT INTO leads (...)]
            ↓
[Dashboard Lead Master IA — aparece em tempo real]
```

### 5.3 Campos mínimos na planilha

| Coluna | Tipo | Obrigatório | Observação |
|---|---|---|---|
| `nome` | Texto | ✅ | Nome do lead |
| `telefone` | Texto | ✅ | Formato livre (validar no backend) |
| `origem` | Enum | ✅ | Instagram / Facebook / WhatsApp / Outro |
| `interesse` | Texto | ✅ | Ex.: "Compra • Apto 2 quartos" |
| `faixa_valor` | Texto | ❌ | Ex.: "R$ 400–600 mil" |
| `equipe_nome` | Texto | ✅ | "Equipe Atlântico" ou "Equipe Horizonte" |
| `importado` | Boolean | — | Apps Script marca TRUE após importar |
| `importado_em` | Timestamp | — | Apps Script preenche |

### 5.4 Desafios a resolver

1. **Deduplicação:** precisar da coluna `importado` para não inserir o mesmo lead duas vezes
2. **Resolução de equipe:** a API precisa converter nome da equipe para UUID do Supabase
3. **Segurança da API Route:** usar token secreto no header para que só o Apps Script acesse
4. **Tratamento de erros:** se o Supabase recusar (ex.: telefone duplicado), o Apps Script precisa saber

### 5.5 Alternativa: Polling via Cron

Se não quiser Apps Script, uma **Vercel Cron Job** pode ler a planilha via Google Sheets API a cada 5 minutos e importar linhas novas. Mais simples de manter, porém com latência maior.

---

## FASE 6 — Bugs e Problemas

### CRÍTICO

| ID | Descrição | Arquivo | Impacto |
|---|---|---|---|
| BUG-01 | Diretório `corretores ` tem espaço no nome | `app/corretores /page.tsx` | Pode quebrar em ambientes case-sensitive; URLs geradas podem ter `%20` |

### ALTO

| ID | Descrição | Arquivo | Impacto |
|---|---|---|---|
| BUG-02 | Botões em Server Components sem handler — nunca funcionarão | `leads/page.tsx:31,80` `corretores/page.tsx:33` `equipes/page.tsx:28` | Todos os botões de ação são inoperantes por design |
| BUG-03 | Botões de filtro de ranking em Server Component — filtro nunca aplica | `ranking/page.tsx:21-23` | Usuário clica, nada acontece, parece bug |
| BUG-04 | Aviso de "demonstração visual com dados fictícios" visível ao usuário final | `pipeline/page.tsx:91` | Destrói credibilidade em uma apresentação real |

### MÉDIO

| ID | Descrição | Arquivo | Impacto |
|---|---|---|---|
| BUG-05 | Nomes dos gerentes exibidos como "g1"/"g2" no mock | `equipes/page.tsx:14-17` + `mock-data.ts:15-16` | Dados inconsistentes para demo |
| BUG-06 | `getKPIs()` conta vendas como leads (inflando total) | `supabase-queries.ts:265` | KPI "Leads totais" é incorreto — mostra 21, não 11 |
| BUG-07 | `getFunil()` adiciona count de vendas ao status "fechado" dos leads | `supabase-queries.ts:259` | Duplicação no funil — "Fechado" aparece com 10 a mais |
| BUG-08 | Campo `regiao` sempre vazio no modo Supabase | `supabase-queries.ts:122` | Cards do pipeline sem região quando usando banco real |
| BUG-09 | Campo `captadorNome` sempre vazio no modo Supabase | `supabase-queries.ts:129` | Informação ausente na distribuição |
| BUG-10 | Campo `imovel` sempre vazio nas vendas do Supabase | `supabase-queries.ts:155` | Sem nome do imóvel nas vendas reais |
| BUG-11 | `emPlantao` usa coluna `ativo` como proxy | `supabase-queries.ts:98` | Um corretor desativado aparece como "fora de plantão" — semanticamente errado |
| BUG-12 | Sem RLS ativo no Supabase | `schema.sql` | Chave anon permite SELECT em todas as tabelas sem restrição |

### BAIXO

| ID | Descrição | Arquivo | Impacto |
|---|---|---|---|
| BUG-13 | Export `gerentes` não é usado em nenhuma página | `mock-data.ts:39` | Dead code |
| BUG-14 | Funções `funilPorStatus`, `dashboardKPIs`, `buildRanking`, `proximoPlantao` do mock não são chamadas pelas páginas | `mock-data.ts:102-166` | Dead code — páginas usam versões de `supabase-queries.ts` |
| BUG-15 | `UserRole` exportado mas nunca usado | `lib/types.ts:3` | Dead code |
| BUG-16 | Filtro de período "Junho 2026" hardcoded | `Topbar.tsx:24` | Vai aparecer desatualizado quando mudar o mês |
| BUG-17 | Perfil "João Carvalho / Administrador" hardcoded no rodapé da Sidebar | `Sidebar.tsx:84-89` | Não há autenticação; nome fixo em código |

---

## FASE 7 — Roadmap Técnico

### Prioridade 1 — Itens obrigatórios para demonstração funcional

Estas tarefas transformam o protótipo visual em um MVP demonstrável com dados reais.

| # | Tarefa | Esforço | Observação |
|---|---|---|---|
| P1-1 | Renomear `app/corretores ` para `app/corretores` (remover espaço) | 30min | BUG-01 — correção cirúrgica |
| P1-2 | Remover texto "demonstração visual com dados fictícios" do pipeline | 5min | BUG-04 — impacto na credibilidade |
| P1-3 | Corrigir nomes dos gerentes no mock-data (`"g1"` → `"Roberto Tavares"`) | 10min | BUG-05 |
| P1-4 | Formulário "Cadastrar lead" (modal ou página `/leads/novo`) com Server Action | 4h | Primeiro CRUD real do sistema |
| P1-5 | Ação "Distribuir" — `UPDATE leads SET corretor_id` via Server Action | 2h | Fecha o fluxo de distribuição |
| P1-6 | Filtros de ranking por equipe (searchParam `?equipe=...`) | 2h | BUG-03 — usa lógica já existente |

### Prioridade 2 — Itens necessários para operação real

| # | Tarefa | Esforço | Observação |
|---|---|---|---|
| P2-1 | Autenticação via Supabase Auth (login com email/senha) | 1 dia | Blocker para qualquer deploy real |
| P2-2 | RLS no Supabase (políticas por papel) | 4h | BUG-12 — segurança básica |
| P2-3 | Movimentação de status no Pipeline (botões de avançar) | 1 dia | Pipeline atual é 100% visual |
| P2-4 | API Route pública `POST /api/leads` para ingestão externa | 3h | Habilita Google Forms, Sheets, webhooks |
| P2-5 | Adicionar coluna `regiao` na tabela `leads` do banco | 1h | BUG-08 |
| P2-6 | Integração Google Sheets → Leads (Apps Script + cron) | 1 dia | Canal de captura mais rápido |
| P2-7 | Notificação ao gerente quando lead entra na fila | 4h | Sem isso, gerente não sabe do lead |
| P2-8 | Rotação de plantão automática após distribuição | 2h | Lógica de round-robin real |
| P2-9 | Corrigir BUGs 06, 07, 08, 09, 10, 11 (lógica de KPIs e campos ausentes) | 3h | Dados corretos em produção |

### Prioridade 3 — Melhorias futuras

| # | Tarefa | Observação |
|---|---|---|
| P3-1 | Filtro de período dinâmico no dashboard | Remove o hardcode "Junho 2026" |
| P3-2 | Integração Meta Lead Ads (Facebook/Instagram webhook) | Canal de maior volume para imobiliárias |
| P3-3 | Perfil individual do corretor `/corretores/[id]` | Histórico de leads e vendas por corretor |
| P3-4 | Drag-and-drop no pipeline | Experiência esperada em sistemas modernos |
| P3-5 | Exportação de relatórios (CSV / PDF) | Demanda comum de gerência |
| P3-6 | Histórico de atividades por lead | Auditoria de quem fez o quê |
| P3-7 | App mobile ou PWA | Corretores operam pelo celular |
| P3-8 | Campo `WhatsApp` no enum `LeadSource` | Canal essencial no mercado imobiliário BR |

---

## Arquivos Lidos

| Arquivo | Propósito |
|---|---|
| `app/page.tsx` | Página Dashboard |
| `app/leads/page.tsx` | Página Leads |
| `app/pipeline/page.tsx` | Página Pipeline |
| `app/corretores /page.tsx` | Página Corretores |
| `app/equipes/page.tsx` | Página Equipes |
| `app/ranking/page.tsx` | Página Ranking |
| `app/layout.tsx` | Layout raiz |
| `components/AppShell.tsx` | Shell da aplicação (único Client Component raiz) |
| `components/Sidebar.tsx` | Navegação lateral |
| `components/Topbar.tsx` | Barra superior |
| `components/PageHeader.tsx` | Cabeçalho de página |
| `components/ui/Card.tsx` | Componente Card |
| `components/ui/KpiCard.tsx` | Componente KPI |
| `components/ui/StatusPill.tsx` | Badge de status |
| `components/ui/Avatar.tsx` | Avatar de corretor |
| `lib/supabase.ts` | Cliente Supabase + flag `hasSupabaseEnv` |
| `lib/supabase-queries.ts` | Camada de dados (dual-mode) |
| `lib/mock-data.ts` | Dados fictícios |
| `lib/types.ts` | Tipos do domínio |
| `lib/format.ts` | Formatadores pt-BR |
| `supabase/schema.sql` | Schema completo do banco |
| `tailwind.config.ts` | Design tokens |
| `app/globals.css` | CSS global |
| `package.json` | Dependências |
| `next.config.mjs` | Configuração Next.js |
| `.env.local.example` | Template de variáveis de ambiente |

---

## Problemas Encontrados (Resumo)

| Severidade | Quantidade | Exemplos-chave |
|---|---|---|
| CRÍTICO | 1 | Espaço no nome do diretório `corretores ` |
| ALTO | 4 | Botões em Server Components sem handler; texto "demonstração visual" exposto |
| MÉDIO | 7 | KPIs incorretos; nomes de gerentes quebrados; campos ausentes no banco |
| BAIXO | 5 | Dead code; hardcodes visuais; semântica de plantão incorreta |
| **Total** | **17** | |

---

## Correções Recomendadas (em ordem de impacto)

1. **BUG-01** — Renomear diretório `corretores ` → `corretores`
2. **BUG-04** — Remover texto "demonstração visual" do pipeline  
3. **BUG-05** — Corrigir nomes dos gerentes no mock
4. **BUG-06 + BUG-07** — Refatorar `getKPIs()` e `getFunil()` para não duplicar contagem
5. **P1-4** — Implementar formulário "Cadastrar lead" (ação mais pedida por qualquer imobiliária)
6. **P1-5** — Implementar ação "Distribuir" (fecha o fluxo essencial do produto)

---

## Primeira Tarefa a Executar

**BUG-01: Renomear `app/corretores ` para `app/corretores`**

É a correção de menor esforço (1 comando git) com o maior risco potencial. Um diretório com espaço no nome é uma vulnerabilidade silenciosa que pode causar falha de build em qualquer mudança futura de ambiente.

Após isso: **P1-4 (formulário de cadastro de lead)** — porque sem ele o sistema é 100% read-only e não serve para operação real.

---

*Auditoria concluída. Aguardando aprovação da Fase 1.*
