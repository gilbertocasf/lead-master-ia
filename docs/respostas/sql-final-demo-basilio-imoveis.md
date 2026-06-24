# SQL Final Demo — Basílio Imóveis

## Decisão estratégica

A estratégia aprovada é a **Opção C enriquecida**: limpar os dados fictícios antigos e recriar uma base demo completa da Basílio Imóveis.

- Preservar a imobiliária existente
- Renomear a imobiliária para `BASILIO IMOVEIS`
- Preservar os UUIDs das 2 equipes existentes
- Renomear equipes e atualizar gerentes
- Limpar dados antigos em ordem segura
- Criar 26 corretores reais da Basílio
- Criar leads profissionais suficientes para demo
- Criar vendas fictícias coerentes para ranking
- Inserir histórico mínimo coerente para leads distribuídos e criados

## Tabelas alteradas

- `imobiliarias`
- `equipes`
- `historico_leads`
- `vendas`
- `leads`
- `corretores`

## Ordem segura de execução

1. Atualizar `imobiliarias` e `equipes`
2. Deletar dados antigos na ordem segura:
   - `historico_leads`
   - `vendas`
   - `leads`
   - `corretores`
3. Inserir os 26 corretores Basílio
4. Inserir leads de demo
5. Inserir vendas de demo
6. Inserir histórico mínimo de leads

## SQL completo

```sql
BEGIN;

-- 1) Renomear imobiliária existente
WITH imob AS (
  SELECT id AS imobiliaria_id
  FROM imobiliarias
  LIMIT 1
)
UPDATE imobiliarias
SET nome = 'BASILIO IMOVEIS'
WHERE id = (SELECT imobiliaria_id FROM imob);

-- 2) Renomear equipes preservando UUIDs existentes
UPDATE equipes
SET nome = 'Genesis', gerente = 'Euler'
WHERE nome = 'Equipe Atlântico'
  AND imobiliaria_id = (SELECT imobiliaria_id FROM imob);

UPDATE equipes
SET nome = 'Arkanjos', gerente = 'Mateus'
WHERE nome = 'Equipe Horizonte'
  AND imobiliaria_id = (SELECT imobiliaria_id FROM imob);

-- 3) Limpar dados antigos em ordem segura
DELETE FROM historico_leads
WHERE imobiliaria_id = (SELECT imobiliaria_id FROM imob);

DELETE FROM vendas
WHERE imobiliaria_id = (SELECT imobiliaria_id FROM imob);

DELETE FROM leads
WHERE imobiliaria_id = (SELECT imobiliaria_id FROM imob);

DELETE FROM corretores
WHERE imobiliaria_id = (SELECT imobiliaria_id FROM imob);

-- 4) Inserir 26 corretores Basílio
INSERT INTO corretores (
  nome,
  email,
  telefone,
  equipe_id,
  ordem_plantao,
  ativo,
  em_plantao,
  imobiliaria_id
)
SELECT nome, email, telefone, equipe_id, ordem_plantao, ativo, em_plantao, imobiliaria_id
FROM (
  VALUES
    -- Genesis em plantão
    ('Annelyza Silva',  'annelyza.silva@basilio.com.br', '(62) 99999-0001', 1, true, true),
    ('Leandro Costa',   'leandro.costa@basilio.com.br', '(62) 99999-0002', 2, true, true),
    ('Maria Eduarda',   'maria.eduarda@basilio.com.br', '(62) 99999-0003', 3, true, true),
    ('Douglas Freitas', 'douglas.freitas@basilio.com.br', '(62) 99999-0004', 4, true, true),
    ('Jacson Oliveira', 'jacson.oliveira@basilio.com.br', '(62) 99999-0005', 5, true, true),
    ('Rodrigo Pereira', 'rodrigo.pereira@basilio.com.br', '(62) 99999-0006', 6, true, true),
    ('Rafael Gomes',    'rafael.gomes@basilio.com.br', '(62) 99999-0007', 7, true, true),
    -- Genesis folga
    ('Danilo Porto',    'danilo.porto@basilio.com.br', '(62) 99999-0008', 8, true, false),
    ('Lorraine Melo',   'lorraine.melo@basilio.com.br', '(62) 99999-0009', 9, true, false),
    ('Daiane Ramos',    'daiane.ramos@basilio.com.br', '(62) 99999-0010', 10, true, false),
    ('Túlio Alves',     'tulio.alves@basilio.com.br', '(62) 99999-0011', 11, true, false),
    ('André Barros',    'andre.barros@basilio.com.br', '(62) 99999-0012', 12, true, false),
    ('Julihermes Silva','julihermes.silva@basilio.com.br', '(62) 99999-0013', 13, true, false),
    ('Manoel Nunes',    'manoel.nunes@basilio.com.br', '(62) 99999-0014', 14, true, false),
    -- Arkanjos em plantão
    ('Kamila Rocha',    'kamila.rocha@basilio.com.br', '(62) 99999-0015', 1, true, true),
    ('Victor Barbosa',  'victor.barbosa@basilio.com.br', '(62) 99999-0016', 2, true, true),
    ('Aline Martins',   'aline.martins@basilio.com.br', '(62) 99999-0017', 3, true, true),
    ('Graziela Lima',   'graziela.lima@basilio.com.br', '(62) 99999-0018', 4, true, true),
    ('Keila Santos',    'keila.santos@basilio.com.br', '(62) 99999-0019', 5, true, true),
    ('Jhonatham Dias',  'jhonatham.dias@basilio.com.br', '(62) 99999-0020', 6, true, true),
    -- Arkanjos folga
    ('Emily Fernandes', 'emily.fernandes@basilio.com.br', '(62) 99999-0021', 7, true, false),
    ('Ricardo Souza',   'ricardo.souza@basilio.com.br', '(62) 99999-0022', 8, true, false),
    ('Kanan Rocha',     'kanan.rocha@basilio.com.br', '(62) 99999-0023', 9, true, false),
    ('Silvio Torres',   'silvio.torres@basilio.com.br', '(62) 99999-0024', 10, true, false),
    ('Cláudio Moraes',  'claudio.moraes@basilio.com.br', '(62) 99999-0025', 11, true, false),
    ('Lorena Campos',   'lorena.campos@basilio.com.br', '(62) 99999-0026', 12, true, false)
) AS csv(nome, email, telefone, ordem_plantao, ativo, em_plantao)
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN csv.ordem_plantao <= 7 THEN (SELECT id FROM equipes WHERE nome = 'Genesis' AND imobiliaria_id = (SELECT imobiliaria_id FROM imob) LIMIT 1)
      ELSE (SELECT id FROM equipes WHERE nome = 'Arkanjos' AND imobiliaria_id = (SELECT imobiliaria_id FROM imob) LIMIT 1)
    END AS equipe_id,
    (SELECT imobiliaria_id FROM imob) AS imobiliaria_id
) params;

-- 5) Inserir leads de demo
INSERT INTO leads (
  nome,
  telefone,
  telefone_normalizado,
  origem,
  interesse,
  faixa_valor,
  equipe_id,
  corretor_id,
  status,
  observacoes,
  created_at,
  distribuido_em,
  imobiliaria_id
)
VALUES
  -- Leads na fila
  ('Shaiane Dias',    '(62) 98888-1001', '62988881001', 'Instagram', 'Compra • Apto 2 quartos',   'R$ 550–700 mil',  (SELECT id FROM equipes WHERE nome = 'Genesis' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 'novo', 'Lead captado por anúncio.', NOW() - INTERVAL '2 days', NULL, (SELECT id FROM imobiliarias LIMIT 1)),
  ('Bruno Castro',    '(62) 98888-1002', '62988881002', 'Facebook',  'Compra • Casa 3 quartos',    'R$ 950–1,200 mil', (SELECT id FROM equipes WHERE nome = 'Genesis' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 'novo', 'Solicitou contato após o expediente.', NOW() - INTERVAL '1 day', NULL, (SELECT id FROM imobiliarias LIMIT 1)),
  ('Lorena Dias',     '(62) 98888-1003', '62988881003', 'Instagram', 'Compra • Apto 3 quartos',   'R$ 750–900 mil',  (SELECT id FROM equipes WHERE nome = 'Arkanjos' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 'novo', 'Lead inbound via site.', NOW() - INTERVAL '3 days', NULL, (SELECT id FROM imobiliarias LIMIT 1)),
  ('Enzo Moreira',    '(62) 98888-1004', '62988881004', 'Facebook',  'Compra • Cobertura',         'R$ 1,8–2,3 mi',  (SELECT id FROM equipes WHERE nome = 'Arkanjos' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 'novo', 'Backup de lead de tráfego.', NOW() - INTERVAL '5 hours', NULL, (SELECT id FROM imobiliarias LIMIT 1)),
  ('Melina Souza',    '(62) 98888-1005', '62988881005', 'Instagram', 'Compra • Casa condomínio',   'R$ 1,3–1,6 mi',  (SELECT id FROM equipes WHERE nome = 'Genesis' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 'novo', 'Preferência por região central.', NOW() - INTERVAL '6 hours', NULL, (SELECT id FROM imobiliarias LIMIT 1)),
  -- Leads distribuídos
  ('Paulo Ribeiro',   '(62) 98888-1006', '62988881006', 'Instagram', 'Compra • Apto 3 quartos',   'R$ 700–850 mil',  (SELECT id FROM equipes WHERE nome = 'Genesis' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM corretores WHERE nome = 'Annelyza Silva' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), 'em_contato', 'Primeiro contato por WhatsApp realizado.', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days', (SELECT id FROM imobiliarias LIMIT 1)),
  ('Mariana Faria',   '(62) 98888-1007', '62988881007', 'Facebook',  'Compra • Casa 4 quartos',    'R$ 1,2–1,4 mi',  (SELECT id FROM equipes WHERE nome = 'Genesis' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM corretores WHERE nome = 'Leandro Costa' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), 'visita', 'Visita agendada para sábado.', NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days', (SELECT id FROM imobiliarias LIMIT 1)),
  ('Gabriel Neves',  '(62) 98888-1008', '62988881008', 'Instagram', 'Compra • Cobertura',       'R$ 2–2,5 mi',    (SELECT id FROM equipes WHERE nome = 'Arkanjos' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM corretores WHERE nome = 'Kamila Rocha' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), 'proposta', 'Proposta enviada, aguardando retorno.', NOW() - INTERVAL '6 days', NOW() - INTERVAL '4 days', (SELECT id FROM imobiliarias LIMIT 1)),
  ('Fernanda Leal',   '(62) 98888-1009', '62988881009', 'Facebook',  'Compra • Apto 2 quartos',   'R$ 520–620 mil',  (SELECT id FROM equipes WHERE nome = 'Arkanjos' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM corretores WHERE nome = 'Victor Barbosa' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), 'fechado', 'Contrato assinado e em fase de documentação.', NOW() - INTERVAL '12 days', NOW() - INTERVAL '10 days', (SELECT id FROM imobiliarias LIMIT 1)),
  ('Lucas Tavares',   '(62) 98888-1010', '62988881010', 'Instagram', 'Compra • Apto 2 quartos',   'R$ 600–700 mil',  (SELECT id FROM equipes WHERE nome = 'Genesis' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM corretores WHERE nome = 'Maria Eduarda' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), 'em_contato', 'Necessita verificar financiamento.', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day', (SELECT id FROM imobiliarias LIMIT 1)),
  ('Larissa Pinto',   '(62) 98888-1011', '62988881011', 'Facebook',  'Compra • Casa 3 quartos',    'R$ 900–1,050 mi', (SELECT id FROM equipes WHERE nome = 'Genesis' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM corretores WHERE nome = 'Douglas Freitas' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), 'visita', 'Cliente bem qualificado, visita marcada.', NOW() - INTERVAL '9 days', NOW() - INTERVAL '7 days', (SELECT id FROM imobiliarias LIMIT 1)),
  ('Adriana Santos',  '(62) 98888-1012', '62988881012', 'Facebook',  'Compra • Apto 3 quartos',   'R$ 780–900 mil',  (SELECT id FROM equipes WHERE nome = 'Arkanjos' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM corretores WHERE nome = 'Aline Martins' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), 'perdido', 'Lead perdeu interesse e procurou concorrente.', NOW() - INTERVAL '15 days', NOW() - INTERVAL '13 days', (SELECT id FROM imobiliarias LIMIT 1)),
  ('Pedro Matos',     '(62) 98888-1013', '62988881013', 'Instagram', 'Compra • Casa condomínio',   'R$ 1,4–1,7 mi',  (SELECT id FROM equipes WHERE nome = 'Arkanjos' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM corretores WHERE nome = 'Graziela Lima' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), 'proposta', 'Negociação em andamento.', NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days', (SELECT id FROM imobiliarias LIMIT 1)),
  ('Daniela Rocha',   '(62) 98888-1014', '62988881014', 'Facebook',  'Compra • Apto 1 quarto',   'R$ 380–450 mil',  (SELECT id FROM equipes WHERE nome = 'Arkanjos' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 'novo', 'Lead entrou pela landing page.', NOW() - INTERVAL '4 hours', NULL, (SELECT id FROM imobiliarias LIMIT 1));

-- 6) Inserir vendas de demo para ranking VGV
INSERT INTO vendas (
  corretor_id,
  lead_id,
  valor_vgv,
  data_venda,
  imobiliaria_id
)
VALUES
  ((SELECT id FROM corretores WHERE nome = 'Victor Barbosa' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), (SELECT id FROM leads WHERE telefone = '(62) 98888-1009' AND status = 'fechado'), 2450000.00, current_date - 6, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Keila Santos' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 1280000.00, current_date - 11, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Annelyza Silva' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 680000.00, current_date - 12, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Leandro Costa' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 1150000.00, current_date - 20, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Kamila Rocha' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 1980000.00, current_date - 9, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Aline Martins' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 1320000.00, current_date - 11, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Graziela Lima' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 890000.00, current_date - 2, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Maria Eduarda' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 760000.00, current_date - 3, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Douglas Freitas' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 460000.00, current_date - 22, (SELECT id FROM imobiliarias LIMIT 1)),
  ((SELECT id FROM corretores WHERE nome = 'Jhonatham Dias' AND imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)), NULL, 540000.00, current_date - 15, (SELECT id FROM imobiliarias LIMIT 1));

-- 7) Inserir histórico mínimo de leads
INSERT INTO historico_leads (
  lead_id,
  imobiliaria_id,
  tipo_evento,
  criado_por,
  dados
)
VALUES
  ((SELECT id FROM leads WHERE telefone = '(62) 98888-1001'), (SELECT id FROM imobiliarias LIMIT 1), 'lead_criado', 'formulario', jsonb_build_object('telefone', '(62) 98888-1001', 'origem', 'Instagram')),
  ((SELECT id FROM leads WHERE telefone = '(62) 98888-1006'), (SELECT id FROM imobiliarias LIMIT 1), 'lead_criado', 'formulario', jsonb_build_object('telefone', '(62) 98888-1006', 'origem', 'Instagram')),
  ((SELECT id FROM leads WHERE telefone = '(62) 98888-1006'), (SELECT id FROM imobiliarias LIMIT 1), 'lead_distribuido', 'sistema', jsonb_build_object('corretor_id', (SELECT id FROM corretores WHERE nome = 'Annelyza Silva'), 'corretor_nome', 'Annelyza Silva')),
  ((SELECT id FROM leads WHERE telefone = '(62) 98888-1007'), (SELECT id FROM imobiliarias LIMIT 1), 'lead_criado', 'formulario', jsonb_build_object('telefone', '(62) 98888-1007', 'origem', 'Facebook')),
  ((SELECT id FROM leads WHERE telefone = '(62) 98888-1007'), (SELECT id FROM imobiliarias LIMIT 1), 'lead_distribuido', 'sistema', jsonb_build_object('corretor_id', (SELECT id FROM corretores WHERE nome = 'Leandro Costa'), 'corretor_nome', 'Leandro Costa')),
  ((SELECT id FROM leads WHERE telefone = '(62) 98888-1009'), (SELECT id FROM imobiliarias LIMIT 1), 'lead_criado', 'formulario', jsonb_build_object('telefone', '(62) 98888-1009', 'origem', 'Facebook')),
  ((SELECT id FROM leads WHERE telefone = '(62) 98888-1009'), (SELECT id FROM imobiliarias LIMIT 1), 'lead_distribuido', 'sistema', jsonb_build_object('corretor_id', (SELECT id FROM corretores WHERE nome = 'Victor Barbosa'), 'corretor_nome', 'Victor Barbosa'));

COMMIT;
```

## Verificações pós-execução

1. Confirmar renomeação da imobiliária:
   ```sql
   SELECT id, nome FROM imobiliarias WHERE nome = 'BASILIO IMOVEIS';
   ```

2. Confirmar equipes com nomes e gerentes corretos:
   ```sql
   SELECT id, nome, gerente FROM equipes WHERE nome IN ('Genesis', 'Arkanjos');
   ```

3. Confirmar 26 corretores criados:
   ```sql
   SELECT count(*) FROM corretores WHERE imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1);
   ```

4. Confirmar leads suficientes para demo:
   ```sql
   SELECT status, count(*) FROM leads WHERE imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1) GROUP BY status;
   ```

5. Confirmar vendas e ranking VGV:
   ```sql
   SELECT c.nome AS corretor, count(v.*) AS vendas, sum(v.valor_vgv) AS vgv_total
   FROM vendas v
   JOIN corretores c ON c.id = v.corretor_id
   WHERE v.imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1)
   GROUP BY c.nome
   ORDER BY vgv_total DESC;
   ```

6. Confirmar histórico mínimo criado:
   ```sql
   SELECT tipo_evento, count(*) FROM historico_leads WHERE imobiliaria_id = (SELECT id FROM imobiliarias LIMIT 1) GROUP BY tipo_evento;
   ```

## Riscos residuais

- `imobiliarias` com múltiplos registros não tratados explicitamente; o SQL usa `LIMIT 1` para selecionar a imobiliária existente.
- Se já existir outro registro com nome diferente das equipes esperadas, as atualizações de nome podem não encontrar correspondência.
- Se existirem corretores adicionais fora da imobiliária atual, o `DELETE FROM corretores` afetará todos os corretores do mesmo `imobiliaria_id`.
- Se a tabela `autorizacoes` ou alguma tabela não documentada referenciar `corretores`, esse SQL não a considera.
- O histórico criado é mínimo; o sistema pode requerer eventos adicionais para fluxos específicos que não estão cobertos aqui.
