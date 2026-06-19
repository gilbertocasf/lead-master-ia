# Lead Master IA

Distribuidor inteligente de leads para imobiliárias com múltiplas equipes.

O produto resolve um problema operacional real: leads que chegam via Meta Ads, WhatsApp ou indicação precisam ser roteados para a equipe certa e distribuídos automaticamente para o corretor de plantão — sem o gestor tocar em nada. Planilhas e grupos de WhatsApp não fazem isso. CRMs genéricos (RD Station, Pipedrive) não têm o conceito de fila de plantão com múltiplas equipes.

---

## Stack

- **Next.js 14** (App Router, Server Components)
- **TypeScript**
- **Tailwind CSS** — tema dark customizado, sem dependência de UI externa
- **Supabase** (Postgres + Auth + RLS)
- **Vercel** (deploy)

---

## Status atual

- App publicado na Vercel e conectado ao Supabase
- Leitura real de dados funcionando (Supabase conectado)
- Operações de escrita ainda não implementadas (formulário de lead, distribuição, pipeline drag-and-drop)
- A UI reflete os dados reais do banco, mas ações de mutação são visuais

---

## Funcionalidades implementadas

| Tela | Funcionalidade | Estado |
|------|---------------|--------|
| `/` | Dashboard com KPIs, funil, pódio VGV | Leitura real |
| `/leads` | Fila de distribuição por equipe + tabela | Leitura real |
| `/pipeline` | Kanban por status do pipeline | Visual — sem drag-and-drop |
| `/corretores` | Cards com VGV, vendas e status de plantão | Leitura real |
| `/equipes` | Equipes, gerentes e ordem de plantão | Leitura real |
| `/ranking` | Ranking VGV com pódio e tabela completa | Leitura real |

## Limitações atuais

| Funcionalidade | Estado |
|---------------|--------|
| Cadastrar lead | Botão existe — sem formulário implementado |
| Distribuir lead para corretor | Botão existe — sem ação implementada |
| Mover lead no pipeline | Visual — sem escrita no banco |
| Registrar venda | Sem implementação |
| Filtros do ranking por equipe | Botões sem `onClick` |
| Status de plantão editável | Sem UI de edição |
| Adicionar corretor / nova equipe | Botões sem ação |

---

## Próximo marco — Captura e distribuição funcional

O objetivo imediato é fechar o loop operacional mínimo:

1. Lead entra (formulário manual ou webhook)
2. Sistema roteia para a equipe
3. Sistema distribui para o corretor de plantão
4. Lead aparece no pipeline

Sem esse loop, o produto é um painel de leitura, não uma ferramenta operacional.

---

## Como rodar localmente

```bash
npm install
npm run dev
```

Acesse http://localhost:3000

### Modos de operação

| Modo | Como ativar | Fonte dos dados |
|------|-------------|----------------|
| Mock (padrão) | Sem `.env.local` | `lib/mock-data.ts` — dados fictícios |
| Supabase | Com `.env.local` preenchido | Banco real |

### Variáveis de ambiente

Crie `.env.local` na raiz com:

```
NEXT_PUBLIC_SUPABASE_URL=sua_url_aqui
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_aqui
```

**Nunca versionar `.env.local`.** Está no `.gitignore`. Para produção, configure as mesmas variáveis no painel da Vercel.

---

## Estrutura do projeto

```
app/
  layout.tsx          layout raiz (fontes + shell)
  globals.css         base e tokens CSS
  page.tsx            Dashboard
  leads/              Fila de leads e tabela
  pipeline/           Kanban por status
  corretores/         Cards de corretores
  equipes/            Equipes e plantão
  ranking/            Ranking VGV
components/
  AppShell.tsx        shell client (drawer mobile)
  Sidebar.tsx         navegação lateral
  Topbar.tsx          barra superior
  PageHeader.tsx      cabeçalho de página
  ui/                 Card, KpiCard, StatusPill, Avatar
lib/
  types.ts            tipos do domínio
  mock-data.ts        dados fictícios + funções derivadas
  supabase.ts         cliente Supabase (criado uma vez)
  supabase-queries.ts camada de acesso a dados (dual-mode)
  format.ts           formatadores pt-BR
supabase/
  schema.sql          schema completo do banco
```

---

## Roadmap

| Fase | Objetivo |
|------|----------|
| 4 — Planejamento técnico | Definir schema delta, contrato da API, estrutura dos componentes |
| 5 — Schema mínimo | Aplicar alterações de banco aprovadas (histórico, campos de roteamento) |
| 6 — Entrada de leads | Formulário manual + webhook `POST /api/leads` com deduplicação por telefone |
| 7 — Distribuição automática | Round-robin com fairness; botão "Distribuir" com escrita real |
| 8 — Pipeline funcional | Mover lead entre status com registro de histórico e SLA visual |
| 9 — Validação comercial | Demo end-to-end com dados reais: lead entra, é distribuído, aparece no pipeline |
