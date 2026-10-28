# Como aplicar as migrations 009, 010 e 011 no Supabase

Este guia é para o dono do sistema. Ele explica, passo a passo, como aplicar no banco de
produção as três mudanças que preparam o Lead Master IA para receber leads da Meta
(Facebook e Instagram), como conferir se deu certo e como desfazer, se for preciso.

Arquivos (na pasta `supabase/migrations/` do repositório):

| Ordem | Arquivo | Em uma frase |
| --- | --- | --- |
| 1 | `009_seguranca_rls_equipe.sql` | Fecha brechas de segurança e faz cada gestor ver só a própria equipe |
| 2 | `010_estrutura_meta_leads.sql` | Cria as colunas e tabelas para os leads da Meta e padroniza o telefone |
| 3 | `011_rpcs_distribuicao.sql` | Atualiza a criação de leads e cria fila, atribuição manual e plantão |

Nenhuma delas apaga tabela, lead, corretor, venda ou histórico.

---

## 1. Antes de começar

1. **Escolha um horário de pouco movimento.** Cada migration leva poucos segundos.
2. **Aplique as três em sequência, no mesmo dia, sem intervalo longo** entre a 010 e a 011.
   A 010 muda o formato do telefone salvo para comparação (passa a ter o "55" do Brasil) e é a
   011 que faz a criação de leads usar esse mesmo formato. Entre uma e outra, a detecção de
   lead repetido pode falhar para leads que já estavam no banco.
3. **Confira os gestores sem equipe.** Depois da 009, um gestor sem equipe definida não vê
   nenhum lead, corretor ou venda. Rode esta consulta no SQL Editor:

   ```sql
   SELECT nome, email
   FROM usuarios
   WHERE role = 'gestor' AND ativo = true AND equipe_id IS NULL;
   ```

   Se aparecer alguém, defina a equipe dessa pessoa antes (veja o final de
   `supabase/migrations/006_usuarios_equipe_id.sql`) ou avise-a de que ela ficará sem acesso
   aos dados até isso ser feito.
4. **Anote os totais atuais** para comparar depois (os números não podem mudar):

   ```sql
   SELECT (SELECT count(*) FROM leads)           AS leads,
          (SELECT count(*) FROM corretores)      AS corretores,
          (SELECT count(*) FROM vendas)          AS vendas,
          (SELECT count(*) FROM historico_leads) AS historico;
   ```

---

## 2. Passo a passo

Para **cada** arquivo, na ordem 009, 010 e 011:

1. Abra o painel do Supabase do projeto → menu lateral **SQL Editor** → **New query**.
2. Abra o arquivo da migration no repositório, copie **o conteúdo inteiro** e cole no editor.
3. Clique em **Run**.
4. O Supabase pode mostrar um aviso de "operação potencialmente destrutiva" (por causa de
   `DROP POLICY` e `REVOKE`). É esperado: as policies são removidas e recriadas na mesma hora.
   Confirme para executar.
5. O resultado esperado é **"Success. No rows returned"**.

**Se aparecer um erro:** cada arquivo roda inteiro dentro de uma transação (`BEGIN` … `COMMIT`).
Se qualquer linha falhar, nada daquele arquivo é gravado e o banco continua como estava.
Copie a mensagem de erro e envie para o responsável técnico. Não aplique a migration seguinte.

As três podem ser rodadas de novo sem problema (são "idempotentes"): rodar duas vezes dá o
mesmo resultado que rodar uma.

---

## 3. O que cada migration faz

### 009 — Segurança e escopo do gestor

- **Funções de escrita só pelo servidor.** No Supabase, toda função nova recebe permissão de
  execução para os papéis `anon` (visitante) e `authenticated` (usuário logado). Isso deixava
  qualquer usuário logado chamar `criar_e_distribuir_lead` e `alterar_status_lead` direto pela
  API, sem passar pelas regras do app. A 009 retira essa permissão; só o servidor do app
  (chave `service_role`) continua chamando essas funções. O app já funciona assim, então
  nada muda para quem usa.
- **Nova função `current_equipe_id()`**: devolve a equipe do usuário logado.
- **Gestor vê só a própria equipe**: leads, corretores, histórico dos leads e vendas dos
  corretores da equipe dele. O administrador continua vendo a imobiliária inteira.
  Todos continuam vendo a lista de equipes.
- **Cadastro e edição de equipes e corretores direto pela API**: só administrador.
  (As telas do app fazem isso pelo servidor e não são afetadas.)
- **Não muda** o que corretor e captador enxergam.

### 010 — Estrutura para leads da Meta

- **Colunas novas em `leads`** (todas opcionais; os leads atuais ficam com `canal = 'manual'`):
  `email`, `canal`, `plataforma`, identificadores da Meta (`meta_leadgen_id`, `meta_page_id`,
  `meta_form_id`, `meta_ad_id`, `meta_adset_id`, `meta_campaign_id`), nomes do anúncio e da
  campanha, data do lead na Meta, respostas do formulário e consentimentos.
- **Proteção contra lead em dobro da Meta**: o mesmo lead da Meta (`meta_leadgen_id`) nunca vira
  dois leads.
- **Histórico**: passa a aceitar o evento `lead_reentrada` ("o mesmo telefone entrou de novo
  em até 24 horas"). Todos os tipos de evento antigos continuam valendo.
- **Três tabelas novas**, visíveis só para administradores da própria imobiliária:
  - `integracoes_meta` — as Páginas do Facebook ligadas à imobiliária (sem senha nem token;
    o token fica na Vercel, na variável `META_ACCESS_TOKEN`);
  - `meta_roteamento` — para qual equipe vai o lead de cada Página/formulário;
  - `meta_eventos` — registro de cada aviso de lead recebido da Meta e se foi processado.
- **Função `normalizar_telefone_br`** — padroniza o telefone para comparação, com a mesma regra
  do app (`lib/telefone.ts`). Exemplo: `(62) 99999-0001` vira `5562999990001`.
- **Atualiza o telefone padronizado dos leads existentes** para o formato novo. O telefone que
  foi digitado (coluna `telefone`) **não é alterado**; só a coluna de comparação
  (`telefone_normalizado`).

### 011 — Distribuição de leads

- **`criar_e_distribuir_lead` versão 4** — continua aceitando exatamente o que o app envia hoje
  e respondendo no mesmo formato. Novidades:
  - aceita os dados da Meta;
  - se o lead da Meta já foi criado antes, responde `ja_processado` em vez de criar outro;
  - se o telefone se repete em 24 horas, registra `lead_reentrada` no lead que já existe;
  - a equipe escolhida precisa estar **ativa**;
  - duas entradas ao mesmo tempo na mesma equipe são organizadas em fila (uma de cada vez),
    para o rodízio entre corretores continuar justo.
- **`distribuir_fila_equipe`** — entrega aos corretores em plantão os leads da equipe que
  estão parados sem corretor (até 50 por vez), do mais antigo para o mais novo.
  Leads fechados ou perdidos não entram.
- **`atribuir_lead_manual`** — o gestor ou administrador escolhe o corretor de um lead
  (o corretor precisa ser da mesma equipe do lead). Fica registrado no histórico quem fez.
- **`definir_plantao_corretor`** — liga ou desliga o plantão de um corretor. Ao ligar, já
  distribui a fila da equipe dele.
- Todas só podem ser chamadas pelo servidor do app.

---

## 4. Como verificar depois

Rode cada bloco no SQL Editor (uma consulta por vez, se preferir).

### 4.1 Totais não mudaram

Rode de novo a consulta do item 1.4 e compare: `leads`, `corretores`, `vendas` iguais;
`historico` igual (ou maior, se entraram leads no meio tempo).

### 4.2 Funções fechadas para visitantes e usuários logados

```sql
SELECT f AS funcao,
       has_function_privilege('anon',          f, 'execute') AS visitante,
       has_function_privilege('authenticated', f, 'execute') AS usuario_logado,
       has_function_privilege('service_role',  f, 'execute') AS servidor
FROM unnest(ARRAY[
  'alterar_status_lead(jsonb)',
  'criar_e_distribuir_lead(jsonb)',
  'distribuir_fila_equipe(jsonb)',
  'atribuir_lead_manual(jsonb)',
  'definir_plantao_corretor(jsonb)'
]) AS f;
```

Esperado: **5 linhas**, todas com `visitante = false`, `usuario_logado = false`,
`servidor = true`. Em especial,
`has_function_privilege('anon','alterar_status_lead(jsonb)','execute')` precisa ser `false`.
Se alguma aparecer `true`, avise o responsável técnico.

**Recomendação: aplique a 009 o quanto antes**, mesmo que a 010 e a 011 ainda esperem. Ela é
compatível com o código atual de `main` (o app em produção continua funcionando igual) e fecha
a chamada direta das funções de escrita (`alterar_status_lead`, `criar_e_distribuir_lead`)
pela chave pública do Supabase (que fica visível no navegador). Sem a 009, essas funções ainda
podem ser chamadas diretamente com essa chave, sem passar pelas regras do app.

### 4.3 Policies (regras de acesso)

```sql
SELECT tablename AS tabela, policyname AS regra, cmd AS operacao
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
```

Esperado (27 linhas). **Não pode aparecer** nenhuma regra terminada em `_admin_gestor`.

| tabela | regras |
| --- | --- |
| corretores | `corretores_insert`, `corretores_select_admin`, `corretores_select_captador`, `corretores_select_corretor`, `corretores_select_gestor`, `corretores_update` |
| equipes | `equipes_insert`, `equipes_select`, `equipes_update` |
| historico_leads | `historico_select_admin`, `historico_select_corretor`, `historico_select_gestor` |
| imobiliarias | `imobiliarias_select` |
| integracoes_meta | `integracoes_meta_select_admin` |
| leads | `leads_select_admin`, `leads_select_captador`, `leads_select_corretor`, `leads_select_gestor`, `leads_update_admin`, `leads_update_gestor` |
| meta_eventos | `meta_eventos_select_admin` |
| meta_roteamento | `meta_roteamento_select_admin` |
| usuarios | `usuarios_select` |
| vendas | `vendas_select_admin`, `vendas_select_captador`, `vendas_select_corretor`, `vendas_select_gestor` |

(Se o seu banco tiver alguma regra extra criada à mão, ela também aparece — tudo bem.)

### 4.4 Telefone padronizado igual ao do app

```sql
SELECT entrada,
       normalizar_telefone_br(entrada)            AS resultado,
       esperado,
       normalizar_telefone_br(entrada) = esperado AS ok
FROM (VALUES
  ('(62) 99999-0001',   '5562999990001'),
  ('+55 62 99999-0001', '5562999990001'),
  ('062 99999-0001',    '5562999990001'),
  ('62 3333-0001',      '556233330001'),
  ('+1 650 555 1234',   '16505551234')
) AS t(entrada, esperado);
```

Esperado: 5 linhas, todas com `ok = true`. (São os exemplos de `lib/telefone.ts`.)

E todos os leads existentes já no formato novo:

```sql
SELECT count(*) AS leads_fora_do_padrao
FROM leads
WHERE telefone IS NOT NULL
  AND telefone_normalizado IS DISTINCT FROM normalizar_telefone_br(telefone);
```

Esperado: `0`.

### 4.5 Tabelas novas protegidas e histórico atualizado

```sql
SELECT tablename AS tabela, rowsecurity AS protegida
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('integracoes_meta', 'meta_roteamento', 'meta_eventos');
```

Esperado: 3 linhas, `protegida = true`.

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'historico_leads'::regclass AND contype = 'c';
```

Esperado: uma linha `historico_leads_tipo_evento_check` com os 7 tipos
(`lead_criado`, `lead_roteado`, `lead_distribuido`, `distribuicao_falhou`, `status_alterado`,
`lead_redistribuido`, `lead_reentrada`) e outra com os valores de `criado_por`.

### 4.6 Funções novas respondendo (sem gravar nada)

Estas chamadas usam IDs inexistentes de propósito, então só respondem e não alteram dados:

```sql
SELECT distribuir_fila_equipe('{"imobiliaria_id":"00000000-0000-0000-0000-000000000000","equipe_id":"00000000-0000-0000-0000-000000000000"}');
-- esperado: {"status": "equipe_invalida"}

SELECT atribuir_lead_manual('{"imobiliaria_id":"00000000-0000-0000-0000-000000000000","lead_id":"00000000-0000-0000-0000-000000000000","corretor_id":"00000000-0000-0000-0000-000000000000"}');
-- esperado: {"status": "lead_nao_encontrado"}

SELECT definir_plantao_corretor('{"imobiliaria_id":"00000000-0000-0000-0000-000000000000","corretor_id":"00000000-0000-0000-0000-000000000000","em_plantao":true}');
-- esperado: {"status": "corretor_nao_encontrado"}
```

### 4.7 Teste no app

Entre no app como administrador e cadastre um lead de teste pelo botão "Novo lead".
Ele deve ser criado e distribuído como antes. Tente cadastrar de novo com o mesmo telefone:
o app deve avisar que o lead já existe. Entre como gestor e confirme que aparecem apenas os
leads e corretores da equipe dele.

### 4.8 Antes de ligar plantão ou o cron

Leads que entraram sem corretor (por exemplo, quando ninguém estava de plantão) ficam parados
na fila da equipe. Depois da 011, **ligar o plantão de um corretor**, clicar em
**"Distribuir fila"** ou **a primeira execução do cron** (`/api/cron/meta`) distribui esses
leads de uma vez, e **cada corretor que receber um lead é avisado por e-mail**. Antes de ligar,
confira quantos são e desde quando estão parados:

```sql
SELECT e.nome, l.status, count(*), min(l.created_at), max(l.created_at)
FROM leads l
JOIN equipes e ON e.id = l.equipe_id
WHERE l.corretor_id IS NULL
  AND l.status NOT IN ('fechado','perdido')
GROUP BY 1,2;
```

Leads `fechado` ou `perdido` nunca entram na fila. Se a lista tiver leads antigos que não
devem mais ser atendidos, marque-os como `perdido` pelo app antes de ligar o plantão ou o
cron; se estiver tudo certo, avise os corretores de que vão receber esses leads e os e-mails.

---

## 5. Como reverter

Só reverta se algo estiver errado. Reverta **na ordem inversa**: 011, depois 010, depois 009,
e só até onde precisar. Nenhum dos comandos abaixo apaga leads, corretores, vendas ou
histórico. Cole cada bloco no SQL Editor e clique em **Run**.

### 5.1 Reverter a 011

**Passo A — remover as três funções novas:**

```sql
BEGIN;
DROP FUNCTION IF EXISTS definir_plantao_corretor(JSONB);
DROP FUNCTION IF EXISTS atribuir_lead_manual(JSONB);
DROP FUNCTION IF EXISTS distribuir_fila_equipe(JSONB);
COMMIT;
```

**Passo B — voltar `criar_e_distribuir_lead` para a versão 3** (só se a versão 4 estiver
causando problema; ela aceita tudo o que a versão 3 aceitava):

1. Abra `supabase/migrations/007_captador_role.sql`.
2. Copie do início da linha `CREATE OR REPLACE FUNCTION criar_e_distribuir_lead(p JSONB)`
   até a linha `GRANT EXECUTE ON FUNCTION criar_e_distribuir_lead(JSONB) TO service_role;`
   (itens 2.5 e 2.6 do arquivo). Cole no SQL Editor e clique em **Run**.
3. Rode em seguida, para manter a função fechada:

   ```sql
   REVOKE ALL ON FUNCTION criar_e_distribuir_lead(JSONB) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION criar_e_distribuir_lead(JSONB) TO service_role;
   ```

4. **Obrigatório depois do passo B:** faça também o passo 5.2-A abaixo. A versão 3 compara
   telefones no formato antigo (sem o "55"); sem isso a detecção de lead repetido falha.

Observação: as telas e rotas novas do app (plantão, fila, atribuição, integração Meta)
respondem "migration pendente" enquanto essas funções não existirem.

### 5.2 Reverter a 010

**Passo A — voltar o telefone de comparação ao formato antigo** (faça somente se voltou a
`criar_e_distribuir_lead` para a versão 3 no passo 5.1-B):

> **Atenção:** só faça se o app em produção também voltou para a versão 633c230. O app atual
> compara telefones no formato novo (com o "55"); com o banco no formato antigo, a detecção de
> lead repetido falha.

```sql
BEGIN;
UPDATE leads
SET telefone_normalizado = regexp_replace(telefone, '\D', '', 'g')
WHERE telefone IS NOT NULL
  AND telefone_normalizado IS DISTINCT FROM regexp_replace(telefone, '\D', '', 'g');
COMMIT;
```

**Passo B (opcional) — voltar a regra do histórico** para os 6 tipos antigos. Não é necessário:
aceitar um tipo a mais não atrapalha nada. Se mesmo assim quiser, o `NOT VALID` mantém os
registros `lead_reentrada` que já existirem (nada é apagado) e só bloqueia novos:

```sql
BEGIN;
ALTER TABLE historico_leads DROP CONSTRAINT IF EXISTS historico_leads_tipo_evento_check;
ALTER TABLE historico_leads
  ADD CONSTRAINT historico_leads_tipo_evento_check
  CHECK (tipo_evento IN (
    'lead_criado', 'lead_roteado', 'lead_distribuido',
    'distribuicao_falhou', 'status_alterado', 'lead_redistribuido'
  )) NOT VALID;
COMMIT;
```

**O que fica de propósito:** as colunas novas de `leads` (podem conter dados de leads da Meta;
removê-las apagaria esses dados), as três tabelas novas (`integracoes_meta`,
`meta_roteamento`, `meta_eventos`) e a função `normalizar_telefone_br`. Sem o app usando,
elas ficam paradas, protegidas pelo RLS, e não interferem em nada. Se um dia quiser
removê-las de fato, fale com o responsável técnico: isso apaga a configuração e o registro
de eventos da Meta e não deve ser feito sem backup.

### 5.3 Reverter a 009

Volta as regras de acesso de gestor ao que eram (gestor vendo a imobiliária inteira) e
remove `current_equipe_id()`:

```sql
BEGIN;

-- corretores
DROP POLICY IF EXISTS "corretores_select_admin"        ON corretores;
DROP POLICY IF EXISTS "corretores_select_gestor"       ON corretores;
DROP POLICY IF EXISTS "corretores_select_admin_gestor" ON corretores;
CREATE POLICY "corretores_select_admin_gestor" ON corretores
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id()
         AND current_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "corretores_insert" ON corretores;
CREATE POLICY "corretores_insert" ON corretores
  FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = current_imobiliaria_id()
              AND current_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "corretores_update" ON corretores;
CREATE POLICY "corretores_update" ON corretores
  FOR UPDATE TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (imobiliaria_id = current_imobiliaria_id()
              AND current_user_role() IN ('admin', 'gestor'));

-- equipes
DROP POLICY IF EXISTS "equipes_insert" ON equipes;
CREATE POLICY "equipes_insert" ON equipes
  FOR INSERT TO authenticated
  WITH CHECK (imobiliaria_id = current_imobiliaria_id()
              AND current_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "equipes_update" ON equipes;
CREATE POLICY "equipes_update" ON equipes
  FOR UPDATE TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (imobiliaria_id = current_imobiliaria_id()
              AND current_user_role() IN ('admin', 'gestor'));

-- leads
DROP POLICY IF EXISTS "leads_select_admin"        ON leads;
DROP POLICY IF EXISTS "leads_select_gestor"       ON leads;
DROP POLICY IF EXISTS "leads_select_admin_gestor" ON leads;
CREATE POLICY "leads_select_admin_gestor" ON leads
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id()
         AND current_user_role() IN ('admin', 'gestor'));

DROP POLICY IF EXISTS "leads_update_admin"        ON leads;
DROP POLICY IF EXISTS "leads_update_gestor"       ON leads;
DROP POLICY IF EXISTS "leads_update_admin_gestor" ON leads;
CREATE POLICY "leads_update_admin_gestor" ON leads
  FOR UPDATE TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id())
  WITH CHECK (imobiliaria_id = current_imobiliaria_id()
              AND current_user_role() IN ('admin', 'gestor'));

-- historico_leads
DROP POLICY IF EXISTS "historico_select_admin"        ON historico_leads;
DROP POLICY IF EXISTS "historico_select_gestor"       ON historico_leads;
DROP POLICY IF EXISTS "historico_select_admin_gestor" ON historico_leads;
CREATE POLICY "historico_select_admin_gestor" ON historico_leads
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id()
         AND current_user_role() IN ('admin', 'gestor'));

-- vendas
DROP POLICY IF EXISTS "vendas_select_admin"        ON vendas;
DROP POLICY IF EXISTS "vendas_select_gestor"       ON vendas;
DROP POLICY IF EXISTS "vendas_select_admin_gestor" ON vendas;
CREATE POLICY "vendas_select_admin_gestor" ON vendas
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id()
         AND current_user_role() IN ('admin', 'gestor'));

-- função criada pela 009 (nenhuma regra usa mais)
DROP FUNCTION IF EXISTS current_equipe_id();

COMMIT;
```

**Não reverta** a parte de permissões das funções (`REVOKE` de `alterar_status_lead` e
`criar_e_distribuir_lead`). Ela fecha uma brecha de segurança e o app não depende dela aberta.

### 5.4 Depois de reverter

Rode de novo as verificações do item 4 que fizerem sentido. Para aplicar outra vez mais tarde,
basta seguir este guia desde o início: as migrations funcionam também sobre um banco que
passou pelo rollback.
