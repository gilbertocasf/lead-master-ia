# Fase 7 — Auditoria de Escrita
**Data:** 2026-06-19  
**Status:** Concluída  
**Metodologia:** Análise do schema real (pós migration 002), decisões aprovadas e regras de negócio. Nenhum código alterado. Nenhuma migration criada.

---

## Contexto

A leitura de dados funciona. As operações de escrita não existem. Esta auditoria mapeia exatamente o que precisa acontecer quando um lead entra no sistema — do payload até o banco — sem deixar nenhuma ambiguidade para a fase de implementação.

---

## 1. Como um lead deve ser inserido

Todo lead entra por um de dois caminhos:

| Canal | Rota | Quem aciona |
|-------|------|------------|
| Webhook (campanha de mídia) | `POST /api/leads` | Automação (Meta Ads, landing page, Zapier) |
| Formulário manual | `POST /api/leads` (mesmo endpoint) | Operador humano na UI |

Ambos os canais convertem para o mesmo payload e passam pelo mesmo pipeline de processamento. A distinção entre os dois fica registrada no campo `criado_por` do `historico_leads`.

**Pipeline de processamento (ordem obrigatória):**

```
1. Validar campos obrigatórios do payload
2. Normalizar telefone (remover caracteres não-numéricos)
3. Checar deduplicação (telefone_normalizado + janela 24h)
   └── duplicata → HTTP 409, abortar
4. Resolver equipe_id (campanha ou rodízio)
5. INSERT leads (status='novo', corretor_id=NULL)
6. INSERT historico_leads (tipo_evento='lead_criado')
7. Executar algoritmo de distribuição → selecionar corretor
8a. Corretor encontrado →
    UPDATE leads SET corretor_id, distribuido_em
    UPDATE corretores SET ultimo_lead_recebido_em
    UPDATE equipes SET ultimo_lead_recebido_em
    INSERT historico_leads (tipo_evento='lead_distribuido')
8b. Nenhum corretor disponível →
    INSERT historico_leads (tipo_evento='distribuicao_falhou')
    (lead permanece na fila com corretor_id=NULL)
9. Retornar HTTP 201 com o lead criado
```

**Quem executa as escritas:**  
Toda escrita ocorre via API route server-side (`app/api/leads/route.ts`) usando o cliente Supabase com `service_role`. Nenhuma escrita é feita diretamente pelo client browser. As RLS policies da migration 002 confirmam isso: `leads` e `historico_leads` não têm policy de INSERT para usuários autenticados — só service_role bypassa o RLS.

---

## 2. Quais campos são obrigatórios em leads

### Obrigatórios pelo banco (NOT NULL no schema)

| Coluna | Tipo | Observação |
|--------|------|-----------|
| `nome` | TEXT | Campo livre, mínimo 1 caractere |
| `origem` | lead_origem enum | Valores válidos: `'Instagram'`, `'Facebook'`, `'Outro'` |
| `equipe_id` | UUID | Resolvido antes do INSERT (ver Seção 4) |
| `status` | lead_status enum | Sempre `'novo'` na criação |
| `imobiliaria_id` | UUID | Herdado da sessão do usuário / token do webhook |

### Obrigatórios pela regra de negócio (não pelo banco)

| Campo | Justificativa |
|-------|--------------|
| `telefone` | Necessário para deduplicação. Tecnicamente nullable no schema, mas sem telefone não há como deduplicar. Rejeitar na criação se ausente. |
| `origem` | Já NOT NULL no banco, mas é obrigatório também por decisão de negócio (rastreabilidade de canal — Decisão #3). |

### Opcionais (nullable no banco)

| Coluna | Quando preencher |
|--------|-----------------|
| `interesse` | Texto livre descrevendo o tipo de imóvel buscado |
| `faixa_valor` | Texto livre com faixa de preço |
| `observacoes` | Notas do operador no momento do cadastro |
| `telefone_normalizado` | Gerado automaticamente pelo pipeline (não vem no payload) |
| `distribuido_em` | Preenchido automaticamente quando corretor é atribuído |
| `corretor_id` | NULL na criação; preenchido pelo algoritmo de distribuição |

### Campos gerados pelo sistema (não vêm no payload)

| Coluna | Como é gerado |
|--------|--------------|
| `id` | `gen_random_uuid()` pelo banco |
| `created_at` | `now()` pelo banco |
| `status` | Fixo em `'novo'` na criação |
| `telefone_normalizado` | Derivado de `telefone` na API route antes do INSERT |
| `distribuido_em` | Timestamp do momento da distribuição, preenchido na API route |
| `imobiliaria_id` | Extraído da sessão ou do token de webhook |

---

## 3. Quais FKs precisam existir antes da inserção

Para inserir em `leads`, os seguintes registros devem existir no banco:

| FK em leads | Tabela referenciada | Condição |
|-------------|--------------------|----|
| `equipe_id` | `equipes.id` | Equipe deve existir. Não há validação de `equipes.ativo` no schema (campo existe mas não há constraint). Validar em código. |
| `imobiliaria_id` | `imobiliarias.id` | Sempre preexiste (contexto da sessão). |
| `corretor_id` | `corretores.id` (nullable) | NULL na criação; quando preenchido, corretor deve pertencer à mesma `equipe_id`. |

**Risco de integridade:** O schema não tem constraint que impeça `leads.corretor_id` de apontar para um corretor de uma equipe diferente de `leads.equipe_id`. A validação de coerência equipe/corretor deve ser feita na API route, não pode ser delegada ao banco.

Para inserir em `historico_leads`, os seguintes registros devem existir:

| FK em historico_leads | Tabela referenciada | Condição |
|----------------------|--------------------|---------|
| `lead_id` | `leads.id` | Lead deve ter sido inserido antes (ver atomicidade, Seção 7) |
| `imobiliaria_id` | `imobiliarias.id` | Herdado do lead |
| `usuario_id` | `usuarios.id` (nullable) | NULL para eventos do sistema; preenchido quando a ação é de um usuário |

---

## 4. Como determinar a equipe destino

```
Payload contém equipe_id?
    ├── SIM → usar equipe_id diretamente (campanha ou formulário manual)
    │         Validar: equipe existe e pertence à imobiliária
    └── NÃO → rodízio entre equipes ativas:
              SELECT id FROM equipes
              WHERE imobiliaria_id = $imobiliaria_id
                AND ativo = true
              ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC
              LIMIT 1;
              
              Nenhuma equipe ativa → HTTP 503 (sem_equipe_disponivel)
```

**Casos possíveis:**

| Caso | Canal | equipe_id no payload | Comportamento |
|------|-------|---------------------|--------------|
| Campanha com equipe mapeada | Webhook | Sim (campo oculto do formulário) | Usa direto |
| Formulário manual | UI | Sim (operador seleccionou) | Usa direto |
| Webhook sem mapeamento | Webhook | Não | Rodízio |
| Formulário sem seleção | UI | Não (bug de UI) | Rodízio — mas campo deve ser obrigatório na UI para evitar este caso |

**Nota sobre `equipes.ultimo_lead_recebido_em`:**  
Este campo existe no banco (adicionado pela migration 002). Deve ser atualizado junto com a distribuição do corretor (passo 8a do pipeline). Sem isso, o rodízio de equipes não funciona com fairness.

---

## 5. Como determinar o corretor de plantão

Após a equipe destino ser determinada (Seção 4), o algoritmo de distribuição seleciona o corretor:

```sql
SELECT id FROM corretores
WHERE equipe_id      = $equipe_id
  AND imobiliaria_id = $imobiliaria_id
  AND em_plantao     = true
  AND ativo          = true
ORDER BY
  COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC,
  ordem_plantao ASC
LIMIT 1;
```

**Interpretação das colunas:**

| Coluna | Significado |
|--------|------------|
| `ativo = true` | Corretor está na empresa (não demitido/desligado) |
| `em_plantao = true` | Corretor está disponível agora para receber leads |
| `ultimo_lead_recebido_em` | Timestamp do último lead recebido. NULL = nunca recebeu — tem prioridade máxima (COALESCE para '1970-01-01') |
| `ordem_plantao` | Desempate quando dois corretores têm o mesmo `ultimo_lead_recebido_em` (improvável, mas possível em setup inicial) |

**O índice `idx_corretores_plantao` da migration 002 cobre exatamente esta query:**
```sql
CREATE INDEX idx_corretores_plantao
  ON corretores (equipe_id, em_plantao, ativo, ultimo_lead_recebido_em)
  WHERE em_plantao = true AND ativo = true;
```

**Resultado possível:**

| Resultado | Ação |
|-----------|------|
| Corretor encontrado | UPDATE leads + UPDATE corretores + UPDATE equipes + INSERT historico (lead_distribuido) |
| Nenhum corretor (fila vazia) | Lead fica com corretor_id=NULL + INSERT historico (distribuicao_falhou). Lead aparece na fila do gestor. |

**Após a distribuição:**
- `leads.corretor_id` ← UUID do corretor selecionado
- `leads.distribuido_em` ← `NOW()`
- `corretores.ultimo_lead_recebido_em` ← `NOW()`
- `equipes.ultimo_lead_recebido_em` ← `NOW()`

---

## 6. Como registrar histórico de distribuição

A tabela `historico_leads` é a trilha de auditoria imutável. Nenhum evento deve ser apagado ou alterado após registrado.

**Eventos que devem ser registrados na criação de lead:**

| tipo_evento | Quando | criado_por | dados (JSONB sugerido) |
|-------------|--------|-----------|----------------------|
| `lead_criado` | Imediatamente após INSERT em leads | `'formulario'` ou `'webhook'` | `{ nome, telefone, origem, equipe_id, canal }` |
| `lead_distribuido` | Quando corretor é atribuído com sucesso | `'sistema'` | `{ corretor_id, corretor_nome, equipe_id, distribuido_em }` |
| `distribuicao_falhou` | Quando nenhum corretor está disponível | `'sistema'` | `{ equipe_id, motivo: 'sem_corretor_em_plantao' }` |

**Eventos que devem ser registrados em operações futuras (pós-criação):**

| tipo_evento | Quando |
|-------------|--------|
| `status_alterado` | Quando corretor ou gestor muda o status no pipeline |
| `lead_redistribuido` | Quando gestor reatribui o lead para outro corretor manualmente |

**Schema atual de historico_leads (pós migration 002):**

```
id              UUID NOT NULL (PK)
lead_id         UUID NOT NULL FK leads(id) ON DELETE CASCADE
imobiliaria_id  UUID NOT NULL FK imobiliarias(id)
tipo_evento     TEXT NOT NULL CHECK ('lead_criado'|'lead_roteado'|'lead_distribuido'|
                                     'distribuicao_falhou'|'status_alterado'|'lead_redistribuido')
descricao       TEXT (nullable) — texto legível para o gestor
dados           JSONB (nullable) — snapshot do estado no momento do evento
criado_por      TEXT NOT NULL DEFAULT 'sistema' CHECK ('sistema'|'formulario'|'webhook'|'usuario')
usuario_id      UUID (nullable) FK usuarios(id) ON DELETE SET NULL
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

**Gaps identificados no schema atual vs. necessidade:**
- O tipo `'lead_roteado'` está no CHECK mas não é usado no pipeline descrito acima. É reservado para V2 (roteamento por cascata empreendimento/região onde o roteamento é um passo separado da distribuição).
- O tipo `'lead_criado'` está no CHECK. Usar este valor no passo 6 do pipeline.

---

## 7. Quais transações precisam ser atômicas

### Transação 1 — Criação + Distribuição (crítica)

Os seguintes passos devem ocorrer dentro de uma única transação de banco:

```
BEGIN;
  -- Passo A: verificação de deduplicação (lock para evitar race condition)
  SELECT id FROM leads
  WHERE telefone_normalizado = $telefone_normalizado
    AND imobiliaria_id       = $imobiliaria_id
    AND created_at           > NOW() - INTERVAL '24 hours'
  FOR UPDATE SKIP LOCKED;
  → Se encontrou: ROLLBACK + retornar HTTP 409

  -- Passo B: inserir o lead
  INSERT INTO leads (...) RETURNING id;

  -- Passo C: registrar evento lead_criado
  INSERT INTO historico_leads (lead_id, tipo_evento, criado_por, dados, ...);

  -- Passo D: selecionar corretor (algoritmo de distribuição)
  SELECT id, nome FROM corretores
  WHERE equipe_id = $equipe_id AND em_plantao = true AND ativo = true
  ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC, ordem_plantao ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;  -- evita que dois leads simultâneos peguem o mesmo corretor

  -- Passo E-A: se corretor encontrado
  UPDATE leads SET corretor_id = $corretor_id, distribuido_em = NOW() WHERE id = $lead_id;
  UPDATE corretores SET ultimo_lead_recebido_em = NOW() WHERE id = $corretor_id;
  UPDATE equipes SET ultimo_lead_recebido_em = NOW() WHERE id = $equipe_id;
  INSERT INTO historico_leads (tipo_evento='lead_distribuido', ...);

  -- Passo E-B: se nenhum corretor
  UPDATE equipes SET ultimo_lead_recebido_em = NOW() WHERE id = $equipe_id;
  INSERT INTO historico_leads (tipo_evento='distribuicao_falhou', ...);

COMMIT;
```

**Por que atômico:** Sem transação, é possível:
- Dois webhooks simultâneos criarem o mesmo lead (race condition na deduplicação)
- Um lead ser criado sem evento `lead_criado` no histórico (crash entre os dois INSERTs)
- Dois leads simultâneos serem atribuídos ao mesmo corretor (race condition na distribuição)

**Mecanismo recomendado:** Supabase RPC (stored procedure em PostgreSQL) ou transação explícita via `supabase-admin` com `BEGIN/COMMIT`. A opção RPC é preferível porque o PostgreSQL gerencia o lock nativamente e a API route não precisa gerenciar o estado da conexão.

### Transação 2 — Mudança de status (simples)

Quando o pipeline muda de status (`status_alterado`):

```
BEGIN;
  UPDATE leads SET status = $novo_status WHERE id = $lead_id;
  INSERT INTO historico_leads (tipo_evento='status_alterado', dados={de, para}, usuario_id, ...);
COMMIT;
```

**Por que atômico:** O status do lead e o evento de histórico devem ser sempre consistentes. Um lead com `status='visita'` sem evento `status_alterado` no histórico é dado corrompido.

### Transação 3 — Redistribuição manual (moderada)

Quando o gestor reatribui um lead para outro corretor:

```
BEGIN;
  UPDATE leads SET corretor_id = $novo_corretor_id, distribuido_em = NOW() WHERE id = $lead_id;
  UPDATE corretores SET ultimo_lead_recebido_em = NOW() WHERE id = $novo_corretor_id;
  INSERT INTO historico_leads (tipo_evento='lead_redistribuido',
    dados={ corretor_anterior_id, novo_corretor_id }, usuario_id, ...);
COMMIT;
```

---

## Resumo — Gaps no schema atual que bloqueiam a implementação

| Gap | Impacto | Solução |
|-----|---------|---------|
| `corretores.em_plantao` existe mas todos os corretores têm `em_plantao=false` (default da migration 002) | Nenhum corretor será selecionado pelo algoritmo de distribuição | Ação manual no banco: `UPDATE corretores SET em_plantao=true WHERE ativo=true` (ver passo 3 das ações manuais da migration 002) |
| `leads.origem` enum só tem `'Instagram'`, `'Facebook'`, `'Outro'` | Origens como 'WhatsApp', 'Indicação', 'Portal', 'Plantão' não têm valor nativo | Usar `'Outro'` como catch-all no MVP. Expandir o enum em migration futura quando necessário. |
| Sem constraint banco que impeça corretor de equipe diferente | Lead pode ter `corretor_id` de outra equipe | Validar na API route antes do UPDATE |
| `SUPABASE_SERVICE_ROLE_KEY` pode não estar configurada no ambiente local | API routes de escrita falham silenciosamente | Confirmar variável de ambiente antes de implementar |

---

## Resumo Executivo

| Pergunta | Resposta |
|----------|----------|
| Canal de entrada | `POST /api/leads` — único endpoint para webhook e formulário |
| Campos obrigatórios | `nome`, `origem`, `telefone` (regra de negócio), `equipe_id` (resolvido), `imobiliaria_id` |
| FKs que devem preexistir | `equipes.id`, `imobiliarias.id`; `corretores.id` só quando atribuindo |
| Roteamento para equipe | `equipe_id` no payload → direto; sem `equipe_id` → rodízio por `ultimo_lead_recebido_em` |
| Seleção do corretor | `em_plantao=true AND ativo=true`, ORDER BY `ultimo_lead_recebido_em ASC`, LIMIT 1, FOR UPDATE SKIP LOCKED |
| Histórico | `lead_criado` sempre; `lead_distribuido` ou `distribuicao_falhou` conforme resultado |
| Atomicidade | Toda a operação de criação+distribuição em uma única transação de banco |
| Quem escreve no banco | API route server-side com `service_role` — nunca o client browser |
