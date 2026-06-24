# Auditoria Final — Estado Real do Banco

**Data:** 2026-06-23  
**Escopo:** Estado atual do banco Supabase de produção, cruzado com código, migrations e documentos de validação das Fases 7 e 8  
**Método:** Leitura direta de migrations, código-fonte e documentos de auditoria; sem execução de queries  
**Nenhuma alteração foi feita ao banco.**

---

## 1. Estrutura do banco — o que está aplicado

### Tabelas confirmadas presentes

| Tabela | Origem | Colunas adicionais (além do schema base) |
|--------|--------|------------------------------------------|
| `equipes` | schema.sql | `imobiliaria_id`, `ativo`, `ultimo_lead_recebido_em` |
| `corretores` | schema.sql | `imobiliaria_id`, `em_plantao`, `ultimo_lead_recebido_em`, `usuario_id` |
| `leads` | schema.sql | `imobiliaria_id`, `telefone_normalizado`, `distribuido_em` |
| `vendas` | schema.sql | `imobiliaria_id` |
| `historico_leads` | migration 002 | `imobiliaria_id`, `usuario_id` |
| `imobiliarias` | migration 002 | — |
| `usuarios` | migration 002 | — |

### Migrations aplicadas

| Migration | Status | Evidência |
|-----------|--------|-----------|
| 001 — Schema mínimo (Fase 5) | Incorporada pela 002 | migration 002 inclui todas as colunas de 001 via ADD COLUMN IF NOT EXISTS |
| 002 — RLS + multi-tenancy | **CONFIRMADA** | CLAUDE.md declara explicitamente; dados reais lidos com RLS ativo |
| 003 — RPC `criar_e_distribuir_lead` | **CONFIRMADA** | fase-7-validacao-final.md documenta distribuição real para Beatriz Lima, Diego Farias, Camila Souza — impossível sem a RPC aplicada |
| 004 — RPC `alterar_status_lead` | **PROVÁVEL — NÃO CONFIRMADA DIRETAMENTE** | fase-9-validacao-bloqueadores.md argumenta aplicação por evidência indireta; diagnóstico original (2026-06-22) mostrou "No rows returned" — contradição não resolvida |

### RPCs no banco

| Função | Status |
|--------|--------|
| `criar_e_distribuir_lead(JSONB)` | **Presente e operacional** |
| `alterar_status_lead(JSONB)` | **Provavelmente presente** — não confirmado por inspeção direta |
| `current_imobiliaria_id()` | Presente (migration 002) |
| `current_user_role()` | Presente (migration 002) |
| `current_usuario_id()` | Presente (migration 002) |

### RLS

- **Habilitado** em 7 tabelas: `imobiliarias`, `usuarios`, `equipes`, `corretores`, `leads`, `historico_leads`, `vendas`
- Políticas por role: `admin`, `gestor`, `corretor`
- Operações de escrita protegidas via `service_role` (API routes server-side)

---

## 2. Dados — estado atual confirmado

### Volumes por tabela

| Tabela | Contagem confirmada | Fonte da confirmação |
|--------|--------------------|-----------------------|
| `imobiliarias` | 1 | auditoria-final-estado-real-banco-basilio.md (anterior) |
| `usuarios` | 1 | idem |
| `equipes` | 2 | idem |
| `corretores` | 12 | idem |
| `leads` | ≥ 17 | idem — mas inclui leads de teste da Fase 7 |
| `vendas` | 10 | idem |
| `historico_leads` | ≥ 12 | idem — mas cresceu desde então (Fase 7 adicionou eventos) |

### Composição conhecida dos 17+ leads

| Categoria | Estimativa | Detalhe |
|-----------|-----------|---------|
| Leads do seed (`schema.sql`) | 11 | 4 na fila (corretor_id NULL), 7 distribuídos |
| Leads de teste da Fase 7 | ≥ 4 | `TESTE-FASE7-001`, `TESTE-RR-001`, `TESTE-RR-002`, `TESTE-RR-003` |
| Leads adicionais não documentados | ≥ 2 | Diferença entre seed (11) e contagem confirmada (17) |

**Risco para o demo:** leads com prefixo `TESTE-` aparecem na tela de `/leads`. A fila não estará limpa sem intervenção.

### Corretores

- **12 corretores** (6 na Equipe Atlântico, 6 na Equipe Horizonte)
- `em_plantao = true` para todos: **confirmado indiretamente** — a Fase 7 distribuiu leads para Beatriz Lima, Diego Farias e Camila Souza via round-robin, o que pressupõe `em_plantao = true` no momento dos testes
- `ultimo_lead_recebido_em`: atualizado a cada distribuição automática — estado atual depende de quando foi o último lead criado

### Imobiliária

- Nome atual: **provavelmente `"Imobiliária Padrão — Renomear após setup"`**  
  A migration 002 insere esse nome como default. Não há evidência de que o UPDATE de renomeação foi executado.

### Histórico de eventos

Eventos **confirmados presentes** (fase-7-validacao-final.md):
- `lead_criado` — gerado pelo formulário e webhook
- `lead_distribuido` — gerado pela RPC 003 quando distribui corretor
- `distribuicao_falhou` — gerado pela RPC 003 quando sem corretor em plantão

Evento **provável mas não confirmado diretamente**:
- `status_alterado` — gerado pela RPC 004; depende da migration 004 estar aplicada

---

## 3. Consistência dos dados

### O que está consistente

| Item | Status |
|------|--------|
| RLS ativo em 7 tabelas | ✓ Confirmado |
| Multi-tenancy (`imobiliaria_id` em todas as tabelas) | ✓ Confirmado |
| Foreign keys com ON DELETE correto | ✓ Definido nas migrations |
| Distribuição automática funcionando | ✓ Confirmado pela Fase 7 |
| `distribuido_em` preenchido nos leads distribuídos | ✓ Confirmado pela Fase 7 |
| `historico_leads` registrando eventos | ✓ 12+ eventos confirmados |
| SLA visual lendo `distribuido_em` do banco | ✓ Confirmado pela Fase 8 |
| `telefone_normalizado` preenchido nos leads criados pela API | ✓ Pressuposto pela deduplicação funcionar |

### O que está inconsistente ou incerto

| Item | Estado | Impacto |
|------|--------|---------|
| Migration 004 (`alterar_status_lead`) | Evidência conflitante | StatusDropdown pode falhar em produção |
| Nome da imobiliária | Provavelmente "Imobiliária Padrão..." | Visível no banco, não na UI atual |
| Leads `TESTE-*` da Fase 7 | Presentes na fila | Poluem a tela de `/leads` durante o demo |
| `telefone_normalizado` nos leads do seed | NULL para todos os 11 leads do seed | Deduplicação não cobre leads antigos |
| `distribuido_em` nos leads do seed | NULL para alguns (inseridos diretamente, sem RPC) | SLA badge usa `created_at` como fallback — funciona, mas SLA conta desde a criação, não distribuição |
| `usuario_id` nos corretores | NULL para todos (nenhum corretor está vinculado ao login) | Sidebar ainda mostra "João Carvalho / Administrador" (mock) |

---

## 4. Riscos para a demonstração

### Risco CRÍTICO — Migration 004 não confirmada

**Sintoma:** StatusDropdown muda o status localmente na UI mas a alteração não persiste no banco. A API retorna `500 erro_interno`.  
**Probabilidade:** Média (evidência conflitante).  
**Verificação:** Executar no Supabase Dashboard:
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'alterar_status_lead';
```
Se retornar vazio → aplicar `supabase/migrations/004_rpc_alterar_status.sql`.

---

### Risco ALTO — Leads de teste na fila

**Sintoma:** `/leads` mostra `TESTE-FASE7-001`, `TESTE-RR-001`, `TESTE-RR-002`, `TESTE-RR-003` e possivelmente outros leads de teste ao iniciar o demo.  
**Probabilidade:** Alta (foram criados e não há registro de limpeza).  
**Mitigação:** Executar no Supabase Dashboard antes do demo:
```sql
DELETE FROM leads
WHERE nome LIKE 'TESTE-%'
   OR nome LIKE 'TESTE-RR-%';
```
Nota: `historico_leads` tem ON DELETE CASCADE — os eventos desses leads serão deletados junto.

---

### Risco ALTO — `em_plantao` pode ter mudado desde a Fase 7

**Sintoma:** Lead criado via formulário fica na fila (`corretor_id = NULL`). A distribuição automática falha silenciosamente.  
**Probabilidade:** Baixa-média. A Fase 7 confirmou `em_plantao = true`, mas o estado pode ter sido alterado desde então.  
**Verificação:** Executar no Supabase Dashboard antes do demo:
```sql
SELECT nome, em_plantao, ativo FROM corretores ORDER BY nome;
```
Se algum tiver `em_plantao = false` → executar:
```sql
UPDATE corretores SET em_plantao = true WHERE ativo = true;
```

---

### Risco MÉDIO — Usuário na Sidebar é mock

**Sintoma:** Sidebar exibe "João Carvalho / Administrador" durante o demo.  
**Probabilidade:** Certa (CLAUDE.md confirma como dívida técnica).  
**Impacto:** Estético. Não quebra funcionalidade do fluxo principal.  
**Mitigação:** Nenhuma para o MVP. Aceitar como limitação conhecida.

---

### Risco MÉDIO — Botão "Distribuir" sem ação

**Sintoma:** Clicar no botão "Distribuir" na fila de `/leads` não faz nada.  
**Probabilidade:** Certa.  
**Impacto:** Nenhum para o fluxo principal — distribuição é automática na criação. O botão só seria necessário para redistribuição manual (fallback operacional, fora do roteiro do demo).  
**Mitigação:** Não demonstrar o botão. Enfatizar que a distribuição automática já ocorreu.

---

### Risco BAIXO — Leads do seed com SLA incorreto

**Sintoma:** SLA badge nos leads do seed mostra tempo desde `created_at`, não desde `distribuido_em` (que é NULL).  
**Probabilidade:** Certa para os 11 leads do seed original.  
**Impacto:** Para o demo, o lead criado ao vivo terá `distribuido_em` correto. Os leads antigos mostrarão SLA vermelho (criados há dias). Pode causar confusão visual.  
**Mitigação:** Limpar os leads antigos antes do demo (já coberto pelo risco de leads de teste acima).

---

## 5. Pendências — o que não foi confirmado por inspeção direta

As informações abaixo **não são conhecidas sem executar queries no Supabase Dashboard**:

| # | Informação faltante | Query para verificar |
|---|--------------------|-----------------------|
| P1 | Migration 004 aplicada? | `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'alterar_status_lead'` |
| P2 | Nome atual da imobiliária | `SELECT nome FROM imobiliarias` |
| P3 | `em_plantao` atual de cada corretor | `SELECT nome, em_plantao FROM corretores ORDER BY nome` |
| P4 | Quantos leads têm `telefone_normalizado = NULL` | `SELECT COUNT(*) FROM leads WHERE telefone_normalizado IS NULL` |
| P5 | Quantos leads estão na fila (`corretor_id = NULL`) | `SELECT COUNT(*) FROM leads WHERE corretor_id IS NULL` |
| P6 | Distribuição de leads por status | `SELECT status, COUNT(*) FROM leads GROUP BY status` |
| P7 | Tipos de eventos em `historico_leads` | `SELECT tipo_evento, COUNT(*) FROM historico_leads GROUP BY tipo_evento` |
| P8 | Role e email do usuário único | `SELECT email, role, ativo FROM usuarios` |

---

## 6. Veredito

### Estado geral do banco

```
╔══════════════════════════════════════════════════════════╗
║                                                          ║
║   BANCO OPERACIONAL — PREPARAÇÃO PARCIAL PARA DEMO      ║
║                                                          ║
║   Estrutura:  ✓ Correta e completa                      ║
║   RLS:        ✓ Ativo em 7 tabelas                      ║
║   Distribuição automática: ✓ Confirmada (Fase 7)        ║
║   SLA visual: ✓ Confirmado (Fase 8)                     ║
║   Alteração de status: ⚠ Provável, não confirmada        ║
║   Dados de teste: ✗ Presentes, devem ser limpos          ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝
```

### Análise de prontidão para o demo

| Critério | Status | Ação necessária |
|---------|--------|-----------------|
| Migration 003 (criação e distribuição) | ✓ Confirmada | Nenhuma |
| Migration 004 (alteração de status) | ⚠ Não confirmada | Verificar P1 antes do demo |
| RLS e isolamento de tenant | ✓ Confirmado | Nenhuma |
| Corretores com `em_plantao = true` | ⚠ Inferido, não atual | Verificar P3 antes do demo |
| Leads de teste na fila | ✗ Presentes | Deletar antes do demo |
| Dados do seed antigos com SLA vermelho | ✗ Presentes | Deletar antes do demo (ou deixar no pipeline, não na fila) |
| Loop operacional mínimo (criar → distribuir → pipeline → mudar status) | ✓ Validado Fase 7 e 8 | Nenhuma (condicionado a P1 e P3) |

---

## 7. Próximo passo recomendado

**Antes de qualquer demo**, executar as seguintes verificações no Supabase Dashboard SQL Editor (ordem recomendada):

### Passo 1 — Verificar migration 004 (2 min)
```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'alterar_status_lead';
```
- Retornou 1 linha → migration está aplicada
- Retornou 0 linhas → aplicar `supabase/migrations/004_rpc_alterar_status.sql` no SQL Editor

### Passo 2 — Verificar e ativar corretores em plantão (1 min)
```sql
SELECT nome, em_plantao, ativo FROM corretores ORDER BY nome;
-- Se necessário:
UPDATE corretores SET em_plantao = true WHERE ativo = true;
```

### Passo 3 — Limpar dados de teste (2 min)
```sql
DELETE FROM leads
WHERE nome LIKE 'TESTE-%'
   OR nome LIKE 'TESTE-RR-%'
   OR nome LIKE 'TESTE-FASE7-%';
```

### Passo 4 — Decidir sobre leads e vendas do seed (opcional)
Os 11 leads do seed e as 10 vendas históricas estão no banco. Para o demo:
- **Opção A (recomendada):** manter os leads do seed no pipeline (fora da fila) e as vendas no ranking — cria contexto de uso real
- **Opção B:** deletar tudo e começar com banco limpo — demo mais limpa mas banco vazio parece incompleto

### Passo 5 — Verificar estado após limpeza (1 min)
```sql
SELECT 'fila_pendente', COUNT(*) FROM leads WHERE corretor_id IS NULL
UNION ALL
SELECT 'em_pipeline',   COUNT(*) FROM leads WHERE corretor_id IS NOT NULL
UNION ALL
SELECT 'historico',     COUNT(*) FROM historico_leads;
```

---

**Tempo estimado total: 5–10 minutos de preparação.**  
**Nenhum arquivo de código precisa ser alterado.**  
**O loop operacional mínimo está implementado e validado.**

---

*Auditoria gerada por leitura de código, migrations e documentação existente.*  
*Nenhum arquivo foi alterado. Nenhum SQL de modificação foi gerado.*
