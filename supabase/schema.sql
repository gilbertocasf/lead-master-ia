-- =====================================================================
-- LEAD MASTER IA — Schema completo para Supabase (PostgreSQL)
-- =====================================================================
-- Ordem de execução: extensões → tipos → tabelas → índices → dados.
-- Pode rodar este arquivo inteiro de uma vez no SQL Editor do Supabase.
-- O script é idempotente: pode ser reexecutado sem erro (usa DROP/IF NOT EXISTS).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. EXTENSÕES
-- ---------------------------------------------------------------------
-- gen_random_uuid() vem da extensão pgcrypto. No Supabase já costuma
-- estar habilitada, mas garantimos aqui.
create extension if not exists "pgcrypto";


-- ---------------------------------------------------------------------
-- 1. LIMPEZA (idempotência)
-- ---------------------------------------------------------------------
-- Dropamos na ordem inversa das dependências para não violar FKs.
drop table if exists vendas cascade;
drop table if exists leads cascade;
drop table if exists corretores cascade;
drop table if exists equipes cascade;

drop type if exists lead_status cascade;
drop type if exists lead_origem cascade;


-- ---------------------------------------------------------------------
-- 2. TIPOS ENUM
-- ---------------------------------------------------------------------
-- Espelham exatamente os valores usados na aplicação (lib/types.ts).

-- Origem do lead (anúncios pagos + outros canais)
create type lead_origem as enum ('Instagram', 'Facebook', 'Outro');

-- Etapas do pipeline
create type lead_status as enum (
  'novo',
  'em_contato',
  'visita',
  'proposta',
  'fechado',
  'perdido'
);


-- ---------------------------------------------------------------------
-- 3. TABELA: equipes
-- ---------------------------------------------------------------------
create table equipes (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  gerente     text not null,                         -- nome do gerente responsável
  created_at  timestamptz not null default now()
);

comment on table equipes is 'Equipes comerciais da imobiliária.';
comment on column equipes.gerente is 'Nome do gerente responsável pela equipe.';


-- ---------------------------------------------------------------------
-- 4. TABELA: corretores
-- ---------------------------------------------------------------------
create table corretores (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  email          text unique,                        -- e-mail único quando informado
  telefone       text,
  equipe_id      uuid not null
                   references equipes(id)
                   on update cascade
                   on delete restrict,               -- não apaga equipe com corretores
  ordem_plantao  integer not null default 0,         -- posição na fila de plantão
  ativo          boolean not null default true,
  created_at     timestamptz not null default now()
);

comment on table corretores is 'Corretores vinculados a uma equipe, com ordem de plantão.';
comment on column corretores.ordem_plantao is 'Ordem na fila de plantão (1 = próximo a receber lead).';


-- ---------------------------------------------------------------------
-- 5. TABELA: leads
-- ---------------------------------------------------------------------
create table leads (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  telefone     text,
  origem       lead_origem not null default 'Outro',
  interesse    text,                                 -- ex.: "Compra • Apto 2 quartos"
  faixa_valor  text,                                 -- ex.: "R$ 400–600 mil"
  equipe_id    uuid not null
                 references equipes(id)
                 on update cascade
                 on delete restrict,                 -- captador escolhe a equipe de destino
  corretor_id  uuid
                 references corretores(id)
                 on update cascade
                 on delete set null,                 -- null = ainda na fila de distribuição
  status       lead_status not null default 'novo',
  observacoes  text,
  created_at   timestamptz not null default now()
);

comment on table leads is 'Leads captados; entram com equipe definida e são distribuídos a um corretor.';
comment on column leads.corretor_id is 'NULL enquanto o lead está na fila aguardando distribuição.';


-- ---------------------------------------------------------------------
-- 6. TABELA: vendas
-- ---------------------------------------------------------------------
create table vendas (
  id           uuid primary key default gen_random_uuid(),
  corretor_id  uuid not null
                 references corretores(id)
                 on update cascade
                 on delete restrict,                 -- preserva histórico de vendas
  lead_id      uuid
                 references leads(id)
                 on update cascade
                 on delete set null,                 -- mantém a venda mesmo se o lead sumir
  valor_vgv    numeric(14,2) not null check (valor_vgv > 0),  -- base do ranking; sempre positivo
  data_venda   date not null default current_date,
  created_at   timestamptz not null default now()
);

comment on table vendas is 'Vendas fechadas. Base do ranking VGV (apenas vendas — locação não entra).';
comment on column vendas.valor_vgv is 'Valor Geral de Vendas do imóvel, em reais.';


-- ---------------------------------------------------------------------
-- 7. ÍNDICES
-- ---------------------------------------------------------------------
-- FKs e colunas usadas em filtros/ordenções das telas.

-- corretores: filtro por equipe e ordenação de plantão
create index idx_corretores_equipe_id     on corretores (equipe_id);
create index idx_corretores_ordem_plantao on corretores (equipe_id, ordem_plantao);

-- leads: fila por equipe, leads por corretor e por status (kanban/funil)
create index idx_leads_equipe_id   on leads (equipe_id);
create index idx_leads_corretor_id on leads (corretor_id);
create index idx_leads_status      on leads (status);
-- fila de distribuição = leads sem corretor (índice parcial, bem enxuto)
create index idx_leads_fila        on leads (equipe_id) where corretor_id is null;

-- vendas: agregação do ranking por corretor e por período
create index idx_vendas_corretor_id on vendas (corretor_id);
create index idx_vendas_lead_id     on vendas (lead_id);
create index idx_vendas_data_venda  on vendas (data_venda);


-- =====================================================================
-- 8. DADOS DE EXEMPLO
-- =====================================================================
-- Inserimos com CTEs encadeadas para capturar os UUIDs gerados e usá-los
-- nas FKs sem precisar digitar IDs manualmente.
-- =====================================================================

-- 8.1 — Equipes
with eq as (
  insert into equipes (nome, gerente) values
    ('Equipe Atlântico', 'Roberto Tavares'),
    ('Equipe Horizonte', 'Cláudia Menezes')
  returning id, nome
)
-- 8.2 — Corretores (vinculados às equipes recém-criadas)
insert into corretores (nome, email, telefone, equipe_id, ordem_plantao, ativo)
select c.nome, c.email, c.telefone, eq.id, c.ordem_plantao, c.ativo
from (values
  -- Equipe Atlântico
  ('Rafael Mendes',  'rafael.mendes@imob.com',   '(62) 99100-0001', 'Equipe Atlântico', 1, true),
  ('Beatriz Lima',   'beatriz.lima@imob.com',    '(62) 99100-0002', 'Equipe Atlântico', 2, true),
  ('Diego Farias',   'diego.farias@imob.com',    '(62) 99100-0003', 'Equipe Atlântico', 3, true),
  ('Camila Souza',   'camila.souza@imob.com',    '(62) 99100-0004', 'Equipe Atlântico', 4, true),
  ('Henrique Alves', 'henrique.alves@imob.com',  '(62) 99100-0005', 'Equipe Atlântico', 5, true),
  ('Patrícia Rocha', 'patricia.rocha@imob.com',  '(62) 99100-0006', 'Equipe Atlântico', 6, true),
  -- Equipe Horizonte
  ('Lucas Pereira',  'lucas.pereira@imob.com',   '(62) 99100-0007', 'Equipe Horizonte', 1, true),
  ('Aline Castro',   'aline.castro@imob.com',    '(62) 99100-0008', 'Equipe Horizonte', 2, true),
  ('Marcos Vieira',  'marcos.vieira@imob.com',   '(62) 99100-0009', 'Equipe Horizonte', 3, true),
  ('Juliana Dias',   'juliana.dias@imob.com',    '(62) 99100-0010', 'Equipe Horizonte', 4, true),
  ('Felipe Nunes',   'felipe.nunes@imob.com',    '(62) 99100-0011', 'Equipe Horizonte', 5, true),
  ('Sofia Barros',   'sofia.barros@imob.com',    '(62) 99100-0012', 'Equipe Horizonte', 6, true)
) as c(nome, email, telefone, equipe_nome, ordem_plantao, ativo)
join eq on eq.nome = c.equipe_nome;


-- 8.3 — Leads
-- Alguns na fila (corretor_id = NULL), outros já distribuídos.
insert into leads (nome, telefone, origem, interesse, faixa_valor, equipe_id, corretor_id, status, observacoes)
select
  l.nome, l.telefone, l.origem::lead_origem, l.interesse, l.faixa_valor,
  eq.id,
  cr.id,                       -- NULL quando corretor_nome é NULL (lead na fila)
  l.status::lead_status,
  l.observacoes
from (values
  -- Fila Atlântico
  ('Marina Costa',    '(62) 99812-3344', 'Instagram', 'Compra • Apto 2 quartos',  'R$ 400–600 mil',    'Equipe Atlântico', null,             'novo',       'Veio do anúncio de lançamento.'),
  ('Eduardo Ramos',   '(62) 99744-1290', 'Facebook',  'Compra • Casa 3 quartos',  'R$ 800 mil–1,2 mi', 'Equipe Atlântico', null,             'novo',       null),
  -- Fila Horizonte
  ('Fernanda Aguiar', '(62) 99655-7781', 'Instagram', 'Compra • Cobertura',       'R$ 1,5–2 mi',       'Equipe Horizonte', null,             'novo',       'Pediu contato após as 18h.'),
  ('Gustavo Lemos',   '(62) 99533-4412', 'Facebook',  'Compra • Apto 1 quarto',   'R$ 250–350 mil',    'Equipe Horizonte', null,             'novo',       null),
  -- Distribuídos — Atlântico
  ('Paula Andrade',   '(62) 99411-8820', 'Instagram', 'Compra • Apto 3 quartos',  'R$ 600–800 mil',    'Equipe Atlântico', 'Rafael Mendes',  'em_contato', 'Primeiro contato feito por WhatsApp.'),
  ('Ricardo Maia',    '(62) 99322-1170', 'Facebook',  'Compra • Casa condomínio', 'R$ 1,2–1,8 mi',     'Equipe Atlântico', 'Beatriz Lima',   'visita',     'Visita agendada para sábado.'),
  ('Tatiane Reis',    '(62) 99288-6655', 'Instagram', 'Compra • Apto 2 quartos',  'R$ 450–550 mil',    'Equipe Atlântico', 'Rafael Mendes',  'proposta',   'Proposta enviada, aguardando retorno.'),
  ('André Fontes',    '(62) 99177-2244', 'Facebook',  'Compra • Casa 4 quartos',  'R$ 1–1,5 mi',       'Equipe Atlântico', 'Camila Souza',   'perdido',    'Comprou com concorrente.'),
  -- Distribuídos — Horizonte
  ('Vanessa Pires',   '(62) 99066-3311', 'Instagram', 'Compra • Cobertura',       'R$ 2–3 mi',         'Equipe Horizonte', 'Lucas Pereira',  'em_contato', null),
  ('Bruno Teixeira',  '(62) 98955-4400', 'Facebook',  'Compra • Apto 2 quartos',  'R$ 350–500 mil',    'Equipe Horizonte', 'Aline Castro',   'visita',     'Cliente bem qualificado.'),
  ('Larissa Gomes',   '(62) 98844-7788', 'Instagram', 'Compra • Apto 3 quartos',  'R$ 700–900 mil',    'Equipe Horizonte', 'Marcos Vieira',  'proposta',   'Negociando condições de pagamento.')
) as l(nome, telefone, origem, interesse, faixa_valor, equipe_nome, corretor_nome, status, observacoes)
join equipes   eq on eq.nome = l.equipe_nome
left join corretores cr on cr.nome = l.corretor_nome;


-- 8.4 — Vendas (base do ranking VGV)
-- Vinculadas a corretores reais. lead_id fica NULL aqui (vendas históricas,
-- anteriores aos leads de exemplo acima) — a FK permite NULL.
insert into vendas (corretor_id, lead_id, valor_vgv, data_venda)
select cr.id, null, v.valor_vgv, v.data_venda
from (values
  ('Rafael Mendes',  620000.00,  current_date - 12),
  ('Rafael Mendes',  1150000.00, current_date - 20),
  ('Beatriz Lima',   1980000.00, current_date - 9),
  ('Lucas Pereira',  2450000.00, current_date - 6),
  ('Lucas Pereira',  540000.00,  current_date - 15),
  ('Marcos Vieira',  780000.00,  current_date - 3),
  ('Henrique Alves', 460000.00,  current_date - 22),
  ('Aline Castro',   1320000.00, current_date - 11),
  ('Beatriz Lima',   890000.00,  current_date - 2),
  ('Felipe Nunes',   670000.00,  current_date - 18)
) as v(corretor_nome, valor_vgv, data_venda)
join corretores cr on cr.nome = v.corretor_nome;


-- =====================================================================
-- 9. CONFERÊNCIA RÁPIDA (opcional — pode rodar para validar)
-- =====================================================================
-- select 'equipes'    as tabela, count(*) from equipes
-- union all select 'corretores', count(*) from corretores
-- union all select 'leads',      count(*) from leads
-- union all select 'vendas',     count(*) from vendas;
--
-- Ranking VGV (espelha buildRanking da app):
-- select c.nome, e.nome as equipe, sum(v.valor_vgv) as vgv_total, count(*) as vendas
-- from vendas v
-- join corretores c on c.id = v.corretor_id
-- join equipes e on e.id = c.equipe_id
-- group by c.nome, e.nome
-- order by vgv_total desc;
-- =====================================================================
