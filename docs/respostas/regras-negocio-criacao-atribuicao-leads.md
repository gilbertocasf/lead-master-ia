# Regras de Negócio — Criação e Atribuição de Leads

**Data:** 2026-06-25  
**Escopo:** Ajuste das regras de cadastro e distribuição de leads manuais para a BASILIO IMÓVEIS  
**Build:** ✅ Passou sem erros TypeScript

---

## 1. Arquivos alterados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `supabase/migrations/005_rpc_criar_lead_v2.sql` | Novo — atualização da RPC |
| `app/api/leads/route.ts` | Atualizado — role check + suporte a `corretor_id` |
| `lib/supabase-queries.ts` | Atualizado — nova função `fetchUsuarioAtual()` |
| `components/NovoLeadModal.tsx` | Refatorado — dois cenários + seletor de corretor |
| `app/(app)/leads/page.tsx` | Atualizado — role-based rendering + passa `corretores` |

---

## 2. Regras implementadas

### Quem pode cadastrar lead

| Role | Pode cadastrar? |
|------|----------------|
| `admin` | ✅ Sim |
| `gestor` | ✅ Sim |
| `corretor` | ❌ Não — API retorna 403 |

**Onde a restrição é aplicada:**
- **API** (`route.ts`, linha 41–43): verificação de `usuario.role === 'corretor'` antes de qualquer processamento.
- **UI** (`leads/page.tsx`): botão "Cadastrar lead" só renderizado se `podeVerForm = true` (em modo mock: sempre visível; em Supabase: apenas para admin/gestor).

---

### Cenário A — Lead com captador conhecido

Fluxo: gerente sabe que um corretor específico trouxe o cliente.

1. Gerente abre o modal → marca **"Lead captado por corretor específico"**.
2. Sistema exibe selector filtrado pelos corretores **ativos** da equipe selecionada (não exige `em_plantao`).
3. Gerente seleciona o corretor → envia formulário.
4. API passa `corretor_id` na chamada da RPC.
5. RPC valida que `corretor_id` pertence à `equipe_id` + `imobiliaria_id` + `ativo = true`.
6. Lead salvo já com `corretor_id` definido, `distribuido_em = NOW()`, `status = novo`.
7. Historico registra evento `lead_distribuido` com `atribuicao_tipo = 'captador_conhecido'`.

**Ponto de integração de e-mail:** imediatamente após o `INSERT historico_leads` de `lead_distribuido` na RPC, um trigger ou função externa pode disparar o e-mail. A coluna `dados->>'corretor_nome'` e o `corretor_id` já estão presentes para compor a mensagem. A RPC não bloqueia caso o envio falhe — o lead é salvo independentemente.

---

### Cenário B — Lead sem dono definido (distribuição automática)

Fluxo: gerente cadastra lead que chegou sem captador identificado.

1. Gerente abre o modal → **não** marca "Lead captado por corretor específico".
2. Envia sem `corretor_id`.
3. API não inclui `corretor_id` no payload da RPC.
4. RPC executa round-robin: `em_plantao = true AND ativo = true ORDER BY ultimo_lead_recebido_em ASC` com `FOR UPDATE SKIP LOCKED` (sem duplicidade concorrente).
5. Lead salvo com `corretor_id` do próximo da fila, `distribuido_em = NOW()`, `status = novo`.
6. `corretores.ultimo_lead_recebido_em` atualizado → esse corretor vai para o fim da fila na próxima distribuição.
7. Historico registra `atribuicao_tipo = 'rodizio'`.
8. Se não houver corretor em plantão: lead fica com `corretor_id = NULL` (fila), evento `distribuicao_falhou` no histórico.

---

### Cenário C — Lead externo / futuro Meta Ads

Webhook `POST /api/leads` sem `corretor_id` → comportamento idêntico ao Cenário B.
Se `equipe_id` também omitido: RPC resolve por rodízio entre equipes ativas.

**Ponto de integração preservado:** o webhook já existe. Quando o Meta Ads for conectado, basta enviar o payload correto para o endpoint existente.

---

## 3. Onde a lógica de distribuição está centralizada

```
supabase/migrations/005_rpc_criar_lead_v2.sql
  └── FUNCTION criar_e_distribuir_lead(JSONB)
        ├── Deduplicação por telefone (24h, com advisory lock)
        ├── Resolução de equipe_id (direto ou rodízio)
        ├── INSERT leads (status = 'novo')
        ├── INSERT historico_leads ('lead_criado')
        ├── Cenário A: atribuição direta ao corretor informado
        ├── Cenário B/C: round-robin com fairness (ultimo_lead_recebido_em)
        ├── UPDATE leads.corretor_id + distribuido_em
        ├── UPDATE corretores.ultimo_lead_recebido_em
        ├── UPDATE equipes.ultimo_lead_recebido_em
        └── INSERT historico_leads ('lead_distribuido' | 'distribuicao_falhou')
```

**Nenhuma lógica de distribuição duplicada** — a RPC é a única fonte de verdade. A API route (`route.ts`) apenas valida entradas e delega.

---

## 4. Necessidade de migration

### Migration necessária: **005** (function only — sem mudança de schema)

**Arquivo:** `supabase/migrations/005_rpc_criar_lead_v2.sql`

É um `CREATE OR REPLACE FUNCTION` — sem `ALTER TABLE`, sem nova coluna, sem risco de dados. Idempotente e seguro para reaplicar.

**O que precisa ser executado no Supabase Dashboard (SQL Editor):**

```sql
-- Copiar e executar o conteúdo de:
-- supabase/migrations/005_rpc_criar_lead_v2.sql
```

### Schema existente: suficiente para o MVP

| Campo necessário | Status | Detalhe |
|-----------------|--------|---------|
| `leads.corretor_id` | ✅ Existe | FK para corretores, permite NULL |
| `leads.distribuido_em` | ✅ Existe | Adicionado na migration 002 |
| `leads.status` | ✅ Existe | Default `'novo'` — mantido |
| `corretores.em_plantao` | ✅ Existe | Adicionado na migration 002 |
| `corretores.ultimo_lead_recebido_em` | ✅ Existe | Adicionado na migration 002 |
| `historico_leads.dados` JSONB | ✅ Existe | Armazena `atribuicao_tipo` sem nova coluna |
| `leads.atribuicao_tipo` | ⚪ Não existe | Não necessário para MVP — informação preservada em `historico_leads.dados` |

### Campo opcional para o futuro (sem urgência):

```sql
-- Não aplicar agora. Apenas para referência futura:
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS atribuicao_tipo TEXT
    CHECK (atribuicao_tipo IN ('captador_conhecido', 'rodizio', 'externo'))
    DEFAULT 'rodizio';
```

Sem esse campo, a distinção fica em `historico_leads.dados->>'atribuicao_tipo'`. Para relatórios futuros de "quais leads vieram de captação própria vs. distribuição automática", seria útil adicioná-lo. Não bloqueia o MVP.

---

## 5. Checklist de teste manual

### Pré-requisito
- Aplicar `005_rpc_criar_lead_v2.sql` no Supabase Dashboard
- Pelo menos um corretor com `em_plantao = true` e `ativo = true`

### Cenário A — Captador conhecido
- [ ] Abrir `/leads` como gerente/admin
- [ ] Clicar em "Cadastrar lead"
- [ ] Preencher nome, telefone, origem, equipe
- [ ] Marcar **"Lead captado por corretor específico"**
- [ ] Verificar que o seletor aparece com corretores da equipe selecionada
- [ ] Trocar de equipe → verificar que o seletor reseta e exibe corretores da nova equipe
- [ ] Tentar salvar sem selecionar corretor → deve exibir erro "Selecione o corretor"
- [ ] Selecionar corretor e salvar → lead criado
- [ ] Verificar no banco: `leads.corretor_id` = UUID do corretor selecionado
- [ ] Verificar no banco: `leads.status = 'novo'`
- [ ] Verificar no banco: `historico_leads` tem evento `lead_distribuido` com `dados->>'atribuicao_tipo' = 'captador_conhecido'`

### Cenário B — Distribuição automática
- [ ] Abrir `/leads` como gerente/admin
- [ ] Clicar em "Cadastrar lead"
- [ ] Preencher nome, telefone, origem, equipe
- [ ] **Não marcar** "Lead captado por corretor específico"
- [ ] Verificar nota informativa "será distribuído automaticamente"
- [ ] Salvar → lead criado
- [ ] Verificar no banco: `leads.corretor_id` = próximo corretor da fila (não o mesmo recebido por último)
- [ ] Verificar no banco: `historico_leads` tem evento `lead_distribuido` com `dados->>'atribuicao_tipo' = 'rodizio'`
- [ ] Criar segundo lead sem captador → verificar que foi para corretor diferente (round-robin)

### Restrição de role
- [ ] Fazer login como usuário com `role = 'corretor'`
- [ ] Verificar que botão "Cadastrar lead" **não aparece** na tela `/leads`
- [ ] Tentar `POST /api/leads` manualmente com token do corretor → deve retornar `403 sem_permissao`

### Deduplicação
- [ ] Cadastrar lead com um telefone
- [ ] Tentar cadastrar outro lead com o mesmo telefone em menos de 24h → deve aparecer o aviso de duplicata

### Pipeline e dashboard
- [ ] Verificar `/` — KPIs sem regressão
- [ ] Verificar `/pipeline` — leads aparecem na coluna "Novo"
- [ ] Verificar `/ranking` — sem regressão

---

## 6. Riscos conhecidos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Migration 005 não aplicada | Alta (nova migration) | Cenário A retorna como round-robin (ignora `corretor_id`) | Aplicar no Supabase antes de usar |
| `em_plantao = false` em todos os corretores | Média | Cenário B coloca lead na fila sem distribuir | `UPDATE corretores SET em_plantao = true WHERE ativo = true` |
| `equipes.gerente` é TEXT (nome) sem FK para `usuarios` | Certa | Não é possível restringir o gerente à sua própria equipe no servidor | MVP aceita que gerente veja e selecione qualquer corretor de qualquer equipe — a API valida que `corretor_id` pertence à `equipe_id` escolhida |
| Botão "Distribuir" na fila ainda sem implementação | Certa | Não interfere — distribuição ocorre na criação | Aceitar como `ComingSoonButton` |

---

## 7. Próximos passos recomendados

### Imediato (antes de usar em produção)
1. Aplicar `supabase/migrations/005_rpc_criar_lead_v2.sql` no Supabase Dashboard
2. Verificar `em_plantao` dos corretores da BASILIO IMÓVEIS

### Curto prazo
3. **E-mail ao corretor:** criar `POST /api/leads/[id]/notificar-corretor` usando o `corretor_id` e `dados` do evento `lead_distribuido` no historico. Ou adicionar trigger no Supabase via Edge Function. Não bloqueia o fluxo atual — ponto de integração está preparado.
4. **Sidebar com usuário real:** substituir "João Carvalho / Administrador" pelo `usuario.nome` e `usuario.role`. A função `fetchUsuarioAtual()` já está disponível.
5. **Vincular corretor ao usuário:** preencher `corretores.usuario_id` para que o corretor veja seus próprios leads (pré-requisito para painel do corretor).

### Médio prazo
6. Adicionar `leads.atribuicao_tipo` se relatórios de "captação própria vs. automática" forem necessários
7. Implementar botão "Distribuir" manual (redistribuição de leads na fila sem corretor)
