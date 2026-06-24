# Auditoria do Estado Real do Banco — Basílio Imóveis

**Data:** 2026-06-23  
**Autor:** Claude Code  
**Objetivo:** Gerar queries de inspeção para mapear o estado atual do banco antes da preparação dos dados para a demo da BASÍLIO IMÓVEIS.  
**Escopo:** Somente leitura. Nenhum SQL de alteração foi gerado.

---

## Objetivo

Mapear com precisão o que existe hoje no banco (imobiliarias, usuarios, equipes, corretores, leads, vendas, historico_leads) para que:

1. O usuário execute as queries manualmente no Supabase SQL Editor.
2. Os resultados sejam interpretados com orientação clara.
3. A decisão sobre o que substituir, preservar ou confirmar seja tomada com base em dados reais — não em suposições.

---

## Queries de inspeção

Execute cada bloco separadamente no **SQL Editor do Supabase** (aba "SQL Editor" no painel).

---

### 1. Contagem geral por tabela

```sql
SELECT 'imobiliarias'    AS tabela, COUNT(*) AS total FROM imobiliarias
UNION ALL
SELECT 'usuarios',                   COUNT(*)          FROM usuarios
UNION ALL
SELECT 'equipes',                    COUNT(*)          FROM equipes
UNION ALL
SELECT 'corretores',                 COUNT(*)          FROM corretores
UNION ALL
SELECT 'leads',                      COUNT(*)          FROM leads
UNION ALL
SELECT 'vendas',                     COUNT(*)          FROM vendas
UNION ALL
SELECT 'historico_leads',            COUNT(*)          FROM historico_leads;
```

**Por que rodar:** Confirma os volumes reais de cada tabela antes de qualquer operação. Volumes inesperados (mais ou menos do que o previsto pelo schema.sql) indicam que migrations ou inserts adicionais foram aplicados.

---

### 2. Imobiliárias existentes

```sql
SELECT
  id,
  nome,
  created_at
FROM imobiliarias
ORDER BY created_at;
```

**Por que rodar:** Deve existir exatamente 1 linha, com o nome provisório `"Imobiliária Padrão — Renomear após setup"`. Qualquer número diferente de 1 é inesperado e exige investigação antes de prosseguir.

---

### 3. Usuários existentes

```sql
SELECT
  id,
  email,
  created_at
FROM usuarios
ORDER BY created_at;
```

**Por que rodar:** Confirma quais contas de acesso existem na tabela `public.usuarios`. Não exibe senhas — estas ficam exclusivamente no Auth interno do Supabase.

> Para ver os usuários do Auth (com email e status de confirmação), acessar no painel: **Authentication → Users**.

---

### 4. Equipes existentes

```sql
SELECT
  id,
  nome,
  ativo,
  ultimo_lead_recebido_em,
  imobiliaria_id,
  created_at
FROM equipes
ORDER BY created_at;
```

**Por que rodar:** Mostra quais equipes existem, se estão ativas, e a qual imobiliária pertencem. As equipes inseridas pelo schema.sql têm nomes de demonstração ("Equipe Atlântico", "Equipe Horizonte").

---

### 5. Corretores existentes — visão completa

```sql
SELECT
  c.id,
  c.nome,
  c.ativo,
  c.em_plantao,
  c.ultimo_lead_recebido_em,
  c.usuario_id,
  c.imobiliaria_id,
  e.nome AS equipe_nome,
  c.created_at
FROM corretores c
LEFT JOIN equipes e ON e.id = c.equipe_id
ORDER BY e.nome, c.nome;
```

**Por que rodar:** Lista todos os corretores com equipe, status de atividade, status de plantão e vínculo com conta de usuário. Os corretores do schema.sql têm nomes fictícios (Rafael Mendes, Beatriz Lima, etc.).

---

### 6. Corretores em plantão agora

```sql
SELECT
  c.nome,
  e.nome AS equipe,
  c.em_plantao,
  c.ultimo_lead_recebido_em
FROM corretores c
LEFT JOIN equipes e ON e.id = c.equipe_id
WHERE c.em_plantao = true
ORDER BY e.nome, c.nome;
```

**Por que rodar:** Verifica se algum corretor está marcado como em plantão. Se retornar vazio, a fila de distribuição automática está desconfigurada — nenhum lead será distribuído até que `em_plantao = true` seja definido.

---

### 7. Leads existentes — visão completa

```sql
SELECT
  id,
  nome,
  telefone,
  telefone_normalizado,
  email,
  origem,
  status,
  equipe_id,
  corretor_id,
  distribuido_em,
  imobiliaria_id,
  created_at
FROM leads
ORDER BY created_at DESC;
```

**Por que rodar:** Lista todos os leads com seus campos principais. Leads de demo têm nomes fictícios (Marina Costa, Eduardo Ramos, etc.) e `telefone_normalizado = NULL`.

---

### 8. Leads — distribuição por status

```sql
SELECT
  status,
  COUNT(*) AS total
FROM leads
GROUP BY status
ORDER BY total DESC;
```

**Por que rodar:** Mostra quantos leads existem em cada status do pipeline.

---

### 9. Leads — distribuição por origem

```sql
SELECT
  origem,
  COUNT(*) AS total
FROM leads
GROUP BY origem
ORDER BY total DESC;
```

**Por que rodar:** Identifica as origens registradas. Origens como `null`, `"Demo"` ou `"Teste"` indicam dados de seed. Origens como `"Site"`, `"WhatsApp"`, `"Indicação"` ou `"Meta Ads"` podem indicar dados reais.

---

### 10. Vendas existentes

```sql
SELECT
  v.id,
  v.valor_vgv,
  v.data_venda,
  l.nome  AS lead_nome,
  c.nome  AS corretor_nome,
  e.nome  AS equipe_nome,
  v.imobiliaria_id,
  v.created_at
FROM vendas v
LEFT JOIN leads     l ON l.id = v.lead_id
LEFT JOIN corretores c ON c.id = v.corretor_id
LEFT JOIN equipes   e ON e.id = v.equipe_id
ORDER BY v.data_venda DESC;
```

**Por que rodar:** Lista todas as vendas com contexto completo. Vendas de demo têm valores fictícios e datas fabricadas.

---

### 11. Histórico de leads

```sql
SELECT
  h.id,
  h.evento,
  h.descricao,
  h.created_at,
  l.nome AS lead_nome,
  c.nome AS corretor_nome
FROM historico_leads h
LEFT JOIN leads      l ON l.id = h.lead_id
LEFT JOIN corretores c ON c.id = h.corretor_id
ORDER BY h.created_at DESC
LIMIT 50;
```

**Por que rodar:** Verifica se existe algum histórico registrado. O esperado é que esteja vazio, pois nenhuma operação de escrita real foi realizada via app até esta data.

---

### 12. Leads sem corretor atribuído

```sql
SELECT
  id,
  nome,
  telefone,
  status,
  origem,
  distribuido_em,
  created_at
FROM leads
WHERE corretor_id IS NULL
ORDER BY created_at DESC;
```

**Por que rodar:** Leads sem corretor nunca passaram pelo fluxo de distribuição. Útil para separar o que é dado de seed do que é dado real.

---

### 13. Corretores sem equipe

```sql
SELECT
  id,
  nome,
  ativo,
  em_plantao,
  equipe_id
FROM corretores
WHERE equipe_id IS NULL;
```

**Por que rodar:** Identifica corretores órfãos (sem equipe). Não devem existir, mas é um check de integridade antes de qualquer alteração.

---

### 14. Consistência do imobiliaria_id entre tabelas

```sql
SELECT 'imobiliarias' AS tabela, CAST(imobiliaria_id AS TEXT) AS imobiliaria_id, COUNT(*) FROM imobiliarias GROUP BY imobiliaria_id
UNION ALL
SELECT 'equipes',     CAST(imobiliaria_id AS TEXT), COUNT(*) FROM equipes     GROUP BY imobiliaria_id
UNION ALL
SELECT 'corretores',  CAST(imobiliaria_id AS TEXT), COUNT(*) FROM corretores  GROUP BY imobiliaria_id
UNION ALL
SELECT 'leads',       CAST(imobiliaria_id AS TEXT), COUNT(*) FROM leads       GROUP BY imobiliaria_id
UNION ALL
SELECT 'vendas',      CAST(imobiliaria_id AS TEXT), COUNT(*) FROM vendas      GROUP BY imobiliaria_id;
```

**Por que rodar:** Confirma que todos os registros de todas as tabelas pertencem ao mesmo tenant. Se aparecerem UUIDs diferentes entre tabelas, há inconsistência de multi-tenancy que precisa ser resolvida antes de qualquer alteração.

---

### 15. Data mais recente por tabela

```sql
SELECT 'leads'           AS tabela, MAX(created_at) AS mais_recente FROM leads
UNION ALL
SELECT 'corretores',                MAX(created_at)                  FROM corretores
UNION ALL
SELECT 'equipes',                   MAX(created_at)                  FROM equipes
UNION ALL
SELECT 'vendas',                    MAX(created_at)                  FROM vendas
UNION ALL
SELECT 'historico_leads',           MAX(created_at)                  FROM historico_leads;
```

**Por que rodar:** Se todos os `created_at` estiverem muito próximos entre si e anteriores ao deploy da Fase 7, os dados são todos de seed. Se algum registro for recente, pode ter sido inserido manualmente e merece atenção antes de ser deletado.

---

### 16. Foreign keys e regras de deleção

```sql
SELECT
  tc.table_name       AS tabela,
  kcu.column_name     AS coluna_fk,
  ccu.table_name      AS tabela_referenciada,
  rc.delete_rule      AS ao_deletar
FROM information_schema.table_constraints      AS tc
JOIN information_schema.key_column_usage       AS kcu ON tc.constraint_name  = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc  ON rc.constraint_name  = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name;
```

**Por que rodar:** Mostra se as FKs têm `ON DELETE CASCADE`, `SET NULL` ou `NO ACTION`. Essencial para entender o efeito em cascata de qualquer DELETE antes de executá-lo.

---

## Como interpretar os resultados

### Query 1 — contagem geral

| Resultado esperado | Significado |
|---|---|
| `imobiliarias = 1` | Normal — tenant único |
| `usuarios = 0` | Nenhum usuário criado ainda |
| `usuarios >= 1` | Há pelo menos uma conta de acesso |
| `equipes = 2` | Dados do schema.sql inicial (demo) |
| `corretores = 12` | Dados do schema.sql inicial (demo) |
| `leads = 11` | Dados do schema.sql inicial (demo) |
| `vendas = 10` | Dados do schema.sql inicial (demo) |
| `historico_leads = 0` | Esperado — nenhuma escrita real ocorreu |

Qualquer volume diferente do esperado exige análise antes de prosseguir.

### Query 6 — plantão

- Resultado **vazio**: fila de plantão desconfigurada. Nenhum lead será distribuído até que `em_plantao = true` seja definido para ao menos um corretor por equipe.
- Resultado **com registros**: há corretores de plantão. Verificar se são dados reais ou configuração de teste.

### Query 9 — origens

- `null`, `"Demo"`, `"Teste"`, `"Seed"` = dados de demonstração, substituíveis.
- `"Site"`, `"WhatsApp"`, `"Indicação"`, `"Meta Ads"` = potencialmente dados reais. Confirmar antes de deletar.

### Query 14 — imobiliaria_id

- **Mesmo UUID em todas as tabelas**: multi-tenancy consistente. Seguro para prosseguir com substituição de dados.
- **UUIDs diferentes entre tabelas**: inconsistência. Não alterar nada antes de investigar a causa.

### Query 16 — foreign keys

- `CASCADE`: deletar o pai apaga os filhos automaticamente.
- `NO ACTION` ou `RESTRICT`: deletar o pai falha se houver filhos. É necessário deletar os filhos primeiro.
- `SET NULL`: deletar o pai define `NULL` na coluna FK dos filhos.

---

## Dados que devem ser preservados

| Dado | Motivo |
|---|---|
| `imobiliarias.id` (UUID) | Chave de multi-tenancy referenciada em todas as tabelas. Nunca deletar — apenas fazer UPDATE no campo `nome`. |
| `usuarios` (contas de acesso) | São contas reais de autenticação. Preservar e vincular aos corretores reais via `usuario_id`. |

---

## Dados que podem ser substituídos

| Dado | Estratégia segura |
|---|---|
| `imobiliarias.nome` | UPDATE — substituir pelo nome real: `"Basílio Imóveis"` |
| `equipes` (nomes de demo) | UPDATE nos nomes. Preservar os IDs para não quebrar as FKs dos corretores. |
| `corretores` (nomes fictícios) | UPDATE nos nomes reais. Deletar linhas extras se houver mais demo do que corretores reais. Inserir novas linhas se houver mais corretores reais do que linhas de demo. |
| `leads` (dados fictícios) | DELETE em todos + INSERT dos leads reais. Executar após confirmar ausência de dados reais pela Query 15. |
| `vendas` (dados fictícios) | DELETE em todos + INSERT das vendas reais para a demo. |
| `historico_leads` | Se vazio: nenhuma ação. Se houver registros: DELETE seguro (são logs de eventos, não dados estruturais). |

---

## Riscos identificados

### Risco 1 — Deleção em cascata inesperada

Se as FKs tiverem `ON DELETE CASCADE` (verificar pela Query 16), deletar uma equipe apaga os corretores, e deletar corretores apaga os leads distribuídos. Confirmar as regras antes de qualquer DELETE.

**Ordem segura de deleção quando não há CASCADE:**
1. `historico_leads`
2. `vendas`
3. `leads`
4. `corretores`
5. `equipes`
6. Nunca deletar `imobiliarias`

### Risco 2 — Recriar o registro de imobiliária

O UUID em `imobiliarias.id` é a âncora do multi-tenancy. Se for deletado e recriado, todos os registros das outras tabelas ficam com `imobiliaria_id` apontando para um ID que não existe mais. **Nunca deletar — apenas UPDATE no nome.**

### Risco 3 — Fila de plantão vazia após substituição de corretores

Se os corretores de demo forem deletados sem que os corretores reais sejam inseridos com `em_plantao = true` e `ativo = true`, o sistema ficará sem fila operacional durante a demo. Configurar o plantão como última etapa, após inserir todos os corretores.

### Risco 4 — Inconsistência entre Auth e tabela `usuarios`

Os usuários em `auth.users` (gerenciados pelo Supabase) e os registros em `public.usuarios` devem estar sincronizados. Deletar um usuário do Auth sem atualizar `public.usuarios` (ou vice-versa) quebra o login. Verificar os dois painéis antes de qualquer alteração em usuários.

---

## Próximo passo

Após executar as queries acima e analisar os resultados:

1. **Anotar o UUID da imobiliária** — valor de `imobiliarias.id`. Necessário para qualquer INSERT subsequente.

2. **Mapear a estrutura real da Basílio Imóveis** — quantas equipes existem, quais os nomes reais, quantos corretores por equipe, quais corretores serão vinculados a contas de usuário.

3. **Confirmar as regras de CASCADE** pela Query 16 — define a ordem segura das operações.

4. **Definir o que será UPDATE, DELETE e INSERT** — com base nos volumes reais encontrados pelas queries, não em estimativas.

5. **Preparar um único script SQL comentado** para revisão antes de qualquer execução. Nada deve ser executado diretamente no banco sem aprovação prévia.

6. **Configurar o plantão como etapa final** — definir `em_plantao = true` para ao menos um corretor por equipe ativa antes da demonstração.
