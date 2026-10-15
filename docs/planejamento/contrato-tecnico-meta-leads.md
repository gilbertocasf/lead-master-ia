# Contrato técnico — Prontidão para leads da Meta

Branch: `feat/prontidao-meta-leads` (a partir de `main` 633c230). Data: 2026-10-15.

Este documento é a fonte única para todos que trabalham nesta entrega. Nomes de tabelas,
colunas, funções e rotas abaixo são definitivos. Não invente nomes diferentes.

## Regras de segurança da entrega

1. **Não quebrar produção.** A Vercel publica `main` automaticamente. Trabalhamos só neste branch.
2. **Código compatível antes das migrations.** O app novo precisa funcionar (ou degradar com
   mensagem clara) mesmo se as migrations 009–011 ainda não foram aplicadas. Use
   `funcaoAusente()` de `lib/rpc.ts` e responda `503` com `RESPOSTA_MIGRATION_PENDENTE`.
3. **Migrations aditivas e idempotentes.** `IF NOT EXISTS`, `CREATE OR REPLACE`,
   `DROP POLICY IF EXISTS` + `CREATE POLICY`. Nunca `DROP TABLE`, nunca apagar dados.
4. **Não alterar** `package.json`, `package-lock.json`, `supabase/schema.sql`, `supabase/schema.v2.sql`.
   Não há dependências novas: use só o que já existe (Next 14.2.5, React 18, @supabase/*, `crypto` do Node).
5. **Escrita sempre pelo servidor.** Rotas usam `createSupabaseServer()` para identificar o usuário
   e `createSupabaseAdmin()` (service role) para escrever, sempre filtrando por `imobiliaria_id`
   do usuário autenticado. Nunca confiar em `imobiliaria_id` vindo do cliente.
6. **Sem dados pessoais em logs e e-mails de alerta** (nome, telefone, e-mail do lead).
7. Estilo: TypeScript estrito, Tailwind com os tokens existentes (`base-*`, `ink-*`, `action`,
   `gold`, `win`, `loss`, `warn`), ícones SVG inline, textos em português do Brasil.
8. Não existe suíte de testes nem é possível rodar `npm run build` neste ambiente (sem acesso ao npm).
   Revise tipos e imports com cuidado redobrado; siga exatamente os padrões dos arquivos vizinhos.

## Telefone (já implementado)

`lib/telefone.ts` → `normalizarTelefone(bruto)` e `telefoneValido(normalizado)`.
Resultado só com dígitos e código do país (`5562999990001`). A função SQL
`normalizar_telefone_br(text)` (migration 010) implementa a mesma regra.

## Migrations (agente banco)

### 009_seguranca_rls_equipe.sql
- `REVOKE ALL ON FUNCTION alterar_status_lead(jsonb) FROM PUBLIC, anon, authenticated;`
  `GRANT EXECUTE ... TO service_role;` — idem para `criar_e_distribuir_lead(jsonb)`
  (o Supabase concede EXECUTE diretamente a `anon` e `authenticated` por privilégio padrão;
  o `REVOKE ... FROM PUBLIC` da 007 não remove essas concessões).
- Nova função `current_equipe_id()` (SQL, STABLE, SECURITY DEFINER, search_path fixo):
  `usuarios.equipe_id` do usuário autenticado e ativo.
- Gestor limitado à própria equipe (admin continua com a imobiliária inteira):
  - `corretores`: SELECT admin = tenant; gestor = `equipe_id = current_equipe_id()`.
    INSERT/UPDATE = só admin (as rotas usam service role).
  - `equipes`: SELECT inalterado (tenant); INSERT/UPDATE = só admin.
  - `leads`: SELECT admin = tenant; gestor = própria equipe. UPDATE admin = tenant; gestor = própria equipe.
  - `historico_leads`: SELECT admin = tenant; gestor = leads da própria equipe.
  - `vendas`: SELECT admin = tenant; gestor = vendas de corretores da própria equipe.
  - Policies de corretor e captador: inalteradas.

### 010_estrutura_meta_leads.sql
Colunas novas em `leads` (todas opcionais):
`email text`, `canal text not null default 'manual'` (valores: `manual`, `meta_lead_ads`),
`plataforma text` (`facebook` | `instagram` | null), `meta_leadgen_id text`, `meta_page_id text`,
`meta_form_id text`, `meta_ad_id text`, `meta_adset_id text`, `meta_campaign_id text`,
`meta_ad_nome text`, `meta_campanha_nome text`, `meta_criado_em timestamptz`,
`respostas_formulario jsonb`, `consentimentos jsonb`.
Índice único parcial `leads(meta_leadgen_id) WHERE meta_leadgen_id IS NOT NULL`.

`historico_leads.tipo_evento`: recriar o CHECK (nomes possíveis: `historico_tipo_evento_check`
ou `historico_leads_tipo_evento_check`) aceitando também `lead_reentrada`.

Tabela `integracoes_meta`: `id uuid pk`, `imobiliaria_id uuid not null fk`, `page_id text not null unique`,
`page_nome text`, `ativo boolean not null default true`, `ultimo_evento_em timestamptz`,
`ultimo_erro text`, `ultimo_erro_em timestamptz`, `created_at timestamptz default now()`.
O token de acesso **não** fica no banco: variável de ambiente `META_ACCESS_TOKEN`.

Tabela `meta_roteamento`: `id uuid pk`, `imobiliaria_id uuid not null fk`, `page_id text not null`,
`form_id text` (null = regra padrão da Página), `form_nome text`, `equipe_id uuid not null fk equipes`,
`ativo boolean not null default true`, `created_at`, `updated_at`.
Índice único `(page_id, coalesce(form_id, ''))`.

Tabela `meta_eventos`: `id uuid pk`, `imobiliaria_id uuid null fk`, `recebido_em timestamptz default now()`,
`origem text not null default 'webhook'` (`webhook` | `reconciliacao` | `manual`), `page_id text`,
`form_id text`, `leadgen_id text`, `ad_id text`, `adgroup_id text`, `payload jsonb`,
`status text not null default 'recebido'` CHECK (`recebido`, `processando`, `processado`,
`duplicado`, `ignorado`, `erro`), `tentativas int not null default 0`, `ultimo_erro text`,
`proxima_tentativa_em timestamptz`, `processado_em timestamptz`, `lead_id uuid fk leads on delete set null`.
Índice único parcial em `leadgen_id`. Índice em `(status, proxima_tentativa_em)`.

RLS nas três tabelas: ativado; SELECT só para admin da própria imobiliária; nenhuma policy de escrita
(escrita apenas via service role).

Função `normalizar_telefone_br(text) returns text` (IMMUTABLE) com a mesma regra de `lib/telefone.ts`,
e `UPDATE leads SET telefone_normalizado = normalizar_telefone_br(telefone) WHERE telefone IS NOT NULL`.

### 011_rpcs_distribuicao.sql
Todas: `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog`, recebem `p jsonb`,
devolvem `jsonb`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated` e `GRANT EXECUTE ... TO service_role`.

Seleção de corretor (regra comum): `equipe_id` = equipe, `imobiliaria_id`, `ativo`, `em_plantao`,
`ORDER BY COALESCE(ultimo_lead_recebido_em, '1970-01-01') ASC, ordem_plantao ASC LIMIT 1 FOR UPDATE`
(sem SKIP LOCKED), precedida de `pg_advisory_xact_lock(hashtext('equipe:' || equipe_id))`.

**`criar_e_distribuir_lead(p)` v4** — mesma assinatura, compatível com o app atual. Chaves novas opcionais:
`email`, `canal`, `plataforma`, `meta_leadgen_id`, `meta_page_id`, `meta_form_id`, `meta_ad_id`,
`meta_adset_id`, `meta_campaign_id`, `meta_ad_nome`, `meta_campanha_nome`, `meta_criado_em`,
`respostas_formulario` (jsonb), `consentimentos` (jsonb).
- Se `meta_leadgen_id` já existe em `leads`: `{status:'ja_processado', lead_id}` (também ao capturar
  `unique_violation`).
- Duplicata por telefone (24 h, mesma imobiliária): grava `lead_reentrada` no histórico do lead existente
  (dados: canal, origem, meta_leadgen_id, meta_form_id — sem nome/telefone) e devolve
  `{status:'duplicata', lead_existente:{id, nome, created_at, corretor_id}}`.
- `equipe_id` informado precisa ser da imobiliária **e ativo**, senão `equipe_nao_pertence_imobiliaria`.
- Demais retornos iguais à v3 (`criado`, `distribuido`, `motivo`, `lead{...}`).

**`distribuir_fila_equipe(p)`** — `{imobiliaria_id, equipe_id, usuario_id?, limite? (default 50)}`.
Distribui leads da equipe com `corretor_id IS NULL` e status fora de (`fechado`,`perdido`), por ordem de
chegada, até acabar a fila ou faltar corretor. Histórico `lead_distribuido` com `dados.motivo = 'fila'`.
Retorno `{status:'ok', distribuidos:int, restantes:int, atribuicoes:[{lead_id, corretor_id, corretor_nome}]}`
ou `{status:'equipe_invalida'}`.

**`atribuir_lead_manual(p)`** — `{imobiliaria_id, lead_id, corretor_id, usuario_id}`.
Corretor ativo da mesma equipe do lead. Atualiza `corretor_id`, `distribuido_em`,
`corretores.ultimo_lead_recebido_em`. Histórico `lead_distribuido` (lead estava na fila) ou
`lead_redistribuido` (já tinha corretor), `criado_por 'usuario'`, `usuario_id`.
Retorno `{status:'ok', tipo:'distribuido'|'redistribuido', corretor_id, corretor_nome}` ou
`{status:'lead_nao_encontrado'}` / `{status:'corretor_invalido'}`.

**`definir_plantao_corretor(p)`** — `{imobiliaria_id, corretor_id, em_plantao:boolean, usuario_id?}`.
Só corretor ativo da imobiliária. Ao ligar, chama `distribuir_fila_equipe` para a equipe do corretor.
Retorno `{status:'ok', corretor_id, equipe_id, em_plantao, fila: <retorno de distribuir_fila_equipe> | null}`
ou `{status:'corretor_nao_encontrado'}`.

## Rotas da aplicação

Todas: `isMockMode` → 503; sessão obrigatória (401); perfil ativo com `imobiliaria_id` (403).
Gestor sem `equipe_id` → 403 `gestor_sem_equipe`. Função ausente → 503 `migration_pendente`.

| Rota | Quem | Corpo | Resposta 200 |
| --- | --- | --- | --- |
| `PATCH /api/corretores/[id]/plantao` | admin; gestor só da própria equipe | `{em_plantao:boolean}` | `{status:'ok', em_plantao, fila:{distribuidos, restantes}|null}` |
| `POST /api/equipes/[id]/distribuir-fila` | admin; gestor só a própria equipe | — | `{status:'ok', distribuidos, restantes}` |
| `POST /api/leads/[id]/atribuir` | admin; gestor só leads da própria equipe | `{corretor_id}` | `{status:'ok', tipo, corretor_nome}` |
| `GET /api/webhooks/meta` | Meta (público) | query `hub.*` | texto `hub.challenge` |
| `POST /api/webhooks/meta` | Meta (público, assinatura) | payload Meta | `200` após gravar eventos; `500` se não conseguir gravar (a Meta reenvia) |
| `GET /api/cron/meta` | agendador, `Authorization: Bearer CRON_SECRET` | — | resumo JSON |
| `GET /api/integracoes/meta` | admin | — | estado: variáveis configuradas (booleans), URL do webhook, páginas, roteamentos, últimos 50 eventos, contagem por status |
| `POST /api/integracoes/meta/roteamentos` | admin | `{page_id, page_nome?, form_id?|null, form_nome?, equipe_id}` | `{status:'ok', roteamento}` (upsert; também faz upsert de `integracoes_meta` para a Página) |
| `DELETE /api/integracoes/meta/roteamentos/[id]` | admin | — | `{status:'ok'}` |
| `POST /api/integracoes/meta/eventos/[id]/reprocessar` | admin | — | `{status:'ok', resultado}` |

`middleware.ts`: caminhos que começam com `/api/webhooks/` e `/api/cron/` não exigem sessão
(a autenticação deles é a assinatura da Meta e o `CRON_SECRET`).

## Variáveis de ambiente novas (todas server-side, nunca `NEXT_PUBLIC_`)

| Variável | Uso |
| --- | --- |
| `META_APP_SECRET` | Validar `X-Hub-Signature-256` e gerar `appsecret_proof` |
| `META_VERIFY_TOKEN` | Texto combinado com o painel da Meta na verificação do webhook |
| `META_ACCESS_TOKEN` | Token de Usuário do Sistema (ou de Página de longa duração) para ler os leads |
| `META_GRAPH_VERSION` | Opcional; padrão `v25.0` |
| `CRON_SECRET` | Protege `/api/cron/meta` (a Vercel envia `Authorization: Bearer <CRON_SECRET>`) |
| `ALERTA_EMAILS` | Destinatários dos alertas, separados por vírgula (usa `RESEND_API_KEY` e `EMAIL_FROM` existentes) |

Não criar `vercel.json` com cron: no plano Hobby, cron com frequência maior que diária faz o deploy falhar.
O agendamento é configurado depois (documentação).

## Processamento de um lead da Meta (agente meta)

1. Webhook valida assinatura com `crypto.timingSafeEqual` sobre o corpo bruto (`await req.text()`).
   Sem `META_APP_SECRET` configurado → 503 (nunca aceitar sem assinatura).
2. Para cada `entry[].changes[]` com `field === 'leadgen'`: upsert em `meta_eventos` por `leadgen_id`
   (`ignoreDuplicates`), com `imobiliaria_id` resolvido por `integracoes_meta.page_id` (pode ser null).
3. Processa os eventos recém-gravados no mesmo request, com limite de tempo (~8 s no total);
   o que não der tempo fica `recebido` para o cron.
4. Processar evento: Página sem cadastro → `erro` (`pagina_nao_cadastrada`) + alerta.
   Busca o lead: `GET https://graph.facebook.com/{versão}/{leadgen_id}?fields=...&access_token=...&appsecret_proof=...`
   (tentar campos estendidos `id,created_time,ad_id,ad_name,adset_id,campaign_id,campaign_name,form_id,platform,is_organic,field_data,custom_disclaimer_responses`;
   se a Meta recusar campo — erro code 100 — repetir com `id,created_time,ad_id,form_id,field_data`).
   Mapeia `field_data`: `full_name` ou `first_name`+`last_name` → nome; `phone_number` → telefone;
   `email` → email; demais respostas → `respostas_formulario` e um resumo legível em `observacoes`.
   Sem telefone válido → `erro` (`sem_telefone`). Equipe: `meta_roteamento` por (page_id, form_id) ativo,
   senão regra padrão da Página (form_id null), senão rodízio (equipe_id null) + alerta `formulario_sem_equipe`.
   `origem`: `platform === 'ig'` → `Instagram`, senão `Facebook`. `canal = 'meta_lead_ads'`, `criado_por = 'webhook'`.
   Chama `criar_e_distribuir_lead`. `criado`/`ja_processado` → `processado` (+ lead_id); `duplicata` → `duplicado`.
   Falha transitória → `erro`, `tentativas + 1`, `proxima_tentativa_em` = agora + (1, 5, 15, 60, 180, 360, 720) min;
   após 8 tentativas, para e alerta. Lead atribuído → `notificarCorretorNovoLead` (lib/email.ts).
5. Cron: reprocessa eventos `recebido`/`erro` vencidos (até 50), distribui filas de equipes ativas com
   leads parados, e reconcilia: para cada `meta_roteamento` ativo com `form_id`, lê `/{form_id}/leads`
   das últimas 3 h (`filtering` por `time_created`) e cria eventos `origem='reconciliacao'` para
   `leadgen_id` que ainda não existem.

## Telas (agente telas)

- `/integracoes` (só admin; link na Sidebar só para admin): estado da configuração (variáveis ok/pendente,
  URL do webhook para copiar), cadastro de vínculo Página/formulário → equipe, lista de vínculos com
  remover, lista dos últimos eventos com status colorido e botão Reprocessar nos com erro.
  Leitura server-side com service role **depois** de checar que o usuário é admin, sempre filtrando
  por `imobiliaria_id`. Tabelas ausentes → aviso "migrations pendentes".
- `/leads/[id]`: detalhe do lead e linha do tempo de `historico_leads`, lidos com o cliente RLS
  (`createSupabaseServer`), para que cada perfil só veja o que pode. Campos Meta lidos numa consulta
  separada e tolerante a coluna ausente. Lead não visível → `notFound()`.
