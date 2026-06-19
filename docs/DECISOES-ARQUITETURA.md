# Decisões de Arquitetura — Lead Master IA
**Atualizado:** 2026-06-19  
**Referências:** docs/auditorias/fase-1-6-definicao-produto.md · fase-3-arquitetura-distribuicao.md · fase-3-1b-revisao-arquitetura.md · fase-3-1c-regras-roteamento.md · fase-3-1d-jornada-real-lead.md

Este documento registra as decisões arquiteturais aprovadas. Não abre para rediscussão sem nova evidência concreta.

---

## 1. Identidade do produto

**Decisão:** O Lead Master IA é um **distribuidor inteligente de leads para imobiliárias** — não um CRM genérico.

O diferencial é a fila de plantão com distribuição automática por equipe. CRMs genéricos (RD Station, Pipedrive) não têm esse conceito. Para imobiliárias com 2+ equipes e múltiplos corretores por plantão, isso resolve um problema real que hoje é gerenciado com grupos de WhatsApp e planilhas.

---

## 2. SLA de entrada

**Decisão:** Lead deve ser roteado e ter primeiro contato possível em até **30 minutos** da entrada.

Qualquer design de distribuição que introduza passos manuais antes do contato vai contra esse SLA. Distribuição automática como padrão; manual como fallback ou override.

---

## 3. Origem do lead é obrigatória

**Decisão:** Campo `origem` é obrigatório em todo registro de lead — sem exceção.

Sem origem, não há rastreabilidade de canal, não há base para relatórios de conversão por fonte, e não há dado para futuros modelos de lead scoring.

---

## 4. Distribuição: automática por padrão, manual como fallback

**Decisão:** O sistema distribui automaticamente para o corretor de plantão. O gestor pode intervir manualmente em casos pontuais, mas não é o fluxo normal.

Distribuição manual como fluxo primário nega o valor do produto — é exatamente o que o WhatsApp já faz.

---

## 5. Roteamento MVP: campanha → equipe direto; fallback rodízio

**Decisão:** 

```
Lead entra com equipe_id no payload?
  ├── SIM → usa esse equipe_id diretamente (campanha ou formulário)
  └── NÃO → rodízio entre equipes ativas (ORDER BY ultimo_lead_recebido_em ASC)
```

- Webhook de campanha já pode carregar `equipe_id` diretamente — sem tabela de configuração extra no MVP.
- Formulário manual tem campo "Equipe" obrigatório — operador seleciona antes de salvar.
- Rodízio garante que nenhum lead fica sem destino.
- Zero tabelas novas no MVP. `leads.equipe_id` já existe no schema.

**Para V2:** cascata de roteamento completa (campanha → empreendimento → região → rodízio ponderado).

---

## 6. Distribuição para corretor: round-robin com fairness

**Decisão:** Dentro de cada equipe, a distribuição segue round-robin com fairness por `ultimo_lead_recebido_em`.

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

`em_plantao` e `ativo` são campos separados:
- `ativo`: corretor está na empresa (não demitido/desligado)
- `em_plantao`: corretor está disponível agora para receber leads

Um corretor pode ser `ativo = true` mas `em_plantao = false` (de folga, em reunião, sem disponibilidade).

---

## 7. Separar `ativo` de `em_plantao`

**Decisão:** Os campos `ativo` e `em_plantao` são distintos e ambos necessários.

O schema atual tem `ativo` mas não tem `em_plantao`. Esse campo precisa ser adicionado via migration antes da implementação da distribuição.

---

## 8. Criar `historico_leads` desde o início da escrita

**Decisão:** A tabela `historico_leads` deve ser criada junto com as primeiras operações de escrita, não depois.

Cada evento relevante é registrado: entrada, roteamento, distribuição, mudança de status, re-roteamento. Sem histórico desde o início, não há como reconstruir o que aconteceu com um lead.

```sql
CREATE TABLE historico_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id),
  tipo        TEXT NOT NULL,  -- 'lead_criado', 'lead_roteado', 'lead_distribuido', 'status_alterado', etc.
  descricao   TEXT,
  dados       JSONB,          -- snapshot do estado no momento do evento
  criado_por  TEXT,           -- 'sistema', 'webhook', 'formulario', ou id do usuário
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 9. SLA visual faz parte do MVP

**Decisão:** O SLA de primeiro contato deve ser visível na UI do MVP.

Relógio de SLA começa quando o lead entra. Indicadores:
- Até 30 min: sem alerta
- 30 min–2h: amarelo
- Acima de 2h: vermelho

Sem visibilidade de SLA, o gestor não tem como saber quais leads estão em risco. Isso é central para o valor do produto.

---

## 10. Deduplicação por telefone

**Decisão:** Lead com mesmo número de telefone recebido nas últimas 24h não gera novo registro.

Resposta para o chamador: HTTP 409 com referência ao lead existente.

Isso evita duplicatas causadas por race conditions de webhook, cliques duplos em formulário, ou o mesmo lead preenchendo a mesma campanha duas vezes.

---

## 11. Google Sheets não é núcleo do MVP

**Decisão:** Integração com Google Sheets pode entrar depois como importação de dados históricos ou compatibilidade — não é bloqueante para o MVP.

O MVP resolve o fluxo operacional novo. Migração de planilhas existentes é um problema separado.

---

## 12. Webhook como canal ideal; formulário manual como obrigatório

**Decisão:** 

- **Webhook** (`POST /api/leads`) é o canal para integração com Meta Ads, landing pages e Zapier.
- **Formulário manual** é obrigatório para cobrir leads que chegam por WhatsApp pessoal, indicação, plantão físico — casos onde não há automação.

Não é um ou outro. Os dois precisam existir no MVP.

---

## 13. O que não é o produto

- Não é multi-tenant no MVP (não suporta múltiplas imobiliárias no mesmo banco)
- Não tem autenticação no MVP (a Vercel protege o acesso por URL não-divulgada)
- Não tem notificações push/WhatsApp no MVP
- Não tem lead scoring com ML no MVP
- Não tem pipeline drag-and-drop no MVP (mover status via dropdown é suficiente para V1)

---

## 14. Distribuição automática na criação do lead

**Decisão:** Quando um lead entra no sistema (formulário ou webhook), o sistema tenta distribuir automaticamente para o corretor de plantão elegível **na mesma operação de criação**.

- Se houver corretor disponível (`ativo = true`, `em_plantao = true`): lead sai com `corretor_id` e `distribuido_em` já preenchidos.
- Se não houver: lead fica com `corretor_id = NULL` (fila). O botão "Distribuir" serve para redistribuição manual depois.

O botão "Distribuir" **não é o fluxo principal** — é o fallback operacional.

---

## 15. Deduplicação por telefone: bloquear e informar

**Decisão:** Mesmo número de telefone dentro de 24h → HTTP 409. Não cria duplicata silenciosa.

Comportamento:
- Normalizar telefone antes de comparar (remover máscara, espaços, caracteres não-numéricos).
- Se duplicata: retornar `{ erro: 'duplicata', lead_existente: { id, nome, criadoEm } }`.
- UI exibe: "Esse número já foi cadastrado ([nome], [X min atrás]). Abrir lead existente?" — sem botão de "criar mesmo assim".

Janela de 24h cobre race conditions, cliques duplos e reenvios acidentais de webhook.

---

## 16. Lead sem equipe_id (webhook sem campanha mapeada): rodízio automático

**Decisão:** Webhook sem `equipe_id` → selecionar a equipe que há mais tempo não recebe lead (`ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC`).

- Formulário manual **mantém `equipe_id` como campo obrigatório** — esse caso não ocorre no formulário.
- Nenhuma equipe cadastrada → HTTP 503 `sem_equipe_disponivel`.
- Sem `equipes.ativa` no MVP — todas as equipes cadastradas participam do rodízio.
