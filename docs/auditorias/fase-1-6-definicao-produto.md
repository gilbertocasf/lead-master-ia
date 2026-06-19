# Fase 1.6 — Definição Estratégica do Produto
**Data:** 2026-06-19  
**Referência:** [fase-1-5-arquitetura-entrada-leads.md](./fase-1-5-arquitetura-entrada-leads.md)  
**Status:** Aguardando aprovação

---

## Premissa desta análise

Este documento não descreve o que o Lead Master IA diz ser. Descreve o que ele **é** — com base na leitura direta do código (`lib/types.ts`, `lib/supabase-queries.ts`, `lib/mock-data.ts`, e todas as seis páginas da aplicação).

---

## 1. CRM ou Distribuidor Inteligente de Leads?

**Resposta:** Nenhum dos dois com completude. O produto está mais próximo de um **painel de gestão operacional de leads** — e, dentro desse espectro, seu componente mais original é o **distribuidor com fila de plantão**, não o CRM.

| Característica | CRM completo | Distribuidor inteligente | Lead Master IA (hoje) |
|---|---|---|---|
| Cadastro de leads | Sim | Sim | Visual apenas (botão sem ação) |
| Histórico de interações | Sim | Não | Não |
| Pipeline com drag-and-drop | Sim | Não | Visual apenas (sem ação) |
| Fila de distribuição por plantão | Não | Sim | Implementado visualmente |
| "Próximo de plantão" sugerido | Não | Sim | Implementado (lógica real) |
| Ranking VGV | Marginal | Não | Implementado (lógica real) |
| Notificações / alertas | Sim | Sim | Não |
| Regras de roteamento automático | Não | Sim | Não |
| Escrita no banco | Sim | Sim | Não (zero operações de escrita) |

**Conclusão:** O produto tem a **cara de um CRM** (pipeline, ranking, dashboard) mas a **alma de um distribuidor** (fila de plantão, equipes, roteamento). O problema é que, sem operações de escrita, não é nenhum dos dois em produção — é um **relatório ao vivo de dados mockados**.

O diferencial competitivo real, quando implementado, será a **distribuição automática por plantão com regras de equipe** — algo que planilhas não fazem e CRMs genéricos (RD Station, Pipedrive) não têm configurado para o modelo de imobiliária com múltiplas equipes.

---

## 2. Funcionalidades Atualmente Apenas Visuais

As seguintes interações existem na UI mas **não têm implementação**:

| Funcionalidade | Localização | Estado real |
|---|---|---|
| Botão "Cadastrar lead" | `/leads` — PageHeader action | Renderiza um `<button>`, nenhum `onClick`, nenhum formulário |
| Botão "Distribuir" | `/leads` — card de fila | Renderiza um `<button>`, nenhuma ação |
| Botão "Adicionar corretor" | `/corretores` — PageHeader action | Renderiza um `<button>`, nenhuma ação |
| Botão "Nova equipe" | `/equipes` — PageHeader action | Renderiza um `<button>`, nenhuma ação |
| Pipeline drag-and-drop | `/pipeline` | Texto na própria página confirma: *"na versão final, os cards serão arrastáveis"* |
| Filtros de ranking (Geral / Atlântico / Horizonte) | `/ranking` | Três `<button>` sem `onClick`; filtro não funciona |

**Total: 6 interações críticas sem implementação.**

Dessas seis, duas são bloqueadoras do uso real: **cadastrar lead** e **distribuir**. Sem elas, o sistema não pode receber nem movimentar dados reais.

---

## 3. Funcionalidades que Geram Valor Real (Já Implementadas)

Apesar do estado incompleto, há lógica real e funcional:

| Funcionalidade | O que faz de verdade |
|---|---|
| **Dual-mode (mock/Supabase)** | Detecta variáveis de ambiente em boot; usa Supabase se disponível, mock caso contrário. Degrada silenciosamente — sem crash. |
| **KPIs do dashboard** | Calcula totalLeads, VGV, conversão e leads na fila a partir dos dados reais (via `getKPIs`). |
| **Fila de distribuição por equipe** | Separa leads sem `corretorId` por equipe e exibe visualmente com contador correto. |
| **Sugestão "próximo de plantão"** | `getProximoPlantao` percorre a fila ordenada por `ordemPlantao` e retorna o primeiro corretor `emPlantao = true`. Lógica real, não hard-coded. |
| **Funil por status** | Conta leads por etapa do pipeline e exibe barras proporcionais com o máximo como referência. |
| **Ranking VGV** | Soma `vgv` das vendas por corretor, ordena, calcula ticket médio e atribui posição. Funcional para dados reais. |
| **Resolução de equipe via corretor** | No ranking, como `vendas` não guarda `equipe_id`, o sistema resolve a equipe através do corretor (`getRanking`). Lógica de join feita no frontend. |
| **Leads ativos por corretor** | `/corretores` calcula leads em andamento (excluindo `fechado` e `perdido`) por corretor com dados reais. |

---

## 4. Fluxo Ideal

```
Lead chega
    │
    ▼
[Entrada]
Webhook (Meta Ads, landing page) ou Cadastro manual
    │
    ├─ Nome, telefone, origem, interesse, faixa de valor
    │
    ▼
[Classificação]
Sistema identifica: qual tipo de imóvel? qual faixa de valor?
    │
    ├─ Regra manual (hoje): captador escolhe a equipe
    ├─ Regra automática (futuro): sistema roteia por faixa de valor
    │
    ▼
[Equipe]
Lead entra na fila da equipe selecionada
    │
    ├─ Gerente recebe notificação
    ├─ Sistema sugere "próximo de plantão"
    │
    ▼
[Distribuição → Corretor]
Gerente clica "Distribuir" → lead vai para o corretor de plantão
    │
    ├─ Corretor recebe notificação (WhatsApp / push)
    ├─ `corretorId` é gravado no banco
    ├─ Status muda de "novo" para "em_contato"
    │
    ▼
[Pipeline]
Corretor move o card: em_contato → visita → proposta → fechado
    │
    ├─ Cada mudança é registrada com timestamp
    ├─ Gerente acompanha em tempo real
    │
    ▼
[Venda]
Corretor registra o fechamento: imóvel, VGV, data
    │
    ├─ Venda entra no ranking
    ├─ KPI de conversão é atualizado
    └─ Lead sai do pipeline ativo
```

**Gaps atuais:** o fluxo acima existe como visualização. As ações de escrita (distribuir, mover no pipeline, registrar venda) não estão implementadas.

---

## 5. Como a IA Poderia Participar desse Fluxo

A palavra "IA" no nome do produto cria uma expectativa que o código atual não atende. Mas há pontos concretos onde IA agrega valor real, ordenados por impacto vs. complexidade:

### Alta prioridade (impacto alto, implementação viável no médio prazo)

**a) Lead Scoring automático**  
Ao entrar no sistema, cada lead recebe uma pontuação de 1 a 10 baseada em:
- Faixa de valor (leads com ticket maior = menor volume, mais atenção)
- Origem (Facebook Ads tende a ter menor intenção que WhatsApp direto)
- Horário de entrada (leads que chegam em horário comercial convertem mais)
- Histórico da equipe com perfis similares

Impacto direto: corretor sabe em quem focar primeiro.

**b) Priorização da fila**  
Em vez de round-robin puro, a distribuição considera quem está com menos leads ativos no momento, evitando acúmulo em um corretor enquanto outro está livre.

**c) Detecção de lead inativo**  
Se um lead está em "em_contato" há mais de 48h sem movimentação: alerta automático para o gerente. Hoje isso é invisível.

### Médio prazo

**d) Roteamento por perfil**  
Lead com interesse em cobertura acima de R$ 1,5 mi → equipe especializada em alto padrão. Regra configurável pelo gestor, executada automaticamente.

**e) Análise de motivos de perda**  
Com volume suficiente de leads perdidos com `motivoPerdida` preenchido, classificação automática dos padrões: "perdido por preço", "perdido para concorrente", "sem resposta".

### Longo prazo

**f) Sugestão de próximo passo no pipeline**  
Com base no histórico de leads similares que fecharam, sugerir ao corretor: "Leads com esse perfil que agendaram visita na semana 1 converteram 3x mais."

---

## 6. Regras Automáticas que Poderiam Existir

Estas são regras de negócio (não necessariamente IA) que o sistema deveria executar automaticamente:

| Gatilho | Regra | Ação |
|---|---|---|
| Lead entra sem `corretorId` | Fila está vazia | Notificar gerente imediatamente |
| Lead entra sem `corretorId` | Há `N` leads na fila | Alertar gerente se fila > threshold configurável |
| Lead em "novo" por mais de 2h | SLA de primeiro contato | Alerta para gerente + corretor de plantão |
| Lead em qualquer status por mais de 48h sem mudança | Inatividade | Alerta de risco de perda |
| Corretor entra em "plantão" | — | Aparecer primeiro na fila de sugestão |
| Lead fecha venda | — | Criar registro em `vendas`, atualizar ranking automaticamente |
| Webhook recebe lead | — | Classificar origem, direcionar para equipe por regra |
| Faixa de valor > R$ 1 mi | — | Direcionamento automático para equipe de alto padrão (regra configurável) |

---

## 7. O Que Implementar Primeiro para uma Apresentação Comercial

Uma demonstração comercial precisa de um **loop completo e real**: lead entra → é distribuído → aparece no pipeline do corretor.

**Sequência mínima para uma demo convincente:**

### Etapa A — O loop funciona (pré-condição absoluta)
1. **Formulário "Cadastrar lead"**: modal simples com nome, telefone, origem, interesse, faixa de valor, equipe de destino. Grava no banco.
2. **Botão "Distribuir"**: atribui o `corretorId` do próximo de plantão ao lead. Grava no banco. Remove da fila.

Sem isso, qualquer apresentação é de um mockup, não de um produto.

### Etapa B — A demo impressiona
3. **Filtros do ranking por equipe**: os três botões (Geral / Atlântico / Horizonte) passam a funcionar. Uma linha de código cada.
4. **Webhook básico**: `POST /api/leads` recebe um payload de teste, cria o lead. Permite demonstrar integração com Meta Ads ao vivo.

### Etapa C — O diferencial aparece
5. **Status de plantão editável**: gerente pode marcar corretor como "em plantão" / "fora" pelo sistema. Hoje está no banco mas não há UI para alterar.
6. **Lead score visual**: badge simples (Alta/Média/Baixa prioridade) derivado de regras básicas. Não precisa de ML — uma função com `if/else` já impressiona.

---

## 8. Roadmap

### MVP — "O loop funciona" (próximas 2–4 semanas)

**Objetivo:** sistema pode receber e distribuir leads reais. Uma imobiliária poderia usar em produção.

| # | O que | Por quê é o MVP |
|---|---|---|
| 1 | Formulário de cadastro de lead (modal) | Sem isso, não entra dado real |
| 2 | Botão "Distribuir" com escrita no banco | Sem isso, não sai lead da fila |
| 3 | Filtros de ranking funcionais | Demo básica de segmentação por equipe |
| 4 | Webhook `POST /api/leads` com validação | Integração com Meta Ads |
| 5 | Correção do deploy Vercel (404) | Sem isso, nada vai para produção |
| 6 | Variáveis de ambiente confirmadas na Vercel | Sem isso, app usa mock em produção |

**Critério de conclusão do MVP:** lead entra via webhook ou formulário, aparece na fila, é distribuído, aparece no pipeline com o corretor atribuído — em produção (não só local).

---

### Versão 1 — "CRM operacional" (4–8 semanas após MVP)

**Objetivo:** o sistema substitui planilhas no dia a dia da imobiliária.

| # | O que |
|---|---|
| 1 | Pipeline drag-and-drop (mover lead entre status) |
| 2 | Registro de venda (formulário: imóvel, VGV, data) |
| 3 | Status de plantão editável pelo gerente |
| 4 | Lead score básico (regras configuráveis) |
| 5 | Alertas de inatividade (lead parado > 48h) |
| 6 | Histórico de movimentações do lead |
| 7 | Autenticação e controle de acesso por papel (admin / gerente / corretor) |
| 8 | Motivo de perda obrigatório ao mover para "perdido" |

---

### Versão 2 — "Distribuidor inteligente" (2–3 meses após V1)

**Objetivo:** o sistema toma decisões, não apenas registra.

| # | O que |
|---|---|
| 1 | Roteamento automático por faixa de valor e perfil |
| 2 | Lead scoring com IA (modelo simples baseado em histórico) |
| 3 | Análise de motivos de perda com agrupamento automático |
| 4 | Notificações via WhatsApp (API não-oficial ou Twilio) |
| 5 | Dashboard de conversão por canal de origem |
| 6 | Integração nativa com Meta Lead Ads (sem Zapier) |
| 7 | Relatório de SLA (tempo médio de primeiro contato por equipe) |
| 8 | Modo multi-imobiliária (multi-tenant) |

---

## Síntese Estratégica

**O que o Lead Master IA é hoje:** um protótipo de visualização bem executado, sem operações de escrita, rodando em mock-data em produção.

**O que ele pode ser:** o ponto de controle operacional de uma imobiliária que usa Meta Ads — onde todo lead que entra é rastreado, distribuído por regra, movimentado no pipeline, e o resultado aparece no ranking em tempo real.

**O diferencial que justifica o produto:** a maioria dos CRMs genéricos não tem o conceito de "fila de plantão com distribuição por equipe". Para imobiliárias com 2+ equipes e 6+ corretores por plantão, isso resolve um problema real que hoje é resolvido com grupos de WhatsApp e planilhas.

**O que está bloqueando o valor:** a ausência de qualquer operação de escrita. O produto é 100% de leitura. Implementar o formulário de cadastro e o botão "Distribuir" transforma o produto de mockup para ferramenta.

---

Definição estratégica concluída. Aguardando aprovação.
