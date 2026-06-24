# HANDOFF — Lead Master IA
**Gerado em:** 2026-06-24  
**Propósito:** Documento mestre de continuidade. Permite retomar o projeto em qualquer novo chat sem perda relevante de contexto.  
**Versão atual:** v1-demo-operacional (tag criada e enviada ao GitHub em 2026-06-24)

---

## DECISÃO ESTRATÉGICA VIGENTE — 2026-06-24

> **O maior risco atual do projeto não é técnico. É comercial.**

A pergunta central ainda sem resposta é:

> **"Imobiliárias pagarão pelo Lead Master IA em sua forma atual?"**

Por isso, a prioridade da Fase 10 é exclusivamente:

1. Demonstrar o produto para prospects reais
2. Conversar e coletar objeções
3. Validar interesse real
4. Validar disposição de pagamento
5. Somente após validação comercial priorizar integrações grandes

### O que foi conscientemente adiado (não descartado)

| Integração/Feature | Status | Quando priorizar |
|--------------------|--------|-----------------|
| Meta Lead Ads | Adiado | Quando prospect real exigir como critério de adoção |
| Instagram Lead Ads | Adiado | Idem |
| WhatsApp (notificações) | Adiado | Idem |
| Multi-tenant | Adiado | Idem |
| IA de scoring | Adiado | Idem |
| Grandes integrações em geral | Adiado | Idem |

Todas são **tecnicamente possíveis hoje** (Meta Ads e Instagram via webhook HTTP, multi-tenant via `imobiliaria_id` já no schema). Foram adiadas porque construir antes de validar demanda é desperdício de capital e atenção.

---

## ÍNDICE RÁPIDO

1. [Visão geral do produto](#1-visão-geral-do-produto)
2. [Problema que resolve](#2-problema-que-resolve)
3. [O que o produto NÃO é](#3-o-que-o-produto-não-é)
4. [Diferencial principal](#4-diferencial-principal)
5. [Stack técnica completa](#5-stack-técnica-completa)
6. [Estrutura atual do projeto](#6-estrutura-atual-do-projeto)
7. [Estado Git atual](#7-estado-git-atual)
8. [Estado da produção](#8-estado-da-produção)
9. [Estado do banco Supabase](#9-estado-do-banco-supabase)
10. [Status das fases 1–10](#10-status-das-fases-110)
11. [Marco v1-demo-operacional](#11-marco-v1-demo-operacional)
12. [Fluxo operacional validado](#12-fluxo-operacional-validado)
13. [Dados usados na validação](#13-dados-usados-na-validação)
14. [Decisões arquiteturais importantes](#14-decisões-arquiteturais-importantes)
15. [Decisões comerciais importantes](#15-decisões-comerciais-importantes)
16. [Decisões rejeitadas](#16-decisões-rejeitadas)
17. [Funcionalidades adiadas](#17-funcionalidades-adiadas)
18. [Pendências conhecidas](#18-pendências-conhecidas)
19. [Estado da performance](#19-estado-da-performance)
20. [Histórico resumido do projeto](#20-histórico-resumido-do-projeto)
21. [Erros já cometidos e lições aprendidas](#21-erros-já-cometidos-e-lições-aprendidas)
22. [O que é fato confirmado](#22-o-que-é-fato-confirmado)
23. [O que ainda é hipótese](#23-o-que-ainda-é-hipótese)
24. [Estado comercial real do produto](#24-estado-comercial-real-do-produto)
25. [Próxima pergunta que o projeto precisa responder](#25-próxima-pergunta-que-o-projeto-precisa-responder)
26. [Roadmap atual](#26-roadmap-atual)
27. [Próximas prioridades recomendadas](#27-próximas-prioridades-recomendadas)
28. [O que NÃO construir agora](#28-o-que-não-construir-agora)
29. [Critérios para aceitar novas funcionalidades](#29-critérios-para-aceitar-novas-funcionalidades)
30. [Regras de trabalho com Claude Code](#30-regras-de-trabalho-com-claude-code)
31. [Regras de segurança](#31-regras-de-segurança)
32. [Comandos perigosos](#32-comandos-perigosos)
33. [Como continuar o projeto em outro chat](#33-como-continuar-o-projeto-em-outro-chat)
34. [Como usar este documento](#34-como-usar-este-documento)
35. [Últimos commits relevantes](#35-últimos-commits-relevantes)
36. [Tag criada](#36-tag-criada)
37. [Estado atual da Fase 10](#37-estado-atual-da-fase-10)

---

## 1. Visão geral do produto

**Lead Master IA** é um distribuidor inteligente de leads para imobiliárias com múltiplas equipes.

O produto é uma aplicação web (Next.js 14 + Supabase) que recebe leads via formulário manual ou webhook HTTP, roteia automaticamente para a equipe correta e distribui para o corretor de plantão com menor tempo desde o último recebimento (round-robin com fairness). Todo evento é registrado em `historico_leads`. O gestor não precisa intervir no fluxo normal.

O produto está publicado na Vercel, conectado ao Supabase em produção, com dados reais da **BASILIO IMOVEIS** (cliente demo). A tag `v1-demo-operacional` marca o ponto em que o loop operacional mínimo foi validado end-to-end em produção.

---

## 2. Problema que resolve

Imobiliárias com 2+ equipes e múltiplos corretores recebem leads de várias fontes (Meta Ads, WhatsApp, indicação, portais). O fluxo atual é: lead chega → gestor para o que está fazendo → distribui manualmente pelo WhatsApp → corretor que deveria receber talvez já tenha recebido três leads esse dia.

Problemas concretos:
- **Lentidão no primeiro contato:** sem sistema, o lead pode esperar horas até o gestor ver e distribuir. O SLA ideal é 30 minutos.
- **Injustiça na distribuição:** sem rodízio automático, os mesmos corretores favoritos recebem mais leads.
- **Falta de rastreabilidade:** nenhum registro de quem recebeu o que, quando, e o que aconteceu depois.
- **Dependência do gestor:** o gestor vira gargalo operacional em vez de gerir a equipe.

Planilhas e grupos de WhatsApp não resolvem esses problemas. CRMs genéricos (RD Station, Pipedrive) não têm o conceito de fila de plantão com múltiplas equipes.

---

## 3. O que o produto NÃO é

- **Não é um CRM genérico.** Não gerencia contratos, documentos, visitas físicas, financiamento.
- **Não é multi-tenant no MVP.** Uma imobiliária por instância. Múltiplas imobiliárias no mesmo banco não estão implementadas.
- **Não tem WhatsApp nativo.** Notificações via WhatsApp para corretores não existem. Estão no roadmap V2, conscientemente adiadas.
- **Não tem integração nativa com Meta Ads (via UI).** A integração é possível via webhook HTTP, mas não há configuração via interface. Adiada até validação comercial.
- **Não tem IA de scoring.** Não há nenhum modelo de ML aplicado. O nome "IA" refere-se ao posicionamento do produto, não a uma funcionalidade de inteligência artificial presente.
- **Não tem drag-and-drop no pipeline.** O kanban usa dropdown de status.
- **Não tem login por papel para corretores.** Apenas o admin/gestor acessa o sistema hoje.

---

## 4. Diferencial principal

**Fila de plantão com distribuição automática por equipe.**

Nenhum CRM genérico tem isso. O lead entra (formulário ou webhook) → sistema roteia para a equipe correta → distribui para o corretor de plantão com maior tempo sem receber lead → registra tudo em `historico_leads`. Sem o gestor tocar em nada.

A lógica de distribuição usa:
```sql
SELECT id FROM corretores
WHERE equipe_id = $equipe_id
  AND em_plantao = true
  AND ativo = true
ORDER BY
  COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC,
  ordem_plantao ASC
LIMIT 1;
```

Esse algoritmo garante fairness: o corretor que há mais tempo não recebe lead tem prioridade. É a mesma lógica de fila justa usada em call centers profissionais, implementada de forma simples e auditável em SQL.

---

## 5. Stack técnica completa

| Camada | Tecnologia | Observação |
|--------|-----------|-----------|
| Frontend | Next.js 14 (App Router) | Server Components por padrão |
| Linguagem | TypeScript | Strict mode |
| Estilo | Tailwind CSS | Tema dark customizado; zero dependência de UI externa |
| Ícones | SVG inline | Nenhuma biblioteca de ícones instalada |
| Backend | Next.js API Routes + Server Actions | `app/api/` para mutações via HTTP; `app/login/actions.ts` para auth |
| Banco | Supabase (PostgreSQL) | RLS habilitado em 7 tabelas |
| Auth | Supabase Auth (SSR) | `@supabase/ssr` — cookies HttpOnly |
| Deploy | Vercel | Branch `main` → produção automática |
| ORM | Nenhum | SQL via Supabase JS Client |

### Clientes Supabase (três arquivos distintos)

| Arquivo | Tipo | Uso |
|---------|------|-----|
| `lib/supabase-browser.ts` | `createBrowserClient` | Client Components |
| `lib/supabase-server.ts` | `createServerClient` com cookies | Server Components, Server Actions, API Routes |
| `lib/supabase-admin.ts` | `createClient` com service_role | API Routes que precisam contornar RLS |

### Variáveis de ambiente

| Variável | Visibilidade | Obrigatório |
|----------|-------------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública (browser) | Para sair do mock mode |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Pública (browser) | Para sair do mock mode |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only (sem NEXT_PUBLIC_) | Para API routes de escrita |

**Nunca versionar `.env.local`.** Está no `.gitignore`. Em produção, configurar no painel da Vercel.

### Modo de operação dual

O app detecta automaticamente o modo baseado na presença das env vars:

- **Mock mode** (sem `.env.local`): todos os dados vêm de `lib/mock-data.ts`. Zero chamadas de rede. Auth middleware bypassa toda proteção. Útil para desenvolvimento sem banco.
- **Supabase mode** (com `.env.local`): todos os dados vêm do banco real. RLS ativo. Auth obrigatório. É o modo de produção.

O flag `hasSupabaseEnv` (exportado de `lib/supabase.ts`) controla qual modo está ativo.

---

## 6. Estrutura atual do projeto

```
middleware.ts              proteção de rotas — redireciona para /login sem sessão
app/
  layout.tsx               layout raiz (fontes, sem shell)
  globals.css              base e tokens CSS
  (app)/                   route group — rotas protegidas (com AppShell)
    layout.tsx             shell: AppShell → Sidebar + Topbar + <main>
    loading.tsx            skeleton global para navegação (Fase 10)
    page.tsx               Dashboard — KPIs, funil, pódio VGV, últimos leads
    leads/page.tsx         Fila de distribuição por equipe + tabela completa
    pipeline/page.tsx      Kanban por status + SLA badge
    corretores/page.tsx    Cards de corretores com VGV e plantão
    equipes/page.tsx       Equipes, gerentes, ordem de plantão
    ranking/page.tsx       Ranking VGV com pódio e tabela
  login/
    page.tsx               formulário de login (rota pública)
    actions.ts             Server Actions: login(), logout()
  api/
    leads/route.ts         POST /api/leads — criação + distribuição
    leads/[id]/
      status/route.ts      PATCH /api/leads/[id]/status — alterar status
components/
  AppShell.tsx             shell client (drawer mobile) — "use client"
  Sidebar.tsx              navegação lateral — "use client" (usePathname)
  Topbar.tsx               barra superior
  PageHeader.tsx           cabeçalho de página
  NovoLeadModal.tsx        formulário modal de cadastro de lead — "use client"
  ui/
    Card.tsx               card base
    KpiCard.tsx            card de KPI
    StatusPill.tsx         pílula de status
    Avatar.tsx             avatar de corretor
  pipeline/
    StatusDropdown.tsx     dropdown de mudança de status — "use client"
    PipelineSlaBadge.tsx   badge visual de SLA (verde/amarelo/vermelho)
lib/
  types.ts                 tipos do domínio
  mock-data.ts             dados fictícios + funções derivadas
  supabase.ts              flag hasSupabaseEnv (sem client)
  supabase-browser.ts      createBrowserClient
  supabase-server.ts       createServerClient com cookies
  supabase-admin.ts        createClient service_role (server-only)
  supabase-queries.ts      camada de acesso a dados (dual-mode)
  auth.ts                  getCurrentUser, getCurrentProfile, requireAuth, requireRole
  format.ts                formatadores pt-BR
supabase/
  schema.sql               schema original (referência — não reaplicar)
  schema.v2.sql            PERIGO: começa com DROP TABLE — nunca aplicar em banco com dados
  migrations/
    001_base_fields.sql    campos base (incorporados na 002)
    002_security_rls_multitenancy.sql   migration aplicada no banco real
    003_rpc_criar_distribuir_lead.sql   RPC atômica criação + distribuição
    004_rpc_alterar_status_lead.sql     RPC atômica alteração de status + histórico
docs/
  HANDOFF-PROJETO.md       este arquivo
  DECISOES-ARQUITETURA.md  decisões aprovadas — não reabrir sem evidência nova
  PROXIMAS-FASES.md        roadmap detalhado por fase
  roteiro-demo.md          script completo de demo comercial (10 min)
  auditorias/              análises técnicas das fases 1–9
  respostas/               respostas detalhadas a perguntas específicas
  planejamento/            planejamentos de mini-fases
  planos/                  planos de implementação de fases
  skills/                  guias de segurança LGPD + RLS
  setup/                   instruções de setup (primeiro admin, etc)
scripts/                   scripts auxiliares
```

### Design tokens

Tema dark ("sala de operação"):
- `base-*` — backgrounds (raised, surface, border)
- `ink-*` — texto (primary, secondary, tertiary)
- `action` — azul `#3B82F6` para interativos
- `gold` — `#D4A636` para ranking/VGV
- `win`/`loss`/`warn` — estados semânticos
- `.tnum` — classe utilitária para valores numéricos em tabelas e KPIs

### Formatação (`lib/format.ts`)

Locale pt-BR. Funções principais:
- `formatBRLCompact` — "R$ 1,2 mi"
- `formatPercent` — "12,5%"
- `timeAgo` — timestamps relativos

---

## 7. Estado Git atual

**Branch:** `main`  
**Tag:** `v1-demo-operacional` (criada e enviada ao GitHub em 2026-06-24)  
**Repositório:** `github.com/gilbertocasf/lead-master-ia`  
**Deploy:** Vercel conectado à branch `main` — qualquer push à main aciona deploy automático

### Commits recentes (ordem cronológica reversa)

```
3991523  perf: adiciona skeleton global do app
7a72592  perf: adiciona loading global para navegacao
faa63dc  docs: revisa roteiro comercial da demo
165f0ee  docs: atualiza roadmap apos validacao fase 9
0031e41  docs: validacao final fase 9
b53a672  docs: organize project documentation
c16bd7e  fix: allow server actions in codespaces dev
171b3f8  fix(ui): acabamento pre-demo e filtros ranking
761e343  feat(pipeline): adicionar SLA visual e concluir fase 8
b467d52  feat(pipeline): alterar status com historico - fase 8
6ff67e7  docs: encerramento formal da fase 7
674e05e  feat(leads): captura e distribuicao automatica - fase 7
9db9b58  chore: trigger deploy
efdd768  feat(auth): implementar autenticação SSR e proteção por RLS - Fase 6.1
32c3a85  feat(security): harden schema with rls and multitenancy
75dcd02  feat(schema): fase 5 schema minimo para captura e distribuicao
```

---

## 8. Estado da produção

| Item | Estado |
|------|--------|
| URL | Vercel — deploy automático da `main` |
| Dados | Supabase real (`gpcntrukhttkviecrjee.supabase.co`) |
| Auth | Supabase Auth SSR — sessão expira em ~1 hora |
| Modo | Supabase mode (`NEXT_PUBLIC_SUPABASE_URL` configurado na Vercel) |
| Build | `npm run build` → 11/11 páginas geradas sem erro (validado em `b53a672`) |
| Deploy | Contínuo — push para `main` aciona novo deploy |
| Último deploy funcional | Commit `3991523` (skeleton de loading) |

### Checklist antes de qualquer demo

Executar no mínimo 5 minutos antes da reunião:
- [ ] Fazer login no app em produção (sessão expira em 1 hora — fazer login fresco)
- [ ] Confirmar que a URL é Vercel, não localhost
- [ ] Abrir `/leads` — verificar que a tabela tem leads no pipeline e a fila está limpa
- [ ] Abrir `/pipeline` — verificar que há leads em pelo menos 3 colunas diferentes
- [ ] Abrir `/ranking` — verificar que há corretores com VGV > 0
- [ ] Testar o modal "Novo lead" uma vez antes
- [ ] Confirmar que o último deploy da Vercel está na branch `main`

---

## 9. Estado do banco Supabase

**Projeto:** `gpcntrukhttkviecrjee.supabase.co`  
**Dados:** BASILIO IMOVEIS (dados de demo inseridos em 2026-06-24)

### Migrations aplicadas

| Migration | Conteúdo | Status |
|-----------|---------|--------|
| 002 | RLS em 7 tabelas, 14 policies, 3 funções SECURITY DEFINER, multi-tenancy por `imobiliaria_id` | ✓ Aplicada e confirmada |
| 003 | RPC `criar_e_distribuir_lead` — criação atômica + distribuição round-robin | ✓ Aplicada — validada na Fase 7 |
| 004 | RPC `alterar_status_lead` — mudança de status + registro em `historico_leads` | ✓ Aplicada — validada na Fase 8 |

**Nota sobre migration 001:** foi incorporada integralmente na 002. Pode ser desconsiderada.

### Estrutura de tabelas

| Tabela | Descrição |
|--------|-----------|
| `imobiliarias` | Entidade raiz do tenant. 1 linha (BASILIO IMOVEIS) |
| `usuarios` | Usuários autenticados com role (admin/gestor/corretor) |
| `equipes` | Grupos de corretores. 2 linhas (Genesis, Arkanjos) |
| `corretores` | Corretores vinculados a equipes. 26 linhas reais |
| `leads` | Leads com status, corretor_id, equipe_id, historico. 14 linhas |
| `vendas` | Vendas fechadas para ranking VGV. 10 linhas |
| `historico_leads` | Log imutável de eventos por lead |

### Estado dos dados pós-Fase 9

| Tabela | Qtd | Detalhe |
|--------|-----|---------|
| `imobiliarias` | 1 | BASILIO IMOVEIS |
| `equipes` | 2 | Genesis (gerente: Euler) · Arkanjos (gerente: Mateus) |
| `corretores` | 26 | Corretores reais Basílio — 7 Genesis em plantão, 6 Arkanjos em plantão |
| `leads` | 14 | 5 novos (fila) · 2 em_contato · 2 visita · 2 proposta · 1 fechado · 1 perdido + leads criados nas demos |
| `vendas` | 10 | Para ranking VGV. Top: Victor Barbosa R$2,45mi (Arkanjos) |
| `historico_leads` | Variável | Eventos criados pelas RPCs |

### RLS — matriz de acesso

| Tabela | anon | corretor | gestor | admin | service_role |
|--------|------|----------|--------|-------|-------------|
| `imobiliarias` | — | SELECT própria | SELECT própria | SELECT própria | tudo |
| `usuarios` | — | SELECT todos da imob. | SELECT todos | SELECT todos | tudo |
| `equipes` | — | SELECT todas | SELECT+INSERT+UPDATE | idem | tudo |
| `corretores` | — | SELECT **só o próprio** | SELECT todos+INSERT+UPDATE | idem | tudo |
| `leads` | — | SELECT **só os próprios** | SELECT todos+UPDATE | idem | tudo |
| `historico_leads` | — | SELECT **só dos próprios leads** | SELECT todos | idem | tudo |
| `vendas` | — | SELECT **só as próprias** | SELECT todas | idem | tudo |

(`—` = zero acesso, default deny)

### RPCs críticas (sem elas o app não funciona em produção)

**`criar_e_distribuir_lead`** (migration 003):
- Advisory lock por telefone para serializar race conditions
- Deduplicação por `telefone_normalizado` com janela de 24h
- Roteamento: usa `equipe_id` do payload ou rodízio por `ultimo_lead_recebido_em`
- Distribuição: round-robin com fairness (`COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC`)
- Registra `lead_criado` e `lead_distribuido` em `historico_leads`
- Retorna `{ status: 'criado' | 'duplicata', lead_id, corretor_id }`

**`alterar_status_lead`** (migration 004):
- `SELECT ... FOR UPDATE` para evitar race condition
- Valida permissão por role (corretor só altera seus próprios leads)
- Registra `status_alterado` em `historico_leads`
- Retorna o lead atualizado

---

## 10. Status das fases 1–10

| Fase | Descrição | Status | Data |
|------|-----------|--------|------|
| 1–3 | Auditorias estratégicas: identidade do produto, problema, diferencial | ✓ Concluída | 2026-06-19 |
| 3.1-B | Revisão de arquitetura de distribuição | ✓ Concluída | 2026-06-19 |
| 3.1-C | Regras de roteamento MVP | ✓ Concluída | 2026-06-19 |
| 3.1-D | Jornada real do lead — 7 origens mapeadas | ✓ Concluída | 2026-06-19 |
| 3.95 | Skill operacional do Claude Code | ✓ Concluída | 2026-06-19 |
| 4 | Planejamento técnico da captura e distribuição | ✓ Concluída | 2026-06-19 |
| 5 | Schema mínimo: `em_plantao`, `historico_leads`, campos de roteamento | ✓ Concluída | 2026-06-19 |
| 5-R / 5-R.2 | Hardening de RLS: RESTRICT FKs, policies por role, LGPD | ✓ Concluída | 2026-06-19 |
| 6.1 | Autenticação SSR: login/logout, middleware, route groups | ✓ Concluída | 2026-06-20 |
| 6.2 | Entrada de leads: `NovoLeadModal` + `POST /api/leads` | ✓ Concluída | 2026-06-22 |
| 7 | Distribuição automática: RPC 003, round-robin, deduplicação | ✓ Concluída | 2026-06-22 |
| 8 | Pipeline funcional: `StatusDropdown` + RPC 004 + SLA badge | ✓ Concluída | 2026-06-22 |
| 9 | Validação end-to-end em produção com dados Basílio | ✓ Concluída | 2026-06-24 |
| **10** | **Preparação comercial da demo real** | **→ Em andamento** | 2026-06-24 |

---

## 11. Marco v1-demo-operacional

**Tag criada:** `v1-demo-operacional`  
**Data:** 2026-06-24  
**Commit base:** `3991523`

Este marco representa:
- O produto operando end-to-end em produção (Vercel + Supabase real)
- Dados reais da BASILIO IMOVEIS carregados
- Fluxo completo validado sem erros: lead entra → distribuído → pipeline → histórico
- Nenhuma intervenção manual do gestor necessária no fluxo principal

É o ponto de inflexão do produto: passou de painel de leitura a ferramenta operacional.

---

## 12. Fluxo operacional validado

O fluxo foi executado e validado na Fase 9 com dados reais em produção:

```
1. Usuário abre /leads
   └─ Fila limpa — leads Basílio pré-carregados visíveis na tabela

2. Clica em "Novo lead" → preenche formulário
   ├─ Campos obrigatórios: nome, telefone, origem, equipe
   └─ Clica "Cadastrar lead"

3. [SISTEMA DISTRIBUI AUTOMATICAMENTE — sem clique adicional]
   ├─ POST /api/leads → valida payload → chama RPC criar_e_distribuir_lead
   ├─ RPC seleciona corretor: em_plantao=true, ativo=true, ORDER BY ultimo_lead_recebido_em ASC
   ├─ Lead gravado com corretor_id + distribuido_em preenchidos
   └─ historico_leads registra lead_criado + lead_distribuido

4. Usuário abre /pipeline
   └─ Lead aparece na coluna "Novo" com:
       • Nome do lead
       • Nome do corretor atribuído automaticamente
       • Badge SLA verde (recém chegado — < 30 min)

5. Usuário abre dropdown de status → seleciona "Em contato"
   ├─ PATCH /api/leads/[id]/status → chama RPC alterar_status_lead
   ├─ Status atualizado no banco
   └─ historico_leads registra status_alterado

6. Usuário abre /leads
   └─ Lead aparece na tabela com status "Em contato" e corretor atribuído
```

### Critérios de aceitação validados na Fase 9

| # | Critério | Resultado |
|---|---------|-----------|
| C1 | Lead criado via formulário em produção (Vercel) | ✓ |
| C2 | Lead distribuído automaticamente para corretor | ✓ |
| C3 | Lead aparece no pipeline com badge SLA verde | ✓ |
| C4 | Status alterado para "Em contato" via dropdown | ✓ |
| C5 | Eventos registrados em `historico_leads` | ✓ |
| C6 | Nenhum erro 4xx/5xx durante o fluxo | ✓ |
| C7 | Demo executada em produção (não local) | ✓ |

---

## 13. Dados usados na validação

Os dados de demo foram inseridos via SQL direto no Supabase Dashboard (documento: `docs/respostas/sql-final-demo-basilio-imoveis.md`).

**UUIDs da imobiliária e equipes foram preservados** em relação ao seed original — RLS e FKs continuam intactos.

### Dados de validação do round-robin (Fase 7)

| Lead de teste | Corretor atribuído | Critério |
|--------------|-------------------|---------|
| TESTE-RR-001 | Beatriz Lima | `ultimo_lead_recebido_em` mais antigo |
| TESTE-RR-002 | Diego Farias | próximo na fila |
| TESTE-RR-003 | Camila Souza | próximo na fila |

Esses leads de teste foram removidos antes da Fase 9 para limpar a base.

### Composição atual dos leads (pós-preparação Fase 9)

| Status | Qtd | Observação |
|--------|-----|-----------|
| `novo` (fila) | 5 | Aguardando distribuição manual — fallback operacional |
| `em_contato` | 2 | Distribuídos e em acompanhamento |
| `visita` | 2 | Visita agendada |
| `proposta` | 2 | Proposta enviada |
| `fechado` | 1 | Fernanda Leal — contrato assinado |
| `perdido` | 1 | Adriana Santos — perdido para concorrente |

### Ranking VGV (top 5 pós-preparação)

| Corretor | VGV | Equipe |
|---------|-----|--------|
| Victor Barbosa | R$ 2.450.000 | Arkanjos |
| Kamila Rocha | R$ 1.980.000 | Arkanjos |
| Aline Martins | R$ 1.320.000 | Arkanjos |
| Keila Santos | R$ 1.280.000 | Arkanjos |
| Leandro Costa | R$ 1.150.000 | Genesis |

---

## 14. Decisões arquiteturais importantes

Documento completo: `docs/DECISOES-ARQUITETURA.md`. Não reabrir sem evidência nova concreta.

### Resumo das decisões aprovadas

| # | Decisão | Racional |
|---|---------|---------|
| 1 | Produto é distribuidor, não CRM | Diferencial é a fila de plantão — CRMs genéricos não têm |
| 2 | SLA de 30 minutos para primeiro contato | Qualquer passo manual antes viola o SLA |
| 3 | `origem` obrigatório em todo lead | Sem origem, sem rastreabilidade de canal |
| 4 | Distribuição automática por padrão; manual como fallback | Manual nega o valor do produto |
| 5 | Roteamento: `equipe_id` direto no payload; fallback rodízio entre equipes | Zero tabelas novas no MVP |
| 6 | Distribuição dentro da equipe: round-robin com fairness por `ultimo_lead_recebido_em` | Fairness auditável |
| 7 | `ativo` e `em_plantao` são campos distintos | Corretor pode estar ativo mas de folga |
| 8 | `historico_leads` criada junto com as primeiras escritas | Sem histórico desde o início, não há auditoria |
| 9 | SLA visual faz parte do MVP | Sem visibilidade, gestor não sabe quais leads estão em risco |
| 10 | Deduplicação por telefone com janela de 24h → HTTP 409 | Evita duplicatas por race condition e clique duplo |
| 11 | Google Sheets não é núcleo do MVP | Migração de planilhas é problema separado |
| 12 | Webhook + formulário manual — os dois obrigatórios | Webhook para automação; formulário para leads sem canal digital |
| 13 | Não multi-tenant no MVP | Complexidade não justificada antes de validação comercial |
| 14 | Distribuição automática na criação do lead | Sem corretor disponível: lead fica com `corretor_id = NULL` (fila) |
| 15 | Duplicata: bloquear e informar, sem botão "criar mesmo assim" | UI clara, sem brechas |
| 16 | Webhook sem `equipe_id`: rodízio automático entre equipes | Nenhum lead fica sem destino |

---

## 15. Decisões comerciais importantes

- **Cliente demo é BASILIO IMOVEIS** — dados reais inseridos no banco de produção para uso em apresentações a prospects.
- **Modelo de precificação não definido.** Quando prospects perguntam sobre preço: *"Ainda estamos validando o modelo comercial. A estrutura de custo de infraestrutura é baixa. Vamos agendar uma conversa específica sobre isso?"*
- **Meta Ads é possível via webhook** — não é um clique, mas é configurável. Resposta padrão: *"O Meta Ads pode ser conectado via webhook — o lead que vem do formulário de lead do Meta pode cair aqui automaticamente com uma configuração simples."*
- **WhatsApp está no roadmap V2**, não no MVP. Resposta padrão: *"Ainda não nativamente. WhatsApp como canal de notificação para o corretor é algo que está no roadmap."*
- **Multi-tenant é possível** mas não implementado. Resposta padrão: *"Hoje o sistema opera com uma imobiliária por vez. Suporte a múltiplas imobiliárias está no roadmap."*
- **O roteiro de demo está em `docs/roteiro-demo.md`** — inclui script completo, perguntas frequentes com respostas padrão, checklist pré e pós-demo, e critérios para identificar interesse real.

### Critérios de interesse real do prospect

O prospect demonstrou interesse real se ao menos **dois** ocorrerem:
- Perguntou sobre preço ou modelo comercial
- Pediu para ver histórico de leads ou auditoria
- Perguntou como conectar ao Meta Ads ou CRM atual
- Pediu um teste com os próprios dados
- Mencionou um problema específico que o produto resolve
- Pediu uma segunda reunião com outro decisor presente

---

## 16. Decisões rejeitadas

| Decisão rejeitada | Por quê foi rejeitada |
|------------------|----------------------|
| Distribuição manual como fluxo principal | É exatamente o que o WhatsApp já faz — nega o valor do produto |
| Tabela de configuração de campanhas no MVP | Complexidade sem validação; `equipe_id` direto no payload é suficiente |
| Drag-and-drop no pipeline V1 | Dropdown de status é funcionalmente equivalente para V1; drag-and-drop é UX, não valor |
| Mock como fallback silencioso quando Supabase falha | Ocultava erros reais de configuração/produção; removido explicitamente |
| `schema.v2.sql` — schema com DROP TABLE | Começa com `DROP TABLE ... CASCADE` — apagaria todos os dados. **Nunca aplicar.** |
| Google Sheets como integração do MVP | Migração de planilhas é problema separado; não é o fluxo novo |
| Autenticação por papel para corretores no MVP | Aumenta escopo sem validação de que corretores querem usar o sistema |

---

## 17. Funcionalidades adiadas

### Conscientemente adiadas até validação comercial

| Funcionalidade | Quando | Motivo do adiamento |
|---------------|--------|-------------------|
| **Integração Meta Ads (via UI)** | V2 | Webhook já cobre o caso; UI de configuração exige mais desenvolvimento |
| **Integração Instagram Lead Ads** | V2 | Idem — possível via webhook hoje |
| **Integração nativa via webhook configurável** | V1 pós-MVP | Webhook existe mas sem autenticação (X-API-Key) — risco de segurança |
| **Notificações WhatsApp para corretores** | V2 | Dependência externa (Twilio/Z-API); sem validação de demanda |
| **Multi-tenant (múltiplas imobiliárias)** | V2 | Arquitetura do banco suporta via `imobiliaria_id`, mas a lógica de gestão de tenants não existe |
| **IA de scoring de leads** | Indeterminado | Sem dados históricos suficientes para treinar; posicionamento de produto |
| **Login individual para corretores** | V1 pós-MVP | `usuarios` existe no schema mas sem vínculo com `corretores` implementado |
| **Status de plantão editável na UI** | V1 pós-MVP | Hoje só muda via SQL direto no banco |
| **Motivo de perda obrigatório** | V1 pós-MVP | Mover para `perdido` não exige justificativa ainda |
| **Registro de venda (formulário de fechamento)** | V1 pós-MVP | Sem UI de fechamento — vendas só existem como dados de demo |
| **SLA badge em tempo real** | V1 pós-MVP | Badge estático — requer reload para ver SLA evoluir |
| **Filtros de ranking por equipe funcionais** | V1 pós-MVP | Botões existem mas sem `onClick` |
| **Alertas de inatividade (lead parado > 48h)** | V1 pós-MVP | Requer job de background ou polling |

---

## 18. Pendências conhecidas

Dívida técnica documentada — não são bloqueadores para demo:

| # | Item | Onde | Impacto |
|---|------|------|---------|
| P1 | Botão "Distribuir" na fila de leads sem ação | `app/(app)/leads/page.tsx:74` | Fallback operacional ausente — lead órfão não pode ser redistribuído manualmente |
| P2 | Sidebar exibe "João Carvalho / Administrador" fixo | `components/Sidebar.tsx` | Estético — não afeta funcionalidade |
| P3 | Campo `regiao` vazio nos cards do pipeline | `lib/supabase-queries.ts:133` | Renderiza " • R$ valor" com espaço extra à esquerda |
| P4 | `PipelineSlaBadge` não atualiza em tempo real | `components/pipeline/PipelineSlaBadge.tsx` | Badge estático — requer reload |
| P5 | Filtros de ranking por equipe sem ação | `app/(app)/ranking/page.tsx` | Botões "Genesis" e "Arkanjos" não filtram |
| P6 | Corretores não têm login próprio | — | Apenas admin/gestor acessa o sistema |
| P7 | `telefone_normalizado` NULL em leads inseridos diretamente (sem RPC) | — | Deduplicação não cobre esses casos |
| P8 | Webhook sem autenticação (X-API-Key) | `app/api/leads/route.ts` | Segurança — qualquer pessoa com a URL pode criar leads |
| P9 | Rate limiting ausente no webhook | `app/api/leads/route.ts` | Risco de spam de leads |
| P10 | Middleware `getUser()` em todas as requisições | `middleware.ts` | Adiciona 50–200ms de latência por navegação |

---

## 19. Estado da performance

### Diagnóstico (auditoria `docs/auditorias/performance-navegacao.md`)

**Causa principal:** sem `loading.tsx` → usuário vê tela congelada até queries terminarem.  
**Causa secundária:** 7 queries Supabase por navegação (middleware + layout + fetchTudo) sem cache.

**Por navegação:**
- Middleware: 1 query (`getUser()` valida JWT via rede)
- Layout: 2 queries (`getUser()` + `SELECT usuarios`)
- Página: 4 queries paralelas via `fetchTudo()` (equipes, corretores, leads, vendas)
- **Total: 7 queries** por navegação, em Supabase mode

**Latência real:** 300–800ms por troca de rota (depende de distância Vercel → Supabase).

### O que foi implementado (Fase 10)

`app/(app)/loading.tsx` criado — skeleton global com `animate-pulse` que aparece instantaneamente ao clicar em qualquer item da Sidebar. Não altera o tempo real de carregamento, mas elimina a percepção de congelamento.

### O que ainda está pendente (próximas etapas de performance)

| Etapa | Arquivo | Impacto |
|-------|---------|---------|
| Pending state na Sidebar | `components/Sidebar.tsx` | Link clicado muda visualmente antes da página carregar |
| Cache de equipes e corretores | `lib/supabase-queries.ts` | Elimina 2 das 4 queries em navegações subsequentes |
| Cache do perfil no layout | `lib/auth.ts` | Deduplica `getUser()` entre middleware e layout |
| Queries específicas por página | todas as pages | Remove dados não utilizados por página |

---

## 20. Histórico resumido do projeto

**2026-06-19 — Auditorias estratégicas (Fases 1–3.95)**
- Produto definido como distribuidor, não CRM.
- Jornada real de 7 origens de lead mapeada.
- Arquitetura de distribuição decidida: round-robin com fairness, sem tabelas extras no MVP.
- Schema mínimo planejado.
- Skill operacional do Claude Code criada.

**2026-06-19 — Schema e segurança (Fases 4–5-R.2)**
- Migration 002 aplicada: RLS em 7 tabelas, multi-tenancy, `em_plantao`, `historico_leads`.
- Hardening: `ON DELETE RESTRICT` em FKs de tenant, policies separadas por role, LGPD.
- `schema.v2.sql` criado mas nunca aplicado (começa com DROP TABLE — bloqueado).

**2026-06-20 — Auth SSR (Fase 6.1)**
- Login/logout via Supabase Auth com `@supabase/ssr`.
- Middleware de proteção de rotas.
- Route groups `(app)/` vs `login/`.
- Fallback silencioso para mock removido — erros agora são explícitos.

**2026-06-22 — Captura e distribuição (Fases 6.2–7)**
- `NovoLeadModal` implementado com campos mínimos.
- `POST /api/leads` com validação, deduplicação e chamada à RPC.
- Migration 003 (`criar_e_distribuir_lead`) aplicada e validada com 3 leads de teste.
- Round-robin com fairness confirmado operacional.

**2026-06-22 — Pipeline funcional (Fase 8)**
- `StatusDropdown` implementado no kanban.
- `PATCH /api/leads/[id]/status` com chamada à RPC.
- Migration 004 (`alterar_status_lead`) aplicada.
- `PipelineSlaBadge` (verde/amarelo/vermelho) implementado.
- Correção de Server Actions em ambiente Codespaces.

**2026-06-24 — Validação e demo (Fase 9 + início Fase 10)**
- Base migrada de dados fictícios para BASILIO IMOVEIS (26 corretores reais).
- Seed antigo removido (leads teste, corretores fictícios).
- Demo end-to-end executada em produção sem erros.
- Tag `v1-demo-operacional` criada.
- Roteiro de demo comercial revisado e documentado.
- `loading.tsx` implementado (skeleton de navegação — Fase 10 etapa 1).

---

## 21. Erros já cometidos e lições aprendidas

| Erro | Lição |
|------|-------|
| `schema.v2.sql` criado com `DROP TABLE ... CASCADE` | Nunca criar migrations que começam com DROP sobre banco com dados. O arquivo existe mas **nunca deve ser aplicado**. |
| `Write` para arquivo em diretório com parênteses `(app)` — reportou sucesso mas não gravou | Sempre verificar com `ls` após escrever arquivo em diretório com parênteses no nome. |
| Fallback silencioso mock → Supabase ocultava erros de produção | Erros devem ser explícitos. Se o banco não está disponível, o app deve falhar claramente, não servir dados fake. |
| Tabela de leads chamada `pistas` no código mas `leads` no banco | Constante `TABELA_PISTAS = "leads"` corrigida. Verificar sempre o nome real da tabela antes de implementar queries. |
| Diretório `corretores ` com espaço no final | Bug de infraestrutura corrigido antes de virar problema em produção. Sistemas case-sensitive rejeitam espaços em caminhos. |
| `totalLeads` em `getKPIs()` contava vendas fechadas duas vezes | Venda fechada era contada como lead + como venda — inflava o total. Correção aplicada. |
| Frase "demonstração visual com dados fictícios" visível para o usuário final no pipeline | Texto de desenvolvimento não deve aparecer em produção. Removido antes da demo. |
| `em_plantao = false` para todos os corretores após migration 002 | Migration adicionou a coluna com default `false`. Foi necessário atualizar manualmente via SQL para ativar plantão dos corretores. |
| Deploy Vercel falhando por Root Directory incorreto | Vercel precisava apontar para o diretório raiz correto do projeto. Corrigido no painel da Vercel. |
| Server Actions bloqueadas no ambiente Codespaces | Ambiente Codespaces exige configuração específica para Server Actions — corrigido em `c16bd7e`. |

---

## 22. O que é fato confirmado

- O fluxo completo (lead entra → distribui → pipeline → histórico) funciona em produção com dados reais. Validado na Fase 9 com evidências documentadas.
- As 4 migrations (002, 003, 004) estão aplicadas e operacionais no banco Supabase.
- 26 corretores reais da Basílio Imóveis estão no banco com dados de plantão corretos.
- Round-robin com fairness funciona: testado com TESTE-RR-001, 002, 003 na Fase 7.
- Deduplicação por telefone funciona: testado na Fase 7.
- SLA badge funciona: verde ≤ 30 min, amarelo 30–120 min, vermelho > 120 min.
- Build `npm run build` passa sem erros (11/11 páginas).
- Deploy automático da Vercel para branch `main` está funcional.
- Autenticação SSR funciona: sessão persiste, middleware redireciona corretamente.
- RLS está ativo: `anon` não vê nenhum dado (zero rows confirmado nas queries de validação).

---

## 23. O que ainda é hipótese

- **Interesse comercial real de prospects.** Nenhum prospect pagante confirmado. O produto está pronto para demonstrações, mas o ajuste produto-mercado ainda não foi validado.
- **`em_plantao` dos 26 corretores Basílio está correto.** Foi configurado via SQL direto. Não há UI para verificar ou editar — depende do que foi inserido.
- **SLA badge atualiza visualmente a cada reload.** Não há polling em tempo real — o badge é calculado no render do servidor.
- **Sessão dura 1 hora sem interação.** Supabase Auth tem TTL configurável; o comportamento em demos longas (> 1 hora) não foi testado.
- **Webhook sem `equipe_id` faz rodízio correto em produção.** Testado com `equipe_id` direto; o fallback de rodízio entre equipes não foi testado em produção.
- **Custo de infraestrutura é baixo.** Vercel + Supabase free tier para o volume de dados atual. Custo real com múltiplos tenants não foi calculado.
- **Prospects de imobiliárias vão adotar o produto.** Hipótese central do negócio — não validada.

---

## 24. Estado comercial real do produto

**O produto está operacional, mas sem clientes pagantes.**

| Item | Estado |
|------|--------|
| MVP funcional | ✓ Sim — fluxo completo em produção |
| Dados de demo carregados | ✓ Sim — BASILIO IMOVEIS |
| Prospect piloto | Não confirmado |
| Contrato ou receita | Nenhum |
| Modelo de preço | Não definido |
| Validação produto-mercado | Não realizada — é o objetivo da Fase 10 |

**A Fase 10 é a fase comercial.** O objetivo não é construir novas features — é apresentar o produto a prospects reais e validar se há demanda antes de investir em expansão técnica.

**O risco mais alto agora não é técnico. É comercial.** O produto pode estar tecnicamente perfeito e não encontrar adoção. A Fase 10 responde essa pergunta.

---

## 25. Próxima pergunta que o projeto precisa responder

> **"Existe uma imobiliária disposta a usar o Lead Master IA para gerenciar seus leads reais?"**

Não "existe interesse" — interesse é fácil. A pergunta é: existe comprometimento? Um gestor que:
- Agende uma segunda reunião trazendo outro decisor
- Peça um teste com os próprios dados
- Pergunte sobre preço e modelo comercial

Qualquer feature nova construída antes dessa validação é risco de desperdício. Construir para hipóteses não confirmadas é o erro mais comum em produtos B2B.

---

## 26. Roadmap atual

### Fase 10 — Preparação comercial da demo real (EM ANDAMENTO)

**Critério de conclusão:** gestor consegue apresentar o produto para um prospect novo em 10 minutos sem suporte técnico.

**Escopo da Fase 10:**
- 10.1 — Dados e apresentação: confirmar consistência dos dados Basílio no banco
- 10.2 — Acabamentos visuais críticos: corrigir label de região vazio nos cards do pipeline
- 10.3 — Roteiro de demo documentado (concluído: `docs/roteiro-demo.md`)
- 10.4 — Estabilidade operacional: validar sessão, confirmar deploy na main

**O que NÃO entra na Fase 10:** WhatsApp, Meta Ads nativo, multi-tenant, novas rotas, migrations.

### V1 — CRM operacional (pós-MVP, após validação comercial)

| # | Funcionalidade |
|---|---------------|
| 1 | Botão "Distribuir" com `POST /api/leads/[id]/distribuir` |
| 2 | Motivo de perda obrigatório ao mover para `perdido` |
| 3 | Registro de venda (imóvel, VGV, data) |
| 4 | Status de plantão editável pelo gerente na UI |
| 5 | Login individual para corretores (`usuarios` ↔ `corretores`) |
| 6 | Alertas de inatividade (lead parado > 48h) |
| 7 | SLA badge atualizando em tempo real |
| 8 | Filtros de ranking por equipe funcionais |
| 9 | Webhook com autenticação (X-API-Key no header) |

### V2 — Distribuidor inteligente (pós-V1)

| # | Funcionalidade |
|---|---------------|
| 1 | Roteamento automático por campanha (tabela `config_campanhas`) |
| 2 | Roteamento por empreendimento |
| 3 | Lead scoring com histórico de conversão |
| 4 | Dashboard de conversão por canal de origem |
| 5 | Relatório de SLA por equipe |
| 6 | Notificações via WhatsApp |
| 7 | Integração nativa com Meta Lead Ads |
| 8 | Multi-tenant (múltiplas imobiliárias) |

---

## 27. Próximas prioridades recomendadas

Em ordem de impacto comercial:

1. **Executar a Fase 10** — preparar a demo para prospects reais. O produto está pronto; o roteiro está documentado em `docs/roteiro-demo.md`. O bloqueador agora é humano, não técnico.
2. **Corrigir o label de região vazio** (P3) — espaço extra " • R$ valor" nos cards do pipeline. Pequeno mas visível na demo.
3. **Pending state na Sidebar** — feedback visual ao clicar antes da página carregar (descrito em `docs/auditorias/performance-loading-diagnostico.md`).
4. **Validar sessão Supabase em demos longas** — testar se a sessão expira antes de 60 minutos de uso.

O que NÃO é prioridade agora: nenhuma feature nova da lista V1 ou V2 antes de validação comercial.

---

## 28. O que NÃO construir agora

**O foco atual NÃO é Meta Ads.**  
**O foco atual NÃO é WhatsApp.**  
**O foco atual NÃO é multi-tenant.**  
**O foco atual NÃO é IA de scoring.**  
**O foco atual NÃO é expansão técnica.**

O foco atual é **validação comercial**: apresentar o produto a prospects reais e confirmar se existe demanda. Construir qualquer das features acima antes dessa validação é desperdício de capital e atenção.

### Integrações que estão no roadmap (mas adiadas)

- **Integração Meta Ads é possível.** Qualquer formulário de Lead Ads pode enviar para `POST /api/leads` via Zapier ou Facebook Webhook. Não é um clique, mas é configurável hoje.
- **Integração Instagram Lead Ads é possível.** Mesmo mecanismo — Instagram Lead Ads usa a mesma API do Meta.
- **Integração via webhook genérico é possível.** Qualquer sistema que faça HTTP POST com o payload correto (nome, telefone, origem, equipe_id) cria o lead automaticamente.
- **Essas integrações foram conscientemente adiadas** até que um prospect real exija uma delas como critério de adoção.

---

## 29. Critérios para aceitar novas funcionalidades

Uma nova funcionalidade entra no escopo apenas se **todas** as seguintes condições forem verdadeiras:

1. **Um prospect real pediu.** Não é uma hipótese de que "prospects vão querer". Um humano específico expressou a necessidade.
2. **Não resolve-se com o que já existe.** O webhook atual, o formulário manual e o roteiro de demo não cobrem o caso.
3. **Não aumenta a complexidade de manutenção da demo.** A demo já funciona — adicionar features aumenta superfície de bugs.
4. **É reversível.** Se a feature provar desnecessária, pode ser removida sem quebrar o resto.
5. **É compatível com o schema atual.** Novas colunas ou tabelas requerem migration e aprovação explícita.

**Se uma das condições falhar, a resposta padrão é: documentar no roadmap V1/V2 e não implementar agora.**

---

## 30. Regras de trabalho com Claude Code

Estas regras são obrigatórias. Estão no `CLAUDE.md` e devem ser respeitadas em qualquer sessão.

### Antes de qualquer tarefa de implementação

Invocar a skill operacional:
```
/lead-master-product-architect
```
Ela contém identidade do produto, decisões aprovadas, ordem de prioridade, regras de execução e checklist de início de tarefa.

### Regras de execução

1. **Nunca alterar `schema.sql`** sem confirmação explícita do usuário.
2. **Nunca alterar `package.json`** sem confirmação explícita do usuário.
3. **Nunca fazer deploy ou push** sem confirmação explícita do usuário.
4. **Antes de implementar qualquer funcionalidade**, consultar `docs/DECISOES-ARQUITETURA.md` e as auditorias relevantes.
5. **Antes de sugerir qualquer correção em código**, descrever o que será feito e aguardar autorização.
6. **Toda auditoria ou análise** deve gerar um arquivo `.md` em `docs/`, não apenas texto no chat.
7. **Quando houver código na resposta**, consolidar tudo em um único arquivo completo no final.

### O que não fazer em nenhuma sessão

- Não instalar Playwright MCP.
- Não instalar Supabase MCP (avaliar quando a implementação avançar).
- Não criar novas páginas ou features além das definidas no foco técnico imediato.
- Não refatorar código existente sem autorização.
- Não assumir que qualquer parte do app funciona sem verificar.
- Não reabrir discussões sobre Vercel 404, Root Directory, ou mock-data vs. Supabase — resolvidas.

---

## 31. Regras de segurança

### Banco

- RLS habilitado em 7 tabelas — nunca desabilitar.
- `SUPABASE_SERVICE_ROLE_KEY` é server-only — nunca usar com prefixo `NEXT_PUBLIC_`.
- Funções `SECURITY DEFINER` devem ter `SET search_path = public` explícito.
- `ON DELETE RESTRICT` em FKs para `imobiliarias(id)` — nunca trocar para CASCADE.
- Políticas RLS de UPDATE devem ter `imobiliaria_id` no `WITH CHECK`, não só no `USING`.
- Escrita direta do client em `leads`, `vendas`, `historico_leads` é proibida — sempre via API route + service_role.

### Webhook

- `POST /api/leads` atualmente sem autenticação — risco conhecido (P8). Para V1: adicionar `X-API-Key` no header.
- Sem rate limiting — risco conhecido (P9). Para V1: implementar.

### Autenticação

- `corretor_select_corretor` policy garante que corretor vê apenas o próprio registro — não editar.
- `leads` policy para corretor limita SELECT aos próprios leads — não editar.

### Deploy e Git

- Nunca versionar `.env.local`.
- Nunca commitar com `--no-verify`.
- Nunca force push para `main`.
- Confirmar com o usuário antes de qualquer push.

---

## 32. Comandos perigosos

| Comando | Por que é perigoso | Quando usar |
|---------|-------------------|------------|
| `git push --force` | Sobrescreve histórico remoto — irreversível | Nunca sem confirmação explícita |
| `DROP TABLE` | Apaga dados permanentemente | Nunca em banco de produção |
| Aplicar `supabase/schema.v2.sql` | Começa com `DROP TABLE ... CASCADE` — apaga tudo | Nunca aplicar em banco com dados |
| Aplicar `supabase/schema.sql` diretamente | Schema original sem RLS — sobrescreve as migrations | Apenas em banco vazio de desenvolvimento |
| `DELETE FROM imobiliarias` | Com `RESTRICT`, bloqueia. Com service_role sem RESTRICT, apagaria todos os dados em cascata | Nunca em produção |
| Alterar `package.json` sem confirmação | Pode quebrar o build ou introduzir dependências incompatíveis | Apenas com autorização explícita |
| `npm install <pacote>` novo | Idem | Apenas com autorização explícita |
| Alterar `schema.sql` | É o schema de referência — alterações podem confundir o histórico de migrations | Apenas com autorização explícita |

---

## 33. Como continuar o projeto em outro chat

### Checklist de início de sessão

1. Abrir o repositório no ambiente de desenvolvimento (Codespaces ou local).
2. Executar `/lead-master-product-architect` para carregar o contexto operacional.
3. Ler `docs/HANDOFF-PROJETO.md` (este documento) para o estado atual.
4. Ler `docs/PROXIMAS-FASES.md` para o roadmap detalhado.
5. Verificar `git log --oneline -10` para ver os últimos commits.
6. Se for trabalhar em código: ler `docs/DECISOES-ARQUITETURA.md` antes de qualquer implementação.

### Perguntas para orientar a sessão

- "Qual é o status atual da Fase 10?"
- "Quais pendências conhecidas (P1–P10) são bloqueadoras para a próxima demo?"
- "O que mudou desde o último commit?"

### MCP Servers disponíveis

| Servidor | Status |
|----------|--------|
| context7 | Instalado e conectado |
| supabase | Não instalado |
| playwright | Não instalar |

---

## 34. Como usar este documento

- **Para iniciar uma sessão nova:** ler as seções 10, 11, 12, 18, 27 e 37 para ter contexto rápido.
- **Para tomar uma decisão de arquitetura:** consultar seção 14 e `docs/DECISOES-ARQUITETURA.md`.
- **Para preparar uma demo:** usar seção 8 (checklist de produção) e `docs/roteiro-demo.md`.
- **Para implementar uma feature:** verificar seções 16 (rejeitadas) e 17 (adiadas) antes de começar. Depois consultar seção 30 (regras de trabalho).
- **Para responder a um prospect:** usar seção 15 (decisões comerciais) para respostas padrão.
- **Para avaliar uma nova feature proposta:** usar seção 29 (critérios de aceitação).
- **Para entender o estado do banco:** usar seção 9.
- **Para entender o estado da performance:** usar seção 19.

---

## 35. Últimos commits relevantes

| Commit | Descrição | Fase |
|--------|-----------|------|
| `3991523` | perf: adiciona skeleton global do app | Fase 10 |
| `7a72592` | perf: adiciona loading global para navegacao | Fase 10 (diagnóstico) |
| `faa63dc` | docs: revisa roteiro comercial da demo | Fase 9/10 |
| `165f0ee` | docs: atualiza roadmap apos validacao fase 9 | Fase 9 |
| `0031e41` | docs: validacao final fase 9 | Fase 9 |
| `b53a672` | docs: organize project documentation | Fase 9 |
| `c16bd7e` | fix: allow server actions in codespaces dev | Fase 8 |
| `171b3f8` | fix(ui): acabamento pre-demo e filtros ranking | Pré-demo |
| `761e343` | feat(pipeline): adicionar SLA visual e concluir fase 8 | Fase 8 |
| `b467d52` | feat(pipeline): alterar status com historico — fase 8 | Fase 8 |
| `6ff67e7` | docs: encerramento formal da fase 7 | Fase 7 |
| `674e05e` | feat(leads): captura e distribuicao automatica — fase 7 | Fase 7 |
| `efdd768` | feat(auth): implementar autenticação SSR e proteção por RLS — Fase 6.1 | Fase 6.1 |
| `32c3a85` | feat(security): harden schema with rls and multitenancy | Fase 5-R |
| `75dcd02` | feat(schema): fase 5 schema minimo para captura e distribuicao | Fase 5 |

---

## 36. Tag criada

```
v1-demo-operacional
```

Criada em 2026-06-24 no commit `3991523` e enviada ao GitHub.

Representa o marco em que o loop operacional mínimo do produto foi validado end-to-end em produção com dados reais da BASILIO IMOVEIS, sem erros, sem intervenção manual do gestor.

Para criar uma tag localmente se necessário:
```bash
git tag v1-demo-operacional <commit-hash>
git push origin v1-demo-operacional
```

---

## 37. Estado atual da Fase 10

**Fase 10 — Preparação comercial da demo real**  
**Data de início:** 2026-06-24  
**Status:** Em andamento

### O que foi feito

| Item | Status | Detalhe |
|------|--------|---------|
| Roteiro de demo documentado | ✓ Concluído | `docs/roteiro-demo.md` — script completo de 10 min com perguntas frequentes |
| `loading.tsx` global criado | ✓ Concluído | Skeleton de navegação — feedback visual imediato ao clicar na Sidebar |
| Roadmap pós-Fase 9 atualizado | ✓ Concluído | `docs/PROXIMAS-FASES.md` revisado com status de todas as fases |
| Diagnóstico de performance | ✓ Concluído | `docs/auditorias/performance-navegacao.md` e `performance-loading-diagnostico.md` |

### O que ainda está pendente na Fase 10

| Item | Status | Observação |
|------|--------|-----------|
| 10.1 — Confirmar consistência dos dados Basílio | ⚠️ Pendente | Verificar nomes, equipes, corretores em plantão antes de cada demo |
| 10.2 — Corrigir label de região vazio | ⚠️ Pendente | " • R$ valor" com espaço extra — pequeno mas visível |
| 10.3 — Pending state na Sidebar | ⚠️ Pendente | Link clicado muda visualmente antes da página carregar |
| 10.4 — Validar sessão em demo longa | ⚠️ Pendente | Testar se sessão expira antes de 60 min de uso |

### Critério de conclusão da Fase 10

> Gestor consegue apresentar o produto para um prospect novo em 10 minutos sem precisar de suporte técnico.

A Fase 10 é concluída quando a demo for executada com sucesso com um prospect real (não interno) e o resultado for documentado.

---

*Este documento foi gerado em 2026-06-24 com base em todos os arquivos de documentação do repositório.*  
*Fonte: README.md, CLAUDE.md, docs/DECISOES-ARQUITETURA.md, docs/PROXIMAS-FASES.md, docs/roteiro-demo.md, docs/auditorias/*, docs/respostas/*.*
