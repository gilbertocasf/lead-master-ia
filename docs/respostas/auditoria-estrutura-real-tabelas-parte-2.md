# Auditoria Estrutural Real — Parte 2
## Detalhamento Completo: leads, vendas, historico_leads

**Data**: 2026-06-23  
**Fonte**: `supabase/schema.v2.sql` — comentários, constraints e definições SQL  
**Status**: Estrutura conforme definição — sem inferências

---

## TABELA: leads

**Descrição do Schema**:
```
Leads captados. equipe_id sempre preenchido. corretor_id = NULL enquanto aguardando distribuição.
```

**Política de equipe_id**:
```
equipe_id é NOT NULL: no fluxo do sistema, a equipe é sempre definida antes da inserção — 
diretamente pelo payload ou pelo rodízio automático. O rodízio pode falhar (503 sem equipes ativas) 
mas nunca deixa o lead sem equipe; nesse caso o lead não é criado.
```

---

### Coluna: id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Tipo PostgreSQL | UUID genérica de 128 bits |
| Nullable | ✗ NOT NULL |
| Default | `gen_random_uuid()` |
| Constraints | PRIMARY KEY |
| Índices | Implícito no PK |

**Semântica**:
- Identificador único imutável do lead
- Gerado automaticamente no lado do banco (não pelo cliente)
- Permanece inalterado ao longo do ciclo de vida do lead
- Usado em todas as FKs (historico_leads, vendas)

---

### Coluna: imobiliaria_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | FK → `imobiliarias(id)` ON DELETE CASCADE |
| Índices | `idx_leads_imobiliaria` ON `(imobiliaria_id)` |

**Semântica**:
- Tenant raiz — identifica a imobiliária proprietária do lead
- Preenchido obrigatoriamente no payload POST `/api/leads`
- Crítico para RLS: toda política de acesso filtra por este campo
- ON DELETE CASCADE: apagar a imobiliária apaga todos seus leads
- Índice simples permite filtrar leads por imobiliária rapidamente

**Operação de Leitura**:
```
SELECT * FROM leads WHERE imobiliaria_id = $1
```
Usado em dashboards, pipelines, rankings — sempre isolado por tenant.

---

### Coluna: equipe_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | FK → `equipes(id)` ON UPDATE CASCADE ON DELETE RESTRICT |
| Índices | `idx_leads_equipe` ON `(equipe_id)` |

**Semântica**:
- Identifica a equipe responsável pela captação/rodízio
- Sempre preenchido no momento da criação (obrigatório)
- Determina qual equipe receberá o lead para distribuição
- ON UPDATE CASCADE: se equipe for renumerada (UUID mudou), leva o lead junto
- ON DELETE RESTRICT: protege contra deleção acidental de equipe com leads ativos
- Índice permite consultas de fila de plantão: `WHERE equipe_id = ?`

**Fluxo de Roteamento**:
1. Lead chega sem equipe_id no payload (formulário externo)
2. Sistema executa rodízio: `SELECT * FROM equipes WHERE imobiliaria_id = $1 AND ativo = true ORDER BY ultimo_lead_recebido_em ASC LIMIT 1`
3. equipe_id é preenchido com resultado do rodízio
4. Lead é criado com `equipe_id = <resultado>`
5. Se nenhuma equipe ativa existir: requisição retorna 503, lead não é criado

---

### Coluna: corretor_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | FK → `corretores(id)` ON UPDATE CASCADE ON DELETE SET NULL |
| Índices | `idx_leads_corretor` ON `(corretor_id)` |

**Semântica**:
- Identifica o corretor atribuído ao lead para contato/acompanhamento
- NULL = lead aguardando distribuição (na fila de plantão)
- ON UPDATE CASCADE: se corretor for reatribuído (UUID mudou), leva o lead junto
- ON DELETE SET NULL: se corretor for deletado, lead volta para NULL (fila de espera)
- Índice permite encontrar todos os leads de um corretor

**Ciclo de Vida**:
```
Criação:  corretor_id = NULL
Distribuição:  corretor_id = <uuid do corretor de plantão>
Redistribuição:  corretor_id = <uuid do novo corretor>
Desligamento do corretor:  corretor_id = NULL (cascata, volta à fila)
```

**Query de Fila de Distribuição**:
```sql
SELECT id, nome, telefone FROM leads 
WHERE equipe_id = $1 AND corretor_id IS NULL
ORDER BY created_at ASC;
```

---

### Coluna: nome

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | — |
| Índices | — |

**Semântica**:
- Nome do contato do lead (pessoa física ou jurídica)
- Obrigatório na captura via formulário ou webhook
- Campo livre (sem validação de formato)
- Usado em displays, relatórios, histórico
- Sem índice (busca por nome é rara; telefone é chave primária de deduplicação)

**Exemplo**:
```
"João Silva", "Empresa ABC LTDA", "PESSOA JURÍDICA 2025"
```

---

### Coluna: telefone

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | — |
| Índices | — |

**Semântica**:
- Telefone com máscara visual (ex.: `(11) 98765-4321`)
- Opcional na captura, mas recomendado
- **Formato bruto**: não normalizado nesta coluna
- Complemento: `telefone_normalizado` contém apenas dígitos
- Exibido no contato e comunicação com corretor

**Validação Esperada na Aplicação**:
- Padrão: 11 dígitos (Brasil) ou número variável
- Máscara visual: `(\d{2}) \d{5}-\d{4}` (São Paulo, padrão brasileiro)

**Exemplo**:
```
"(11) 98765-4321", "(21) 99876-5432", "1133334444"
```

---

### Coluna: telefone_normalizado

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | — |
| Índices | `idx_leads_deduplicacao` ON `(telefone_normalizado, created_at)` |

**Semântica**:
```
Telefone com apenas dígitos (sem máscara). Índice composto com created_at cobre deduplicação por 24h.
```

- Normalização: apenas `[0-9]` (sem parênteses, hífens, espaços, etc.)
- Crítico para deduplicação: evita captura duplicada do mesmo contato
- Índice composto `(telefone_normalizado, created_at)` permite:
  ```sql
  SELECT * FROM leads 
  WHERE imobiliaria_id = $1 
    AND telefone_normalizado = $2 
    AND created_at > NOW() - INTERVAL '24 hours'
  ```
- Se resultado > 0: é duplicata, não criar novo lead

**Fluxo de Deduplicação**:
1. Cliente envia `telefone = "(11) 98765-4321"`
2. Backend normaliza: `telefone_normalizado = "11987654321"`
3. Query: existe lead com este telefone nos últimos 24h?
4. Se SIM: erro 409 Conflict, não criar
5. Se NÃO: criar novo lead com ambos os campos

**Exemplo**:
```
telefone: "(11) 98765-4321"
telefone_normalizado: "11987654321"

telefone: "11 9 8765-4321"
telefone_normalizado: "11987654321" (mesmo após normalização = duplicata)
```

---

### Coluna: origem

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `lead_origem` (ENUM) |
| Enum Values | `'Instagram'`, `'Facebook'`, `'Outro'` |
| Nullable | ✗ NOT NULL |
| Default | `'Outro'` |
| Constraints | — |
| Índices | — |

**Semântica**:
```
Canais de origem do lead (espelha lib/types.ts LeadSource)
```

- Canal de captura/marketing de onde veio o lead
- Obrigatório, mas DEFAULT = 'Outro' se não informado
- Usado para análise de ROI de canais (Instagram vs Facebook vs organismo)
- Sem índice (filtro por origem é raro; filtros principais são equipe, status)

**Possíveis Valores**:
- `'Instagram'`: lead captado via anúncio ou DM Instagram
- `'Facebook'`: lead captado via anúncio ou formulário Facebook
- `'Outro'`: website, indicação, telefone direto, etc.

**Exemplo de Webhook**:
```json
{
  "nome": "João Silva",
  "telefone": "(11) 98765-4321",
  "origem": "Instagram",
  "interesse": "Compra • Apto 2 quartos"
}
```

---

### Coluna: interesse

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | — |
| Índices | — |

**Semântica**:
- Descrição livre do que o lead busca (tipo de imóvel, localização, etc.)
- Opcional na captura
- Campo estrutura em aplicações avançadas, aqui é texto livre
- Exibido no lead card e pipeline para contexto do corretor

**Exemplo**:
```
"Compra • Apto 2 quartos"
"Aluguel • Sala comercial em Paulista"
"Venda • Casa em Grajaú"
"Interessado em condomínios em São Bernardo"
```

---

### Coluna: faixa_valor

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | — |
| Índices | — |

**Semântica**:
- Faixa de preço/orçamento que o lead informou
- Opcional e em formato texto livre (não numérico)
- Permite formatação visual: "R$ 400–600 mil", "R$ 1,2 mi", etc.
- Usado para filtrar imóveis disponíveis no contato inicial

**Exemplo**:
```
"R$ 400–600 mil"
"R$ 1,2–1,5 mi"
"Sem limite"
"Até R$ 200 mil"
"Acima de R$ 3 mi"
```

---

### Coluna: status

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `lead_status` (ENUM) |
| Enum Values | `'novo'`, `'em_contato'`, `'visita'`, `'proposta'`, `'fechado'`, `'perdido'` |
| Nullable | ✗ NOT NULL |
| Default | `'novo'` |
| Constraints | — |
| Índices | `idx_leads_status` ON `(status)` |

**Semântica**:
```
Etapas do pipeline (espelha lib/types.ts LeadStatus)
```

- Estado atual do lead no funil de vendas
- Obrigatório, DEFAULT = 'novo' (estado inicial)
- Transições de status definem o funnel
- Índice permite segmentar o pipeline por status

**Máquina de Estados**:
```
novo
  ↓
em_contato (corretor contatou)
  ↓
visita (agendou/realizou visita)
  ↓
proposta (enviou proposta)
  ├─→ fechado (conversão bem-sucedida)
  └─→ perdido (descartado, sem interesse, concorrência)
```

**Estados de Saída**: `fechado` e `perdido` marcam fim do pipeline  
**Estados Ativos**: `novo`, `em_contato`, `visita`, `proposta` (contagem para funil)

**Query do Funnel**:
```sql
SELECT status, COUNT(*) as quantidade
FROM leads
WHERE imobiliaria_id = $1 AND status != 'perdido'
GROUP BY status
ORDER BY CASE 
  WHEN status = 'novo' THEN 1
  WHEN status = 'em_contato' THEN 2
  WHEN status = 'visita' THEN 3
  WHEN status = 'proposta' THEN 4
  WHEN status = 'fechado' THEN 5
END;
```

---

### Coluna: observacoes

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | — |
| Índices | — |

**Semântica**:
- Anotações livres do corretor ou gestor sobre o lead
- Opcional, preenchida manualmente durante acompanhamento
- Não é indexada (busca por texto é operação pesada)
- Usado para contexto histórico: "cliente tem restrições", "aguardando resposta", etc.

**Exemplo**:
```
"Cliente trabalha longe, prefere perto de metrô"
"Já viu 3 imóveis, interessado em verde"
"Aguardando resposta da empresa sobre transferência"
"Suspeita de financiamento - verificar capacidade"
```

---

### Coluna: distribuido_em

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TIMESTAMPTZ` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | — |
| Índices | — |

**Semântica**:
```
Timestamp da atribuição ao corretor. Início do SLA de primeiro contato (30min amarelo / 2h vermelho).
```

- Registra o exato momento em que o lead foi atribuído a um corretor
- NULL = lead ainda não foi distribuído (aguardando fila)
- Crítico para SLA: calcula tempo desde distribuição até primeiro contato
- Comparação: `NOW() - distribuido_em` mede quantas horas/minutos desde atribuição

**Fluxo**:
```
Criação do lead:  distribuido_em = NULL, corretor_id = NULL
Distribuição:  corretor_id = <uuid>, distribuido_em = NOW()
Redistribuição:  corretor_id = <uuid novo>, distribuido_em = NOW() (atualiza timestamp)
```

**SLA Visualization**:
```
Amarelo (warning):   30 min < tempo_desde_distribuição < 2 horas
Vermelho (critical): tempo_desde_distribuição > 2 horas
Verde (ok):         tempo_desde_distribuição < 30 min
```

**Exemplo de Cálculo**:
```sql
SELECT 
  id, 
  nome,
  EXTRACT(EPOCH FROM (NOW() - distribuido_em)) / 60 as minutos_decorridos
FROM leads
WHERE distribuido_em IS NOT NULL
  AND corretor_id IS NOT NULL
  AND status = 'novo';
```

---

### Coluna: created_at

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TIMESTAMPTZ` |
| Nullable | ✗ NOT NULL |
| Default | `now()` |
| Constraints | — |
| Índices | (Implícito em `idx_leads_deduplicacao`) |

**Semântica**:
- Timestamp de criação do lead no banco
- Gerado automaticamente (não pelo cliente)
- Imutável — nunca é atualizado
- Zona horária: `TIMESTAMPTZ` (timezone-aware)
- Usado em deduplicação: `WHERE created_at > NOW() - INTERVAL '24 hours'`
- Usado em ordenação natural: leads mais antigos aparecem primeiro na fila

**Precisão**:
- PostgreSQL: microsegundos (6 casas decimais)
- Supabase padrão: `CURRENT_TIMESTAMP` = microsegundos UTC

**Exemplo**:
```
2026-06-23 14:32:45.123456+00:00
```

---

### Índices da Tabela leads

#### idx_leads_imobiliaria
```sql
CREATE INDEX idx_leads_imobiliaria ON leads (imobiliaria_id);
```
- **Tipo**: B-tree (padrão)
- **Coluna**: `(imobiliaria_id)`
- **Uso**: filtra leads por tenant em qualquer query
- **Cardinality**: alta (muitos leads por imobiliária)

#### idx_leads_equipe
```sql
CREATE INDEX idx_leads_equipe ON leads (equipe_id);
```
- **Tipo**: B-tree
- **Coluna**: `(equipe_id)`
- **Uso**: filtra leads por equipe (relatórios, pipeline)

#### idx_leads_corretor
```sql
CREATE INDEX idx_leads_corretor ON leads (corretor_id);
```
- **Tipo**: B-tree
- **Coluna**: `(corretor_id)`
- **Uso**: filtra leads atribuídos a um corretor

#### idx_leads_status
```sql
CREATE INDEX idx_leads_status ON leads (status);
```
- **Tipo**: B-tree
- **Coluna**: `(status)`
- **Uso**: segmenta o pipeline por status

#### idx_leads_fila
```sql
CREATE INDEX idx_leads_fila ON leads (equipe_id) 
WHERE corretor_id IS NULL;
```
- **Tipo**: B-tree com filtro parcial (índice sparse)
- **Coluna**: `(equipe_id)` com predicado `WHERE corretor_id IS NULL`
- **Uso**: otimiza query da fila de distribuição
- **Explicação**: armazena apenas leads aguardando distribuição, economia de espaço

#### idx_leads_deduplicacao
```sql
CREATE INDEX idx_leads_deduplicacao ON leads (telefone_normalizado, created_at);
```
- **Tipo**: B-tree composto (2 colunas)
- **Colunas**: `(telefone_normalizado, created_at)`
- **Uso**: deduplicação por telefone com janela de 24h
- **Query coberta**:
  ```sql
  SELECT * FROM leads 
  WHERE telefone_normalizado = '11987654321'
    AND created_at > NOW() - INTERVAL '24 hours';
  ```
- **Ordem de coluna crítica**: telefone primeiro (busca por valor específico), depois created_at (range)

---

### Row Level Security (RLS) para leads

**Tabela**: `leads` | **Estado**: HABILITADA

#### Política: leads_select_admin_gestor
```sql
CREATE POLICY "leads_select_admin_gestor" ON leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );
```
- **Sujeito**: usuários logados com role = 'admin' ou 'gestor'
- **Ação**: SELECT
- **Acesso**: todos os leads da sua imobiliária
- **Uso**: dashboard, pipeline, relatórios gerenciais

#### Política: leads_select_corretor
```sql
CREATE POLICY "leads_select_corretor" ON leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'corretor'
    AND corretor_id = (
      SELECT id FROM corretores
      WHERE usuario_id = current_usuario_id()
        AND imobiliaria_id = current_imobiliaria_id()
      LIMIT 1
    )
  );
```
- **Sujeito**: usuários logados com role = 'corretor'
- **Ação**: SELECT
- **Acesso**: apenas leads onde `corretor_id` = seu registro de corretor
- **Pressupostos**: 1 usuário = 1 corretor (MVP)
- **LIMIT 1**: guard defensivo (deveria haver apenas 1 resultado)
- **Uso**: app mobile do corretor, ver próprios leads

#### Política: leads_update_admin_gestor
```sql
CREATE POLICY "leads_update_admin_gestor" ON leads
  FOR UPDATE TO authenticated
  USING  (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (current_user_role() IN ('admin', 'gestor'));
```
- **Sujeito**: admin/gestor
- **Ação**: UPDATE (INSERT/DELETE sem política = bloqueadas)
- **Acesso**: podem atualizar leads da imobiliária
- **Operações Permitidas**: atualizar status, corretor_id, observações
- **Uso**: movimentar lead no pipeline, reatribuir corretor

**Nota**: Corretor NÃO pode atualizar leads via client (RLS bloqueia). Movimentação de status é via API route com `service_role`.

---

## TABELA: historico_leads

**Descrição do Schema**:
```
Auditoria imutável de eventos do lead. Nunca alterar ou apagar registros — apenas inserir.
```

**Política de Imutabilidade**:
```
Inserções apenas via service_role (operações do servidor).
Nunca atualizar ou apagar eventos. ON DELETE CASCADE acompanha o lead.
```

---

### Coluna: id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✗ NOT NULL |
| Default | `gen_random_uuid()` |
| Constraints | PRIMARY KEY |
| Índices | Implícito no PK |

**Semântica**:
- Identificador único do evento histórico
- Gerado automaticamente no lado do banco
- Imutável — nunca é modificado ou apagado
- Permite rastrear versão de cada evento

---

### Coluna: imobiliaria_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | FK → `imobiliarias(id)` ON DELETE CASCADE |
| Índices | `idx_historico_imobiliaria` ON `(imobiliaria_id)` |

**Semântica**:
- Tenant raiz — imobiliária proprietária do evento
- Preenchido em tempo de inserção do evento
- ON DELETE CASCADE: apagar imobiliária apaga todo histórico dos seus leads
- RLS filtra histórico por imobiliária

---

### Coluna: lead_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | FK → `leads(id)` ON DELETE CASCADE |
| Índices | `idx_historico_lead` ON `(lead_id, created_at DESC)` |

**Semântica**:
- Referência ao lead que gerou o evento
- Obrigatório — todo evento está associado a um lead
- ON DELETE CASCADE: apagar lead apaga todo seu histórico
- Índice composto permite recuperar cronologia completa do lead

**Query de Timeline do Lead**:
```sql
SELECT * FROM historico_leads
WHERE lead_id = $1
ORDER BY created_at DESC;
```

---

### Coluna: tipo_evento

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | CHECK (tipo_evento IN ('lead_criado', 'lead_roteado', 'lead_distribuido', 'distribuicao_falhou', 'status_alterado', 'lead_redistribuido')) |
| Índices | — |

**Semântica**:
- Tipo/categoria do evento ocorrido
- Obrigatório e restritos a 6 valores pré-definidos
- Define a semântica do campo `dados` (estrutura JSONB varia por tipo)

**Valores Possíveis**:

#### 'lead_criado'
- Evento gerado quando lead é criado via webhook ou formulário
- Dados esperados: `{origem, equipe_id}`
- Exemplo:
  ```json
  {
    "tipo_evento": "lead_criado",
    "dados": {
      "origem": "Instagram",
      "equipe_id": "e1234567-890a-bcde-f012-345678901234"
    }
  }
  ```

#### 'lead_roteado'
- Evento gerado quando sistema executa rodízio automático de equipe (sem equipe_id no payload)
- Dados esperados: `{equipe_id, motivo}`
- Exemplo:
  ```json
  {
    "tipo_evento": "lead_roteado",
    "dados": {
      "equipe_id": "e1234567-890a-bcde-f012-345678901234",
      "motivo": "Rodízio automático — lead sem equipe_id"
    }
  }
  ```

#### 'lead_distribuido'
- Evento gerado quando lead é atribuído a um corretor (sai da fila)
- Dados esperados: `{corretor_id, corretor_nome}`
- Exemplo:
  ```json
  {
    "tipo_evento": "lead_distribuido",
    "dados": {
      "corretor_id": "c7890123-456a-bcde-f012-345678901234",
      "corretor_nome": "João Silva"
    }
  }
  ```

#### 'distribuicao_falhou'
- Evento gerado quando tentativa de distribuição falhou (ex.: sem corretores em plantão)
- Dados esperados: `{motivo}`
- Exemplo:
  ```json
  {
    "tipo_evento": "distribuicao_falhou",
    "dados": {
      "motivo": "Nenhum corretor em plantão na equipe"
    }
  }
  ```

#### 'status_alterado'
- Evento gerado quando status do lead é movido no pipeline
- Dados esperados: `{status_anterior, status_novo, motivo_perda?}`
- Exemplo (sucesso):
  ```json
  {
    "tipo_evento": "status_alterado",
    "dados": {
      "status_anterior": "visita",
      "status_novo": "proposta"
    }
  }
  ```
- Exemplo (perda):
  ```json
  {
    "tipo_evento": "status_alterado",
    "dados": {
      "status_anterior": "proposta",
      "status_novo": "perdido",
      "motivo_perda": "Cliente escolheu concorrente"
    }
  }
  ```

#### 'lead_redistribuido'
- Evento gerado quando lead é reatribuído a outro corretor
- Dados esperados: `{corretor_anterior_id, corretor_novo_id, motivo?}`
- Exemplo:
  ```json
  {
    "tipo_evento": "lead_redistribuido",
    "dados": {
      "corretor_anterior_id": "c1234567-890a-bcde-f012-345678901234",
      "corretor_novo_id": "c9876543-210f-edcb-a987-654321098765",
      "motivo": "Primeiro corretor indisponível"
    }
  }
  ```

---

### Coluna: descricao

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | — |
| Índices | — |

**Semântica**:
- Descrição legível do evento em linguagem natural
- Opcional, oferece contexto adicional além de `dados`
- Complementa o JSONB com prosa

**Exemplo**:
```
"Lead capturado via Instagram — Equipe Zona Sul"
"Lead distribuído para João Silva (plantão)"
"Transição: visita → proposta. Cliente visitou 2 imóveis e pediu proposta."
"Redistribuição: primeiro corretor sem resposta por 2h, passando para substituto."
```

---

### Coluna: dados

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `JSONB` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | — |
| Índices | — |

**Semântica**:
```
Snapshot do estado no momento do evento. Estrutura por tipo:
  lead_criado={origem,equipe_id}
  lead_distribuido={corretor_id,corretor_nome}
  status_alterado={status_anterior,status_novo,motivo_perda?}
  lead_roteado={equipe_id,motivo}
```

- Armazena metadados do evento em formato JSON estruturado
- Permite consultas e análises por campos específicos
- JSONB: índices funcionam em chaves (mais eficiente que JSON)
- Variante por `tipo_evento` (não há uma estrutura única)

**Operador JSONB em PostgreSQL**:
```sql
-- Extrair campo aninhado
SELECT dados->>'corretor_nome' as nome_corretor
FROM historico_leads
WHERE tipo_evento = 'lead_distribuido';

-- Filtrar por valor JSONB
SELECT * FROM historico_leads
WHERE dados->>'status_novo' = 'fechado'
  AND tipo_evento = 'status_alterado';

-- Verificar presença de chave
SELECT * FROM historico_leads
WHERE dados ? 'motivo_perda'
  AND tipo_evento = 'status_alterado';
```

---

### Coluna: criado_por

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TEXT` |
| Nullable | ✗ NOT NULL |
| Default | `'sistema'` |
| Constraints | CHECK (criado_por IN ('sistema', 'formulario', 'webhook', 'usuario')) |
| Índices | — |

**Semântica**:
- Origem/agente que criou o evento
- Obrigatório, com default = 'sistema'
- Restritos a 4 valores: identifica quem/o quê gerou o evento

**Valores Possíveis**:

#### 'sistema'
- Evento gerado por lógica interna do servidor (rodízio, distribuição automática, etc.)
- Exemplo: distribuição automática de lead quando corretor sai de plantão

#### 'formulario'
- Evento gerado por entrada via formulário web na aplicação
- Exemplo: usuário preencheu formulário de novo lead no dashboard

#### 'webhook'
- Evento gerado por webhook externo (integração com CRM, landing page, etc.)
- Exemplo: integração com Typeform, Google Forms, etc.

#### 'usuario'
- Evento gerado por ação manual de usuário autenticado
- Exemplo: gestor moveu lead de 'visita' → 'proposta' manualmente
- Quando isso ocorre, `usuario_id` é preenchido

---

### Coluna: usuario_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | FK → `usuarios(id)` ON DELETE SET NULL |
| Índices | — |

**Semântica**:
```
Preenchido quando criado_por=usuario. NULL em eventos automáticos do sistema.
```

- Identifica qual usuário autenticado gerou o evento
- NULL quando `criado_por` ∈ {'sistema', 'formulario', 'webhook'}
- ON DELETE SET NULL: apagar usuário não apaga evento, apenas desvincula
- Permite rastrear quem fez o quê (auditoria com nome de usuário)

**Caso de Uso**:
```
Gestor move lead de 'proposta' → 'fechado' manualmente:
  tipo_evento = 'status_alterado'
  criado_por = 'usuario'
  usuario_id = <uuid do gestor>
  dados = { status_anterior: 'proposta', status_novo: 'fechado' }
```

---

### Coluna: created_at

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TIMESTAMPTZ` |
| Nullable | ✗ NOT NULL |
| Default | `now()` |
| Constraints | — |
| Índices | (Implícito em `idx_historico_lead`) |

**Semântica**:
- Timestamp exato do evento
- Gerado automaticamente (não pelo cliente)
- Imutável — nunca é alterado
- Zona horária: `TIMESTAMPTZ` (UTC padrão Supabase)
- Ordenação: `ORDER BY created_at DESC` para timeline reversa (eventos mais recentes primeiro)

---

### Índices da Tabela historico_leads

#### idx_historico_imobiliaria
```sql
CREATE INDEX idx_historico_imobiliaria ON historico_leads (imobiliaria_id);
```
- **Tipo**: B-tree
- **Coluna**: `(imobiliaria_id)`
- **Uso**: filtra eventos por tenant

#### idx_historico_lead
```sql
CREATE INDEX idx_historico_lead ON historico_leads (lead_id, created_at DESC);
```
- **Tipo**: B-tree composto
- **Colunas**: `(lead_id, created_at DESC)` — descending em created_at
- **Uso**: recuperar timeline completa de um lead em ordem reversa
- **Query coberta**:
  ```sql
  SELECT * FROM historico_leads
  WHERE lead_id = '...'
  ORDER BY created_at DESC;
  ```
- **Ordem DESC no índice**: PostgreSQL otimiza ORDER BY DESC sem sorter adicional

---

### Row Level Security (RLS) para historico_leads

**Tabela**: `historico_leads` | **Estado**: HABILITADA

#### Política: historico_select_admin_gestor
```sql
CREATE POLICY "historico_select_admin_gestor" ON historico_leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );
```
- **Sujeito**: admin/gestor
- **Ação**: SELECT
- **Acesso**: todo histórico da imobiliária
- **Uso**: auditoria, relatórios, rastreamento de jornada do lead

#### Política: historico_select_corretor
```sql
CREATE POLICY "historico_select_corretor" ON historico_leads
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'corretor'
    AND lead_id IN (
      SELECT l.id FROM leads l
      WHERE l.corretor_id = (
        SELECT id FROM corretores
        WHERE usuario_id = current_usuario_id()
          AND imobiliaria_id = current_imobiliaria_id()
        LIMIT 1
      )
    )
  );
```
- **Sujeito**: corretor
- **Ação**: SELECT
- **Acesso**: histórico apenas dos leads atribuídos ao corretor
- **Pressupostos**: 1 usuário = 1 corretor
- **Uso**: app mobile, acompanhar contexto da jornada do lead próprio

**Nota**: Sem políticas INSERT/UPDATE/DELETE para authenticated (apenas `service_role`). Histórico é imutável.

---

## TABELA: vendas

**Descrição do Schema**:
```
Vendas fechadas. Base do ranking VGV. lead_id nullable para vendas históricas sem lead vinculado.
```

---

### Coluna: id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✗ NOT NULL |
| Default | `gen_random_uuid()` |
| Constraints | PRIMARY KEY |
| Índices | Implícito no PK |

**Semântica**:
- Identificador único da venda
- Gerado automaticamente no lado do banco
- Imutável — usado em referências cruzadas

---

### Coluna: imobiliaria_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | FK → `imobiliarias(id)` ON DELETE CASCADE |
| Índices | `idx_vendas_imobiliaria` ON `(imobiliaria_id)` |

**Semântica**:
- Tenant raiz — imobiliária proprietária da venda
- Obrigatório
- ON DELETE CASCADE: apagar imobiliária apaga todas suas vendas
- RLS filtra vendas por imobiliária

---

### Coluna: lead_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✓ YES |
| Default | NULL |
| Constraints | FK → `leads(id)` ON UPDATE CASCADE ON DELETE SET NULL |
| Índices | `idx_vendas_lead` ON `(lead_id)` |

**Semântica**:
```
lead_id nullable para vendas históricas sem lead vinculado.
```

- Referência ao lead que gerou a venda
- OPCIONAL (permite vendas sem rastreamento de lead)
- ON UPDATE CASCADE: se lead for atualizado, venda acompanha
- ON DELETE SET NULL: apagar lead não apaga venda, apenas desvincula
- Índice permite encontrar venda por lead

**Caso de Uso — Vendas sem Lead**:
- Vendas pré-sistema (histórico importado de CRM anterior)
- Vendas por contato direto, não via sistema de captação
- Arquivos/legado sem rastreamento de lead

**Exemplo**:
```
venda_id: v1234...
lead_id: NULL  (venda importada de CRM antigo)
corretor_id: c5678...
valor: 450000
data_venda: 2025-12-01
```

---

### Coluna: corretor_id

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `UUID` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | FK → `corretores(id)` ON UPDATE CASCADE ON DELETE RESTRICT |
| Índices | `idx_vendas_corretor` ON `(corretor_id)` |

**Semântica**:
- Identifica o corretor responsável pela venda
- Obrigatório — toda venda tem um responsável
- ON UPDATE CASCADE: se corretor for reatribuído, venda acompanha
- ON DELETE RESTRICT: não permite apagar corretor com vendas (protege integridade do ranking)
- Índice permite ranking por corretor (KPI VGV)

**Ranking Query**:
```sql
SELECT 
  c.nome as corretor,
  COUNT(v.id) as total_vendas,
  SUM(v.valor) as total_vgv,
  AVG(v.valor) as ticket_medio
FROM vendas v
JOIN corretores c ON v.corretor_id = c.id
WHERE v.imobiliaria_id = $1
  AND v.data_venda >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY c.id, c.nome
ORDER BY SUM(v.valor) DESC;
```

---

### Coluna: valor

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `NUMERIC(14,2)` |
| Nullable | ✗ NOT NULL |
| Default | — |
| Constraints | CHECK (valor > 0) |
| Índices | — |

**Semântica**:
```
Valor Geral de Vendas em reais. Renomeado de valor_vgv do schema v1.
```

- Valor final da transação imobiliária
- Obrigatório e > 0 (CHECK constraint garante)
- Tipo: NUMERIC com 14 dígitos total, 2 casas decimais
- Máximo: 99.999.999.999,99 (suficiente para imóveis de alto valor)
- Sem índice (ordenação por valor é rara; ordenação por SUM é via agregação)

**Formato**:
```
999.999.999,99 (até R$ 100 bilhões)
450.000,00
1.200.000,50
```

**Precisão**: NUMERIC garante cálculos exatos (não há problema de arredondamento como FLOAT)

---

### Coluna: data_venda

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `DATE` |
| Nullable | ✗ NOT NULL |
| Default | `CURRENT_DATE` |
| Constraints | — |
| Índices | `idx_vendas_data` ON `(data_venda)` |

**Semântica**:
- Data em que a venda foi realizada/fechada
- Obrigatório, DEFAULT = data corrente se não informado
- Tipo: DATE (apenas dia/mês/ano, sem hora)
- Índice permite filtrar por período (mês, trimestre, ano)

**Query de VGV por Período**:
```sql
SELECT 
  DATE_TRUNC('month', data_venda) as mes,
  SUM(valor) as total_vgv
FROM vendas
WHERE imobiliaria_id = $1
GROUP BY DATE_TRUNC('month', data_venda)
ORDER BY mes DESC;
```

**Exemplo**:
```
2026-06-23
2026-12-15
2025-01-30
```

---

### Coluna: created_at

| Propriedade | Valor |
|-------------|-------|
| Tipo SQL | `TIMESTAMPTZ` |
| Nullable | ✗ NOT NULL |
| Default | `now()` |
| Constraints | — |
| Índices | — |

**Semântica**:
- Timestamp de criação do registro de venda no banco
- Gerado automaticamente
- Imutável
- Zona horária: `TIMESTAMPTZ` (UTC)
- Diferente de `data_venda`: `created_at` = quando foi registrado no sistema, `data_venda` = quando ocorreu

**Exemplo**:
```
Venda ocorreu em: 2026-06-23 (data_venda)
Registrada no sistema em: 2026-07-01 14:32:45+00:00 (created_at)
```

---

### Índices da Tabela vendas

#### idx_vendas_imobiliaria
```sql
CREATE INDEX idx_vendas_imobiliaria ON vendas (imobiliaria_id);
```
- **Tipo**: B-tree
- **Coluna**: `(imobiliaria_id)`
- **Uso**: filtra vendas por tenant

#### idx_vendas_corretor
```sql
CREATE INDEX idx_vendas_corretor ON vendas (corretor_id);
```
- **Tipo**: B-tree
- **Coluna**: `(corretor_id)`
- **Uso**: ranking, KPI por corretor

#### idx_vendas_lead
```sql
CREATE INDEX idx_vendas_lead ON vendas (lead_id);
```
- **Tipo**: B-tree
- **Coluna**: `(lead_id)`
- **Uso**: rastrear se um lead gerou venda
- **Query**: `SELECT * FROM vendas WHERE lead_id = $1`

#### idx_vendas_data
```sql
CREATE INDEX idx_vendas_data ON vendas (data_venda);
```
- **Tipo**: B-tree
- **Coluna**: `(data_venda)`
- **Uso**: filtrar por período (mês, trimestre, ano)
- **Query coberta**:
  ```sql
  SELECT * FROM vendas 
  WHERE data_venda >= '2026-06-01' 
    AND data_venda <= '2026-06-30'
  ORDER BY valor DESC;
  ```

---

### Row Level Security (RLS) para vendas

**Tabela**: `vendas` | **Estado**: HABILITADA

#### Política: vendas_select_admin_gestor
```sql
CREATE POLICY "vendas_select_admin_gestor" ON vendas
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() IN ('admin', 'gestor')
  );
```
- **Sujeito**: admin/gestor
- **Ação**: SELECT
- **Acesso**: todas as vendas da imobiliária
- **Uso**: ranking, dashboard de performance, relatórios

#### Política: vendas_select_corretor
```sql
CREATE POLICY "vendas_select_corretor" ON vendas
  FOR SELECT TO authenticated
  USING (
    imobiliaria_id = current_imobiliaria_id()
    AND current_user_role() = 'corretor'
    AND corretor_id = (
      SELECT id FROM corretores
      WHERE usuario_id = current_usuario_id()
        AND imobiliaria_id = current_imobiliaria_id()
      LIMIT 1
    )
  );
```
- **Sujeito**: corretor
- **Ação**: SELECT
- **Acesso**: apenas as próprias vendas
- **Uso**: app mobile, ver histórico de vendas pessoal

**Nota**: Sem políticas INSERT/UPDATE/DELETE para authenticated (apenas `service_role`). Vendas são criadas por operação do servidor.

---

## Resumo Operacional

### Fluxo: Lead → Venda

```
1. CRIAÇÃO (POST /api/leads)
   ↓ payload: nome, telefone, origem, equipe_id?
   ↓ deduplicação por telefone_normalizado (24h)
   ↓ rodízio se equipe_id ausente
   ↓ INSERT leads: status='novo', corretor_id=NULL, distribuido_em=NULL
   ↓ INSERT historico_leads: tipo_evento='lead_criado', criado_por='webhook'
   
2. DISTRIBUIÇÃO (POST /api/distribute)
   ↓ SELECT leads WHERE equipe_id=? AND corretor_id IS NULL ORDER BY created_at
   ↓ SELECT corretores WHERE equipe_id=? AND em_plantao=true ORDER BY ultimo_lead_recebido_em
   ↓ UPDATE leads: corretor_id=<corretor>, distribuido_em=NOW()
   ↓ UPDATE equipes: ultimo_lead_recebido_em=NOW()
   ↓ UPDATE corretores: ultimo_lead_recebido_em=NOW()
   ↓ INSERT historico_leads: tipo_evento='lead_distribuido', criado_por='sistema'

3. ACOMPANHAMENTO (UI Pipeline)
   ↓ corretor marca como 'em_contato' / 'visita' / 'proposta' (via API route com service_role)
   ↓ INSERT historico_leads: tipo_evento='status_alterado', criado_por='usuario'

4. FECHAMENTO (POST /api/close-lead)
   ↓ UPDATE leads: status='fechado'
   ↓ INSERT vendas: lead_id, corretor_id, valor, data_venda
   ↓ INSERT historico_leads: tipo_evento='status_alterado', dados={status_novo:'fechado'}

5. RANKING (GET /api/ranking)
   ↓ SELECT SUM(valor) FROM vendas GROUP BY corretor_id
   ↓ Ordena por VGV (maior primeiro)
```

---

**Fim da Auditoria — Parte 2**
