# Fase 3 — Arquitetura da Distribuição de Leads
**Data:** 2026-06-19  
**Referências:** [fase-2-auditoria-distribuicao.md](./fase-2-auditoria-distribuicao.md) · [fase-1-5-arquitetura-entrada-leads.md](./fase-1-5-arquitetura-entrada-leads.md)  
**Status:** Aguardando aprovação para implementação  
**Metodologia:** Análise direta do código-fonte. Nenhuma inferência sem evidência.

---

## Sumário Executivo

O diferencial do Lead Master IA é a **distribuição automática e rastreável de leads para imobiliárias**. O sistema atual possui toda a estrutura de leitura necessária (schema, tipos, queries) mas **nenhuma operação de escrita**. Esta fase projeta a arquitetura completa do motor de distribuição: desde a entrada do lead até o fechamento da venda.

A premissa inicial do usuário (Google Sheets como fonte primária) foi reavaliada à luz da análise anterior em `fase-1-5-arquitetura-entrada-leads.md`. A recomendação permanece: **webhook como canal principal** para produção, com Google Sheets como canal de compatibilidade para clientes que já operam com planilhas.

---

## 1. Como os Leads Devem Entrar no Sistema

O sistema deve suportar **três canais de entrada**, em ordem de prioridade:

### Canal A — Webhook HTTP (`POST /api/leads`) — Canal Principal

Qualquer fonte que suporte webhook (Facebook Lead Ads, Instagram Ads, landing pages, Zapier, Make, RD Station) envia um `POST` com o payload do lead. O endpoint valida, deduplica e insere na fila automaticamente.

**Por que é o canal principal:**
- Facebook + Instagram Ads respondem por 60–70% dos leads de imobiliárias brasileiras
- Tempo real — lead entra no banco no momento do preenchimento
- Uma configuração única cobre dezenas de fontes
- Não exige intervenção humana no fluxo

### Canal B — Formulário Manual (interface interna) — Fallback Universal

Para leads que chegam por WhatsApp, telefone, indicação ou portais sem webhook. Um operador abre a tela `/leads`, clica em "Cadastrar lead" e preenche o formulário. O lead entra na fila da equipe escolhida.

### Canal C — Google Sheets (sincronização periódica) — Canal de Compatibilidade

Para imobiliárias que já recebem leads em planilhas (Google Forms conectado ao Sheets, integrações de portais via Sheets, etc.). Um job de polling verifica novas linhas na planilha e as ingere via Apps Script ou via API route chamada por cron.

**Escopo nesta fase:** Apenas arquitetura. A implementação do Canal C é recomendada para V2 (ver seção 19).

---

## 2. Como Integrar com Google Sheets Inicialmente

### Abordagem Recomendada para o MVP: Apps Script Trigger

A integração mais confiável e de menor custo de manutenção usa Google Apps Script como ponte:

```
Google Sheets
    ↓ (Apps Script: onEdit ou onFormSubmit)
POST /api/leads/ingest-sheet
    ↓ (valida + deduplica por external_id)
Supabase → tabela leads
```

**Passos de configuração por cliente:**

1. Cliente instala o script em sua planilha (arquivo `.gs` que o produto fornece)
2. Script mapeado: coluna A = nome, B = telefone, C = origem, etc.
3. O script envia um POST para `https://lead-master-ia.vercel.app/api/leads` com um token secreto
4. O endpoint recebe, valida e ingere

**Campos mínimos que a planilha deve ter:**

| Coluna da Planilha | Campo no Banco | Obrigatório |
|-------------------|---------------|-------------|
| Nome | `leads.nome` | Sim |
| Telefone | `leads.telefone` | Sim |
| Origem (Meta/Google/Portal/etc.) | `leads.origem` | Não (default "Outro") |
| Interesse | `leads.interesse` | Não |
| Equipe de destino | `leads.equipe_id` | Sim (ou regra de roteamento automático) |

**Campo anti-duplicata:** A planilha deve incluir o identificador da linha do Sheets (`row_id`) ou um ID externo gerado pelo formulário. Esse valor é armazenado em `leads.external_id` para evitar reingestão ao re-executar o script.

**Limitações desta abordagem:**
- OAuth por conta Google do cliente — cada cliente configura sua própria credencial
- Qualquer alteração na estrutura da planilha quebra o mapeamento
- A planilha pode ser editada ou deletada (não é uma fila confiável)
- Polling tem atraso; o Apps Script Trigger é assíncrono e pode falhar silenciosamente

**Decisão:** Implementar Canal C apenas quando o produto tiver ao menos um cliente real pedindo essa integração. Não implementar antes disso.

---

## 3. Como Identificar Novos Leads

### Para o webhook (Canais A e B)

Cada `POST` cria um novo registro. Deduplica por `telefone` (janela de 24h) para evitar duplicatas de cliques múltiplos no mesmo anúncio:

```sql
-- Antes de inserir, verificar:
SELECT id FROM leads
WHERE telefone = $1
  AND created_at > NOW() - INTERVAL '24 hours'
LIMIT 1;
-- Se retornar linha: rejeitar o lead (ou criar como duplicata com flag)
```

### Para o Google Sheets (Canal C)

Usar uma coluna de controle `processado` na planilha. O Apps Script marca a linha como processada após o POST bem-sucedido. O endpoint também armazena `leads.external_id = sheets_row_id` para segunda camada de proteção.

```sql
-- Verificar no banco antes de inserir:
SELECT id FROM leads WHERE external_id = $1 LIMIT 1;
-- Se existir: ignorar silenciosamente
```

### Notificação de novo lead

Após inserção, o sistema deve disparar:
1. Atualização em tempo real na tela `/leads` via Supabase Realtime (subscriptions)
2. Trigger de distribuição automática (se configurado para automático)
3. Notificação para o gestor da equipe (V2)

---

## 4. Como Distribuir Automaticamente

### Algoritmo Round-Robin com Fairness

A distribuição segue uma fila rotativa por equipe. Para cada lead que entra:

```
1. Identificar a equipe de destino do lead (leads.equipe_id)
2. Buscar corretores elegíveis:
   WHERE equipe_id = $equipe
     AND em_plantao = true
     AND ativo = true
     AND NOT EXISTS afastamento ativo
     AND leads_ativos_count < limite_maximo_leads
3. Ordenar por: ordem_plantao ASC, ultimo_lead_recebido_em ASC
4. Selecionar o primeiro corretor
5. Atribuir: UPDATE leads SET corretor_id = $corretor, distribuido_em = NOW()
6. Atualizar fila: mover corretor para o fim (ordem_plantao = MAX + 1 ou sistema circular)
7. Registrar em historico_leads
```

### Dois modos de operação

**Modo Automático:** O trigger de banco ou Edge Function distribui assim que o lead entra. Sem intervenção humana.

**Modo Manual (MVP):** O botão "Distribuir" na tela `/leads` executa o algoritmo sob demanda. O gestor tem controle total antes de acionar.

**Recomendação para MVP:** Modo manual primeiro. Modo automático é V2 (requer mais confiança no algoritmo e no dado de `em_plantao`).

---

## 5. Como Controlar o Plantão

### Estrutura Atual (Problema Identificado)

O banco atual usa `corretores.ativo` como proxy para `em_plantao` — o que é incorreto. Um corretor pode estar ativo no sistema (conta existe) mas fora de plantão (não recebe leads hoje). Isso foi documentado em `fase-2-auditoria-distribuicao.md`, item 8.1.

### Solução: Coluna `em_plantao` Separada

```sql
ALTER TABLE corretores ADD COLUMN em_plantao BOOLEAN NOT NULL DEFAULT TRUE;
```

### Gestão do Plantão

**Nível 1 — Toggle Manual (MVP):** Gestor alterna `em_plantao` via toggle na tela `/corretores`. Um corretor fora de plantão fica visível no sistema mas não recebe leads.

**Nível 2 — Plantão por Turno (V2):** Tabela `plantoes` com horários definidos. O sistema calcula automaticamente quem está em plantão baseado na agenda.

```sql
-- V2: tabela plantoes
CREATE TABLE plantoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id UUID NOT NULL REFERENCES corretores(id),
  dia_semana  SMALLINT NOT NULL, -- 0=dom, 1=seg, ..., 6=sab
  hora_inicio TIME NOT NULL,
  hora_fim    TIME NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE
);
```

---

## 6. Como Controlar a Ordem de Distribuição

### Mecanismo Atual

O campo `corretores.ordem_plantao` já existe. É um inteiro ordenado (1 = próximo a receber). A função `getProximoPlantao()` já o usa.

### Problema: A Ordem Não Rotaciona

Após distribuir um lead para o corretor de `ordem_plantao = 1`, sua posição não é atualizada — ele voltará a ser o próximo na fila. Isso causa **concentração de leads no primeiro corretor**.

### Solução: Rotação por Timestamp

Em vez de reordenar `ordem_plantao` (o que exige UPDATE em todos os registros), usar `ultimo_lead_recebido_em`:

```sql
ALTER TABLE corretores ADD COLUMN ultimo_lead_recebido_em TIMESTAMPTZ;
```

Critério de ordenação durante a distribuição:

```sql
SELECT id FROM corretores
WHERE equipe_id = $equipe
  AND em_plantao = true
  AND ativo = true
ORDER BY
  COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC,
  ordem_plantao ASC
LIMIT 1;
```

Quem recebeu o lead mais antigo (ou nunca recebeu) fica na frente. `ordem_plantao` serve apenas como desempate.

Após distribuir:

```sql
UPDATE corretores
SET ultimo_lead_recebido_em = NOW()
WHERE id = $corretor_id;
```

---

## 7. Como Evitar Concentração de Leads

### Camada 1 — Rotação automática (seção 6)

O algoritmo de `ultimo_lead_recebido_em` naturalmente distribui com equidade entre os corretores em plantão.

### Camada 2 — Limite máximo de leads ativos por corretor

```sql
ALTER TABLE corretores ADD COLUMN limite_leads_ativos INTEGER NOT NULL DEFAULT 10;
```

Antes de distribuir, verificar:

```sql
SELECT COUNT(*) FROM leads
WHERE corretor_id = $corretor_id
  AND status NOT IN ('fechado', 'perdido')
```

Se `count >= limite_leads_ativos`: pular para o próximo corretor da fila.

### Camada 3 — Alerta de concentração (V2)

Dashboard exibe aviso visual quando um corretor tem mais que X% dos leads ativos da equipe. O gestor pode redistribuir manualmente.

---

## 8. Como Redistribuir Leads Não Atendidos

### Definição de "não atendido"

Lead não atendido = lead com `corretor_id IS NOT NULL` E `status = 'novo'` E `distribuido_em < NOW() - INTERVAL '2 horas'` (tempo configurável).

### Fluxo de Redistribuição

```
[Cron job — a cada 30 minutos]
    ↓
Busca leads não atendidos além do prazo
    ↓
Para cada lead:
  1. Registra em historico_leads (motivo: "não atendido no prazo")
  2. Incrementa leads.redistribuicoes_count
  3. Se redistribuicoes_count < 3: distribui para próximo corretor elegível
  4. Se redistribuicoes_count >= 3: move para fila de revisão do gestor
    ↓
Notifica gestor via alerta na tela (V2: WhatsApp/e-mail)
```

### Campos necessários

```sql
ALTER TABLE leads ADD COLUMN distribuido_em TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN primeiro_contato_em TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN redistribuicoes_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN prazo_atendimento_horas INTEGER DEFAULT 2;
```

**MVP:** Redistribuição manual — gestor visualiza leads atrasados e redistribui com um clique.  
**V2:** Redistribuição automática via cron.

---

## 9. Como Registrar Histórico Completo

### Nova Tabela: `historico_leads`

Toda operação que muda o estado de um lead gera um registro:

```sql
CREATE TABLE historico_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo_evento     TEXT NOT NULL,     -- ver enum abaixo
  status_anterior TEXT,              -- LeadStatus anterior
  status_novo     TEXT,              -- LeadStatus novo
  corretor_id_anterior UUID REFERENCES corretores(id) ON DELETE SET NULL,
  corretor_id_novo     UUID REFERENCES corretores(id) ON DELETE SET NULL,
  executado_por   TEXT,              -- ID do usuário ou "sistema"
  motivo          TEXT,              -- livre — redistribuição, perda, etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_historico_lead_id ON historico_leads (lead_id);
CREATE INDEX idx_historico_created_at ON historico_leads (created_at);
```

**Tipos de evento (`tipo_evento`):**

| Valor | Descrição |
|-------|-----------|
| `lead_criado` | Lead entrou no sistema |
| `lead_distribuido` | Atribuído a corretor (primeira vez) |
| `lead_redistribuido` | Reatribuído a outro corretor |
| `status_alterado` | Mudança de etapa no pipeline |
| `lead_perdido` | Marcado como perdido com motivo |
| `lead_reaberto` | Reativado após perdido |

---

## 10. Como Medir Performance dos Corretores

### Métricas derivadas do banco (sem tabela nova)

| Métrica | Cálculo |
|---------|---------|
| Leads recebidos (período) | `COUNT(*) FROM historico_leads WHERE tipo_evento = 'lead_distribuido' AND corretor_id_novo = $c` |
| Taxa de conversão | `COUNT(fechados) / COUNT(leads_recebidos) * 100` |
| VGV total | `SUM(valor_vgv) FROM vendas WHERE corretor_id = $c` |
| Ticket médio | `AVG(valor_vgv) FROM vendas WHERE corretor_id = $c` |
| Leads ativos no pipeline | `COUNT(*) FROM leads WHERE corretor_id = $c AND status NOT IN ('fechado','perdido')` |
| Leads perdidos | `COUNT(*) FROM leads WHERE corretor_id = $c AND status = 'perdido'` |

### Exibição

A tela `/corretores` já tem a estrutura visual. A tela `/ranking` já calcula VGV. O que falta é conectar dados reais do banco.

---

## 11. Como Medir Velocidade de Atendimento

### Tempo até Primeiro Contato (TFC)

```sql
-- Quando corretor muda status para 'em_contato', registrar:
UPDATE leads SET primeiro_contato_em = NOW() WHERE id = $lead_id;

-- Calcular TFC:
SELECT AVG(
  EXTRACT(EPOCH FROM (primeiro_contato_em - distribuido_em)) / 3600
) AS tfc_medio_horas
FROM leads
WHERE corretor_id = $c
  AND primeiro_contato_em IS NOT NULL;
```

### Métricas de velocidade

| Métrica | Fórmula | Benchmark ideal |
|---------|---------|----------------|
| Tempo até 1º contato | `primeiro_contato_em - distribuido_em` | < 2 horas |
| Tempo na etapa "novo" | Duração até `em_contato` | < 4 horas |
| Tempo total no pipeline | `fechado_em - distribuido_em` | Depende do produto |
| Tempo médio por etapa | Média entre eventos no `historico_leads` | — |

### Dashboard de velocidade (V2)

Tela dedicada com histograma de TFC por corretor e por equipe. Alerta vermelho se TFC médio > 4h.

---

## 12. Como Medir Taxa de Conversão

### Funil de conversão

```
Leads recebidos (100%)
    ↓ emContatoRate
Em contato (ex: 85%)
    ↓ visitaRate
Visita agendada (ex: 40%)
    ↓ propostaRate
Proposta enviada (ex: 20%)
    ↓ fechamentoRate
Fechado (ex: 8%)
```

### Query de funil

```sql
SELECT
  COUNT(*) FILTER (WHERE status != 'novo') * 100.0 / COUNT(*) AS em_contato_rate,
  COUNT(*) FILTER (WHERE status IN ('visita','proposta','fechado')) * 100.0 / COUNT(*) AS visita_rate,
  COUNT(*) FILTER (WHERE status IN ('proposta','fechado')) * 100.0 / COUNT(*) AS proposta_rate,
  COUNT(*) FILTER (WHERE status = 'fechado') * 100.0 / COUNT(*) AS fechamento_rate
FROM leads
WHERE equipe_id = $equipe
  AND created_at BETWEEN $inicio AND $fim;
```

A função `getFunil()` em `supabase-queries.ts` já tem a estrutura. Precisa de período como parâmetro.

---

## 13. Como Lidar com Corretor Offline

### Definição de "offline"

**MVP:** Corretor offline = `em_plantao = false`. O gestor alterna manualmente antes do corretor sair.

**V2 — Detecção automática:** Se o Supabase Auth for implementado, detectar última sessão ativa:

```sql
-- Coluna para rastrear atividade
ALTER TABLE corretores ADD COLUMN ultimo_acesso_em TIMESTAMPTZ;
-- Se ultimo_acesso_em < NOW() - INTERVAL '4 horas': considera offline (alerta, não bloqueia)
```

### Comportamento durante distribuição

- Corretor com `em_plantao = false`: **ignorado completamente** pela fila
- Lead não é penalizado: vai para o próximo corretor elegível
- Se **nenhum** corretor estiver em plantão: lead fica na fila aguardando, gestor recebe alerta

---

## 14. Como Lidar com Férias e Afastamentos

### Nova Tabela: `afastamentos`

```sql
CREATE TABLE afastamentos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corretor_id UUID NOT NULL REFERENCES corretores(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,   -- 'ferias', 'licenca', 'folga', 'outro'
  inicio      DATE NOT NULL,
  fim         DATE NOT NULL,
  motivo      TEXT,
  criado_por  TEXT,            -- ID do gestor que cadastrou
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT afastamentos_periodo_valido CHECK (fim >= inicio)
);

CREATE INDEX idx_afastamentos_corretor ON afastamentos (corretor_id);
CREATE INDEX idx_afastamentos_periodo ON afastamentos (inicio, fim);
```

### Uso durante distribuição

```sql
-- Filtro adicional na query de distribuição:
AND NOT EXISTS (
  SELECT 1 FROM afastamentos a
  WHERE a.corretor_id = c.id
    AND a.inicio <= CURRENT_DATE
    AND a.fim >= CURRENT_DATE
)
```

### Comportamento

- Afastamento cadastrado com antecedência pelo gestor na tela `/corretores`
- Durante o período: corretor é excluído da fila de distribuição automaticamente
- Após retorno: `em_plantao` pode ser reativado manualmente pelo gestor
- Leads do corretor afastado **não são redistribuídos automaticamente** (risco de perda de contexto). Gestor decide o que fazer com cada lead ativo.

---

## 15. Como Lidar com Múltiplas Equipes

### O que já está implementado

O schema e as queries já suportam múltiplas equipes completamente:
- `leads.equipe_id` define a equipe de destino
- `corretores.equipe_id` vincula cada corretor a uma equipe
- `getProximoPlantao()`, `getFunil()` e `getRanking()` já aceitam `equipeId` como filtro

### O que falta implementar

**1. Isolamento de fila por equipe**  
Cada equipe tem sua fila independente. Lead da Equipe Atlântico nunca vai para a Equipe Horizonte.

**2. Permissão por papel (V2)**  
- Gerente de equipe: vê apenas leads e corretores da sua equipe
- Admin: vê todas as equipes
- Corretor: vê apenas seus próprios leads

**3. Configuração por equipe**  
Cada equipe pode ter limite de leads por corretor e prazo de atendimento diferentes.

```sql
CREATE TABLE config_equipe (
  equipe_id              UUID PRIMARY KEY REFERENCES equipes(id),
  limite_leads_por_corretor INTEGER NOT NULL DEFAULT 10,
  prazo_atendimento_horas   INTEGER NOT NULL DEFAULT 2,
  distribuicao_automatica   BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 16. Tabelas Novas Necessárias

### Resumo das novas tabelas

| Tabela | Finalidade | MVP ou V2 |
|--------|-----------|-----------|
| `historico_leads` | Audit trail de todos os eventos de um lead | **MVP** |
| `afastamentos` | Controle de férias e afastamentos de corretores | **MVP** |
| `config_equipe` | Configurações por equipe (limite, prazo, modo de distribuição) | **MVP** |
| `plantoes` | Agenda de plantão por turno/dia da semana | V2 |
| `notificacoes` | Fila de alertas para gestores e corretores | V2 |
| `integracoes_sheets` | Metadata de sincronização com Google Sheets por cliente | V2 |

### DDL das tabelas MVP

```sql
-- historico_leads (ver seção 9)
-- afastamentos (ver seção 14)
-- config_equipe (ver seção 15)
```

---

## 17. Campos a Adicionar às Tabelas Atuais

### Tabela `leads` — campos faltantes

```sql
-- Campos operacionais do fluxo de distribuição
ALTER TABLE leads ADD COLUMN distribuido_em          TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN primeiro_contato_em     TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN redistribuicoes_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN external_id             TEXT UNIQUE;  -- deduplicação Google Sheets

-- Campos de dados que existem no tipo TypeScript mas não no banco
ALTER TABLE leads ADD COLUMN regiao                  TEXT;
ALTER TABLE leads ADD COLUMN captador_nome           TEXT;
ALTER TABLE leads ADD COLUMN motivo_perda            TEXT;         -- coluna dedicada, não mais "observacoes"
ALTER TABLE leads ADD COLUMN fonte_detalhe           TEXT;         -- ex.: "Campanha Setor Bueno - Junho"
```

### Tabela `corretores` — campos faltantes

```sql
-- Toggle de plantão independente do status "ativo"
ALTER TABLE corretores ADD COLUMN em_plantao              BOOLEAN NOT NULL DEFAULT TRUE;

-- Rastreamento para algoritmo de distribuição justa
ALTER TABLE corretores ADD COLUMN ultimo_lead_recebido_em TIMESTAMPTZ;
ALTER TABLE corretores ADD COLUMN limite_leads_ativos     INTEGER NOT NULL DEFAULT 10;
```

### Enum `lead_origem` — valores adicionais

```sql
ALTER TYPE lead_origem ADD VALUE 'WhatsApp';
ALTER TYPE lead_origem ADD VALUE 'Site';
ALTER TYPE lead_origem ADD VALUE 'Portal';
ALTER TYPE lead_origem ADD VALUE 'Indicacao';
ALTER TYPE lead_origem ADD VALUE 'Google';
```

### Tabela `equipes` — campo `gerente_id` como FK

Atualmente `gerente` é texto livre. Para controle de acesso futuro:

```sql
ALTER TABLE equipes ADD COLUMN gerente_id UUID REFERENCES corretores(id) ON DELETE SET NULL;
-- Manter coluna `gerente` (texto) por compatibilidade enquanto autenticação não existe
```

---

## 18. MVP Mínimo para Demonstração Comercial

O MVP de demo deve demonstrar o **loop completo** em uma apresentação ao vivo: lead entra → é distribuído → aparece no pipeline → gestor monitora.

### Escopo do MVP de Demo

| # | Feature | Esforço |
|---|---------|---------|
| 1 | **Formulário de cadastro de lead** (modal em `/leads`) | 4–6h |
| 2 | **Botão "Distribuir"** com Server Action real (round-robin por `emPlantao`) | 2–3h |
| 3 | **Toggle de plantão** na tela `/corretores` | 2h |
| 4 | **Colunas do pipeline clicáveis** para avançar status | 4–6h |
| 5 | **Variáveis de ambiente** confirmadas na Vercel | 30 min |
| 6 | **RLS do Supabase** configurada (ou desabilitada para demo) | 1h |

**Total estimado: 13–18 horas**

### O que a demo deve mostrar (roteiro de 5 minutos)

```
1. Abrir /leads → mostrar fila vazia
2. Cadastrar um lead pelo formulário (nome, telefone, origem: "Facebook", equipe: "Atlântico")
3. Lead aparece na fila → clicar "Distribuir" → lead é atribuído ao próximo corretor de plantão
4. Abrir /pipeline → mostrar o card do lead na coluna "Novo" com o nome do corretor
5. Avançar status: Novo → Em contato → Visita
6. Abrir /ranking → mostrar corretores com leads ativos (KPI "naFila" = 0)
7. Abrir /corretores → mostrar o corretor com 1 lead ativo
```

Esse roteiro **demonstra o diferencial do produto** sem depender de integrações externas.

---

## 19. O que Pode Ser Deixado para V2

| Feature | Motivo do Adiamento |
|---------|---------------------|
| Google Sheets / Google Forms | OAuth por cliente, parsing frágil, complexidade alta. Webhook + formulário manual cobre o mesmo caso de uso |
| Distribuição automática (sem clique) | Requer confiança no dado de `em_plantao`. MVP usa modo manual para validar o algoritmo |
| Redistribuição automática (cron) | Requer infraestrutura de jobs (Supabase Edge Functions com pg_cron ou Vercel Cron). MVP usa redistribuição manual |
| Notificações (WhatsApp/e-mail/push) | Requer integração com Twilio/SendGrid/Firebase. Custo operacional por mensagem |
| Autenticação e papéis (login real) | Bloqueia permissões por equipe. Necessário para multi-cliente. MVP usa acesso unificado |
| Plantão agendado (tabela `plantoes`) | Toggle manual é suficiente para MVP. Agenda automática é conforto, não necessidade |
| Drag-and-drop no pipeline (Kanban) | Botões de avanço de status já demonstram o fluxo. DnD é UX, não funcionalidade |
| Filtro de período (Topbar) | Queries atuais retornam tudo. Filtro temporal melhora análise mas não bloqueia demo |
| Integração com portais (Zap, OLX) | APIs proprietárias, contratos, manutenção contínua |
| Multi-imobiliária (multi-tenant) | Isolamento por organização. Arquitetura adicional significativa |
| App mobile | Depois de validar o produto no web |
| BI / relatórios avançados | Depois de ter dados reais acumulados |

---

## 20. Fluxo Completo da Distribuição (Texto)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  FLUXO COMPLETO — LEAD MASTER IA — DISTRIBUIÇÃO DE LEADS                   ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│  ETAPA 1 — CAPTAÇÃO                                                         │
│                                                                             │
│  Meta Ads (Facebook/Instagram)  ──┐                                        │
│  Google Ads                     ──┤  POST /api/leads                       │
│  Landing Page própria           ──┤  (webhook com API key)                  │
│  RD Station / Zapier / Make     ──┘                                        │
│                                                                             │
│  WhatsApp / Telefone / Indicação ──→  Formulário interno  ─────────────────┤
│  Portais (OLX, ZAP, VivaReal)   ──→  (operador digita)                    │
│                                                                             │
│  Google Sheets (V2)             ──→  Apps Script → POST /api/leads         │
│                                                                             │
│  [Ação no banco]                                                            │
│  INSERT leads (status='novo', corretor_id=NULL, equipe_id=destino)         │
│  INSERT historico_leads (tipo='lead_criado')                               │
│  Deduplicação: checar telefone (janela 24h) + external_id                  │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  ETAPA 2 — FILA DE DISTRIBUIÇÃO                                              │
│                                                                              │
│  Lead aparece em /leads → seção "Fila" da equipe de destino                 │
│  KPI "naFila" incrementa no dashboard                                        │
│                                                                              │
│  [Exibição]                                                                  │
│  Nome do lead · Telefone · Origem · Interesse · Há X horas                  │
│  Sugestão: "Próximo de plantão: Rafael Mendes"                               │
│  Botão: [Distribuir]                                                          │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  ETAPA 3 — DISTRIBUIÇÃO (clique do gestor no MVP; automática no V2)         │
│                                                                              │
│  Algoritmo:                                                                  │
│  1. Filtrar corretores: equipe_id = lead.equipe_id                          │
│                         AND em_plantao = true                               │
│                         AND ativo = true                                    │
│                         AND sem afastamento ativo hoje                      │
│                         AND leads_ativos < limite_leads_ativos              │
│  2. Ordenar: ultimo_lead_recebido_em ASC, ordem_plantao ASC                 │
│  3. Selecionar primeiro da fila                                             │
│                                                                              │
│  [Ação no banco]                                                             │
│  UPDATE leads SET corretor_id=$c, distribuido_em=NOW()                      │
│  UPDATE corretores SET ultimo_lead_recebido_em=NOW()                         │
│  INSERT historico_leads (tipo='lead_distribuido', corretor_novo=$c)         │
│                                                                              │
│  [Caso edge: nenhum corretor elegível]                                       │
│  Lead permanece na fila · Alerta para gestor                                 │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  ETAPA 4 — PRIMEIRO CONTATO                                                  │
│                                                                              │
│  Lead aparece em /pipeline na coluna "Novo" do corretor                     │
│  Prazo: 2 horas para primeiro contato (configurável por equipe)              │
│                                                                              │
│  Corretor abre o pipeline, vê o lead, contata o cliente                     │
│  Corretor clica: [Avançar → Em contato]                                     │
│                                                                              │
│  [Ação no banco]                                                             │
│  UPDATE leads SET status='em_contato', primeiro_contato_em=NOW()            │
│  INSERT historico_leads (tipo='status_alterado', status_anterior='novo',    │
│                          status_novo='em_contato')                           │
│                                                                              │
│  [Se não contactado em 2h]  ← MVP: alerta visual apenas                    │
│  V2: Redistribuição automática para próximo corretor elegível               │
│  redistribuicoes_count++                                                    │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  ETAPA 5 — PIPELINE (acompanhamento)                                         │
│                                                                              │
│  novo → em_contato → visita → proposta → fechado                            │
│                                        ↘ perdido                            │
│                                                                              │
│  Cada mudança de status:                                                     │
│  UPDATE leads SET status=$novo_status                                        │
│  INSERT historico_leads (tipo='status_alterado', ...)                       │
│                                                                              │
│  Se marcado como perdido:                                                    │
│  UPDATE leads SET status='perdido', motivo_perda=$motivo                    │
│  INSERT historico_leads (tipo='lead_perdido', motivo=$motivo)               │
│                                                                              │
│  [Visibilidade]                                                              │
│  /pipeline: cards nas colunas corretas                                       │
│  /leads: lista com status atual                                              │
│  /corretores: contador de leads ativos por corretor                         │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  ETAPA 6 — FECHAMENTO E RANKING                                              │
│                                                                              │
│  Status avança para 'fechado' → gestor (ou corretor) registra a venda       │
│                                                                              │
│  [Ação no banco]                                                             │
│  UPDATE leads SET status='fechado'                                           │
│  INSERT vendas (corretor_id, lead_id, valor_vgv, data_venda)                │
│  INSERT historico_leads (tipo='status_alterado', status_novo='fechado')     │
│                                                                              │
│  [Resultado imediato]                                                        │
│  Ranking VGV atualiza em /ranking                                           │
│  KPI "conversão" atualiza no dashboard                                       │
│  Funil de pipeline: coluna "Fechado" incrementa                             │
└──────────────────────────────┬───────────────────────────────────────────────┘
                               ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│  ETAPA 7 — MONITORAMENTO DO GESTOR                                           │
│                                                                              │
│  /           Dashboard: naFila, VGV, conversão, leads recentes              │
│  /leads       Fila de distribuição + leads distribuídos por equipe          │
│  /pipeline    Kanban por corretor e por equipe                              │
│  /corretores  Leads ativos por corretor, status de plantão, VGV             │
│  /ranking     Posição, VGV acumulado, ticket médio, qtd vendas              │
│                                                                              │
│  Alertas (V2):                                                               │
│  • Lead na fila há mais de X horas sem distribuição                         │
│  • Lead distribuído há mais de 2h sem primeiro contato                     │
│  • Corretor com mais de Y leads ativos (concentração)                       │
│  • Corretor sem plantão cadastrado para hoje                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Riscos Encontrados

### CRÍTICO

| ID | Risco | Consequência |
|----|-------|-------------|
| R1 | `em_plantao` não existe no banco — proxy com `ativo` | Corretor "de folga" ainda recebe leads. Impossível ter corretor ativo mas fora de plantão sem desativar a conta |
| R2 | Sem operações de escrita no sistema atual | Toda a arquitetura aqui projetada depende de implementação completa do backend de escrita (Server Actions ou API routes) |
| R3 | Sem RLS no Supabase | Sem autenticação, o `anon_key` tem acesso irrestrito a todos os dados. Em produção, qualquer um com a URL pública pode ler (e eventualmente escrever) tudo |
| R4 | Variáveis de ambiente não confirmadas na Vercel | O app pode estar operando em mock-mode em produção sem nenhuma indicação visual |

### ALTO

| ID | Risco | Consequência |
|----|-------|-------------|
| R5 | Algoritmo de distribuição pode ficar em loop infinito | Se todos os corretores atingirem o limite de leads, a query retorna zero resultados. Sem fallback, leads ficam presos na fila sem alerta |
| R6 | `motivo_perda` compartilha coluna `observacoes` | Um lead com `status = 'perdido'` tem suas observações legítimas sobrescritas pelo motivo de perda (quando escrita for implementada) |
| R7 | Redistribuição sem histórico | Sem `historico_leads`, é impossível saber por que um lead mudou de corretor — auditoria fica comprometida |
| R8 | `external_id` ausente na tabela `leads` | Google Sheets pode re-enviar leads já ingeridos (script rodado duas vezes, edição de célula) causando duplicatas no banco |

### MÉDIO

| ID | Risco | Consequência |
|----|-------|-------------|
| R9 | Enum `lead_origem` limitado (Instagram/Facebook/Outro) | Canais como WhatsApp, Site, Google, Portal não têm valor no banco — todos viram "Outro", rastreabilidade de canal perdida |
| R10 | Funil do dashboard com possível dupla contagem | `getFunil()` em `supabase-queries.ts:259` soma `vendas.length` ao `contagem.fechado`, mas leads com `status='fechado'` já estão em `leads` — pode haver dupla contagem se a lógica de criação de `vendas` não for bem definida |
| R11 | `ordem_plantao` não rotaciona automaticamente | Sem `ultimo_lead_recebido_em`, o corretor 1 da fila sempre recebe o próximo lead, mesmo que já tenha recebido o anterior |
| R12 | Sem `loading.tsx` | Páginas ficam em branco durante o `fetchTudo()`. Em conexões lentas parece que o site está fora do ar |

---

## Decisões Arquiteturais Recomendadas

### DA-01: Webhook como canal principal (não Google Sheets)
**Decisão:** `POST /api/leads` com autenticação por API key é o canal de entrada principal.  
**Motivo:** Cobre Facebook + Instagram Ads (70% do volume) sem esforço manual. Google Sheets é canal de compatibilidade, não canal principal.

### DA-02: Modo manual no MVP, automático no V2
**Decisão:** Distribuição acionada por clique do gestor no MVP.  
**Motivo:** Valida o algoritmo com supervisão humana antes de automatizar. Reduz risco de distribuição errada.

### DA-03: `historico_leads` obrigatório desde o dia 1
**Decisão:** Toda operação de escrita em leads deve registrar um evento no `historico_leads`.  
**Motivo:** Sem histórico, é impossível auditar distribuições, medir TFC e justificar redistribuições. O custo de adicionar depois é alto (dados históricos perdidos).

### DA-04: `ultimo_lead_recebido_em` em vez de reordenar `ordem_plantao`
**Decisão:** Usar timestamp para determinar quem é o "próximo da fila".  
**Motivo:** Reordenar `ordem_plantao` em todos os corretores a cada distribuição é uma UPDATE com lock na tabela inteira. Um único UPDATE de timestamp em um registro é O(1).

### DA-05: Separar `em_plantao` de `ativo`
**Decisão:** Adicionar coluna `em_plantao` separada ao schema de `corretores`.  
**Motivo:** Um corretor deve poder estar "ativo no sistema" (acessa dados, aparece em relatórios) mas "fora de plantão" (não recebe leads hoje). A confusão atual com `ativo` como proxy é um bug estrutural.

### DA-06: `afastamentos` como tabela separada (não flag no corretor)
**Decisão:** Tabela dedicada com datas de início e fim.  
**Motivo:** Flag booleano não tem histórico, não tem período definido e não permite planejamento antecipado. Tabela de afastamentos resolve os três problemas.

---

## Prioridades de Implementação

### Nível 0 — Pré-requisitos (sem esses, nada funciona)

| ID | Ação | Esforço | Impacto |
|----|------|---------|---------|
| P0-01 | Confirmar variáveis de ambiente na Vercel | 30 min | Crítico — app pode estar em mock em produção |
| P0-02 | Configurar RLS no Supabase (policies básicas ou desativar para dev) | 1h | Crítico — queries retornam zero linhas se RLS ativo sem policies |

### Nível 1 — Schema (preparar o banco para escrita)

| ID | Migração | Esforço | Bloqueia |
|----|----------|---------|---------|
| S1 | `ALTER TABLE corretores ADD COLUMN em_plantao BOOLEAN` | 5 min | Distribuição correta |
| S2 | `ALTER TABLE corretores ADD COLUMN ultimo_lead_recebido_em TIMESTAMPTZ` | 5 min | Algoritmo de fairness |
| S3 | `ALTER TABLE leads ADD COLUMN distribuido_em, primeiro_contato_em, redistribuicoes_count, external_id` | 10 min | Métricas de velocidade |
| S4 | `CREATE TABLE historico_leads` | 10 min | Auditoria |
| S5 | `ALTER TABLE leads ADD COLUMN motivo_perda TEXT, regiao TEXT, captador_nome TEXT` | 10 min | Dados completos |
| S6 | `ALTER TYPE lead_origem ADD VALUE 'WhatsApp', 'Site', 'Portal', 'Indicacao', 'Google'` | 5 min | Rastreabilidade |

### Nível 2 — Backend de escrita (operações do fluxo)

| ID | Feature | Esforço | Depende de |
|----|---------|---------|-----------|
| B1 | `POST /api/leads` — endpoint de webhook com validação + API key | 3–4h | P0, S1–S6 |
| B2 | Server Action `distribuirLead(leadId)` — algoritmo round-robin | 2–3h | S1, S2, S4 |
| B3 | Server Action `cadastrarLead(formData)` — formulário manual | 2–3h | B1 lógica |
| B4 | Server Action `alterarStatus(leadId, novoStatus)` — pipeline | 2–3h | S3, S4 |
| B5 | Server Action `togglePlantao(corretorId)` — toggle em_plantao | 1h | S1 |

### Nível 3 — UI (conectar botões ao backend)

| ID | Feature | Esforço | Depende de |
|----|---------|---------|-----------|
| U1 | Modal "Cadastrar lead" em `/leads` | 4–6h | B3 |
| U2 | Botão "Distribuir" com ação real em `/leads` | 2h | B2 |
| U3 | Cards do pipeline com botões de avanço de status | 4–6h | B4 |
| U4 | Toggle de plantão em `/corretores` | 2h | B5 |
| U5 | Filtros de ranking (Geral/Atlântico/Horizonte) com ação | 2–3h | — |

### Nível 4 — Novas tabelas e features

| ID | Feature | Esforço | MVP ou V2 |
|----|---------|---------|----------|
| N1 | `CREATE TABLE afastamentos` + UI de gestão | 3–4h | MVP |
| N2 | `CREATE TABLE config_equipe` + UI | 2–3h | MVP |
| N3 | Redistribuição manual (gestor reassign lead) | 2–3h | MVP |
| N4 | Dashboard de velocidade (TFC médio) | 4–6h | V2 |
| N5 | Google Sheets integration (Canal C) | 8–16h | V2 |
| N6 | Distribuição automática (trigger/cron) | 4–8h | V2 |
| N7 | Notificações (WhatsApp/e-mail) | 8–16h | V2 |
| N8 | Autenticação e papéis (login real) | 16–24h | V2 |

---

## Ordem Exata das Próximas Fases

```
FASE 3.1 — Pré-requisitos e Schema (1–2h)
  P0-01: Confirmar Vercel env vars
  P0-02: Configurar Supabase RLS
  S1–S6: Executar migrations no Supabase SQL Editor

FASE 3.2 — Backend de escrita (8–13h)
  B1: Endpoint POST /api/leads
  B2: Server Action distribuirLead
  B3: Server Action cadastrarLead
  B4: Server Action alterarStatus
  B5: Server Action togglePlantao

FASE 3.3 — UI conectada (14–20h)
  U1: Modal cadastro de lead
  U2: Botão Distribuir funcional
  U3: Pipeline interativo
  U4: Toggle de plantão
  U5: Filtros de ranking

FASE 3.4 — Tabelas de suporte (5–7h)
  N1: Afastamentos
  N2: Config por equipe
  N3: Redistribuição manual

FASE 3.5 — Validação (2–4h)
  Deploy na Vercel com dados reais
  Testar roteiro de demo completo (5 min)
  Ajustes de UX e bugs encontrados

──────── MARCO: DEMO COMERCIAL VIÁVEL ────────

FASE 4 — V2 (após primeiro cliente real)
  N5: Google Sheets
  N6: Distribuição automática
  N7: Notificações
  N8: Autenticação
```

---

Arquitetura concluída. Aguardando aprovação para implementação.
