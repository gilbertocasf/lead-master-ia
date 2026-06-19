# Fase 3.1-C — Definição das Regras de Roteamento
**Data:** 2026-06-19  
**Referências:** [fase-3-arquitetura-distribuicao.md](./fase-3-arquitetura-distribuicao.md) · [fase-3-1b-revisao-arquitetura.md](./fase-3-1b-revisao-arquitetura.md)  
**Status:** Aguardando aprovação  
**Metodologia:** Análise comparativa dos modelos de roteamento. Nenhum código alterado. Nenhuma migration criada.

---

## Contexto

As Fases 3 e 3.1-B definiram **como** os leads são distribuídos para os corretores dentro de uma equipe (round-robin com fairness). Este documento responde a uma pergunta que ficou em aberto: **como o sistema decide para qual equipe um lead deve ir antes da distribuição individual começar?**

O roteamento para a equipe é a camada que vem antes do algoritmo round-robin. Sem essa definição, toda lead entrada no sistema exige uma decisão manual de qual equipe vai recebê-lo — o que nega o valor da automação construída nas fases anteriores.

---

## Parte 1 — Análise dos 7 Modelos

---

### Modelo 1 — Roteamento por Empreendimento

**Como funciona:**  
O lead declara interesse em um empreendimento específico ("Condomínio Reserva Verde", "Edifício Blue Tower"). O sistema mapeia esse empreendimento para uma equipe e roteia automaticamente.

**Exemplo:**  
Lead do Facebook Ads anuncia o empreendimento Reserva Verde → sistema detecta "empreendimento = Reserva Verde" → roteia para Equipe Atlântico (responsável pelo produto).

**Estrutura de dados necessária:**

```
empreendimentos
  id
  nome
  equipe_id  ← FK para equipes (define o dono do produto)

leads
  empreendimento_id  ← FK para empreendimentos (define o interesse)
```

**Vantagens:**
- Regra de negócio direta: produto → equipe. Sem ambiguidade.
- Corretores se especializam no produto que vendem. Conversão melhor.
- Cada equipe "dono" do produto defende seu resultado.
- Escala bem: novo empreendimento → novo link para uma equipe → pronto.

**Desvantagens:**
- Exige que o lead declare interesse em um produto específico. Lead genérico ("quero um apartamento em SP") não tem empreendimento.
- Em campanhas amplas de topo de funil, o lead chega sem declarar produto.
- Empreendimento vendido ou encerrado: leads órfãos sem destino definido.
- Gestor precisa cadastrar e manter o mapa empreendimento → equipe.

**Quando é a escolha certa:**  
Imobiliárias com portfólio fixo de lançamentos, onde cada campanha anuncia um produto específico.

---

### Modelo 2 — Roteamento por Região

**Como funciona:**  
O lead informa (ou a campanha indica) a região de interesse ("Jardins", "Vila Olímpia", "Zona Norte"). O sistema mapeia essa região para uma equipe especializada naquela área.

**Exemplo:**  
Lead preenche formulário com interesse em "apartamentos no Sacomã" → roteia para Equipe Sul (especializada em zona sul).

**Estrutura de dados necessária:**

```
regioes
  id
  nome
  equipe_id  ← FK para equipes

leads
  regiao_id  ← FK para regioes (ou texto livre com normalização)
```

**Vantagens:**
- Corretores especialistas em região tendem a conhecer os produtos, vizinhança, preços locais.
- Funciona para leads que sabem onde querem morar mas não sabem qual produto.
- Natural para imobiliárias com cobertura geográfica dividida.

**Desvantagens:**
- Lead de digital muitas vezes não declara região — quer ver opções.
- Fronteiras de região são imprecisas ("Pinheiros" pode ser Vila Madalena para alguns).
- Leads que querem comparar regiões ficam sem destino claro.
- Mais difícil de capturar no formulário sem fricção (campo obrigatório cria abandono).
- Campanhas digitais raramente são segmentadas por bairro — são por produto.

**Quando é a escolha certa:**  
Imobiliárias de venda de imóveis usados (revenda) com equipes divididas por bairro ou zona.

---

### Modelo 3 — Roteamento por Origem do Lead

**Como funciona:**  
A origem do lead (de qual canal veio) define a equipe de destino. Facebook → Equipe Digital; Indicação → Equipe VIP; Portal OLX → Equipe Econômico.

**Exemplo:**  
Lead de Instagram Ads → Equipe Digital (especializada em leads frios de redes sociais). Lead de indicação → Equipe Relacionamento (especializada em leads quentes).

**Estrutura de dados necessária:**

```
config_roteamento_origem
  origem       ← 'Instagram', 'Facebook', 'Indicacao', 'Portal', etc.
  equipe_id    ← FK para equipes

leads
  origem       ← campo já existente (enum lead_origem)
```

**Vantagens:**
- Simples de configurar. Regra única por canal.
- Permite que cada equipe desenvolva expertise no tipo de lead que recebe.
- Lead de indicação (quente) não vai parar na fila com lead frio de Instagram.

**Desvantagens:**
- Desacopla o lead do produto que ele quer. Equipe recebe lead de origem X independentemente do interesse.
- Pouco comum em imobiliárias brasileiras — o mercado não organiza equipes por canal.
- Campanhas do mesmo canal podem anunciar produtos diferentes para equipes diferentes — o canal não é suficiente para decidir.
- Cria rigidez: muda a estratégia de mídia, precisa reconfigurar roteamento.

**Quando é a escolha certa:**  
Operações com volume muito alto de leads que precisam de triagem qualitativa antes de distribuição. Raro em imobiliárias. Mais comum em telemarketing.

---

### Modelo 4 — Roteamento por Campanha

**Como funciona:**  
Cada campanha de mídia é configurada para enviar leads para uma equipe específica. A campanha carrega o identificador da equipe no próprio payload do webhook.

**Exemplo:**  
Campanha "Residencial Atlântico - Junho" no Facebook Ads → webhook configurado com `equipe_id = "atlantico"` no campo oculto do formulário → sistema roteia automaticamente para Equipe Atlântico.

**Estrutura de dados necessária:**

```
leads
  campanha_id    ← identificador da campanha (texto, vem no payload)
  campanha_nome  ← nome amigável da campanha

config_campanhas
  campanha_id    ← identificador exato usado no Facebook/Google
  equipe_id      ← FK para equipes
  ativo          ← boolean (campanhas encerradas mantêm histórico)
```

**Ou, no payload direto:**

```json
// POST /api/leads
{
  "nome": "João Silva",
  "telefone": "11999999999",
  "equipe_id": "uuid-da-equipe-atlantico",   ← vem direto da campanha
  "campanha_nome": "Residencial Atlântico - Junho 2026"
}
```

**Vantagens:**
- Determinístico: zero ambiguidade. Lead da campanha X vai para equipe Y. Sempre.
- Configurado uma vez, por campanha. Não exige manutenção contínua.
- Rastreabilidade completa: cada venda tem campanha de origem.
- Escalável: novas campanhas → novo link → pronto. Sem mexer em código.
- Compatível com Facebook Lead Ads, Google Ads, landing pages, Zapier, Make — todos suportam campos ocultos.

**Desvantagens:**
- Exige que o responsável de marketing configure corretamente o campo oculto em cada campanha. Erro humano na configuração = lead sem destino.
- Lead que não veio de campanha (formulário manual, indicação, WhatsApp) não tem `campanha_id` — precisa de fallback.
- Campanha encerrada: os leads que continuam chegando (redirecionamentos, links antigos) ficam sem equipe definida sem fallback.

**Quando é a escolha certa:**  
Qualquer imobiliária que usa Facebook Ads ou Google Ads como canal principal. Que é praticamente toda imobiliária brasileira ativa em marketing digital.

---

### Modelo 5 — Roteamento por Rodízio entre Equipes

**Como funciona:**  
Leads são distribuídos em rotação circular entre as equipes disponíveis, independentemente de campanha, produto ou região.

**Exemplo:**  
Lead 1 → Equipe Atlântico. Lead 2 → Equipe Horizonte. Lead 3 → Equipe Atlântico. Etc.

**Estrutura de dados necessária:**

```
equipes
  ultimo_lead_recebido_em  ← timestamp para determinar próxima da fila
```

**Vantagens:**
- Extremamente simples de implementar.
- Percebido como "justo" pelas equipes — ninguém recebe mais que o outro.
- Zero configuração por campanha ou produto.

**Desvantagens:**
- Desconsidera especialização: equipe de imóveis de alto padrão recebe lead de entrada que deveria ir para outra equipe.
- Gera conflito quando os leads têm qualidade desigual: equipe que recebe lead frio enquanto outra recebe lead quente sente injustiça.
- Lead de campanha específica pode ir para equipe que não conhece o produto anunciado.
- Corretores precisam conhecer todo o portfólio — impossível em imobiliárias com produtos heterogêneos.
- Rodízio "justo" em quantidade não é justo em valor: um lead de R$ 500k e um de R$ 2M não valem o mesmo.

**Quando é a escolha certa:**  
Imobiliárias muito pequenas (1-2 equipes sem diferenciação de produto) ou como fallback quando nenhum outro critério se aplica.

---

### Modelo 6 — Roteamento Manual pelo Gestor

**Como funciona:**  
Lead entra no sistema sem destino definido. O gestor vê o lead, avalia e clica "Enviar para Equipe X".

**Vantagens:**
- Controle total do gestor sobre cada lead.
- Gestor pode avaliar qualidade antes de distribuir.
- Sem risco de erro de configuração.

**Desvantagens:**
- O gestor é o gargalo. Leads que chegam às 22h ficam na fila até o gestor abrir o sistema.
- Escala zero: gestor com 50 leads por dia passa o dia clicando em vez de gerir.
- A Fase 3.1-B demonstrou que o clique manual destrói o valor do produto.
- Leads esperando roteamento manual têm TFC (tempo até primeiro contato) elevado — exatamente o que o produto promete resolver.
- É exatamente o que o WhatsApp já faz. Gestor encaminha para o grupo da equipe. O sistema não agrega nada.

**Quando é a escolha certa:**  
Nunca como modelo primário. Apenas como override pontual quando o gestor quer intervir manualmente em um caso específico.

---

### Modelo 7 — Roteamento Híbrido

**Como funciona:**  
Combina dois ou mais modelos em cascata de decisão. O sistema tenta o critério mais específico primeiro e usa critérios mais amplos como fallback.

**Exemplo de cascata:**

```
Lead chega
    ↓
Tem campanha_id configurada?
    ├── SIM → roteia por campanha (Modelo 4)
    └── NÃO → Tem empreendimento_id?
                ├── SIM → roteia por empreendimento (Modelo 1)
                └── NÃO → Tem região declarada?
                            ├── SIM → roteia por região (Modelo 2)
                            └── NÃO → Rodízio entre equipes (Modelo 5)
```

**Vantagens:**
- Máxima cobertura: nenhum lead fica sem destino.
- Preserva especialização quando há informação suficiente.
- Fallback gracioso: sem configuração, ainda funciona.
- Mais próximo do que imobiliárias reais usam na prática.

**Desvantagens:**
- Mais complexo de configurar e explicar para o gestor.
- Regras de cascata podem criar comportamentos inesperados.
- Exige manutenção de múltiplas tabelas de configuração.
- Para MVP, pode ser over-engineered.

**Quando é a escolha certa:**  
Imobiliárias com portfólio misto (lançamentos + revenda + aluguel) ou com múltiplos canais de captação heterogêneos.

---

## Parte 2 — Comparativo dos Modelos

### Qual modelo é mais comum em imobiliárias brasileiras?

**Roteamento por campanha (Modelo 4) é o mais comum na prática**, combinado com round-robin dentro da equipe.

Motivo: O mercado imobiliário brasileiro opera majoritariamente via Facebook Lead Ads e Instagram Ads. Essas plataformas permitem adicionar campos ocultos no formulário, que os gestores de tráfego já usam para identificar a campanha. A extensão natural é usar esse campo para definir a equipe de destino.

O que acontece na realidade: a maioria das imobiliárias não tem um sistema formal de roteamento. O WhatsApp do gestor recebe o lead e o gestor encaminha manualmente para o grupo da equipe. O objetivo do Lead Master IA é automatizar exatamente essa etapa — e o Modelo 4 é o mais compatível com a operação atual dessas imobiliárias.

---

### Qual modelo gera menos conflito entre equipes?

**Roteamento por campanha (Modelo 4)** ou **por empreendimento (Modelo 1)** geram menos conflito.

Motivo: a regra é objetiva e pré-determinada. Não há espaço para disputa sobre "esse lead deveria ter sido meu". A campanha foi configurada pelo gestor para a equipe X. Não há subjetividade.

O **rodízio entre equipes (Modelo 5)** gera mais conflito, contra-intuitivamente. A equidade em quantidade não significa equidade em qualidade: equipes disputam os leads de campanhas mais quentes e reclamam quando recebem leads frios por rodízio.

O **manual (Modelo 6)** gera o pior conflito: cada decisão do gestor pode ser questionada individualmente. "Por que esse lead foi para a Equipe B e não para nós?"

---

### Qual modelo funciona melhor para demonstração comercial?

**Roteamento por campanha (Modelo 4)**, pela clareza da demonstração:

```
"Veja: essa campanha do Facebook foi configurada para a Equipe Atlântico.
Lead entrou agora → sistema identificou a campanha → roteou automaticamente
para a Equipe Atlântico → distribuiu para o próximo corretor de plantão.
Sem o gestor tocar em nada."
```

Essa narrativa é clara, visual e demonstra automação real. O comprador consegue imaginar o sistema funcionando no dia a dia dele porque já usa Facebook Ads.

O roteamento por empreendimento (Modelo 1) também funciona bem em demo, mas pressupõe que o prospecto já tenha empreendimentos cadastrados no sistema — o que adiciona fricção no setup de demonstração.

---

### Qual modelo funciona melhor para escalar para dezenas de equipes?

**Roteamento por campanha (Modelo 4)** é o mais escalável, por dois motivos:

1. **Configuração distribuída:** quem configura a campanha (gestor de tráfego ou time de marketing) define o `equipe_id` no payload. Não exige uma tabela central de roteamento que escala linearmente.

2. **Independência de domínio:** cada nova campanha é independente das demais. Adicionar a equipe 40 não exige rever as regras das 39 anteriores.

O **modelo híbrido (Modelo 7)** escala bem em flexibilidade, mas o custo de manutenção das regras cresce com o número de equipes, produtos e regiões.

O **rodízio (Modelo 5)** não escala bem: quanto mais equipes, mais heterogêneas ficam as especializações, e a lógica de "todos recebem igual" deixa de fazer sentido.

---

## Parte 3 — Como o Lead Master IA deve funcionar

### MVP

O MVP deve implementar o **Modelo Híbrido simples** — com campanha como critério primário e rodízio entre equipes como fallback:

```
Lead entra (webhook ou formulário)
    ↓
Tem equipe_id no payload?
    ├── SIM → usa esse equipe_id diretamente  ← caso campanha
    └── NÃO → rodízio entre equipes ativas    ← fallback
    ↓
[DENTRO DA EQUIPE]
Algoritmo round-robin com fairness (já definido na Fase 3)
```

**Por que esse design:**

- Webhook de campanha já pode carregar `equipe_id` diretamente — sem tabela de configuração extra.
- Formulário manual permite que o operador selecione a equipe — sem roteamento automático necessário.
- O fallback de rodízio garante que nenhum lead fica sem destino.
- Zero tabelas novas para configurar no MVP. `leads.equipe_id` já existe no schema atual.

**O que não implementar no MVP:**

- Tabela `config_campanhas` → desnecessária; `equipe_id` vem direto no payload.
- Tabela `regioes` → desnecessária; lead sem produto definido vai para rodízio.
- Tabela `empreendimentos` → útil mas não bloqueante para o MVP.

---

### V2

Na V2, o roteamento evolui para o **Modelo Híbrido completo**, com cascata de decisão:

```
Lead entra
    ↓
[Nível 1] Tem campanha_id mapeada na tabela config_campanhas?
    ├── SIM → equipe_id da config_campanhas
    └── NÃO
         ↓
[Nível 2] Tem empreendimento_id mapeado na tabela empreendimentos?
    ├── SIM → equipe_id de empreendimentos
    └── NÃO
         ↓
[Nível 3] Tem regiao_id mapeada na tabela regioes?
    ├── SIM → equipe_id de regioes
    └── NÃO
         ↓
[Nível 4] Rodízio entre equipes ativas (fairness por ultimo_lead_recebido_em)
```

**Evolução adicional da V2:**

- `config_campanhas`: tabela que mapeia `campanha_id` (string do Facebook/Google) para `equipe_id`. Permite histórico de campanhas encerradas e reaproveitamento de configurações.
- `empreendimentos`: tabela de produtos com `equipe_id`, permitindo roteamento por produto mesmo sem campanha configurada.
- `regioes`: opcional, apenas para imobiliárias com divisão geográfica formal.

**Distribuição ponderada (V2 avançado):**  
Após acumular dados suficientes (mínimo 90 dias de histórico), implementar peso de distribuição baseado em performance histórica por origem de lead. Corretores com maior taxa de conversão em leads de Facebook recebem proporcionalmente mais leads de Facebook. Fundamentado no roadmap V1→V5 da Fase 3.1-B.

---

## Parte 4 — Fluxo Completo do Lead até a Equipe

```
╔════════════════════════════════════════════════════════════════════════════╗
║  FLUXO DE ROTEAMENTO — LEAD MASTER IA — MVP                               ║
╚════════════════════════════════════════════════════════════════════════════╝

┌───────────────────────────────────────────────────────────────────────────┐
│  ENTRADA DO LEAD                                                           │
│                                                                           │
│  Canal A — Webhook (campanha de mídia)                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │ POST /api/leads                                                      │ │
│  │ {                                                                    │ │
│  │   "nome": "João Silva",                                              │ │
│  │   "telefone": "11999999999",                                         │ │
│  │   "origem": "Instagram",                                             │ │
│  │   "equipe_id": "uuid-equipe-atlantico",  ← CAMPO OCULTO DA CAMPANHA │ │
│  │   "campanha_nome": "Residencial Atlântico - Junho 2026"             │ │
│  │ }                                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  Canal B — Formulário manual (operador seleciona equipe na UI)            │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Nome: [João Silva     ]                                             │ │
│  │  Telefone: [11999999999]                                             │ │
│  │  Origem: [WhatsApp ▼  ]                                              │ │
│  │  Equipe: [Atlântico ▼ ]  ← gestor/operador seleciona               │ │
│  │  [Cadastrar lead]                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────┬───────────────────────────────┘
                                            ↓
┌───────────────────────────────────────────────────────────────────────────┐
│  DECISÃO DE ROTEAMENTO (AUTOMÁTICA)                                        │
│                                                                           │
│  if (lead.equipe_id != null) {                                            │
│    → usa equipe_id recebido   ← caso normal (campanha ou formulário)      │
│  } else {                                                                 │
│    → seleciona equipe pelo rodízio:                                       │
│      SELECT id FROM equipes                                               │
│      WHERE ativa = true                                                   │
│      ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC        │
│      LIMIT 1;                                                             │
│  }                                                                        │
│                                                                           │
│  → INSERT leads (equipe_id = decisao, status = 'novo', corretor_id = NULL)│
└───────────────────────────────────────────┬───────────────────────────────┘
                                            ↓
┌───────────────────────────────────────────────────────────────────────────┐
│  DISTRIBUIÇÃO PARA CORRETOR (round-robin dentro da equipe)                │
│  [Definido na Fase 3 e confirmado na Fase 3.1-B]                         │
│                                                                           │
│  SELECT id FROM corretores                                                │
│  WHERE equipe_id = $equipe_id                                             │
│    AND em_plantao = true                                                  │
│    AND ativo = true                                                       │
│    AND leads_ativos < limite_leads_ativos                                 │
│  ORDER BY                                                                 │
│    COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC,                  │
│    ordem_plantao ASC                                                      │
│  LIMIT 1;                                                                 │
│                                                                           │
│  → UPDATE leads SET corretor_id = $corretor, distribuido_em = NOW()      │
│  → UPDATE corretores SET ultimo_lead_recebido_em = NOW()                  │
│  → INSERT historico_leads (tipo = 'lead_distribuido')                    │
└───────────────────────────────────────────┬───────────────────────────────┘
                                            ↓
┌───────────────────────────────────────────────────────────────────────────┐
│  RESULTADO                                                                 │
│                                                                           │
│  → Lead aparece em /pipeline na coluna "Novo" do corretor designado       │
│  → Relógio de SLA começa: 30 min (amarelo) / 2h (vermelho)               │
│  → Corretor contata o lead e avança o status                              │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## Parte 5 — Riscos

### CRÍTICOS

| ID | Risco | Consequência | Mitigação |
|----|-------|-------------|-----------|
| RR-01 | Lead sem `equipe_id` e sem equipes ativas no rodízio | Lead inserido no banco sem equipe → nunca distribuído → gestor não vê na fila correta | `equipe_id NOT NULL` com valor padrão (equipe default configurável) |
| RR-02 | Campanha configurada com `equipe_id` de equipe inativa ou deletada | Lead roterizado para equipe inexistente → FK error ou lead invisível | Validar `equipe_id` na entrada; equipes só podem ser "desativadas", nunca deletadas enquanto tiverem leads |
| RR-03 | Campo oculto de campanha preenchido errado pelo gestor de tráfego | Lead vai para equipe errada sem nenhum alerta | Log de auditoria no `historico_leads` com `equipe_origem = 'campanha'`; gestor pode corrigir |

### ALTOS

| ID | Risco | Consequência | Mitigação |
|----|-------|-------------|-----------|
| RR-04 | Campanha encerrada mas link ainda circula nas redes | Leads chegam com `equipe_id` de campanha antiga — a equipe ainda existe, mas o produto foi encerrado | `campanha_nome` registrado no lead permite auditoria; gestor redistribui |
| RR-05 | Formulário manual sem equipe selecionada (campo em branco) | Lead entra sem `equipe_id` → cai no rodízio de todas as equipes | Tornar campo "equipe" obrigatório no formulário com valor default |
| RR-06 | Rodízio desequilibrado entre equipes de tamanhos diferentes | Equipe pequena (3 corretores) recebe mesmo volume que equipe grande (8 corretores) | Rodízio entre equipes ponderado por número de corretores ativos (V2) |

### MÉDIOS

| ID | Risco | Consequência | Mitigação |
|----|-------|-------------|-----------|
| RR-07 | Dois webhooks da mesma campanha chegam simultaneamente (race condition) | Dois leads idênticos inseridos ao mesmo tempo → duplicata no banco | Deduplicação por telefone (janela 24h) já prevista na Fase 3 |
| RR-08 | Gestor muda lead de equipe após distribuição | Corretor perde lead, corretor da nova equipe recebe sem contexto | Registrar re-roteamento em `historico_leads (tipo = 'lead_reroteado')`; notificar ambos (V2) |
| RR-09 | Nome de campanha inconsistente entre Facebook e o que está no payload | Dificuldade em identificar origem da campanha nos relatórios | `campanha_nome` é texto livre — relatórios precisam de normalização |

---

## Parte 6 — Decisão Final Recomendada

### Arquitetura de roteamento recomendada

**Modelo: Campanha como critério primário + rodízio entre equipes como fallback.**

Essa arquitetura:

1. É compatível com o schema atual (`leads.equipe_id` já existe).
2. Não exige nenhuma nova tabela no MVP.
3. Funciona para 100% dos casos de uso identificados: campanha digital, formulário manual, indicação, WhatsApp.
4. Tem fallback gracioso: nenhum lead fica sem destino.
5. É explicável em 30 segundos para o gestor de imobiliária.
6. Suporta a evolução natural para o Modelo Híbrido completo na V2.

### Regra de roteamento resumida em uma frase

**"A campanha define a equipe. Se não houver campanha, a equipe com menos leads recentes recebe o próximo."**

### O que muda no schema (MVP)

Nada. O campo `leads.equipe_id` já existe. O roteamento é implementado 100% na lógica da API route (`POST /api/leads`) e no formulário de cadastro manual.

**Uma melhoria opcional de baixo custo:**

```sql
-- Adicionar campo de rodízio na tabela equipes (sem migração bloqueante)
ALTER TABLE equipes ADD COLUMN ultimo_lead_recebido_em TIMESTAMPTZ;
```

Esse campo permite o rodízio justo entre equipes no fallback. Sem ele, o fallback precisa de uma lógica mais complexa de contagem.

### O que muda no schema (V2)

```sql
-- Tabela de campanhas (mapeia string de campanha para equipe)
CREATE TABLE config_campanhas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id  TEXT NOT NULL UNIQUE,  -- string vinda do Facebook/Google
  campanha_nome TEXT,
  equipe_id    UUID NOT NULL REFERENCES equipes(id),
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de empreendimentos (segundo nível da cascata)
CREATE TABLE empreendimentos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL,
  equipe_id  UUID NOT NULL REFERENCES equipes(id),
  ativo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE leads ADD COLUMN empreendimento_id UUID REFERENCES empreendimentos(id);
```

### Prioridades de implementação desta fase

| # | Ação | Escopo | Depende de |
|---|------|--------|-----------|
| RO-01 | `equipe_id` como campo obrigatório no payload do `POST /api/leads` | MVP | B1 (Fase 3.2) |
| RO-02 | Fallback de rodízio entre equipes quando `equipe_id` não enviado | MVP | B1 + `equipes.ultimo_lead_recebido_em` |
| RO-03 | Campo "Equipe" obrigatório no formulário de cadastro manual | MVP | U1 (Fase 3.4) |
| RO-04 | `historico_leads` registra `equipe_origem` (campanha/formulário/rodízio) | MVP | S4 (schema) |
| RO-05 | `CREATE TABLE config_campanhas` + UI de gestão | V2 | — |
| RO-06 | `CREATE TABLE empreendimentos` + link com leads | V2 | — |
| RO-07 | Rodízio ponderado por tamanho de equipe | V2 | — |
| RO-08 | Cascata completa (campanha → empreendimento → região → rodízio) | V2 | RO-05, RO-06 |

---

## Resumo Final

| Pergunta | Resposta |
|----------|----------|
| Mais comum em imobiliárias brasileiras | Campanha define equipe (Modelo 4) |
| Gera menos conflito entre equipes | Campanha ou empreendimento (critério objetivo, pré-definido) |
| Melhor para demonstração comercial | Campanha (narrativa clara: "sem tocar em nada, o lead foi para a equipe certa") |
| Melhor para escalar | Campanha (cada nova campanha é independente; zero manutenção de regras centrais) |
| Como funciona no MVP | `equipe_id` no payload → direto; sem `equipe_id` → rodízio entre equipes ativas |
| Como funciona na V2 | Cascata: campanha → empreendimento → região → rodízio ponderado |

O ponto crítico que as Fases 3 e 3.1-B ainda não haviam endereçado explicitamente: **o roteamento para a equipe deve ser resolvido antes que o algoritmo round-robin comece**. O MVP resolve isso de forma elegante e sem nova infraestrutura: quem manda o lead já sabe para qual equipe ele vai, seja a campanha (via campo oculto) ou o operador (via seleção no formulário). O sistema confia nessa informação e age imediatamente.

---

Definição de roteamento concluída. Aguardando aprovação.
