# Fase 3.1-B — Revisão Crítica da Arquitetura de Distribuição
**Data:** 2026-06-19  
**Referência:** [fase-3-arquitetura-distribuicao.md](./fase-3-arquitetura-distribuicao.md)  
**Status:** Aguardando aprovação  
**Metodologia:** Análise crítica sob a ótica de uma imobiliária real. Todas as premissas questionadas.

---

## Contexto

A Fase 3 projetou uma arquitetura sólida tecnicamente. Este documento a revisa a partir de uma pergunta diferente: **o que uma imobiliária real precisaria no dia 1 para que esse sistema valha o preço?**

Imobiliária real significa: gestor que trabalha das 8h às 20h, corretores que atendem até 22h, leads que chegam às 23h pelo Instagram, plantão que muda todo dia, sem equipe de TI, sem paciência para processos manuais que o WhatsApp já resolve.

---

## 1. O gestor deve realmente clicar para distribuir leads?

**Premissa da Fase 3:** Modo manual no MVP. Modo automático no V2.

**Avaliação: INCORRETA.**

O argumento da Fase 3 é que o modo manual "valida o algoritmo com supervisão humana". Isso faz sentido para um engenheiro. Não faz sentido para uma imobiliária.

**Por que o clique manual é um problema grave:**

- Leads de Facebook e Instagram chegam em qualquer horário — 22h, fim de semana, feriado.
- Se o gestor precisa clicar "Distribuir", o lead fica parado na fila até o gestor abrir o sistema.
- Um lead que espera 3h para ser contactado tem probabilidade de conversão entre 3–5x menor do que um lead contactado em 15 minutos.
- O gestor não vai ficar olhando o sistema esperando leads chegarem. Ele tem reuniões, visitas, vida.
- **O WhatsApp já distribui leads automaticamente** (quem vê primeiro responde). Se o sistema exige mais trabalho que o WhatsApp, a imobiliária abandona o sistema.

**A lógica do "valida o algoritmo antes de automatizar" é válida em SaaS B2B enterprise. Em imobiliária brasileira, o MVP precisa de automação desde o dia 1, com manual como fallback, não o contrário.**

**Revisão recomendada:** Distribuição automática é o padrão. O gestor pode pausar a automação (toggle) ou redistribuir manualmente. O modo manual existe, mas não é o fluxo principal.

**A única exceção válida:** Se `em_plantao` para todos os corretores for desconhecido (primeiro uso), o sistema distribui e alerta. Não espera o clique.

---

## 2. O fluxo automático seria mais adequado?

**Sim. Com uma ressalva crítica sobre `em_plantao`.**

A Fase 3 justifica o modo manual porque "requer confiança no dado de `em_plantao`". O argumento é que se nenhum corretor tiver `em_plantao = true`, o lead fica preso. Isso é verdade mas a solução errada é modo manual.

**Solução correta para o problema de `em_plantao`:**

1. Na ativação do sistema: todos os corretores ativos entram com `em_plantao = true` por padrão.
2. O gestor desativa para quem está de folga.
3. Se o fluxo automático rodar e não encontrar nenhum corretor elegível: **alerta imediato** para o gestor + lead fica na fila com flag de urgência.
4. O sistema nunca trava. Ou distribui ou alerta.

Esse comportamento é mais seguro do que depender do gestor lembrar de abrir o sistema e clicar "Distribuir".

---

## 3. Google Sheets deveria permanecer apenas na V2?

**Decisão: APROVADA — mas o motivo precisa ser corrigido.**

A Fase 3 diz "adiar Google Sheets para quando um cliente pedir". Isso está certo, mas pelo motivo errado. O motivo correto é:

- O **formulário manual** (Canal B) resolve 100% dos casos de Google Sheets para uma imobiliária: operador recebe lead pelo WhatsApp → abre o sistema → preenche o formulário → lead entra na fila.
- Google Sheets não é mais fácil que o formulário interno. É mais difícil (OAuth por conta Google, mapeamento de colunas, fragilidade de edição).
- O único caso onde Google Sheets agrega valor é quando a imobiliária já tem uma planilha de leads históricos que quer importar de uma só vez. Isso é **migração de dados**, não integração contínua.

**Decisão correta:** Google Sheets em V2, mas como importação histórica de dados, não como canal de entrada contínuo.

---

## 4. Como seria um MVP demonstrável sem integrações externas?

A Fase 3 já projeta um bom roteiro de demo (seção 18). O problema é que o roteiro tem uma fraqueza fatal: **o clique manual quebra a narrativa**.

Quando o gestor demonstra o sistema para uma imobiliária e precisa clicar "Distribuir" manualmente, o comprador pensa: "eu faço isso no WhatsApp hoje sem pagar nada".

**Roteiro de demo revisado (5 minutos):**

```
1. Mostrar /corretores com os corretores em plantão (toggle verde = ativo)
2. Abrir /leads — fila vazia
3. Cadastrar um lead pelo formulário interno (30 segundos)
4. Lead entra → sistema distribui AUTOMATICAMENTE para Rafael (próximo na fila)
5. Mostrar /pipeline → card já aparece na coluna "Novo" do Rafael
6. Avançar status: Novo → Em contato (simular o corretor agindo)
7. Mostrar alerta de SLA: outro lead não contactado em 30 min aparece em vermelho
8. Redistribuir esse lead para o próximo da fila com um clique
9. Abrir /ranking — VGV, conversão, velocidade de atendimento
```

A chave da demo: **o lead é distribuído sem o gestor clicar nada**. Isso é o diferencial. Isso é o que vende o sistema.

**Para que esse MVP seja viável sem integrações externas:** o formulário manual (Canal B) + distribuição automática no momento da inserção é suficiente.

---

## 5. Como implementar SLA de atendimento?

**Problema com a Fase 3:** O prazo de 2 horas como padrão está errado para o mercado brasileiro de imóveis.

**Dados do mercado:**
- Lead contactado em < 5 min: taxa de conversão ~8x maior que contactado em > 30 min (fonte: InsideSales)
- Imobiliárias brasileiras de alto desempenho: meta de 15 min para primeiro contato
- 2 horas é o padrão de B2B SaaS ou imóveis de alto padrão com processo consultivo longo. Não é o padrão de apartamentos residenciais.

**SLA revisado:**

| Tipo | Prazo recomendado | Justificativa |
|------|------------------|---------------|
| Prazo alerta amarelo | 30 minutos | Lead esfria rápido |
| Prazo alerta vermelho | 2 horas | Redistribuição obrigatória |
| Redistribuição automática | 2 horas | Limite máximo aceitável |

**Implementação de SLA em dois níveis:**

**Nível 1 — Alerta visual (MVP):**
- Card do lead na `/leads` muda de cor: branco → amarelo (>30 min) → vermelho (>2h)
- Calculado no front a partir de `distribuido_em` — sem query adicional.
- Sem infraestrutura de cron. Sem backend. Só CSS condicional baseado em timestamp.

**Nível 2 — Alerta ativo + redistribuição (V2):**
- Supabase Edge Function com `pg_cron` ou Vercel Cron Jobs (gratuito no plano hobby)
- Roda a cada 15 minutos, busca leads com `distribuido_em < NOW() - INTERVAL '2 horas'` e `status = 'novo'`
- Redistribui automaticamente para próximo corretor elegível

**Erro da Fase 3:** colocar até o **alerta visual** em V2. O alerta visual é trivial de implementar no MVP e é o que demonstra o controle operacional do sistema para o gestor.

---

## 6. Como redistribuir automaticamente após X minutos sem ação?

A Fase 3 coloca redistribuição automática em V2 com argumento de complexidade de infraestrutura. Isso é verdade para cron jobs robustos, mas há uma solução mais simples:

**Opção A — Redistribuição lazy (sem cron):**

O sistema não redistribui ativamente. Mas quando o gestor abre `/leads`, a query verifica leads com SLA expirado e os marca como "críticos" com sugestão de redistribuição. Um clique redistribui.

Vantagem: zero infraestrutura adicional. Funciona no MVP.  
Desvantagem: requer o gestor abrir o sistema.

**Opção B — Vercel Cron (grátis, sem infraestrutura adicional):**

```json
// vercel.json
{
  "crons": [{
    "path": "/api/cron/redistribuir-leads",
    "schedule": "*/15 * * * *"
  }]
}
```

A rota `/api/cron/redistribuir-leads` busca leads expirados e redistribui. Roda a cada 15 minutos na Vercel sem custo extra no plano hobby.

**Este é mais simples do que a Fase 3 sugere.** Vercel Cron não é "infraestrutura de jobs". É um arquivo JSON de 4 linhas.

**Recomendação:** Incluir Vercel Cron no MVP. O argumento de "infraestrutura complexa" não se aplica aqui.

---

## 7. Como medir quem atende mais rápido?

**Problema com a abordagem da Fase 3:** `primeiro_contato_em` é definido quando o **corretor muda o status para `em_contato`**. Isso cria um incentivo perverso: corretor move o lead para `em_contato` sem ter contactado, para "pausar o relógio".

**Esse é um problema real em imobiliárias.** Corretores espertos descobrem esse atalho em dias.

**Soluções, da mais simples à mais confiável:**

| Abordagem | Confiabilidade | Complexidade |
|-----------|---------------|-------------|
| Status `em_contato` = proxy de contato (Fase 3) | Baixa (manipulável) | Nenhuma |
| Registro de "lead aberto pela primeira vez" | Média | Baixa (log de visualização) |
| Integração com WhatsApp Business API | Alta | Alta (V3) |
| Confirmação pelo lead (link de feedback) | Alta | Média |

**Para o MVP:** Aceitar o proxy do status `em_contato` com transparência. Mostrar no relatório do gestor: "Tempo médio até `em_contato`". O gestor sabe que é proxy e calibra sua equipe.

**Para V2:** Adicionar `lead_aberto_em` — quando o corretor abre o detalhe do lead pela primeira vez. Isso é auditável sem depender de ação declarada do corretor.

---

## 8. Como medir quem converte melhor?

**A Fase 3 está correta na mecânica.** O problema é mais sutil: **denominador errado na taxa de conversão**.

**Problema:** Um corretor que recebeu 10 leads e fechou 3 tem taxa de 30%. Um corretor que recebeu 100 leads e fechou 20 tem taxa de 20%. O primeiro parece melhor.

Mas se os 10 leads do primeiro eram leads quentes de indicação, e os 100 do segundo eram frios de Instagram, a comparação é injusta.

**Métricas necessárias por origem, não apenas por corretor:**

```sql
-- Taxa de conversão por corretor E por origem
SELECT 
  c.nome AS corretor,
  l.origem,
  COUNT(*) AS leads_recebidos,
  COUNT(*) FILTER (WHERE l.status = 'fechado') AS fechados,
  ROUND(
    COUNT(*) FILTER (WHERE l.status = 'fechado') * 100.0 / COUNT(*), 1
  ) AS taxa_conversao
FROM historico_leads h
JOIN leads l ON l.id = h.lead_id
JOIN corretores c ON c.id = h.corretor_id_novo
WHERE h.tipo_evento = 'lead_distribuido'
GROUP BY c.nome, l.origem
ORDER BY taxa_conversao DESC;
```

**Para o MVP:** Taxa de conversão simples (fechados / recebidos). Funciona.  
**Para V2:** Taxa por origem. Permite ranking justo e detecta quem converte melhor em qual canal.

---

## 9. Como preparar para distribuição inteligente baseada em performance?

A Fase 3 projeta apenas round-robin. Não há caminho para distribuição inteligente.

**Roadmap de inteligência de distribuição:**

```
V1 — Round-robin puro
  Critério: quem recebeu menos recentemente
  Premissa: todos os corretores são equivalentes

V2 — Round-robin com fairness por disponibilidade
  Critério: round-robin + filtro de limite de leads ativos
  Premissa: corretores disponíveis são equivalentes

V3 — Distribuição ponderada por performance
  Critério: peso = (taxa de conversão × 0.6) + (velocidade de atendimento × 0.4)
  Corretores de alta performance recebem proporcionalmente mais leads
  Premissa: corretores com melhor histórico tendem a converter mais

V4 — Matching por especialidade
  Critério: lead quer 2 quartos em Jardins → corretor especializado em Jardins/2q
  Requer: campo `especialidades` no corretor, campo `perfil_imovel` no lead

V5 — ML (não agora, mas a arquitetura não deve impedir)
  historico_leads é o dataset de treino
  Cada distribuição é uma linha de treino: input (perfil lead) → output (corretor) → resultado (converteu?)
```

**O que a Fase 3 precisa garantir para que V3+ seja possível:**

1. `historico_leads` deve registrar TODAS as distribuições (já previsto — aprovado)
2. `leads` deve ter `origem` confiável (requires enum correto — já previsto)
3. `vendas` deve ter `lead_id` para fechar o loop de conversão
4. Dados acumulados por pelo menos 90 dias antes de qualquer ranking de performance ser confiável

**Ação concreta:** Garantir que `vendas.lead_id` seja NOT NULL desde o início. Se um fechamento for registrado sem `lead_id`, o loop de aprendizado está quebrado.

---

## 10. Decisões da Fase 3 que mudariam após análise crítica

| # | Decisão Original | Problema | Revisão |
|---|-----------------|----------|---------|
| 1 | Modo manual no MVP, automático no V2 | Quebra o valor do produto | **Automático no MVP, manual como override** |
| 2 | SLA padrão de 2 horas | Muito lento para o mercado | **30 min amarelo, 2h vermelho** |
| 3 | Alerta visual de SLA em V2 | Alerta é trivial de implementar | **Alerta visual no MVP** |
| 4 | Cron/redistribuição automática em V2 por complexidade | Vercel Cron é trivial | **Redistribuição automática no MVP via Vercel Cron** |
| 5 | `afastamentos` como tabela separada no MVP | Over-engineered para MVP | **Adiar para V2. Toggle `em_plantao` resolve 95% dos casos** |
| 6 | `config_equipe` como tabela no MVP | Over-engineered para MVP | **Hardcode defaults no código. Tabela só quando houver cliente pedindo config diferente** |
| 7 | Sem menção a `vendas.lead_id` como obrigatório | Quebra o loop de conversão | **`vendas.lead_id NOT NULL` desde o schema inicial** |
| 8 | Taxa de conversão simples por corretor | Denominador injusto por origem | **Segmentar por origem desde V2** |
| 9 | Sem roadmap de distribuição inteligente | Produto não evolui naturalmente | **Adicionar roadmap V1→V5 explícito** |
| 10 | Demo com clique manual como ponto alto | Não diferencia do WhatsApp | **Demo com distribuição automática como ponto alto** |

---

## Classificação das Decisões da Fase 3

### Decisões Aprovadas

| Decisão | Por quê está correta |
|---------|---------------------|
| DA-01: Webhook como canal principal | Facebook/Instagram são a realidade do mercado. Correto. |
| DA-03: `historico_leads` obrigatório desde o dia 1 | Sem histórico, sem produto. Correto e inegociável. |
| DA-04: `ultimo_lead_recebido_em` em vez de reordenar `ordem_plantao` | O(1) vs O(n). Tecnicamente correto. |
| DA-05: Separar `em_plantao` de `ativo` | Bug estrutural real. Correto identificar e separar. |
| Google Sheets em V2 | Formulário interno resolve o mesmo caso sem a fragilidade. |
| Múltiplas equipes com fila isolada | Essencial. Isolamento por equipe é requisito real. |
| Algoritmo round-robin com fairness | Base sólida para V1. Correto como ponto de partida. |

### Decisões Questionáveis

| Decisão | Problema |
|---------|----------|
| MVP com modo manual como padrão | É defensável do ponto de vista técnico, mas errado do ponto de vista de produto. Não vende. |
| SLA de 2 horas como padrão | Defendável para imóveis de alto padrão. Errado para o mercado geral. |
| Redistribuição automática em V2 por "complexidade" | Vercel Cron existe e é simples. A complexidade foi superestimada. |
| `afastamentos` no MVP | Funcional mas prematuro. Nenhuma imobiliária vai usar isso no primeiro mês. |
| DA-06: `afastamentos` como tabela desde o MVP | Over-engineering. Toggle resolve. |

### Decisões Incorretas

| Decisão | Por que está errada |
|---------|---------------------|
| Alertas visuais de SLA em V2 | Alerta é CSS + timestamp. Não tem razão para estar em V2. |
| `config_equipe` como tabela no MVP | Prematura. Nenhum cliente vai querer configurar limites antes de testar o produto. |
| Demo com clique "Distribuir" como ação principal | Isso é o ponto fraco, não o ponto forte. Gestor que precisa clicar não precisa do sistema. |
| Sem menção explícita a `vendas.lead_id NOT NULL` | Gap crítico na arquitetura. Se `lead_id` for nullable, o loop de conversão nunca fecha. |
| Sem roadmap explícito para distribuição inteligente | O sistema foi projetado para nunca evoluir além do round-robin. |

---

## Arquitetura Revisada Recomendada

### Princípios revisados

1. **Automação é o produto, não um upgrade.** O gestor gerencia exceções. O sistema faz o trabalho.
2. **SLA de 30 minutos, não 2 horas.** O lead esfria. O tempo é dinheiro.
3. **Alertas no MVP.** A cor do card é a diferença entre produto e planilha.
4. **Complexidade técnica não é desculpa para omitir features essenciais.** Vercel Cron é trivial.
5. **Dados completos desde o início.** `vendas.lead_id NOT NULL`. Não negocia.

### Fluxo revisado (MVP)

```
Lead entra (formulário interno OU webhook)
    ↓
INSERT leads (status='novo', corretor_id=NULL)
    ↓
Sistema distribui AUTOMATICAMENTE (sem clique):
  → Busca próximo corretor elegível (round-robin)
  → UPDATE leads SET corretor_id=$c, distribuido_em=NOW()
  → INSERT historico_leads
    ↓
Lead aparece no pipeline do corretor
    ↓
[Sem ação em 30 min] → card fica AMARELO no dashboard do gestor
[Sem ação em 2h]    → card fica VERMELHO + Vercel Cron redistribui automaticamente
    ↓
Corretor avança status → pipeline atualiza
    ↓
Status = fechado → INSERT vendas (lead_id obrigatório)
```

### MVP revisado: escopo mínimo real

| # | Feature | Prioridade | Motivo |
|---|---------|-----------|--------|
| 1 | Distribuição automática ao inserir lead | **Obrigatório** | É o produto |
| 2 | Formulário de cadastro de lead | **Obrigatório** | Canal B sem webhook |
| 3 | Toggle `em_plantao` por corretor | **Obrigatório** | Controle básico |
| 4 | Alerta visual de SLA (cor do card) | **Obrigatório** | Diferencial visual |
| 5 | Vercel Cron de redistribuição (a cada 15 min) | **Obrigatório** | Fechamento do loop |
| 6 | `historico_leads` em toda operação de escrita | **Obrigatório** | Auditoria e métricas |
| 7 | Pipeline interativo (avançar status) | **Obrigatório** | Loop completo |
| 8 | `vendas.lead_id NOT NULL` | **Obrigatório** | Loop de conversão |
| 9 | Botão "Redistribuir manualmente" | Desejável | Override do gestor |
| 10 | Toggle de distribuição automática por equipe | Desejável | Flexibilidade |
| — | `afastamentos` (tabela) | V2 | Toggle cobre o MVP |
| — | `config_equipe` (tabela) | V2 | Hardcode defaults |
| — | Plantão agendado | V2 | Toggle cobre o MVP |
| — | Google Sheets | V2 | Formulário cobre o MVP |
| — | Notificações WhatsApp/e-mail | V2 | Alertas visuais cobrem o MVP |

### Ordem revisada de implementação

```
FASE 3.1 — Pré-requisitos (sem esses, nada funciona)
  P0-01: Confirmar variáveis de ambiente na Vercel
  P0-02: Configurar RLS no Supabase (ou desabilitar para dev)

FASE 3.2 — Schema (mínimo real para o MVP revisado)
  S1: ALTER TABLE corretores ADD COLUMN em_plantao BOOLEAN DEFAULT TRUE
  S2: ALTER TABLE corretores ADD COLUMN ultimo_lead_recebido_em TIMESTAMPTZ
  S3: ALTER TABLE leads ADD COLUMN distribuido_em, primeiro_contato_em, redistribuicoes_count
  S4: ALTER TABLE leads ADD COLUMN motivo_perda TEXT
  S5: CREATE TABLE historico_leads
  S6: ALTER TABLE vendas ADD COLUMN lead_id UUID NOT NULL REFERENCES leads(id)  ← NOVO
  S7: ALTER TYPE lead_origem ADD VALUE 'WhatsApp', 'Site', 'Portal', 'Indicacao', 'Google'

FASE 3.3 — Backend de escrita
  B1: POST /api/leads (webhook + formulário)
  B2: Lógica de distribuição automática (chamada pelo B1 e pelo cron)
  B3: Server Action alterarStatus
  B4: Server Action togglePlantao
  B5: GET /api/cron/redistribuir-leads + vercel.json

FASE 3.4 — UI
  U1: Formulário de cadastro de lead
  U2: Cards com cor de SLA (amarelo/vermelho baseado em distribuido_em)
  U3: Pipeline interativo (botões de avanço de status)
  U4: Toggle de plantão em /corretores

FASE 3.5 — Validação
  Deploy com dados reais
  Testar roteiro de demo (distribuição automática como ponto alto)
  Ajustes

──── MARCO: DEMO COMERCIAL VIÁVEL ────

FASE 4 (V2)
  Redistribuição inteligente por performance
  Autenticação e papéis
  Notificações (WhatsApp)
  Google Sheets (importação histórica)
  Agendamento de plantão
```

---

## Resumo Final

A Fase 3 projetou uma arquitetura tecnicamente coerente mas com uma premissa de produto equivocada: **a distribuição manual como padrão torna o sistema menos valioso que um grupo de WhatsApp**. O sistema precisa ser automático por natureza e manual por exceção.

As correções críticas são quatro:

1. **Distribuição automática no MVP** — não é complexidade, é o produto.
2. **SLA de 30 min com alerta visual no MVP** — não em V2.
3. **Vercel Cron de redistribuição no MVP** — 4 linhas de JSON, não "infraestrutura".
4. **`vendas.lead_id NOT NULL`** — sem isso, nunca saberemos qual lead virou venda.

O restante da arquitetura (round-robin, `historico_leads`, `em_plantao` separado, `ultimo_lead_recebido_em`) está correto e deve ser mantido.

---

Revisão crítica concluída. Aguardando aprovação.
