# Skill: Segurança, LGPD e RLS — Lead Master IA
**Versão:** 1.0  
**Data:** 2026-06-19  
**Referências:** `docs/DECISOES-ARQUITETURA.md` · `supabase/migrations/002_security_rls_multitenancy.sql`  
**Invocar antes de:** qualquer tarefa que envolva nova tabela, nova API, novo campo de dados pessoais, nova integração externa, ou alteração em políticas RLS.

---

## 1. Princípios de segurança do Lead Master IA

O Lead Master IA é um produto comercial que processa dados pessoais de terceiros (leads, clientes potenciais de imobiliárias). Não é um sistema interno — é um produto multi-tenant com dados de múltiplos clientes. Isso impõe obrigações legais (LGPD) e técnicas que devem ser tratadas como requisitos de produto, não como ajuste de qualidade.

**Princípio 1 — Defense in depth:** segurança em múltiplas camadas. RLS no banco, validação na API, sanitização no cliente. Uma camada falhar não deve expor dados.

**Princípio 2 — Least privilege:** cada ator tem acesso mínimo necessário. O client do browser recebe o mínimo. O servidor recebe mais. O banco restringe o máximo.

**Princípio 3 — Tenant isolation:** dados de uma imobiliária nunca são visíveis por outra. Sem exceção. Nenhuma query pode omitir o filtro `imobiliaria_id`.

**Princípio 4 — Audit trail:** toda operação relevante gera um registro em `historico_leads`. Sem rastreabilidade, não há como investigar incidentes.

**Princípio 5 — LGPD como requisito:** não coletar dados que não precisamos. Não armazenar mais tempo do que necessário. Não expor dados pessoais sem necessidade.

---

## 2. Dados pessoais tratados pelo sistema

O Lead Master IA coleta e processa os seguintes dados pessoais de terceiros (os leads/clientes):

| Dado | Tabela | Finalidade | Base legal (LGPD) |
|------|--------|-----------|-------------------|
| Nome completo | `leads.nome` | Identificação do lead | Legítimo interesse (Art. 7º, IX) |
| Telefone | `leads.telefone` / `telefone_normalizado` | Contato comercial | Legítimo interesse |
| Interesse imobiliário | `leads.interesse` | Qualificação do lead | Legítimo interesse |
| Faixa de valor | `leads.faixa_valor` | Qualificação do lead | Legítimo interesse |
| Canal de origem | `leads.origem` | Atribuição de campanha | Legítimo interesse |
| Observações | `leads.observacoes` | Contexto de atendimento | Legítimo interesse |

O Lead Master IA também processa dados dos corretores e usuários do sistema (não são leads):

| Dado | Tabela | Finalidade |
|------|--------|-----------|
| Nome | `corretores.nome` / `usuarios.nome` | Identificação interna |
| E-mail | `corretores.email` / `usuarios.email` | Contato e login |
| Telefone | `corretores.telefone` | Contato interno |

---

## 3. Dados que NÃO devem ser coletados

Os seguintes dados **nunca devem ser adicionados ao sistema** sem análise jurídica prévia:

| Dado | Motivo |
|------|--------|
| CPF / RG / documentos | Dados sensíveis desnecessários para o MVP de distribuição |
| Renda comprovada / extrato bancário | Fora do escopo operacional |
| Estado civil / filhos | Dado pessoal sem finalidade no MVP |
| Localização GPS em tempo real | Invasivo e sem finalidade operacional |
| Dados de saúde | Dado sensível (Art. 11 LGPD) — proibido sem consentimento explícito |
| Senhas em texto claro | Óbvio — nunca. Autenticação é gerenciada pelo Supabase Auth |
| Tokens de autenticação | Não armazenar em banco. Supabase gerencia sessões |

**Regra:** antes de adicionar qualquer campo novo que colete dado de pessoa física, perguntar: "para que vamos usar isso?". Se a resposta for vaga, não coletar.

---

## 4. Auditoria de segurança do estado inicial

### 4.1 O que estava seguro antes da migration 002

- Leitura de dados via Server Components (queries não vazam no bundle JS do cliente)
- UUIDs imprevisíveis para todos os IDs (gen_random_uuid via pgcrypto)
- Nenhuma operação de escrita implementada (superfície de ataque zero até a Fase 6)
- Dados de seed apenas — nenhum dado real de cliente armazenado
- Supabase client instanciado uma vez em `lib/supabase.ts` (sem múltiplas instâncias)

### 4.2 O que estava inseguro antes da migration 002

| Vulnerabilidade | Risco | Severidade |
|----------------|-------|-----------|
| Sem RLS | SELECT * FROM leads retorna tudo com anon key pública | **CRÍTICO** |
| Sem RLS | INSERT/UPDATE/DELETE funcionam com anon key | **CRÍTICO** |
| Sem imobiliaria_id | Impossível isolar dados entre imobiliárias | **CRÍTICO** |
| Sem autenticação | Qualquer pessoa com a URL acessa o app | **ALTO** |
| Sem historico_leads | Nenhum registro de quem fez o quê | **ALTO** |
| TABELA_PISTAS vs leads | Queries podem falhar silenciosamente | **MÉDIO** |
| Sem telefone_normalizado | Deduplicação sujeita a falso negativo | **MÉDIO** |
| Sem em_plantao | Distribuição impossível sem esse campo | **BLOQUEANTE** |

### 4.3 O que a migration 002 resolve

- ✅ RLS habilitado em todas as 7 tabelas
- ✅ imobiliaria_id em todas as tabelas de dados
- ✅ Políticas RLS por role (admin, gestor, corretor)
- ✅ Funções helper SECURITY DEFINER para tenant isolation
- ✅ historico_leads criada
- ✅ em_plantao, ultimo_lead_recebido_em, telefone_normalizado, distribuido_em adicionados

### 4.4 Riscos residuais após migration 002

| Risco | Detalhe | Quando resolver |
|-------|---------|-----------------|
| App sem login | UI acessível por URL sem autenticação | Antes de qualquer cliente real |
| Webhook sem autenticação | Quando implementado, qualquer pessoa pode criar leads | V1 (X-API-Key) |
| Rate limiting ausente | Loop de webhook pode criar milhares de leads | V1 |
| Logs de acesso | Não há registro de quem visualizou o quê na UI | V2 |
| Retenção de dados | Sem política de exclusão automática de leads antigos | V2 (LGPD §15) |
| service_role no .env | Precisa ser adicionado manualmente — risco de exposição acidental | Antes da Fase 6 |

---

## 5. Regras para uso da chave anon (NEXT_PUBLIC_SUPABASE_ANON_KEY)

A chave anon é **pública por design** no Supabase. Ela aparece no código JavaScript do browser. Isso é intencional e seguro **apenas se RLS estiver corretamente configurado**.

**Permitido com anon key:**
- Leitura de dados da própria imobiliária (via RLS + sessão autenticada)
- Operações de autenticação (login, logout, refresh de token)
- Leitura de dados públicos que não requerem isolamento

**Proibido com anon key:**
- Inserção direta em `leads` (deve passar pela API route com service_role)
- Inserção em `historico_leads` (sempre via service_role)
- UPDATE em `corretores.ultimo_lead_recebido_em` (operação de distribuição — service_role)
- UPDATE em `equipes.ultimo_lead_recebido_em` (operação de rodízio — service_role)
- Qualquer operação que exija bypass de RLS

**Regra:** se uma operação exige service_role, ela **não pode ser feita direto do client**. Deve passar por uma API route no servidor.

---

## 6. Regras para uso do service_role (SUPABASE_SERVICE_ROLE_KEY)

A chave service_role bypassa completamente o RLS. Com ela, é possível ler, gravar e apagar qualquer dado de qualquer imobiliária. É equivalente a acesso root no banco.

**Regras absolutas:**

1. **Nunca expor no frontend.** A variável de ambiente deve ser `SUPABASE_SERVICE_ROLE_KEY` (sem prefixo `NEXT_PUBLIC_`). Se começar com `NEXT_PUBLIC_`, vai para o bundle do cliente — falha de segurança grave.

2. **Nunca retornar ao cliente.** A API route usa service_role internamente. A resposta HTTP ao cliente nunca deve incluir dados que o RLS ocultaria.

3. **Apenas em API routes.** Nunca importar o client service_role em Server Components ou Client Components. Apenas em `app/api/*/route.ts`.

4. **Validar input antes de usar.** O service_role bypassa RLS mas não bypassa lógica de negócio. Validar payload antes de qualquer INSERT.

5. **Verificar imobiliaria_id explicitamente.** O service_role pode acessar qualquer imobiliária. O código da API route deve garantir que só opera na imobiliária correta — nunca confiar no `imobiliaria_id` vindo do payload do cliente sem verificar.

**Padrão de uso correto:**

```ts
// lib/supabase-server.ts — NUNCA importar no frontend
import { createClient } from '@supabase/supabase-js'
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!  // SEM NEXT_PUBLIC_
)

// app/api/leads/route.ts
import { supabaseAdmin } from '@/lib/supabase-server'
// Usar apenas aqui, nunca em componentes
```

---

## 7. Regras para criação de novas tabelas

Antes de criar qualquer tabela nova:

1. **imobiliaria_id obrigatório.** Toda tabela com dados de negócio deve ter `imobiliaria_id UUID NOT NULL REFERENCES imobiliarias(id) ON DELETE CASCADE`. Sem exceção.

2. **RLS habilitado imediatamente.** `ALTER TABLE nova_tabela ENABLE ROW LEVEL SECURITY;` deve estar na mesma migration que cria a tabela.

3. **Policy SELECT mínima.** Pelo menos uma policy de SELECT que filtra por `imobiliaria_id = current_imobiliaria_id()` deve existir. Tabela sem nenhuma policy = acesso zero para authenticated e anon.

4. **Sem `USING (true)`.** Policy com `USING (true)` libera acesso a todos os dados de todas as imobiliárias. Nunca usar sem justificativa documentada e revisão explícita.

5. **Índice em imobiliaria_id.** Criar `CREATE INDEX ... ON nova_tabela (imobiliaria_id)` na mesma migration.

6. **Campos de auditoria.** Toda tabela nova deve ter `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Para tabelas que registram ações de usuários, adicionar `criado_por` ou `usuario_id`.

7. **Dados pessoais:** se a tabela armazenar dados de pessoas físicas, documentar a finalidade e base legal antes de criar.

**Template mínimo para nova tabela:**

```sql
CREATE TABLE nova_tabela (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  imobiliaria_id UUID        NOT NULL REFERENCES imobiliarias(id) ON DELETE CASCADE,
  -- campos de negócio
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nova_tabela_imobiliaria ON nova_tabela (imobiliaria_id);

ALTER TABLE nova_tabela ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nova_tabela_select" ON nova_tabela
  FOR SELECT TO authenticated
  USING (imobiliaria_id = current_imobiliaria_id());

-- Policies de INSERT/UPDATE/DELETE apenas se o client autenticado
-- precisar dessas operações. Caso contrário, deixar sem policy
-- (apenas service_role conseguirá escrever).
```

---

## 8. Regras para criação de novas APIs (API routes)

1. **Nunca confiar no imobiliaria_id vindo do payload.** O cliente pode enviar qualquer UUID. A API route deve:
   - Ou derivar o `imobiliaria_id` do usuário autenticado (via `supabaseAdmin` + query em `usuarios`)
   - Ou verificar que o recurso referenciado pertence à imobiliária do usuário

2. **Validar payload antes de qualquer query.** Campos obrigatórios, tipos, formatos. Retornar 422 antes de tocar no banco.

3. **Usar supabaseAdmin (service_role) para escritas, supabaseClient para leituras autenticadas.** Nunca usar service_role para retornar dados que o RLS ocultaria.

4. **Toda escrita relevante gera evento em historico_leads.** INSERT em leads → `lead_criado`. UPDATE de status → `status_alterado`. Distribuição → `lead_distribuido`.

5. **Erros não devem vazar detalhes internos.** Retornar mensagens genéricas ao cliente. Logar detalhes no servidor.

6. **Autenticação antes de lógica.** Verificar sessão do usuário antes de qualquer processamento.

**Estrutura mínima de uma API route:**

```ts
export async function POST(req: Request) {
  // 1. Extrair sessão (via cookies ou header)
  // 2. Validar payload (retornar 422 se inválido)
  // 3. Derivar imobiliaria_id do usuário autenticado
  // 4. Executar lógica de negócio com supabaseAdmin
  // 5. Registrar evento em historico_leads
  // 6. Retornar resposta sanitizada (sem dados internos)
}
```

---

## 9. Regras para webhooks externos

Webhooks (Meta Ads, landing pages, Zapier) recebem leads automaticamente via `POST /api/leads`.

1. **Nunca aceitar imobiliaria_id no payload.** O webhook não deve poder escolher a qual imobiliária o lead pertence. O `imobiliaria_id` deve ser determinado pelo token de autenticação do webhook.

2. **Autenticação obrigatória (V1).** No MVP atual, a rota é protegida por obscuridade. Em V1: header `X-API-Key: <token>` verificado contra `process.env.LEAD_API_SECRET`. Token diferente por imobiliária.

3. **Sanitização de campos de texto.** `nome`, `interesse`, `observacoes` devem ser truncados/limpos antes de inserir. O Supabase JS client já usa queries parametrizadas (SQL injection mitigado), mas HTML/scripts nos campos podem causar XSS na UI.

4. **Rate limiting (V1).** Sem rate limiting, um loop de webhook pode criar milhares de leads. Implementar em V1: máximo 30 requisições por minuto por IP.

5. **Idempotência por deduplicação.** O mesmo lead enviado duas vezes não deve criar duplicata. A deduplicação por `telefone_normalizado` + janela 24h resolve isso.

6. **Resposta padronizada.** Nunca retornar UUIDs internos, erros de stack trace ou estrutura do banco na resposta de erro.

---

## 10. Regras para logs e histórico

### historico_leads — uso correto

`historico_leads` é a trilha de auditoria do sistema. Toda operação relevante sobre um lead **deve** gerar um evento.

| Evento | Quando registrar | tipo_evento |
|--------|-----------------|-------------|
| Lead criado | Na criação, sempre | `lead_criado` |
| Lead roteado para equipe | Quando equipe é determinada | `lead_roteado` |
| Lead distribuído para corretor | Quando corretor_id é preenchido | `lead_distribuido` |
| Distribuição falhou | Quando não há corretor elegível | `distribuicao_falhou` |
| Status alterado | Qualquer mudança em leads.status | `status_alterado` |
| Lead redistribuído | Quando corretor muda após distribuição | `lead_redistribuido` |

**Regras:**
- Nunca apagar registros de historico_leads
- Nunca atualizar registros de historico_leads
- Sempre incluir `imobiliaria_id` (obrigatório pela política RLS)
- Incluir `usuario_id` quando a ação foi iniciada por um usuário logado
- Incluir `dados JSONB` com contexto suficiente para reconstruir o que aconteceu

**O que não registrar:**
- Leituras/visualizações (não são relevantes operacionalmente — logs de acesso são tarefa de V2)
- Tentativas de login (gerenciadas pelo Supabase Auth)
- Erros de validação de payload (não chegam a criar leads)

---

## 11. Regras para RLS

### Nunca fazer

- `USING (true)` sem justificativa documentada e aprovação explícita
- Criar tabela sem `ENABLE ROW LEVEL SECURITY`
- Criar tabela sem ao menos uma policy SELECT
- Usar `TO public` em policies de dados sensíveis
- Esquecer `imobiliaria_id = current_imobiliaria_id()` em qualquer USING **e** WITH CHECK
- Usar `ON DELETE CASCADE` em FKs ligadas à entidade raiz de tenant (`imobiliarias.id`). Um DELETE acidental não pode destruir toda a operação. Usar `ON DELETE RESTRICT` — forçar exclusão explícita e ordenada dos dados antes de poder deletar o tenant
- Criar policy UPDATE sem `imobiliaria_id = current_imobiliaria_id()` no WITH CHECK — permite que admin malicioso mova registros para outro tenant
- Permitir escrita direta do client em `leads`, `vendas` ou `historico_leads` — essas tabelas só recebem escrita via service_role em API routes
- Expor `SUPABASE_SERVICE_ROLE_KEY` no frontend (variável sem prefixo `NEXT_PUBLIC_`)
- Criar função `SECURITY DEFINER` sem `SET search_path = public, pg_catalog`

### Sempre fazer

- Uma policy por operação (SELECT, INSERT, UPDATE, DELETE) por role
- Testar com anon key após criar policies (deve retornar zero rows)
- Testar com authenticated de role diferente (corretor não deve ver leads de outro corretor, nem telefone/email de outros corretores)
- Incluir `imobiliaria_id` no filtro de toda policy de dados (USING e WITH CHECK em updates)
- Adicionar `imobiliaria_id` em toda tabela operacional nova
- Usar `ON DELETE RESTRICT` em toda FK que aponte para `imobiliarias(id)`
- Usar `ON DELETE SET NULL` quando o registro filho deve sobreviver ao parent (ex: histórico de lead quando corretor é deletado)
- Usar `ON DELETE CASCADE` apenas quando o filho não tem sentido sem o parent (ex: historico_leads sem lead)
- Registrar eventos relevantes em `historico_leads` usando service_role

### Padrão de policy por role

| Role | SELECT | INSERT | UPDATE | DELETE |
|------|--------|--------|--------|--------|
| admin | todos da imobiliária | ✓ | ✓ | com cuidado |
| gestor | todos da imobiliária | ✓ (operacionais) | ✓ (operacionais) | não recomendado |
| corretor | apenas os seus | ✗ (via service_role) | ✗ (via service_role) | ✗ |
| service_role | bypassa RLS | ✓ | ✓ | ✓ |
| anon | ✗ | ✗ | ✗ | ✗ |

### Debugging de RLS

Se uma query retorna menos dados do que esperado:

```sql
-- 1. Verificar se RLS está habilitado na tabela
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'leads';

-- 2. Listar policies da tabela
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'leads';

-- 3. Testar como usuário específico (SQL Editor → role: authenticated com JWT de usuário)
SELECT current_imobiliaria_id();  -- deve retornar o UUID da imobiliária do usuário

-- 4. Verificar se o usuário tem registro em usuarios
SELECT * FROM usuarios WHERE auth_user_id = auth.uid();
```

---

## 12. Regras de LGPD aplicáveis ao produto

O Lead Master IA atua como **operador de dados** (Art. 5º, VII da LGPD) — processa dados pessoais em nome das imobiliárias (controladoras). As imobiliárias respondem perante seus clientes (os leads). O produto deve oferecer meios para que as imobiliárias cumpram suas obrigações.

### Obrigações atuais (MVP)

| Obrigação LGPD | Implementação |
|----------------|--------------|
| Finalidade determinada | Campos coletados têm propósito documentado (Seção 2) |
| Não coletar dado desnecessário | Lista de dados proibidos (Seção 3) |
| Segurança e prevenção de danos | RLS + multi-tenancy (migration 002) |
| Rastreabilidade | historico_leads registra eventos relevantes |

### Obrigações para V1/V2

| Obrigação | Prazo | Detalhe |
|-----------|-------|---------|
| Aviso de privacidade | V1 | Informar leads que seus dados serão processados |
| Direito de exclusão | V1 | Mecanismo para deletar lead e seu histórico |
| Portabilidade | V2 | Exportar dados de um lead em formato legível |
| Prazo de retenção | V2 | Política de exclusão automática de leads antigos (ex: 2 anos) |
| DPO designado | V2 (ou quando necessário) | Encarregado de dados (se processamento em larga escala) |

### Dados de leads: o que comunicar às imobiliárias

As imobiliárias-clientes devem ser informadas de que:
- Os dados dos leads são armazenados em servidores do Supabase (AWS US-East por padrão)
- O acesso é restrito ao time da imobiliária via RLS
- A Anthropic / Lead Master IA não acessa dados de leads fora do suporte técnico autorizado

---

## 13. Checklist obrigatório antes de qualquer nova feature

Responder SIM a todas as perguntas antes de implementar:

### Banco de dados

- [ ] A tabela nova tem `imobiliaria_id NOT NULL REFERENCES imobiliarias(id) ON DELETE RESTRICT`?
- [ ] RLS está habilitado na tabela nova?
- [ ] Existe pelo menos uma policy SELECT com `imobiliaria_id = current_imobiliaria_id()`?
- [ ] Policies de UPDATE têm `imobiliaria_id = current_imobiliaria_id()` no WITH CHECK (não só no USING)?
- [ ] Existe índice em `imobiliaria_id` na tabela nova?
- [ ] Campos que armazenam dados pessoais estão documentados (finalidade)?
- [ ] Nenhum dado pessoal desnecessário está sendo coletado?
- [ ] Funções SECURITY DEFINER têm `SET search_path = public, pg_catalog`?

### API routes

- [ ] O `imobiliaria_id` é derivado do usuário autenticado, não do payload do cliente?
- [ ] O payload é validado antes de qualquer operação no banco?
- [ ] Escritas sensíveis usam `supabaseAdmin` (service_role), não `supabaseClient`?
- [ ] Eventos relevantes são registrados em `historico_leads`?
- [ ] A resposta de erro não vaza detalhes internos (stack traces, UUIDs do banco)?

### Frontend / componentes

- [ ] `SUPABASE_SERVICE_ROLE_KEY` está ausente de qualquer `NEXT_PUBLIC_*` var?
- [ ] O client service_role não é importado em nenhum componente (apenas em `app/api/`)?
- [ ] Dados pessoais não são exibidos para usuários sem permissão (corretor não vê leads de outros)?

### Webhooks e integrações

- [ ] O webhook não aceita `imobiliaria_id` no payload (determinar pelo token)?
- [ ] A integração não usa anon key para escrita direta no banco?
- [ ] Rate limiting está planejado (mesmo que seja V1)?

---

*Este documento é referência obrigatória. Invocar antes de implementar qualquer feature com impacto em dados, segurança ou banco.*
