# Auditoria de Transição — Fase 8 → Fase 9
**Data:** 2026-06-22  
**Escopo:** Estado real do projeto após encerramento da Fase 8  
**Método:** Leitura direta dos arquivos de código, migrations e documentação

---

## 1. O que já está operacional de ponta a ponta

### Autenticação e segurança
- Login/logout via Supabase Auth (Server Actions em `app/login/actions.ts`)
- Middleware em `middleware.ts` protegendo todas as rotas do grupo `(app)/`
- RLS ativo via migration 002 (confirmado no CLAUDE.md)
- Multi-tenancy por `imobiliaria_id` implementado nas API routes

### Leitura de dados reais (Supabase)
- `fetchEquipes()`, `fetchCorretores()`, `fetchPistas()`, `fetchVendas()` — todas funcionam com dados reais
- Dual-mode correto: mock sem `.env.local`, Supabase com env configurado
- Todas as 6 páginas (`/`, `/leads`, `/pipeline`, `/corretores`, `/equipes`, `/ranking`) lendo dados reais

### Criação de lead — `POST /api/leads`
- Validação de payload (nome, telefone, origem obrigatórios)
- Deduplicação por telefone normalizado com janela de 24h
- Chamada à RPC `criar_e_distribuir_lead` (migration 003) — lógica atômica com:
  - Advisory lock por telefone (serialização de race conditions)
  - Roteamento: `equipe_id` direto ou rodízio por `ultimo_lead_recebido_em`
  - Distribuição automática round-robin com fairness
  - Registro em `historico_leads` (evento `lead_criado` + `lead_distribuido`)
  - Retorno estruturado com status `criado` ou `duplicata`

### Alteração de status — `PATCH /api/leads/[id]/status`
- Validação de autenticação e permissão por role (corretor só move seus próprios leads)
- Chamada à RPC `alterar_status_lead` (migration 004) — atômica com:
  - `FOR UPDATE` para evitar race condition
  - Registro em `historico_leads` (evento `status_alterado`)

### Formulário modal de cadastro — `NovoLeadModal`
- Campos: nome*, telefone*, origem*, equipe*, interesse, faixa de valor
- Chama `POST /api/leads` corretamente
- Tratamento de erro de duplicata (exibe nome do lead existente)
- Chama `router.refresh()` após sucesso (dados reaparecem sem reload manual)

### Pipeline — `StatusDropdown`
- Dropdown funcional em cada card do kanban
- Chama `PATCH /api/leads/[id]/status` corretamente
- Exibe erro se a chamada falhar

### SLA visual — `PipelineSlaBadge`
- Verde: ≤ 30 min desde `distribuido_em` (ou `created_at` se não distribuído)
- Amarelo: 30 min–2h
- Vermelho: > 2h
- Lógica correta usando `distribuidoEm ?? criadoEm`

---

## 2. O que ainda é visual / fake

| Item | Arquivo | Problema |
|------|---------|----------|
| Botão "Distribuir" na fila de leads | `app/(app)/leads/page.tsx:74` | `<button>` sem nenhum `onClick` — clique não faz nada |
| Filtros de ranking por equipe | `app/(app)/ranking/page.tsx` | Botões sem ação (mencionado no README) |
| Status de plantão editável | — | Sem UI de edição. `em_plantao` só muda via SQL direto |
| Adicionar corretor / nova equipe | — | Botões sem ação |
| Usuário na Sidebar | `components/Sidebar.tsx` | Exibe "João Carvalho / Administrador" fixo (mock) |
| Campo `regiao` nos cards do pipeline | `app/(app)/pipeline/page.tsx:68` | Mapeado como `""` em `supabase-queries.ts:133` — renderiza " • R$ valor" com " • " à toa |

---

## 3. Maiores riscos técnicos antes da Fase 9

### RISCO 1 — Estado das migrations no Supabase de produção (CRÍTICO)
As migrations 003 e 004 criam as RPCs `criar_e_distribuir_lead` e `alterar_status_lead`. Sem elas:
- Formulário de cadastro falha com `erro_interno`
- Alteração de status falha com `erro_interno`

**O que se sabe:** migration 002 foi aplicada (confirmado no CLAUDE.md). As migrations 001, 003 e 004 **não têm confirmação explícita de aplicação em produção.**

Nota: migration 002 incorpora todos os campos de 001 (`em_plantao`, `ultimo_lead_recebido_em`, `historico_leads`, etc), então 001 pode ser desconsiderada. Mas 003 e 004 são críticas.

### RISCO 2 — `em_plantao = false` para todos os corretores (CRÍTICO)
A migration 001 (e 002) adiciona `em_plantao BOOLEAN DEFAULT false`. O comentário da migration diz explicitamente:

> "AÇÃO MANUAL OBRIGATÓRIA APÓS APLICAR: UPDATE corretores SET em_plantao = true WHERE ativo = true;"

Se esse UPDATE não foi executado, todos os corretores têm `em_plantao = false`. Nesse cenário:
- A RPC `criar_e_distribuir_lead` retorna `distribuido: false, motivo: sem_corretor_em_plantao`
- Todo lead vai para a fila e fica lá para sempre (o botão Distribuir não tem ação)

### RISCO 3 — Botão "Distribuir" é um botão morto (BLOQUEADOR PARA O DEMO)
O roteiro da Fase 9 é: criar lead → aparecer na fila → **clicar "Distribuir"** → aparecer no pipeline.

O botão existe visualmente em `leads/page.tsx:74` mas não tem `onClick`. Além disso, **não existe** uma rota `POST /api/leads/[id]/distribuir` no projeto — apenas `route.ts` (POST criar) e `[id]/status/route.ts` (PATCH status). O endpoint de distribuição manual foi previsto mas não implementado.

### RISCO 4 — SLA badge não atualiza em tempo real (MENOR)
`PipelineSlaBadge` é um Server Component que usa `Date.now()` no momento do render. O badge é correto quando a página carrega mas **não tica** — permanece estático até o próximo refresh. Para o demo, o gestor precisaria recarregar a página para ver o SLA evoluir.

---

## 4. Dependências da Fase 9

| Dependência | Status |
|-------------|--------|
| Fases 4–8 implementadas | ✓ Confirmado |
| Migration 002 aplicada (RLS, multi-tenancy, `historico_leads`) | ✓ Confirmado |
| Migration 003 aplicada (RPC `criar_e_distribuir_lead`) | ⚠ Não confirmado |
| Migration 004 aplicada (RPC `alterar_status_lead`) | ⚠ Não confirmado |
| Ao menos 1 corretor com `em_plantao = true` em produção | ⚠ Não confirmado — provavelmente false para todos |
| Botão "Distribuir" com ação real | ✗ Não implementado |
| Endpoint `POST /api/leads/[id]/distribuir` | ✗ Não existe |

---

## 5. Dívida técnica a resolver antes da Fase 9

### Alta prioridade (bloqueadores do demo)

**DT-1: Implementar endpoint e botão "Distribuir"**  
Criar `app/api/leads/[id]/distribuir/route.ts` com lógica de:
- Verificar autenticação
- Chamar a mesma lógica de seleção de corretor da RPC (ou criar RPC `distribuir_lead_existente`)
- UPDATE em `leads.corretor_id` e `leads.distribuido_em`
- INSERT em `historico_leads`
- Adicionar `onClick` no botão em `leads/page.tsx`

**DT-2: Confirmar e aplicar migrations 003 e 004 no Supabase**  
Entrar no Supabase Dashboard → SQL Editor e executar os arquivos:
- `supabase/migrations/003_rpc_criar_lead.sql`
- `supabase/migrations/004_rpc_alterar_status.sql`

**DT-3: Ativar corretores em plantão em produção**  
Executar no SQL Editor do Supabase:
```sql
UPDATE corretores SET em_plantao = true WHERE ativo = true;
```
Sem isso, nenhum lead é distribuído automaticamente.

### Baixa prioridade (não bloqueiam o demo)

**DT-4: Remover `regiao` vazio do pipeline**  
Em `pipeline/page.tsx:68` o trecho `{lead.regiao} • {lead.faixaValor}` renderiza " • R$ X" quando `regiao` está vazio. Substituir por `{lead.faixaValor}` ou tratar o vazio.

**DT-5: SLA em tempo real**  
Converter `PipelineSlaBadge` para Client Component com `setInterval` de 60s para atualizar o badge sem reload da página. Melhora experiência do demo mas não é bloqueante.

---

## 6. A Fase 9 pode começar imediatamente?

**Não — 3 bloqueadores ativos:**

| # | Bloqueador | Esforço estimado |
|---|-----------|-----------------|
| B1 | Botão "Distribuir" sem ação + endpoint ausente | 1–2h de implementação |
| B2 | Migrations 003 e 004 não confirmadas em produção | 5 min (aplicar SQL no dashboard) |
| B3 | `em_plantao = false` para todos os corretores | 1 min (executar UPDATE) |

Se B2 e B3 forem resolvidos agora (operações de 1–5 min cada), e B1 for implementado em seguida, a Fase 9 pode começar ainda hoje.

A estrutura técnica das Fases 4–8 está sólida. Os bloqueadores são lacunas operacionais, não problemas arquiteturais.

---

## VEREDITO

```
╔══════════════════════════════════════════════╗
║                                              ║
║   ✗  NÃO APROVADA PARA INICIAR FASE 9       ║
║                                              ║
║   Bloqueadores ativos: B1, B2, B3            ║
║   Esforço total para desbloqueio: ~2–3h      ║
║                                              ║
╚══════════════════════════════════════════════╝
```

**Plano de desbloqueio sugerido (em ordem):**

1. Aplicar migrations 003 e 004 no Supabase Dashboard (5 min)
2. Executar `UPDATE corretores SET em_plantao = true WHERE ativo = true` (1 min)
3. Implementar `POST /api/leads/[id]/distribuir` + onClick no botão (1–2h)
4. Testar o loop completo localmente com Supabase conectado
5. **Reavaliar** → iniciar Fase 9

---

*Auditoria gerada por leitura direta dos arquivos do projeto. Nenhum código foi alterado.*
