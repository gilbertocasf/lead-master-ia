# Auditoria de Preparação — Basílio Imóveis

**Data:** 2026-06-23  
**Autor:** Claude Code  
**Objetivo:** Auditar o estado atual do banco e definir estratégia segura de substituição dos dados de demonstração pelos dados reais da BASILIO IMOVEIS.  
**Escopo:** Somente leitura e planejamento. Nenhum SQL foi executado.

---

## Estado atual esperado

Com base nas migrations aplicadas (`001` a `004`) e no `schema.sql` inicial, o banco contém:

### Tabelas existentes (7)

| Tabela | Conteúdo esperado | Origem |
|---|---|---|
| `imobiliarias` | 1 linha: `"Imobiliária Padrão — Renomear após setup"` | Criada automaticamente pela migration 002 (backfill) |
| `usuarios` | Vazia ou com 1 conta de teste admin | Criada manualmente via Supabase Dashboard (pós-002) |
| `equipes` | 2 linhas: Equipe Atlântico (Roberto Tavares) e Equipe Horizonte (Cláudia Menezes) | `schema.sql` §8.1 |
| `corretores` | 12 linhas: 6 por equipe, nomes fictícios (Rafael Mendes, Beatriz Lima, etc.) | `schema.sql` §8.2 |
| `leads` | 11 linhas: leads fictícios (Marina Costa, Eduardo Ramos, etc.) | `schema.sql` §8.3 |
| `vendas` | 10 linhas: vendas fictícias com valores de demo | `schema.sql` §8.4 |
| `historico_leads` | Provavelmente vazia — nenhuma operação de escrita real foi realizada via app | Criada pela migration 001/002 |

### Colunas adicionadas pelas migrations (além do schema.sql)

| Tabela | Coluna | Valor atual esperado |
|---|---|---|
| `corretores` | `em_plantao` | `false` em todos (a ação manual pós-002 pode não ter sido executada) |
| `corretores` | `ultimo_lead_recebido_em` | `NULL` em todos |
| `corretores` | `usuario_id` | `NULL` em todos |
| `equipes` | `ativo` | `true` em ambas |
| `equipes` | `ultimo_lead_recebido_em` | `NULL` em ambas |
| `leads` | `telefone_normalizado` | `NULL` em todos (não foi preenchido pelos inserts do schema.sql) |
| `leads` | `distribuido_em` | `NULL` em todos |
| todas | `imobiliaria_id` | UUID da imobiliária padrão (mesmo valor em todas as linhas) |

### Stored procedures existentes

| Função | Finalidade |
|---|---|
| `criar_e_distribuir_lead(JSONB)` | Criação atômica de lead + dedup + roteamento + distribuição |
| `alterar_status_lead(JSONB)` | Alteração de status + registro em historico_leads |
| `current_imobiliaria_id()` | Helper RLS — lê imobiliaria_id do usuário autenticado |
| `current_user_role()` | Helper RLS — lê role do usuário autenticado |
| `current_usuario_id()` | Helper RLS — lê id do usuário autenticado |

---

## Tabelas afetadas

Apenas as tabelas de **dados operacionais** precisam ser alteradas. Estrutura e segurança ficam intactas.

| Tabela | Ação necessária | Motivo |
|---|---|---|
| `imobiliarias` | UPDATE (renomear) | Trocar "Imobiliária Padrão" por "BASILIO IMOVEIS" |
| `equipes` | UPDATE (renomear) | Atlântico → Genesis (gerente Euler), Horizonte → Arkanjos (gerente Mateus) |
| `corretores` | DELETE + INSERT | 12 demo → 26 reais (14 Genesis + 12 Arkanjos) — quantidade incompatível com UPDATE simples |
| `leads` | DELETE (todos) | 11 leads fictícios devem ser removidos |
| `vendas` | DELETE (todos) | 10 vendas fictícias devem ser removidas |
| `historico_leads` | Verificar / DELETE se não vazia | Provavelmente vazia; se houver linhas, remover junto com os leads |
| `usuarios` | Verificar / manter ou substituir | Conta de teste deve ser substituída ou deletada via Supabase Dashboard |

### Tabelas que NÃO devem ser tocadas

| Tabela / Objeto | Motivo |
|---|---|
| Estrutura de todas as tabelas (colunas, constraints, índices) | O schema já está correto |
| RLS policies (14 policies ativas) | Corretas e em produção — qualquer alteração é risco alto |
| Stored procedures (migrations 003 e 004) | Lógica de negócio validada — não tocar |
| `auth.users` (Supabase Auth) | Gerenciado pelo Supabase — nunca editar diretamente via SQL |
| `imobiliarias.id` (UUID) | Preservar o UUID; todas as FKs de `imobiliaria_id` dependem dele |
| `equipes.id` (UUIDs) | Preservar os dois UUIDs; UPDATE só em `nome` e `gerente` |

---

## Registros a preservar

### Preservação obrigatória (estrutural)

- **UUID da imobiliária**: o `id` da linha em `imobiliarias` é referenciado via `imobiliaria_id` em 5 tabelas. Deve ser **preservado** — somente o `nome` será trocado.
- **UUIDs das equipes**: os dois `id` em `equipes` são referenciados via `equipe_id` em `corretores` e `leads`. Deve ser **preservado** — somente `nome` e `gerente` serão trocados.
- **Todas as policies RLS**: sem alteração de estrutura.
- **Todas as stored procedures**: sem alteração.

### Preservação condicional

- **Conta admin em `usuarios`**: se existe uma conta de teste funcional (com login real no Supabase Auth), verificar se é de Fabiano ou Cleomir. Se for conta de teste descartável, deletar via Dashboard e recriar com dados reais.

---

## Registros a substituir

### DELETE total (sem preservação)

| Tabela | Quantidade esperada | Critério |
|---|---|---|
| `historico_leads` | 0 (ou poucos testes) | Todos — dados fictícios de teste |
| `vendas` | 10 | Todos — valores fictícios |
| `leads` | 11 | Todos — clientes fictícios |
| `corretores` | 12 | Todos — nomes fictícios |

### UPDATE (troca in-place, preservando UUIDs)

| Tabela | Linha | Campo `nome` atual → novo | Campo `gerente` atual → novo |
|---|---|---|---|
| `imobiliarias` | única | "Imobiliária Padrão — Renomear após setup" → "BASILIO IMOVEIS" | — |
| `equipes` | linha 1 | "Equipe Atlântico" → "Genesis" | "Roberto Tavares" → "Euler" |
| `equipes` | linha 2 | "Equipe Horizonte" → "Arkanjos" | "Cláudia Menezes" → "Mateus" |

### INSERT (dados reais da imobiliária)

| Tabela | Quantidade | Detalhes |
|---|---|---|
| `corretores` | 14 | Equipe Genesis: Annelyza, Leandro, Maria Eduarda, Douglas, Jacson, Rodrigo, Rafael, Danilo, Lorraine, Daiane, Túlio, André, Julihermes, Manoel |
| `corretores` | 12 | Equipe Arkanjos: Kamila, Victor, Aline, Graziela, Keila, Jhonatham, Emily, Ricardo, Kanan, Silvio, Cláudio, Lorena |

---

## Riscos identificados

### 1. Distribuição automática — BAIXO RISCO

A stored procedure `criar_e_distribuir_lead` depende de:
- `equipes.id` (UUIDs preservados → sem risco)
- `equipes.ativo = true` (será verdadeiro para ambas → sem risco)
- `corretores.em_plantao = true` e `corretores.ativo = true`

**Atenção:** Após o INSERT dos novos corretores, `em_plantao` será `false` por padrão (DEFAULT da migration 001/002). É necessário executar manualmente `UPDATE corretores SET em_plantao = true WHERE ativo = true` para que a distribuição automática funcione. Sem esse UPDATE, o sistema recebe leads mas não distribui (ficam na fila).

### 2. Pipeline — BAIXO RISCO

A stored procedure `alterar_status_lead` usa `lead_id` e `imobiliaria_id`. Após a limpeza dos leads demo e inserção de leads reais, não há risco estrutural. O pipeline funcionará normalmente.

### 3. Ranking — SEM RISCO

`vendas` é deletada completamente. O ranking simplesmente ficará zerado até que vendas reais sejam registradas. Isso é o comportamento correto para uma demo com dados reais.

### 4. Histórico — SEM RISCO

`historico_leads` está vazia. Após a limpeza, os novos leads entrarão com histórico limpo e correto via a stored procedure.

### 5. Autenticação — ATENÇÃO MODERADA

- `auth.users` (Supabase Auth): se existir conta de teste, ela deve ser **desativada ou deletada via Dashboard**, nunca via SQL direto.
- `usuarios` table: se existir linha de teste com `auth_user_id` de uma conta descartável, a linha pode ser deletada após a conta auth ser removida.
- Para o acesso real dos donos (Fabiano, Cleomir), será necessário criar contas no Supabase Auth e as linhas correspondentes em `usuarios`.
- **Risco concreto**: se houver uma conta admin existente e ela for deletada sem substituição, o acesso ao sistema será interrompido. Criar o novo admin **antes** de remover o anterior.

### 6. RLS — RISCO ZERO (se UUID da imobiliária for preservado)

Todas as 14 policies de RLS filtram por `imobiliaria_id = current_imobiliaria_id()`. Como o UUID da imobiliária **não muda** (apenas o nome), todas as policies continuam funcionando sem alteração. Nenhuma policy deve ser tocada.

**Risco que NÃO existe aqui:** DELETE + INSERT em `imobiliarias` (que trocaria o UUID) quebraria todas as FKs e toda a RLS. Por isso a estratégia usa UPDATE, não DELETE+INSERT.

### 7. Foreign Keys — RISCO OPERACIONAL (ordem de execução)

As FK constraints definem uma ordem obrigatória de deleção. Executar fora de ordem causa erro `violates foreign key constraint`. A ordem correta está na seção "Estratégia recomendada".

| FK relevante | Tabela filho | Tabela pai | Comportamento ao delete pai |
|---|---|---|---|
| `historico_leads.lead_id` | historico_leads | leads | CASCADE (apaga junto) |
| `vendas.corretor_id` | vendas | corretores | RESTRICT (bloqueia delete) |
| `leads.corretor_id` | leads | corretores | SET NULL (ok) |
| `leads.equipe_id` | leads | equipes | RESTRICT (bloqueia delete) |
| `corretores.equipe_id` | corretores | equipes | RESTRICT (bloqueia delete) |

---

## Estratégia recomendada

**Combinação de UPDATE (para registros com UUIDs críticos) + DELETE/INSERT (para registros substituíveis).**

Não usar DELETE+INSERT em `imobiliarias` nem em `equipes` — preservar os UUIDs é essencial para integridade das FKs e RLS.

### Ordem de execução (quando autorizado)

```
Passo 1: DELETE historico_leads (se houver linhas)
          → referencia leads; apagar antes de leads

Passo 2: DELETE vendas
          → referencia corretores com RESTRICT; apagar antes de corretores

Passo 3: DELETE leads
          → referencia equipes com RESTRICT; apagar antes de alterar equipes
          → historico_leads já foi apagado no passo 1 (CASCADE)

Passo 4: DELETE corretores
          → referencia equipes com RESTRICT; apagar antes de alterar equipes
          → vendas já foi apagado no passo 2

Passo 5: UPDATE imobiliarias SET nome = 'BASILIO IMOVEIS'
          → UUID preservado; RLS intacta

Passo 6: UPDATE equipes SET nome, gerente
          → linha 1: "Genesis" / "Euler"
          → linha 2: "Arkanjos" / "Mateus"
          → UUIDs preservados

Passo 7: INSERT corretores — Genesis (14 corretores)
          → com equipe_id = UUID da equipe Genesis
          → com imobiliaria_id = UUID da imobiliária
          → ordem_plantao = 1 a 14
          → ativo = true, em_plantao = false (default)

Passo 8: INSERT corretores — Arkanjos (12 corretores)
          → com equipe_id = UUID da equipe Arkanjos
          → com imobiliaria_id = UUID da imobiliária
          → ordem_plantao = 1 a 12
          → ativo = true, em_plantao = false (default)

Passo 9: UPDATE corretores SET em_plantao = true WHERE ativo = true
          → ou UPDATE seletivo apenas nos corretores que estarão disponíveis na demo
          → OBRIGATÓRIO para que a distribuição automática funcione

Passo 10: Verificação — SELECT de cada tabela para confirmar contagens
```

### Por que não DELETE+INSERT nas equipes?

Se deletarmos as equipes, as constraints `ON DELETE RESTRICT` em `corretores` e `leads` bloqueiam a deleção (é necessário apagar filhos antes). Mais importante: o UUID novo gerado pelo INSERT seria diferente do atual, e a RLS e os filtros por `equipe_id` nas queries da aplicação receberiam UUIDs desconhecidos. O UPDATE preserva tudo que importa.

---

## Informações ainda necessárias

As seguintes informações não foram fornecidas e são necessárias antes de gerar o SQL:

### Obrigatórias para o sistema funcionar

| Informação | Motivo |
|---|---|
| Email de Fabiano Basilio | Necessário para criar login no Supabase Auth (convite via Dashboard) |
| Email de Cleomir Cortes | Idem |
| Role de cada dono: os dois são `admin`, ou um é `gestor`? | Define as permissões no sistema (admin vê e configura tudo; gestor só vê dados operacionais) |
| Lucas Wendel (captador): é um usuário do sistema? Qual role? | Captadores não têm role definida no schema atual — verificar se ele precisa de login |
| Ordem de plantão de cada corretor nas equipes | Determina `ordem_plantao` (1 a N) — afeta diretamente o round-robin de distribuição |
| Quais corretores estarão em plantão na demo | Define quem receberá `em_plantao = true` no passo 9 |

### Desejáveis (melhora a experiência, não bloqueante)

| Informação | Motivo |
|---|---|
| Telefone de cada corretor | Campo `telefone` em `corretores` (opcional mas útil para contato) |
| Email de cada corretor | Campo `email` em `corretores` — único no banco quando informado; necessário para login futuro de cada corretor |
| Dados históricos de VGV/vendas | Se a imobiliária quiser um ranking pré-populado na demo, precisamos dos dados de vendas anteriores |
| Leads de demonstração reais | Se preferirem demonstrar com leads fictícios realistas (com nomes de bairros/produtos de Goiânia, por exemplo) em vez de banco zerado |

### Atenção: campo `gerente` em `equipes`

O campo `gerente` na tabela `equipes` armazena o **nome** do gerente como texto — não é uma FK para `corretores` ou `usuarios`. Isso significa que Euler e Mateus são registrados como texto livre na equipe, e **não** são automaticamente criados como usuários do sistema. Se Euler e Mateus precisam de login, precisarão de contas em `auth.users` + linhas em `usuarios` com role `gestor`, configuradas separadamente.

---

## Próximos passos

1. **Confirmar as informações faltantes** (seção acima) — especialmente emails dos donos e ordem de plantão.
2. **Verificar estado real do banco** antes de executar qualquer SQL:
   - `SELECT * FROM imobiliarias;` — confirmar nome atual e UUID
   - `SELECT id, nome, gerente FROM equipes;` — capturar os UUIDs reais
   - `SELECT COUNT(*) FROM corretores;` — confirmar 12 demo
   - `SELECT COUNT(*) FROM leads;` — confirmar 11 demo
   - `SELECT COUNT(*) FROM vendas;` — confirmar 10 demo
   - `SELECT COUNT(*) FROM historico_leads;` — confirmar se vazia
   - `SELECT COUNT(*) FROM usuarios;` — confirmar estado atual de auth
3. **Verificar conta admin existente** via Supabase Dashboard → Authentication → Users.
4. **Aguardar autorização explícita** para gerar o SQL da substituição.
5. **Gerar o SQL** em dois blocos separados: (a) limpeza dos dados demo e (b) inserção dos dados reais — para revisão antes de executar.
6. **Executar em ambiente real** somente com confirmação, de preferência durante janela de baixa atividade.
7. **Verificar distribuição automática** após execução: criar um lead de teste e confirmar que é distribuído corretamente para um corretor em plantão.

---

*Documento gerado por auditoria estática do código-fonte. Nenhum SQL foi executado. Nenhuma alteração foi feita.*
