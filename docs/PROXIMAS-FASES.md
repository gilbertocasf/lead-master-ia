# Próximas Fases — Lead Master IA
**Atualizado:** 2026-06-22

Status de fases:
- Fase 6.2 — concluída
- Fase 7 — concluída
- Fase 8 — concluída
- Fase 9 — próxima fase

As Fases 1 a 3.1-D concluíram a auditoria estratégica e definiram a arquitetura. As próximas fases são de implementação.

---

## Fase 4 — Planejamento técnico da captura e distribuição

**Objetivo:** definir o contrato técnico completo antes de escrever código.

**Entregáveis:**

- Lista exata das migrations necessárias (campos a adicionar, tabelas a criar)
- Contrato da API `POST /api/leads` (campos obrigatórios, validações, respostas)
- Estrutura dos componentes React para o formulário de cadastro
- Diagrama do fluxo de dados: formulário/webhook → API route → banco → UI
- Critério de aceite para cada item antes de ir para Fase 5

**Dependências:** Fases 1–3.1-D concluídas (✓)

---

## Fase 5 — Schema mínimo

**Objetivo:** aplicar as alterações de banco necessárias para suportar captura e distribuição.

**Migrations a aplicar:**

```sql
-- 1. Campo de disponibilidade de plantão (separado de ativo)
ALTER TABLE corretores ADD COLUMN em_plantao BOOLEAN NOT NULL DEFAULT false;

-- 2. Timestamp para fairness no round-robin de corretores
ALTER TABLE corretores ADD COLUMN ultimo_lead_recebido_em TIMESTAMPTZ;

-- 3. Timestamp para fairness no rodízio de equipes (fallback de roteamento)
ALTER TABLE equipes ADD COLUMN ultimo_lead_recebido_em TIMESTAMPTZ;

-- 4. Campos de rastreamento de entrada do lead
ALTER TABLE leads ADD COLUMN campanha_nome TEXT;
ALTER TABLE leads ADD COLUMN distribuido_em TIMESTAMPTZ;

-- 5. Histórico de eventos do lead
CREATE TABLE historico_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  descricao   TEXT,
  dados       JSONB,
  criado_por  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_historico_leads_lead_id ON historico_leads (lead_id);
CREATE INDEX idx_historico_leads_created_at ON historico_leads (created_at);
```

**Critério de conclusão:** migrations aplicadas no Supabase real; schema.sql atualizado.

**Dependências:** Fase 4 concluída

---

## Fase 6 — Implementação da entrada de leads

**Objetivo:** lead pode entrar no sistema via formulário manual ou webhook.

**Escopo:**

- Modal "Cadastrar lead" com campos: nome, telefone (obrigatório), origem (obrigatório), interesse, faixa de valor, equipe (obrigatório), campanha_nome (opcional)
- Validação no frontend: campos obrigatórios, formato de telefone
- API route `POST /api/leads` com:
  - Validação de entrada
  - Deduplicação por telefone (janela 24h → HTTP 409 se duplicata)
  - Lógica de roteamento: `equipe_id` no payload → direto; sem `equipe_id` → rodízio
  - INSERT em `leads` com `status = 'novo'`, `corretor_id = NULL`
  - INSERT em `historico_leads` com `tipo = 'lead_criado'`
  - UPDATE em `equipes.ultimo_lead_recebido_em` (para fairness do rodízio)
- Retorno de sucesso com o lead criado

**Critério de conclusão:** lead criado via formulário aparece na fila de `/leads` em tempo real.

**Dependências:** Fase 5 concluída

---

## Fase 7 — Distribuição automática

**Objetivo:** botão "Distribuir" atribui o lead ao corretor de plantão e registra o evento.

**Escopo:**

- Botão "Distribuir" no card da fila chama `POST /api/leads/:id/distribuir`
- API route executa o algoritmo round-robin:
  - Busca corretor `em_plantao = true`, `ativo = true`, com menor `ultimo_lead_recebido_em`
  - UPDATE `leads.corretor_id` e `leads.distribuido_em`
  - UPDATE `corretores.ultimo_lead_recebido_em`
  - INSERT em `historico_leads` com `tipo = 'lead_distribuido'`
- Lead sai da fila e aparece no pipeline do corretor
- SLA visual começa a contar a partir de `distribuido_em`

**Critério de conclusão:** lead distribuído aparece no `/pipeline` com o corretor atribuído; fila de `/leads` atualizada.

**Dependências:** Fase 6 concluída

---

## Fase 8 — Pipeline funcional

**Objetivo:** corretor pode mover lead entre status; histórico é registrado; SLA é visível.

**Escopo:**

- Seletor de status no card do kanban (dropdown com os 6 status)
- API route `PATCH /api/leads/:id/status`
- INSERT em `historico_leads` com `tipo = 'status_alterado'`, timestamp
- Indicador de SLA visual:
  - Verde: menos de 30 minutos sem contato após distribuição
  - Amarelo: 30 min–2h
  - Vermelho: mais de 2h
- Motivo de perda obrigatório ao mover para `perdido`
- Filtros de ranking por equipe funcionando

**Critério de conclusão:** gestor consegue acompanhar o pipeline em tempo real com SLA visível; leads movidos atualizam o funil e o ranking corretamente.

**Dependências:** Fase 7 concluída

---

## Fase 9 — Validação de demo comercial

**Objetivo:** demonstrar o loop completo para um prospect real.

**Roteiro de demo:**

1. Abrir `/leads` — mostrar fila vazia
2. Cadastrar lead via formulário — lead aparece na fila em segundos
3. Clicar "Distribuir" — lead vai para corretor de plantão
4. Abrir `/pipeline` — lead aparece na coluna "Novo" do corretor
5. Mover lead para "Em contato" — relógio de SLA para
6. Abrir `/ranking` — corretor aparece com lead ativo

**Critério de conclusão:** demo executada sem erros em produção (Vercel + Supabase real) com dados reais.

**Dependências:** Fases 4–8 concluídas

---

## Versão 1 — CRM operacional (pós-MVP)

Após o MVP validado comercialmente:

| # | Funcionalidade |
|---|---------------|
| 1 | Pipeline drag-and-drop |
| 2 | Registro de venda (imóvel, VGV, data) |
| 3 | Status de plantão editável pelo gerente na UI |
| 4 | Alertas de inatividade (lead parado > 48h) |
| 5 | Autenticação por papel (admin / gerente / corretor) |
| 6 | Lead score básico (regras configuráveis) |
| 7 | Webhook com autenticação (secret no header) |

---

## Versão 2 — Distribuidor inteligente (pós-V1)

| # | Funcionalidade |
|---|---------------|
| 1 | Roteamento automático por campanha (tabela `config_campanhas`) |
| 2 | Roteamento por empreendimento (tabela `empreendimentos`) |
| 3 | Lead scoring com histórico de conversão |
| 4 | Notificações via WhatsApp (Twilio ou API não-oficial) |
| 5 | Dashboard de conversão por canal de origem |
| 6 | Integração nativa com Meta Lead Ads |
| 7 | Relatório de SLA por equipe |
| 8 | Multi-tenant (múltiplas imobiliárias) |
