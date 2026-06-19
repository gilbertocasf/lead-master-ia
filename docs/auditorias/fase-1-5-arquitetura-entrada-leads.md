# Fase 1.5 — Arquitetura de Entrada de Leads
**Data:** 2026-06-19  
**Referência:** [fase-1-planejamento-mvp-leads.md](./fase-1-planejamento-mvp-leads.md)  
**Status:** Aguardando decisão para implementação

---

## Objetivo

Definir a arquitetura definitiva de como os leads entram no sistema antes de qualquer código ser escrito. Esta decisão impacta o schema do banco, as rotas da API, e o que a imobiliária cliente consegue demonstrar para um prospect.

---

## Parte 1 — Contexto: Como Imobiliárias Recebem Leads na Prática

Com base no modelo de negócio típico de imobiliárias brasileiras que investem em marketing digital:

| Canal | Volume típico | Forma de chegada |
|-------|--------------|-----------------|
| Facebook Ads + Instagram Ads | **60–70%** dos leads digitais | Formulário nativo no Meta (Lead Ads) → webhook |
| Landing Pages próprias | 15–20% | Formulário no site → webhook ou e-mail |
| WhatsApp | 10–15% | Contato direto → entrada manual |
| Google Forms | 5–10% | Link compartilhado → planilha |
| Portais (Zap, OLX, VivaReal) | Variável | E-mail automático ou webhook do portal |
| Indicação / telefone | Sempre presente | Entrada manual |

**Conclusão de contexto:** Meta Ads (Facebook + Instagram) dominam o volume. Qualquer arquitetura que não capture esses dois canais automaticamente precisará de entrada manual constante — o que derrota o propósito de um CRM.

---

## Parte 2 — Fontes para o MVP

### Fontes obrigatórias no MVP

| # | Fonte | Por quê obrigatória |
|---|-------|---------------------|
| 1 | **Cadastro manual (formulário interno)** | Cobre WhatsApp, indicações, telefone e qualquer fonte sem integração |
| 2 | **Webhook genérico (`POST /api/leads`)** | Cobre Facebook Lead Ads, Instagram Ads, landing pages e formulários externos via integração simples |

### Fontes para fases futuras (não MVP)

| Fonte | Motivo do adiamento |
|-------|---------------------|
| Google Sheets | Requer OAuth com a conta do cliente + polling ou Apps Script — muita configuração por cliente |
| Google Forms | Depende do Google Sheets como intermediário — complexidade em cascata |
| Portais (Zap, OLX) | API proprietária de cada portal, documentação restrita, contrato necessário |
| WhatsApp API oficial | Aprovação Meta Business, custo por mensagem, integração não-trivial |

---

## Parte 3 — Comparação das Abordagens

### A) Cadastro Manual (formulário interno)

**Como funciona:** Operador da imobiliária abre o sistema e preenche um formulário com nome, telefone, origem, interesse e equipe de destino. Clica em salvar. Lead entra na fila.

**Vantagens:**
- Zero dependência externa
- Funciona para qualquer canal (WhatsApp, telefone, indicação)
- Demonstrável em qualquer apresentação, mesmo sem integração configurada
- Complexidade de implementação: baixa — um `<form>` + Server Action ou API route

**Desvantagens:**
- Exige que alguém abra o sistema e preencha manualmente a cada lead
- Não escala com volume alto de anúncios
- Atraso entre o lead chegar e entrar no sistema

**Veredicto para MVP:** Obrigatório como canal primário e fallback universal.

---

### B) Google Sheets

**Como funciona:** A imobiliária exporta ou conecta sua planilha de leads ao sistema. O Lead Master IA lê a planilha periodicamente (polling) ou em tempo real (via Google Sheets Webhooks ou Apps Script).

**Vantagens:**
- Imobiliárias que já usam planilhas acham familiar
- Sem alteração de processo para o time

**Desvantagens:**
- Requer OAuth com conta Google do cliente — cada cliente tem uma credencial diferente
- Polling tem atraso (checar a cada X minutos); tempo real requer Apps Script ou Pub/Sub
- Formato da planilha varia por cliente — parsing frágil
- O Google Sheets não é uma fila de entrada confiável; dados podem ser editados ou apagados
- Custo de manutenção alto quando algo quebra (o que acontece com frequência)
- Transforma o CRM em dependente de uma planilha, o oposto do objetivo

**Veredicto:** Não recomendado no MVP. Complexidade desproporcionalmente alta para o benefício. Fase 3 no máximo.

---

### C) Google Forms

**Como funciona:** A imobiliária cria um formulário Google e compartilha o link. As respostas vão para uma planilha Google → o sistema lê essa planilha (volta ao caso B).

**Vantagens:**
- Gratuito e familiar para o cliente
- Fácil de criar e compartilhar

**Desvantagens:**
- Depende inteiramente do Google Sheets como intermediário (todos os problemas do caso B, mais um nível)
- O formulário não tem webhook nativo — requer Apps Script para disparar uma ação
- Qualquer alteração no formulário (campos, ordem) quebra o parsing
- URL do formulário não é branded — imobiliária fica com um `forms.google.com/...` em vez de seu próprio domínio

**Veredicto:** Não recomendado no MVP. Mais simples que Google Sheets mas ainda frágil e limitante.

---

### D) Webhook (`POST /api/leads`)

**Como funciona:** O sistema expõe um endpoint HTTP público que recebe um `POST` com os dados do lead em JSON. Qualquer fonte que suporte webhooks (Facebook Lead Ads, RD Station, ActiveCampaign, formulários com Zapier/Make, landing pages próprias) envia os dados direto para esse endpoint. O lead entra no banco imediatamente.

**Vantagens:**
- Uma única implementação cobre Facebook Ads, Instagram Ads, landing pages e qualquer ferramenta de automação de marketing
- Tempo real — o lead entra no banco no momento em que o formulário é preenchido
- Sem dependência de contas externas no backend (o cliente configura o webhook no lado dele)
- Escalável — não importa se chegam 10 ou 1.000 leads por dia
- Auditável — cada requisição pode ser logada com timestamp, IP e payload completo
- Padrão da indústria — qualquer desenvolvedor sabe integrar

**Desvantagens:**
- Requer endpoint público (o app precisa estar hospedado — a Vercel já resolve isso)
- Requer autenticação do webhook para evitar spam (uma API key simples já basta no MVP)
- O cliente precisa configurar o webhook no lado da plataforma de anúncios (passo único de setup)

**Veredicto:** Canal principal do MVP, complementar ao formulário manual.

---

## Parte 4 — Fonte Principal Recomendada para o MVP

**Decisão:** Webhook como canal principal + Formulário manual como canal universal de fallback.

### Justificativa

1. **Impacto máximo com implementação mínima.** Um único endpoint `POST /api/leads` já conecta Facebook Ads, Instagram Ads, landing pages e qualquer ferramenta de automação. A imobiliária configura uma vez e todos os leads chegam automaticamente.

2. **Elimina o principal gargalo operacional.** Sem webhook, alguém precisa monitorar o Gerenciador de Anúncios do Meta e copiar manualmente cada lead — tarefa que atrasa o primeiro contato e reduz a conversão.

3. **Demonstração poderosa.** Em uma apresentação para um cliente, mostrar um lead chegando em tempo real (via formulário simulando um webhook) é muito mais convincente do que mostrar dados mockados.

4. **O formulário manual resolve o resto.** WhatsApp, indicações, telefone — tudo que não tem webhook entra pelo formulário. Nenhum lead fica de fora.

5. **Sem dependência de terceiros no backend.** Google Sheets e Google Forms exigem credenciais OAuth por cliente, manutenção contínua e são fontes de falha silenciosa. O webhook não exige nada disso.

---

## Parte 5 — Fluxo Completo

```
ORIGEM                   ENTRADA                  DISTRIBUIÇÃO             PIPELINE                 RANKING
──────                   ───────                  ────────────             ────────                 ───────

Facebook Lead Ads ──►┐
Instagram Ads ───────┤   POST /api/leads          Fila da equipe           Corretor recebe          Venda fechada
Landing page ────────┼──►(webhook público) ──►   (leads.corretor_id       o lead no pipeline       gera registro
RD Station / Make ───┘   Valida payload           = NULL)                  (em_contato →            em `vendas`
                         Salva em `leads`          ↓                       visita →                 ↓
                         status = "novo"           Botão "Distribuir"      proposta →               Ranking VGV
                         corretor_id = NULL        lê `corretores`         fechado)                 atualiza em
                                                   por ordem_plantao                                tempo real
WhatsApp ────────────┐   Formulário interno        Atribui corretor_id
Telefone / indicação ┼──►(interface web) ──────►  status = "novo"
Portais (manual) ────┘   Valida campos             corretor_id = UUID
                         Salva em `leads`          ↓
                                                   Lead some da fila
                                                   Aparece no pipeline
                                                   do corretor
```

### Fluxo narrado passo a passo

1. **Origem:** Lead preenche formulário no Facebook Ad (ou humano no WhatsApp, ou formulário da landing page).
2. **Entrada:** O sistema recebe os dados via webhook `POST /api/leads` (ou via formulário interno para origem manual). Valida campos obrigatórios (nome + telefone). Salva na tabela `leads` com `status = "novo"` e `corretor_id = NULL`.
3. **Fila:** O lead aparece na tela `/leads` na seção "Fila de distribuição" da equipe escolhida. Qualquer gestor ou captador consegue ver os leads pendentes.
4. **Distribuição:** Gestor (ou sistema automático no futuro) clica "Distribuir". O sistema consulta `corretores` filtrando pela equipe e ordenando por `ordem_plantao` ASC. O corretor com menor `ordem_plantao` que estiver `ativo = true` recebe o lead (`corretor_id` é atualizado). A `ordem_plantao` do corretor é rotacionada para o fim da fila.
5. **Pipeline:** O lead aparece na coluna "Novo" do Kanban do corretor em `/pipeline`. O corretor avança as etapas: `em_contato → visita → proposta → fechado`.
6. **Ranking:** Quando o lead fecha em venda, um registro é criado em `vendas` com `valor_vgv`. O ranking em `/ranking` soma os VGVs por corretor e atualiza a posição.

---

## Parte 6 — Análise das Tabelas Atuais

### O que o schema atual já suporta

| Capacidade | Tabela | Status |
|------------|--------|--------|
| Armazenar lead com origem (Instagram/Facebook/Outro) | `leads.origem` (enum) | ✅ Suportado |
| Fila de distribuição (lead sem corretor) | `leads.corretor_id = NULL` | ✅ Suportado via índice parcial |
| Distribuição para corretor | `leads.corretor_id = UUID` | ✅ Suportado |
| Ordem de plantão | `corretores.ordem_plantao` | ✅ Suportado |
| Pipeline (etapas do lead) | `leads.status` (enum 6 valores) | ✅ Suportado |
| Ranking VGV | tabela `vendas` | ✅ Suportado |
| Filtro por equipe | `leads.equipe_id` | ✅ Suportado |

### Lacunas que precisariam ser resolvidas

| Lacuna | Impacto | Grau de urgência |
|--------|---------|-----------------|
| `LeadSource` enum tem apenas `Instagram`, `Facebook`, `Outro` | Não cobre `WhatsApp`, `Site`, `Portal`, `Indicação` | Médio — bloqueia rastreabilidade de canal |
| Sem coluna `captador_nome` na tabela `leads` | O tipo TypeScript tem o campo, o banco não | Baixo — UI pode omitir |
| Sem coluna `regiao` na tabela `leads` | O tipo TypeScript tem o campo, o banco não | Baixo — UI pode omitir |
| Sem endpoint de API (`/api/leads`) | Sem webhook = sem entrada automática | **Alto — bloqueia o fluxo principal** |
| Sem autenticação de webhook (API key) | Endpoint público sem proteção | **Alto — segurança** |
| `corretores.em_plantao` não existe no banco — mapeado de `ativo` | Não é possível colocar corretor "de férias" sem desativar sua conta | Médio — afeta distribuição de plantão |
| Sem campo `fonte_url` ou `utm_source` | Não rastreia qual campanha ou anúncio específico gerou o lead | Baixo no MVP — útil para análise futura |

### Alterações de schema necessárias para o MVP

**Obrigatórias (sem elas o fluxo não funciona):**
```sql
-- Nenhuma alteração de schema é obrigatória para o MVP básico.
-- O endpoint /api/leads pode receber os dados e mapear para as colunas existentes.
-- A expansão do enum lead_origem é recomendada mas não bloqueia.
```

**Recomendadas (melhoram a qualidade dos dados):**
```sql
-- Expandir o enum de origens para cobrir mais canais
alter type lead_origem add value 'WhatsApp';
alter type lead_origem add value 'Site';
alter type lead_origem add value 'Portal';
alter type lead_origem add value 'Indicacao';

-- Campo para rastrear de onde exatamente veio (nome da campanha, formulário, etc.)
alter table leads add column fonte_detalhe text;

-- Separar "em plantão" de "ativo" para permitir folga sem desativar conta
alter table corretores add column em_plantao boolean not null default true;
```

**Não alterar no MVP:**
- Estrutura das tabelas `equipes`, `vendas` — completamente adequadas
- Nomes das colunas existentes — o código já mapeia corretamente
- O `schema.sql` principal — qualquer alteração deve ser feita via migration, não sobrescrevendo o arquivo

---

## Parte 7 — Resumo da Decisão

| Decisão | Escolha | Motivo |
|---------|---------|--------|
| Canal principal | Webhook `POST /api/leads` | Cobre Meta Ads (maioria do volume) sem esforço manual |
| Canal de fallback | Formulário manual no sistema | Cobre WhatsApp, indicações, portais e qualquer origem sem webhook |
| Google Sheets | Fase futura | Complexidade OAuth por cliente não justifica no MVP |
| Google Forms | Fase futura | Depende do Sheets — cascata de complexidade |
| Alteração de schema obrigatória | Nenhuma para MVP básico | Schema atual suporta o fluxo principal |
| Alterações recomendadas | Expandir enum + `fonte_detalhe` + `em_plantao` | Qualidade de dados e flexibilidade operacional |

---

## Próximos passos (aguardando autorização)

Ordem de implementação sugerida caso o usuário autorize:

1. **[BUG-01]** Renomear `app/corretores ` → `app/corretores` (5 min, zero risco)
2. **[BUG-04]** Remover texto "demonstração visual" do pipeline (2 min, zero risco)
3. **[MVP-A]** Criar endpoint `POST /api/leads` com autenticação por API key
4. **[MVP-B]** Criar formulário de cadastro manual de lead (modal Client Component)
5. **[MVP-C]** Implementar botão "Distribuir" com Server Action (atribui corretor por plantão)
6. **[SCHEMA]** Executar migrations recomendadas no Supabase (opcional, melhora dados)

Cada item pode ser autorizado independentemente.

---

Arquitetura de entrada de leads definida. Aguardando decisão para implementação.
