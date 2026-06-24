# SQL seguro — Substituição demo Basílio Imóveis

Este arquivo contém um script SQL seguro para revisão. O objetivo é:

- atualizar `imobiliarias.nome` para `BASILIO IMOVEIS`
- atualizar as 2 equipes existentes para `Genesis` e `Arkanjos`
- atualizar os 12 corretores existentes com nomes reais
- definir metade em plantão e metade em folga por equipe
- manter os IDs existentes
- não deletar nem truncar nada
- não criar migrations
- não usar `service_role`
- incluir validações antes e depois
- incluir instrução clara para testar sem gravar

> Atenção: este script não deve ser executado automaticamente. Revise antes de rodar.

```sql
-- ATENÇÃO: para testar sem gravar, substitua COMMIT por ROLLBACK.

-- Validação inicial da imobiliária


WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
)
SELECT
  i.id,
  i.nome
FROM imobiliarias i
WHERE i.id = (SELECT id FROM imob);

-- Validação inicial das equipes existentes que serão renomeadas
WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
),
team_map AS (
  SELECT id, nome, gerente, 'Genesis' AS target_name
  FROM equipes
  WHERE imobiliaria_id = (SELECT id FROM imob)
  ORDER BY id
  LIMIT 1
  UNION ALL
  SELECT id, nome, gerente, 'Arkanjos' AS target_name
  FROM equipes
  WHERE imobiliaria_id = (SELECT id FROM imob)
  ORDER BY id
  OFFSET 1
  LIMIT 1
)
SELECT
  ROW_NUMBER() OVER (ORDER BY target_name) AS mapping_order,
  id AS equipe_id,
  nome AS current_name,
  gerente AS current_gerente,
  target_name
FROM team_map
ORDER BY target_name;

-- Validação inicial dos corretores existentes e seu mapeamento para nomes novos
WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
),
team_map AS (
  SELECT id, 'Genesis' AS target_name
  FROM equipes
  WHERE imobiliaria_id = (SELECT id FROM imob)
  ORDER BY id
  LIMIT 1
  UNION ALL
  SELECT id, 'Arkanjos' AS target_name
  FROM equipes
  WHERE imobiliaria_id = (SELECT id FROM imob)
  ORDER BY id
  OFFSET 1
  LIMIT 1
),
corretor_map AS (
  SELECT
    c.id AS corretor_id,
    c.equipe_id,
    c.nome AS current_name,
    CASE WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') THEN 'Genesis'
         WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') THEN 'Arkanjos'
         ELSE 'Outros' END AS equipe_label,
    ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) AS rn,
    CASE
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 1 THEN 'Annelyza'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 2 THEN 'Leandro'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 3 THEN 'Maria Eduarda'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 4 THEN 'Douglas'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 5 THEN 'Jacson'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 6 THEN 'Rodrigo'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 1 THEN 'Kamila'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 2 THEN 'Victor'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 3 THEN 'Aline'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 4 THEN 'Graziela'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 5 THEN 'Keila'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 6 THEN 'Jhonatham'
      ELSE NULL
    END AS target_name,
    CASE WHEN ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) <= 3 THEN true ELSE false END AS target_em_plantao,
    ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) AS target_ordem_plantao
  FROM corretores c
  WHERE c.imobiliaria_id = (SELECT id FROM imob)
    AND c.equipe_id IN (
      (SELECT id FROM team_map WHERE target_name = 'Genesis'),
      (SELECT id FROM team_map WHERE target_name = 'Arkanjos')
    )
)
SELECT
  equipe_label,
  corretor_id,
  current_name,
  rn AS current_position,
  target_name,
  target_em_plantao,
  target_ordem_plantao
FROM corretor_map
ORDER BY equipe_label, rn;

BEGIN;

-- Atualizar o nome da imobiliária
WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
)
UPDATE imobiliarias
SET nome = 'BASILIO IMOVEIS'
WHERE id = (SELECT id FROM imob);

-- Atualizar as 2 equipes existentes com mapeamento determinístico por id
WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
),
team_map AS (
  SELECT id, 'Genesis' AS target_name
  FROM equipes
  WHERE imobiliaria_id = (SELECT id FROM imob)
  ORDER BY id
  LIMIT 1
  UNION ALL
  SELECT id, 'Arkanjos' AS target_name
  FROM equipes
  WHERE imobiliaria_id = (SELECT id FROM imob)
  ORDER BY id
  OFFSET 1
  LIMIT 1
)
UPDATE equipes e
SET
  nome = CASE WHEN e.id = (SELECT id FROM team_map WHERE target_name = 'Genesis') THEN 'Genesis'
              WHEN e.id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') THEN 'Arkanjos'
              ELSE e.nome END,
  gerente = CASE WHEN e.id = (SELECT id FROM team_map WHERE target_name = 'Genesis') THEN 'Euler'
                 WHEN e.id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') THEN 'Mateus'
                 ELSE e.gerente END
WHERE e.id IN (
  (SELECT id FROM team_map WHERE target_name = 'Genesis'),
  (SELECT id FROM team_map WHERE target_name = 'Arkanjos')
);

-- Atualizar os 12 corretores existentes com mapeamento determinístico por equipe e id
WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
),
team_map AS (
  SELECT id, 'Genesis' AS target_name
  FROM equipes
  WHERE imobiliaria_id = (SELECT id FROM imob)
  ORDER BY id
  LIMIT 1
  UNION ALL
  SELECT id, 'Arkanjos' AS target_name
  FROM equipes
  WHERE imobiliaria_id = (SELECT id FROM imob)
  ORDER BY id
  OFFSET 1
  LIMIT 1
),
corretor_map AS (
  SELECT
    c.id AS corretor_id,
    c.equipe_id,
    c.nome AS current_name,
    ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) AS rn,
    CASE
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 1 THEN 'Annelyza'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 2 THEN 'Leandro'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 3 THEN 'Maria Eduarda'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 4 THEN 'Douglas'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 5 THEN 'Jacson'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Genesis') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 6 THEN 'Rodrigo'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 1 THEN 'Kamila'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 2 THEN 'Victor'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 3 THEN 'Aline'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 4 THEN 'Graziela'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 5 THEN 'Keila'
      WHEN c.equipe_id = (SELECT id FROM team_map WHERE target_name = 'Arkanjos') AND ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) = 6 THEN 'Jhonatham'
      ELSE c.nome
    END AS target_name,
    CASE WHEN ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) <= 3 THEN true ELSE false END AS target_em_plantao,
    ROW_NUMBER() OVER (PARTITION BY c.equipe_id ORDER BY c.id) AS target_ordem_plantao
  FROM corretores c
  WHERE c.imobiliaria_id = (SELECT id FROM imob)
    AND c.equipe_id IN (
      (SELECT id FROM team_map WHERE target_name = 'Genesis'),
      (SELECT id FROM team_map WHERE target_name = 'Arkanjos')
    )
)
UPDATE corretores c
SET
  nome = m.target_name,
  ativo = true,
  em_plantao = m.target_em_plantao,
  ordem_plantao = m.target_ordem_plantao
FROM corretor_map m
WHERE c.id = m.corretor_id;

-- Validação final da imobiliária
WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
)
SELECT
  i.id,
  i.nome
FROM imobiliarias i
WHERE i.id = (SELECT id FROM imob);

-- Validação final das equipes
WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
)
SELECT
  e.id,
  e.nome,
  e.gerente,
  e.ativo,
  e.ultimo_lead_recebido_em
FROM equipes e
WHERE e.imobiliaria_id = (SELECT id FROM imob)
ORDER BY e.id;

-- Validação final dos corretores
WITH imob AS (
  SELECT id
  FROM imobiliarias
  ORDER BY id
  LIMIT 1
)
SELECT
  c.id,
  c.nome,
  c.equipe_id,
  c.ativo,
  c.em_plantao,
  c.ordem_plantao
FROM corretores c
WHERE c.imobiliaria_id = (SELECT id FROM imob)
ORDER BY c.equipe_id, c.ordem_plantao, c.id;

COMMIT;
```
