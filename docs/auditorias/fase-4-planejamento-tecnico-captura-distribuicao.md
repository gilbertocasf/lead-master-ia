# Fase 4 — Planejamento Técnico: Captura e Distribuição de Leads
**Data:** 2026-06-19  
**Referências:** [DECISOES-ARQUITETURA.md](../DECISOES-ARQUITETURA.md) · [PROXIMAS-FASES.md](../PROXIMAS-FASES.md) · [fase-3-1c-regras-roteamento.md](./fase-3-1c-regras-roteamento.md) · [fase-3-1d-jornada-real-lead.md](./fase-3-1d-jornada-real-lead.md)  
**Status:** APROVADO — pronto para Fase 5  
**Metodologia:** Planejamento técnico. Nenhum código de aplicação alterado. Nenhuma migration criada.

### Decisões confirmadas na aprovação (2026-06-19)

| Decisão | Escolha |
|---------|---------|
| Distribuição | Automática na criação. Se houver corretor de plantão, lead já sai com corretor atribuído. "Distribuir" serve apenas para redistribuição de leads que ficaram na fila por ausência de plantão. |
| Deduplicação | Bloquear e informar. Mesmo telefone em 24h → HTTP 409. UI exibe: "Número já cadastrado ([nome], [X min atrás]). Abrir lead existente?" Sem criação silenciosa. |
| Lead sem equipe_id | Rodízio automático. Seleciona equipe com menor `ultimo_lead_recebido_em`. Formulário manual mantém `equipe_id` obrigatório — este caso só ocorre via webhook. |

---

## 1. Estado atual do projeto

### 1.1 Rotas existentes

| Rota | Arquivo | Tipo | Estado |
|------|---------|------|--------|
| `/` | `app/page.tsx` | Server Component | Visual funcionando com dados reais |
| `/leads` | `app/leads/page.tsx` | Server Component | Visual funcionando; botões sem ação |
| `/pipeline` | `app/pipeline/page.tsx` | Server Component | Visual estático; sem interatividade |
| `/corretores` | `app/corretores/page.tsx` | Server Component | Visual funcionando |
| `/equipes` | `app/equipes/page.tsx` | Server Component | Visual funcionando |
| `/ranking` | `app/ranking/page.tsx` | Server Component | Visual funcionando |

Não existe nenhum diretório `app/api/` — nenhuma API route implementada.  
Não existe nenhum diretório `app/actions/` — nenhuma Server Action implementada.

### 1.2 Componentes existentes

| Componente | Localização | Finalidade |
|------------|-------------|-----------|
| `AppShell` | `components/AppShell.tsx` | Client Component; controla drawer mobile |
| `Sidebar` | `components/Sidebar.tsx` | Navegação lateral |
| `Topbar` | `components/Topbar.tsx` | Cabeçalho |
| `PageHeader` | `components/PageHeader.tsx` | Título + descrição + slot de action |
| `Avatar` | `components/ui/Avatar.tsx` | Iniciais coloridas |
| `Card` / `CardHeader` | `components/ui/Card.tsx` | Container visual |
| `KpiCard` | `components/ui/KpiCard.tsx` | Cartão de métrica |
| `StatusPill` | `components/ui/StatusPill.tsx` | Badge colorido de status |

Não existe nenhum modal, formulário ou componente interativo além do `AppShell`.

### 1.3 Funções de Supabase existentes

Todas em `lib/supabase-queries.ts`. **Apenas leitura:**

| Função | Tabela | Tipo |
|--------|--------|------|
| `fetchEquipes()` | `equipes` | SELECT |
| `fetchCorretores()` | `corretores` | SELECT |
| `fetchPistas()` | `leads` | SELECT |
| `fetchVendas()` | `vendas` | SELECT |
| `fetchTudo()` | — | Promise.all sobre as 4 acima |
| `getRanking()` | — | Derivada (computada em memória) |
| `getFunil()` | — | Derivada |
| `getKPIs()` | — | Derivada |
| `getProximoPlantao()` | — | Derivada |
| `getEquipe()` | — | Lookup por id |
| `getCorretor()` | — | Lookup por id |

Zero funções de escrita (INSERT, UPDATE, DELETE).

### 1.4 Tipos existentes (`lib/types.ts`)

```
LeadSource = "Instagram" | "Facebook" | "Outro"
LeadStatus = "novo" | "em_contato" | "visita" | "proposta" | "fechado" | "perdido"
Equipe     = { id, nome, gerenteId, cor }
Corretor   = { id, nome, equipeId, ordemPlantao, emPlantao, ativo, avatarIniciais }
Lead       = { id, nome, telefone, origem, interesse, regiao, faixaValor, status,
               equipeId, corretorId, captadorNome, criadoEm, motivoPerda? }
Venda      = { id, leadId, corretorId, equipeId, imovel, vgv, fechadoEm }
```

**Campos ausentes nos tipos** (precisam ser adicionados junto com as colunas do banco):
- `Corretor.ultimoLeadRecebidoEm?: string`
- `Lead.distribuidoEm?: string`
- `Lead.campanhaNome?: string`
- `Equipe.ultimoLeadRecebidoEm?: string`

### 1.5 Schema atual (`supabase/schema.sql`)

Tabelas existentes: `equipes`, `corretores`, `leads`, `vendas`.

**Colunas ausentes** (confirmado por leitura do schema):

| Tabela | Coluna ausente | Impacto |
|--------|---------------|---------|
| `corretores` | `em_plantao` | Distribuição bloqueada — algoritmo depende deste campo |
| `corretores` | `ultimo_lead_recebido_em` | Fairness do round-robin impossível sem este campo |
| `equipes` | `ultimo_lead_recebido_em` | Rodízio de equipes (fallback) impossível sem este campo |
| `leads` | `distribuido_em` | SLA não tem ponto de partida sem este campo |
| `leads` | `campanha_nome` | Rastreabilidade de campanha ausente |
| — | `historico_leads` | Tabela inteira ausente; decisão aprovada exige desde o início |

**Enum `lead_origem`** atual: apenas `'Instagram'`, `'Facebook'`, `'Outro'`. Suficiente para o MVP. Formulário de cadastro usará esses três valores.

**Problema identificado em `fetchCorretores()`:** a função usa `row.ativo` como proxy para `emPlantao` (`emPlantao: Boolean(row.ativo)`) porque a coluna `em_plantao` não existe no banco ainda. Após a migration, esse mapeamento deve ser corrigido para `emPlantao: Boolean(row.em_plantao)`.

### 1.6 Botões existentes sem ação real

| Botão | Página | Situação |
|-------|--------|----------|
| "Cadastrar lead" | `/leads` | Presente; sem onClick; sem modal |
| "Distribuir" | `/leads` (por card de fila) | Presente; sem onClick; sem chamada de API |
| "Adicionar corretor" | `/corretores` | Presente; sem ação; fora do escopo do MVP |
| "Nova equipe" | `/equipes` | Presente; sem ação; fora do escopo do MVP |

---

## 2. Arquivos que precisarão ser alterados

### `lib/types.ts`

**Por quê:** Novos campos do banco precisam de representação nos tipos TypeScript.  
**Responsabilidade:** Contratos de dados de toda a aplicação.  
**Alterações:**
- Adicionar `distribuidoEm?: string` em `Lead`
- Adicionar `campanhaNome?: string` em `Lead`
- Adicionar `ultimoLeadRecebidoEm?: string` em `Corretor`
- Adicionar `ultimoLeadRecebidoEm?: string` em `Equipe`
- Adicionar tipo `HistoricoLead = { id, leadId, tipo, descricao, dados, criadoPor, criadoEm }`
- Adicionar tipo `LeadInput` (payload de entrada do formulário/webhook)
**Risco:** Baixo. Adições opcionais não quebram código existente.

---

### `lib/supabase-queries.ts`

**Por quê:** Precisa de funções de escrita para inserir leads, distribuir, mudar status, e registrar histórico.  
**Responsabilidade:** Única camada de acesso a dados.  
**Alterações:**
- Corrigir `fetchCorretores()`: após migration, mapear `em_plantao` corretamente em vez de `ativo` como proxy
- Adicionar `criarLead(input: LeadInput): Promise<Lead>` — INSERT em `leads` + INSERT em `historico_leads`
- Adicionar `verificarDuplicata(telefone: string): Promise<Lead | null>` — SELECT com janela 24h
- Adicionar `rotearEquipe(equipeId?: string): Promise<string>` — lógica de seleção de equipe
- Adicionar `distribuirLead(leadId: string): Promise<Lead>` — SELECT corretor elegível + UPDATE lead + UPDATE corretor + INSERT histórico
- Adicionar `alterarStatus(leadId: string, status: LeadStatus, dados?: object): Promise<Lead>` — UPDATE + INSERT histórico
- Adicionar `fetchHistoricoLead(leadId: string): Promise<HistoricoLead[]>`  
**Risco:** Médio. As novas funções de escrita precisam de transações atômicas no Supabase. Risco de inconsistência se uma etapa falhar mid-flow (ex: lead criado mas histórico não registrado). Mitigar com tratamento de erro explícito.

---

### `app/leads/page.tsx`

**Por quê:** Botões "Cadastrar lead" e "Distribuir" precisam ser conectados.  
**Responsabilidade:** Página de captura e fila de distribuição.  
**Alterações:**
- Converter para aceitar client-side interação: o botão "Cadastrar lead" deve abrir o `LeadFormModal`
- O botão "Distribuir" deve chamar `POST /api/leads/:id/distribuir` e revalidar a página
- A página precisará de um `'use client'` no wrapper dos botões, ou usar Server Actions com `revalidatePath`  
**Risco:** Médio. Converter uma Server Component page para ter elementos interativos requer extração de componentes Client. O padrão correto é manter o page como Server Component e extrair os botões em Client Components que fazem fetch ou chamam actions.

---

### `app/pipeline/page.tsx`

**Por quê:** Pipeline precisa ser funcional: cada card precisa de um seletor de status.  
**Responsabilidade:** Movimentação do lead pelo funil.  
**Alterações:**
- Extrair card do lead para componente Client: `PipelineCard.tsx`
- Adicionar seletor de status (dropdown) no card
- Chamar `PATCH /api/leads/:id/status` ao selecionar novo status
- Exibir indicador de SLA nos cards relevantes
- Exibir campo de motivo de perda quando status selecionado é "perdido"  
**Risco:** Médio. Movimentar status sem otimistic update vai causar delay perceptível — a página recarrega após a chamada. Aceitável para MVP.

---

### `lib/supabase.ts`

**Por quê:** Pode precisar de client para server-side e para client-side (API routes precisam do client do lado do servidor).  
**Responsabilidade:** Instância do cliente Supabase.  
**Alterações:** Verificar se o client atual suporta uso em API routes (server-side). Se não, adicionar export de `createServerClient()`.  
**Risco:** Baixo. O client atual já é usado em Server Components; API routes têm o mesmo contexto.

---

## 3. Novos arquivos necessários

### `app/api/leads/route.ts` — MVP

**Finalidade:** `POST /api/leads` — recebe lead via webhook ou formulário, valida, deduplica, roteia, insere.  
**Dependências:** `lib/supabase-queries.ts`, `lib/validations.ts`  
**Responsabilidade no MVP:**
- Validar campos obrigatórios (nome, telefone, origem, equipe_id)
- Normalizar telefone (remover máscara)
- Verificar duplicata (janela 24h) → 409 se duplicata
- Rotear equipe (direto se `equipe_id` no payload; rodízio se não)
- INSERT em `leads` com `status = 'novo'`, `corretor_id = NULL`
- INSERT em `historico_leads` com `tipo = 'lead_criado'`, `criado_por = 'formulario'` ou `'webhook'`
- UPDATE em `equipes.ultimo_lead_recebido_em` (para fairness do rodízio)
- Retornar `{ lead, criado: true }` com HTTP 201

---

### `app/api/leads/[id]/distribuir/route.ts` — MVP

**Finalidade:** `POST /api/leads/:id/distribuir` — distribui lead da fila para o corretor elegível.  
**Dependências:** `lib/supabase-queries.ts`  
**Responsabilidade:**
- Verificar que o lead existe e está sem corretor
- Executar algoritmo de distribuição (ver Seção 8)
- UPDATE `leads.corretor_id` e `leads.distribuido_em`
- UPDATE `corretores.ultimo_lead_recebido_em`
- INSERT em `historico_leads` com `tipo = 'lead_distribuido'`
- Retornar o lead atualizado ou `{ erro: 'sem_corretor_elegivel' }` se fila vazia

---

### `app/api/leads/[id]/status/route.ts` — MVP

**Finalidade:** `PATCH /api/leads/:id/status` — move o lead para um novo status.  
**Dependências:** `lib/supabase-queries.ts`  
**Responsabilidade:**
- Validar que o status é um valor do enum
- Exigir `motivo_perda` se status = `'perdido'`
- UPDATE `leads.status` (e `leads.observacoes` como motivo de perda)
- INSERT em `historico_leads` com `tipo = 'status_alterado'`
- Retornar o lead atualizado

---

### `components/ui/LeadFormModal.tsx` — MVP

**Finalidade:** Modal de cadastro manual de lead.  
**Dependências:** Nenhuma biblioteca externa. Tailwind + SVG inline.  
**Campos do formulário:**
- Nome (input text, obrigatório)
- Telefone (input tel, obrigatório)
- Origem (select, obrigatório): Instagram / Facebook / Outro
- Interesse (input text, opcional)
- Faixa de valor (input text, opcional)
- Equipe (select com equipes carregadas, obrigatório)
- Campanha / Observações (input text, opcional)
**Comportamento:**
- Abre em overlay sobre a página atual
- Fecha em ESC ou clique fora
- Submit chama `POST /api/leads`
- Em caso de 409: exibe aviso de duplicata com nome do lead existente
- Em caso de sucesso: fecha modal e recarrega página
**Risco:** Médio. O modal precisa ser Client Component e receber a lista de equipes como prop (carregada pelo Server Component pai).

---

### `components/ui/PipelineCard.tsx` — MVP

**Finalidade:** Card interativo do kanban com seletor de status e indicador de SLA.  
**Dependências:** Nenhuma externa.  
**Comportamento:**
- Exibe todos os dados do lead (já exibido pelo `pipeline/page.tsx`)
- Dropdown de status (exceto `perdido` que exige campo adicional)
- Diálogo de confirmação com campo de motivo ao mover para `perdido`
- Indicador de SLA calculado a partir de `distribuido_em`
**Risco:** Baixo. Extração limpa do JSX existente em `pipeline/page.tsx`.

---

### `lib/validations.ts` — MVP

**Finalidade:** Funções de validação reutilizáveis entre formulário (frontend) e API route (backend).  
**Conteúdo:**
- `normalizarTelefone(tel: string): string` — remove tudo que não é dígito
- `validarTelefone(tel: string): boolean` — aceita 10-11 dígitos (com ou sem DDD)
- `validarOrigem(v: string): v is LeadSource` — enum guard
- `validarPayloadLead(body: unknown): LeadInput | null` — validação do payload completo
**Risco:** Baixo. Código puro sem dependências externas.

---

### `lib/distribuicao.ts` — MVP

**Finalidade:** Algoritmo de roteamento e distribuição desacoplado das queries.  
**Conteúdo:**
- `selecionarEquipe(equipeId: string | undefined, equipes: Equipe[]): string | null`
- `selecionarCorretor(equipeId: string, corretores: Corretor[]): Corretor | null`  
**Por que separado:** Permite testar a lógica sem banco. Mantém `supabase-queries.ts` como I/O puro.  
**Risco:** Baixo.

---

### `supabase/migrations/001_fase5_schema_minimo.sql` — MVP

**Finalidade:** Migration SQL para aplicar no Supabase antes da implementação.  
**Conteúdo:** Ver Seção 4 completa.  
**Risco:** Alto. Uma migration mal aplicada em banco de produção pode corromper dados. Deve ser revisada e aplicada manualmente via SQL Editor do Supabase após aprovação explícita.

---

## 4. Mudanças necessárias no banco

### Avaliação campo por campo

| Campo | Tabela | Obrigatório | MVP ou V2 | Risco |
|-------|--------|-------------|-----------|-------|
| `em_plantao` | `corretores` | **Obrigatório** | MVP | Médio — DEFAULT false fará todos saírem de plantão; precisará atualizar manualmente |
| `ultimo_lead_recebido_em` | `corretores` | **Obrigatório** | MVP | Baixo — nullable, sem impacto imediato |
| `ultimo_lead_recebido_em` | `equipes` | **Obrigatório** | MVP | Baixo — nullable |
| `distribuido_em` | `leads` | **Obrigatório** | MVP | Baixo — nullable, retroativamente null em leads antigos |
| `campanha_nome` | `leads` | Opcional | MVP | Baixo — nullable |
| `historico_leads` | nova tabela | **Obrigatório** | MVP | Baixo — tabela nova, sem dependências existentes |
| `primeiro_contato_em` | `leads` | Opcional | V1 | — SLA calculado via distribuido_em é suficiente para MVP |
| `redistribuicoes_count` | `leads` | Não | V2 | — |
| `motivo_perda` | `leads` | Opcional | V1 | Atualmente a coluna `observacoes` serve como proxy; MVP pode continuar assim |

### Migration planejada (a ser aprovada antes da Fase 5)

```sql
-- 001_fase5_schema_minimo.sql
-- Aplicar no SQL Editor do Supabase APÓS aprovação explícita.

-- 1. Campo de disponibilidade de plantão (separado de ativo)
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS em_plantao BOOLEAN NOT NULL DEFAULT false;

-- 2. Fairness no round-robin de corretores
ALTER TABLE corretores ADD COLUMN IF NOT EXISTS ultimo_lead_recebido_em TIMESTAMPTZ;

-- 3. Fairness no rodízio de equipes (fallback de roteamento)
ALTER TABLE equipes ADD COLUMN IF NOT EXISTS ultimo_lead_recebido_em TIMESTAMPTZ;

-- 4. Rastreamento do momento da distribuição (início do SLA)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS distribuido_em TIMESTAMPTZ;

-- 5. Nome da campanha de origem
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campanha_nome TEXT;

-- 6. Histórico de eventos do lead
CREATE TABLE IF NOT EXISTS historico_leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL,
  -- tipos válidos: 'lead_criado', 'lead_roteado', 'lead_distribuido',
  --               'status_alterado', 'lead_redistribuido'
  descricao   TEXT,
  dados       JSONB,
  criado_por  TEXT NOT NULL DEFAULT 'sistema',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_leads_lead_id   ON historico_leads (lead_id);
CREATE INDEX IF NOT EXISTS idx_historico_leads_created_at ON historico_leads (created_at DESC);
```

**Ação manual necessária após migration:** Atualizar `em_plantao = true` nos corretores atualmente disponíveis via SQL Editor, pois o DEFAULT será `false`.

---

## 5. Fluxo técnico do cadastro manual

```
Usuário em /leads
  → clica "Cadastrar lead"
  → LeadFormModal abre (Client Component, dados de equipes passados como prop)

Usuário preenche:
  → Nome (obrigatório)
  → Telefone (obrigatório, formato (XX) XXXXX-XXXX aceito; valida 10-11 dígitos)
  → Origem (obrigatório, select: Instagram / Facebook / Outro)
  → Equipe (obrigatório, select com equipes carregadas)
  → Interesse (opcional)
  → Faixa de valor (opcional)
  → Campanha / Observações (opcional)

Usuário clica "Salvar lead"
  → Validação frontend (campos obrigatórios + formato telefone)
  → Se inválido: exibir erro inline no campo; não fazer chamada

  → POST /api/leads
     body: { nome, telefone, origem, equipe_id, interesse?, faixa_valor?, campanha_nome? }

Servidor (app/api/leads/route.ts):
  → validarPayloadLead(body) — retorna 422 se inválido
  → normalizar telefone (remover máscara)
  → verificarDuplicata(telefone) — SELECT leads com mesmo telefone nas últimas 24h
     → duplicata encontrada:
        retornar HTTP 409 { erro: 'duplicata', lead_existente: { id, nome, criadoEm } }
     → sem duplicata: continuar
  → rotearEquipe(equipe_id) — equipe_id veio no payload → usar diretamente
  → INSERT leads { nome, telefone, origem, equipe_id, status: 'novo', corretor_id: NULL, ... }
  → INSERT historico_leads { lead_id, tipo: 'lead_criado', criado_por: 'formulario' }
  → UPDATE equipes SET ultimo_lead_recebido_em = NOW() WHERE id = equipe_id
  → Tentativa de distribuição automática imediata:
       corretor = selecionarCorretor(equipe_id) -- filtra ativo + em_plantao, menor ultimo_lead_recebido_em
       SE corretor encontrado:
         UPDATE leads SET corretor_id = corretor.id, distribuido_em = NOW()
         UPDATE corretores SET ultimo_lead_recebido_em = NOW()
         INSERT historico_leads { tipo: 'lead_distribuido', criado_por: 'sistema' }
       SENÃO:
         lead fica em fila (corretor_id = NULL) -- botão "Distribuir" disponível depois
         INSERT historico_leads { tipo: 'distribuicao_falhou', descricao: 'Sem corretor de plantão' }
  → retornar HTTP 201 { lead: Lead, distribuido: boolean }

LeadFormModal recebe resposta:
  → 201 com distribuido=true: fechar modal, refresh — lead já aparece no pipeline
  → 201 com distribuido=false: fechar modal, refresh — lead aparece na fila com aviso visual
  → 201: fechar modal, chamar router.refresh() para recarregar dados da página
  → 409: exibir aviso "Este telefone já foi cadastrado (lead: [nome], [tempo atrás])
           Deseja cadastrar mesmo assim?" com opções: Cancelar | Abrir lead existente
  → 4xx/5xx: exibir mensagem de erro genérica "Erro ao salvar. Tente novamente."
```

### Campos obrigatórios
- `nome` (string, não vazio)
- `telefone` (string, 10–11 dígitos após normalização)
- `origem` (enum: "Instagram" | "Facebook" | "Outro")
- `equipe_id` (UUID válido de equipe existente)

### Campos opcionais
- `interesse` (string livre)
- `faixa_valor` (string livre)
- `campanha_nome` (string livre)

### Comportamento sem corretor elegível
O lead é criado com `corretor_id = NULL` — fica na fila de distribuição. A distribuição é um passo separado (botão "Distribuir"). Não bloqueia a criação do lead.

---

## 6. Fluxo técnico do webhook (planejamento sem implementação)

### Endpoint

```
POST /api/leads
Content-Type: application/json
X-API-Key: <token secreto>
```

### Payload mínimo

```json
{
  "nome": "Marina Costa",
  "telefone": "62998123344",
  "origem": "Facebook",
  "equipe_id": "uuid-da-equipe-opcional",
  "campanha_nome": "Lançamento Torre Norte Junho/2026",
  "interesse": "Compra • Apto 2 quartos",
  "faixa_valor": "R$ 400–600 mil"
}
```

- `nome`, `telefone`, `origem`: obrigatórios
- `equipe_id`: opcional (sem ele, rodízio entre equipes)
- Demais: opcionais

### Autenticação (V1 — não implementar no MVP)

Header `X-API-Key: <secret>`. Secret armazenado em variável de ambiente `LEAD_API_SECRET`. Retornar 401 se ausente ou inválido.

No MVP atual: a rota não tem autenticação — protegida apenas por obscuridade da URL. Aceitável para MVP sem integração real de Meta Ads.

### Respostas HTTP esperadas

| Situação | HTTP | Body |
|----------|------|------|
| Lead criado e distribuído | 201 | `{ lead: Lead, criado: true, distribuido: true }` |
| Lead criado, sem corretor disponível | 201 | `{ lead: Lead, criado: true, distribuido: false }` |
| Duplicata (24h) | 409 | `{ erro: 'duplicata', lead_existente: { id, nome } }` |
| Payload inválido | 422 | `{ erro: 'validacao', campos: string[] }` |
| Sem equipe disponível | 503 | `{ erro: 'sem_equipe_disponivel' }` |
| Erro interno | 500 | `{ erro: 'erro_interno' }` |

### Riscos de segurança

- **Sem autenticação no MVP:** qualquer pessoa que conhecer a URL pode criar leads. Risco aceitável em MVP fechado.
- **Injeção via campos de texto:** validar e sanitizar `nome`, `interesse`, `campanha_nome` (remover HTML/SQL antes de inserir). O Supabase JS client usa queries parametrizadas — SQL injection mitigado naturalmente.
- **Rate limiting:** sem rate limiting no MVP. Um loop de webhook malformado pode criar centenas de leads. Mitigar na V1 com middleware de rate limiting (ex: 10 req/min por IP).
- **`equipe_id` arbitrário:** validar que o UUID existe na tabela `equipes` antes de usar.

---

## 7. Algoritmo de roteamento para equipe

```
função rotearEquipe(equipe_id_payload, supabase):

  SE equipe_id_payload informado:
    equipe = SELECT * FROM equipes WHERE id = equipe_id_payload
    SE equipe não encontrada:
      retornar ERRO 422 "equipe_id inválido"
    retornar equipe.id

  SENÃO (sem equipe_id no payload — rodízio):
    equipes_ativas = SELECT id FROM equipes
                     ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC
                     LIMIT 1
    SE equipes_ativas vazia:
      retornar ERRO 503 "sem_equipe_disponivel"
    retornar equipes_ativas[0].id
```

**Nota:** No MVP, não há conceito de "equipe inativa" no banco (não há coluna `ativa` em `equipes`). O rodízio usa todas as equipes. Para V2, adicionar `equipes.ativa BOOLEAN` e filtrar no WHERE.

---

## 8. Algoritmo de distribuição para corretor

```
função distribuirLead(lead_id, supabase):

  lead = SELECT * FROM leads WHERE id = lead_id
  SE lead.corretor_id IS NOT NULL:
    retornar ERRO 409 "lead já distribuído"

  corretor = SELECT id, nome FROM corretores
             WHERE equipe_id = lead.equipe_id
               AND em_plantao = true
               AND ativo = true
             ORDER BY
               COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC,
               ordem_plantao ASC
             LIMIT 1

  SE corretor não encontrado:
    INSERT historico_leads {
      lead_id, tipo: 'distribuicao_falhou',
      descricao: 'Nenhum corretor de plantão disponível',
      criado_por: 'sistema'
    }
    retornar { distribuido: false, motivo: 'sem_corretor_elegivel' }

  -- Executar como operações sequenciais (sem transação nativa no cliente Supabase JS):
  1. UPDATE leads SET corretor_id = corretor.id, distribuido_em = NOW()
     WHERE id = lead_id AND corretor_id IS NULL  -- guard contra race condition

  2. UPDATE corretores SET ultimo_lead_recebido_em = NOW()
     WHERE id = corretor.id

  3. INSERT historico_leads {
       lead_id, tipo: 'lead_distribuido',
       descricao: 'Lead distribuído para {corretor.nome}',
       dados: { corretor_id: corretor.id, corretor_nome: corretor.nome },
       criado_por: 'sistema'
     }

  retornar { distribuido: true, lead: lead_atualizado, corretor: corretor }
```

**Proteção contra race condition:** O UPDATE do step 1 usa `AND corretor_id IS NULL` como guard. Se dois requests simultâneos tentarem distribuir o mesmo lead, apenas um vai modificar linhas (o outro não encontrará `corretor_id IS NULL` e retornará 0 rows affected). Detectar via `rowsAffected === 0` → retornar 409.

---

## 9. Pipeline funcional

### Status permitidos e transições

Todos os status podem ser atingidos de qualquer outro status (sem restrição de sequência no MVP). A UI sugere a progressão natural mas não a impõe.

| Transição | Exige dado extra |
|-----------|-----------------|
| qualquer → `perdido` | `motivo_perda` (obrigatório) |
| qualquer → `fechado` | nenhum |
| outros | nenhum |

### Como avançar status

- `PipelineCard.tsx` exibe dropdown com os 6 status
- Ao selecionar `perdido`: exibir campo de texto "Motivo da perda" antes de confirmar
- Ao confirmar: `PATCH /api/leads/:id/status { status, motivo_perda? }`
- Backend: UPDATE `leads.status` + INSERT `historico_leads`
- Frontend: após resposta 200, atualizar estado local ou chamar `router.refresh()`

### Como registrar `primeiro_contato_em`

O MVP usa `historico_leads` como registro de auditoria. Não há coluna `primeiro_contato_em` no MVP. Se necessário para SLA, calcular no futuro como: primeiro evento com `tipo = 'status_alterado'` e `dados.status_novo = 'em_contato'` em `historico_leads`.

### Como registrar perda

- `motivo_perda` é armazenado em `leads.observacoes` (schema atual não tem coluna separada)
- INSERT em `historico_leads` com `tipo = 'status_alterado'`, `dados.motivo_perda`

### Como registrar venda/fechamento

MVP: mover status para `fechado` é o registro. Tabela `vendas` com VGV fica para V1 (quando implementar o formulário de registro de venda).

### O que fica para depois

| Item | Fase |
|------|------|
| Drag-and-drop entre colunas | V1 |
| Formulário de registro de venda (VGV, imóvel) | V1 |
| Filtro de pipeline por equipe/corretor | V1 |
| `primeiro_contato_em` como coluna explícita | V1 |

---

## 10. SLA visual

### Onde será exibido

- `PipelineCard.tsx`: indicador no card de cada lead distribuído com status `novo` ou `em_contato`
- `/leads` (fila): tempo de espera desde `criadoEm` para leads sem `distribuidoEm`

### Como calcular

```
agora = Date.now()
inicio_sla = lead.distribuidoEm ?? lead.criadoEm
minutos_sem_contato = (agora - new Date(inicio_sla).getTime()) / 60_000

SE minutos_sem_contato < 30: verde (sem badge)
SE minutos_sem_contato < 120: amarelo ("⏱ Xmin")
SE minutos_sem_contato >= 120: vermelho ("⚠ Xh")

Não exibir SLA para: status "em_contato", "visita", "proposta", "fechado", "perdido"
(contato já foi feito)
```

### Dados necessários

- `leads.distribuido_em` (coluna nova — migration Fase 5)
- `leads.created_at` (já existe, usado como fallback)
- `leads.status` (já existe)

### Backend ou frontend

Cálculo puramente frontend. Não requer chamada de API adicional. Os timestamps são fornecidos pelos dados já carregados em `fetchTudo()`.

### Limitação crítica

Server Components renderizam uma vez por requisição. O relógio de SLA não vai atualizar em tempo real sem client-side hydration. Para MVP:

- Exibir o SLA calculado no momento do carregamento da página
- Adicionar nota: "Recarregue para atualizar o SLA"
- Para V1: `PipelineCard.tsx` como Client Component pode usar `setInterval` para atualizar o display

---

## 11. Ordem exata de implementação

### Etapa 1 — Migration mínima (Fase 5)
**Arquivos:** `supabase/migrations/001_fase5_schema_minimo.sql` (novo)  
**Ação:** Criar o arquivo SQL. Aguardar aprovação. Aplicar no Supabase via SQL Editor.  
**Critério de sucesso:** `SELECT column_name FROM information_schema.columns WHERE table_name = 'corretores'` retorna `em_plantao` e `ultimo_lead_recebido_em`. Tabela `historico_leads` existe.  
**Risco:** Alto. Executar com backup mental — o schema atual tem dados de exemplo; a migration usa `IF NOT EXISTS` e é segura.

---

### Etapa 2 — Tipos TypeScript
**Arquivos:** `lib/types.ts`  
**Ação:** Adicionar campos novos aos tipos existentes. Adicionar `HistoricoLead` e `LeadInput`.  
**Critério de sucesso:** `npm run build` passa sem erros de tipo.  
**Risco:** Baixo.

---

### Etapa 3 — Validações
**Arquivos:** `lib/validations.ts` (novo)  
**Ação:** Implementar `normalizarTelefone`, `validarTelefone`, `validarOrigem`, `validarPayloadLead`.  
**Critério de sucesso:** Funções exportadas e usadas pelo API route sem erros.  
**Risco:** Baixo.

---

### Etapa 4 — Algoritmo de distribuição
**Arquivos:** `lib/distribuicao.ts` (novo)  
**Ação:** Implementar `selecionarEquipe` e `selecionarCorretor` como funções puras.  
**Critério de sucesso:** Lógica verificável sem banco (dados mockados como input).  
**Risco:** Baixo.

---

### Etapa 5 — Funções de escrita no Supabase
**Arquivos:** `lib/supabase-queries.ts`  
**Ação:** Adicionar `criarLead`, `verificarDuplicata`, `distribuirLead`, `alterarStatus`, `fetchHistoricoLead`. Corrigir mapeamento `em_plantao` em `fetchCorretores`.  
**Critério de sucesso:** Funções exportadas corretamente tipadas. `npm run build` passa.  
**Risco:** Médio. Testar cada função individualmente antes de prosseguir.

---

### Etapa 6 — API route de criação
**Arquivos:** `app/api/leads/route.ts` (novo)  
**Ação:** Implementar `POST /api/leads` com validação, deduplicação, roteamento, inserção e histórico.  
**Critério de sucesso:** `curl -X POST http://localhost:3000/api/leads -d '...'` retorna 201 com lead; duplicata retorna 409.  
**Validação:** Testar com payload válido, com payload inválido (422), com telefone duplicado (409).  
**Risco:** Médio.

---

### Etapa 7 — Formulário de cadastro
**Arquivos:** `components/ui/LeadFormModal.tsx` (novo), `app/leads/page.tsx` (alterado)  
**Ação:** Criar modal Client Component. Conectar botão "Cadastrar lead" da página.  
**Critério de sucesso:** Abrir modal, preencher campos, salvar → lead aparece na fila de `/leads` após refresh.  
**Risco:** Médio. Testar: campo obrigatório vazio, telefone inválido, duplicata.

---

### Etapa 8 — API route de distribuição
**Arquivos:** `app/api/leads/[id]/distribuir/route.ts` (novo)  
**Ação:** Implementar `POST /api/leads/:id/distribuir`.  
**Critério de sucesso:** Lead sem corretor recebe corretor. `leads.corretor_id` preenchido. `historico_leads` com `tipo = 'lead_distribuido'`.  
**Validação:** `curl -X POST http://localhost:3000/api/leads/:id/distribuir`  
**Risco:** Médio. Depende de `em_plantao` preenchido no banco — verificar antes.

---

### Etapa 9 — Botão "Distribuir" funcional
**Arquivos:** `app/leads/page.tsx` (alterado)  
**Ação:** Conectar botão "Distribuir" de cada card de fila ao endpoint.  
**Critério de sucesso:** Lead sai da fila e aparece no pipeline com corretor atribuído.  
**Risco:** Baixo.

---

### Etapa 10 — API route de status
**Arquivos:** `app/api/leads/[id]/status/route.ts` (novo)  
**Ação:** Implementar `PATCH /api/leads/:id/status`.  
**Critério de sucesso:** Status atualizado. Histórico registrado. Perda com motivo funciona.  
**Risco:** Baixo.

---

### Etapa 11 — Pipeline funcional
**Arquivos:** `components/ui/PipelineCard.tsx` (novo), `app/pipeline/page.tsx` (alterado)  
**Ação:** Extrair card para Client Component. Adicionar dropdown de status e SLA visual.  
**Critério de sucesso:** Mover lead de "Novo" para "Em contato" no kanban. SLA muda de cor.  
**Risco:** Baixo. Extração limpa do JSX existente.

---

### Etapa 12 — Validação final
**Ação:** Executar o roteiro de demo da Fase 9:
1. `/leads` com fila vazia
2. Cadastrar lead → aparece na fila
3. Distribuir → aparece no pipeline
4. Mover status → pipeline atualiza
5. Verificar `/ranking` (sem alteração — vendas ainda são dados de exemplo)  
**Critério de sucesso:** Demo sem erros em `localhost:3000` com Supabase real.  
**Risco:** Baixo se etapas anteriores passaram individualmente.

---

## 12. Critérios de sucesso da Fase 4

O planejamento técnico estará pronto para implementação quando:

1. **Banco mapeado:** cada coluna e tabela nova está justificada, com script SQL pronto para revisão.
2. **Contratos de API definidos:** payload, validações e respostas HTTP de cada endpoint estão documentados.
3. **Fluxos definidos:** cadastro manual e distribuição têm pseudocódigo passo-a-passo aprovado.
4. **Ordem segura:** sequência de 12 etapas onde cada uma é verificável antes da próxima.
5. **Riscos documentados:** cada arquivo alterado ou criado tem seu risco descrito.
6. **Fora do escopo explícito:** o que não entra no MVP está listado na Seção 13.

**Este documento é o critério de sucesso da Fase 4.** A Fase 5 começa quando o usuário aprovar a migration.

---

## 13. O que NÃO implementar agora

| Item | Motivo de exclusão |
|------|--------------------|
| Google Sheets | Fora do núcleo; decisão aprovada |
| WhatsApp API | Fora do núcleo; V2 |
| Notificações push | Fora do MVP |
| Login / autenticação | Fora do MVP; Vercel protege por URL |
| Multi-tenant | Fora do MVP; banco único |
| Lead scoring com ML | V2 |
| Drag-and-drop no pipeline | V1; dropdown é suficiente no MVP |
| Formulário de registro de venda (VGV) | V1 |
| Roteamento por empreendimento | V2 |
| Roteamento por região | V2 |
| Dashboard de conversão por canal | V1 |
| Relatório de SLA por equipe | V1 |
| Alertas de inatividade (> 48h) | V1 |
| Rate limiting no webhook | V1 |
| Autenticação do webhook (X-API-Key) | V1 |
| `primeiro_contato_em` como coluna | V1 |
| `redistribuicoes_count` | V2 |
| `motivo_perda` como coluna separada | V1 (proxy via `observacoes` é suficiente no MVP) |
| Botões "Adicionar corretor" e "Nova equipe" | Fora do MVP atual |
| Filtros de equipe/corretor no pipeline | V1 |
| Atualização em tempo real (realtime) | V1 |

---

*Planejamento técnico concluído. Aguardando autorização para implementação.*
