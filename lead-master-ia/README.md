# Lead Master IA

Plataforma web de gestão de leads, pipeline e ranking VGV para imobiliárias.
**Versão V1 — protótipo navegável com dados fictícios (sem banco de dados).**

## Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- Fontes: Space Grotesk (display) + Inter (corpo) via `next/font`
- Sem dependências de UI externas — ícones são SVG inline

## Como rodar

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Telas

| Rota | Tela | Descrição |
|------|------|-----------|
| `/` | Dashboard | KPIs, pódio VGV, funil de pipeline e leads recentes |
| `/leads` | Leads | Fila de distribuição por equipe + tabela completa |
| `/pipeline` | Pipeline | Kanban por etapa (novo → fechado) |
| `/corretores` | Corretores | Cards com VGV, vendas e status de plantão |
| `/equipes` | Equipes | Duas equipes, gerente e ordem de plantão |
| `/ranking` | Ranking VGV | Pódio + classificação completa |

## Regras refletidas na V1

- Ranking VGV considera **apenas vendas fechadas** (locação não entra).
- O captador cadastra o lead **já escolhendo a equipe de destino**.
- A fila de distribuição é **por equipe**; o gerente distribui ao corretor de plantão.
- Layout **responsivo** — sidebar vira drawer no mobile.

## Estrutura

```
app/
  layout.tsx        layout raiz (fontes + shell)
  globals.css       base e tokens CSS
  page.tsx          Dashboard
  leads/            Leads
  pipeline/         Pipeline
  corretores/       Corretores
  equipes/          Equipes
  ranking/          Ranking VGV
components/
  AppShell.tsx      shell client (drawer mobile)
  Sidebar.tsx       navegação lateral
  Topbar.tsx        barra superior
  PageHeader.tsx    cabeçalho de página
  ui/               Card, KpiCard, StatusPill, Avatar
lib/
  types.ts          tipos do domínio
  mock-data.ts      dados fictícios + funções derivadas (ranking, funil, KPIs)
  format.ts         formatadores pt-BR
```

## Próximos passos (fora da V1)

Integração com Supabase (Postgres + Auth + RLS), autenticação por perfil,
integração com Meta Lead Ads, distribuição automática e recursos de IA.
