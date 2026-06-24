# Próximas Fases — Lead Master IA
**Atualizado:** 2026-06-24

## Status das fases

| Fase | Descrição | Status |
|------|-----------|--------|
| 1–3.1-D | Auditorias estratégicas e arquitetura | ✓ Concluída |
| 4 | Planejamento técnico da captura e distribuição | ✓ Concluída |
| 5 | Schema mínimo (migrations 001–002) | ✓ Concluída |
| 6.1 | Autenticação SSR | ✓ Concluída |
| 6.2 | Entrada de leads via formulário e webhook | ✓ Concluída |
| 7 | Distribuição automática (RPC 003) | ✓ Concluída |
| 8 | Pipeline funcional + SLA visual (RPC 004) | ✓ Concluída |
| **9** | **Validação end-to-end em produção** | **✓ Concluída — 2026-06-24** |
| 10 | Preparação comercial da demo real | → Próxima fase |

---

## Marco: v1-demo-operacional — VALIDADO

Tag `v1-demo-operacional` criada e enviada ao GitHub em 2026-06-24.

O fluxo principal do produto está operacional em produção (Vercel + Supabase real) com dados reais da BASILIO IMOVEIS:

```
Lead entra via formulário
  → Sistema distribui automaticamente para o corretor de plantão
  → Lead aparece no pipeline com badge SLA
  → Corretor move o status
  → Evento registrado em historico_leads
  → Sem intervenção manual do gestor
```

Esse é o diferencial do produto. Nenhum CRM genérico faz isso.

---

## Pendências conhecidas (dívida pós-MVP)

Funcionalidades previstas mas não implementadas no MVP:

| # | Item | Observação |
|---|------|-----------|
| P1 | Botão "Distribuir" sem ação real | Distribuição ocorre automaticamente no cadastro; o botão cobre o fallback (lead órfão) — não é o fluxo principal |
| P2 | Motivo de perda não implementado | Mover lead para `perdido` não exige justificativa ainda |
| P3 | Status de plantão não editável na UI | `em_plantao` só muda via SQL direto no banco |
| P4 | Registro de venda não implementado | Não existe formulário de fechamento no app |
| P5 | SLA badge não atualiza em tempo real | Estático; requer reload para ver evolução |

---

## Fase 10 — Preparação comercial da demo real

**Objetivo:** refinar a experiência da demo para uso com prospects reais, sem grandes features novas.

**Escopo — apenas ajustes comerciais e de apresentação:**

### 10.1 — Dados e apresentação
- Confirmar que os dados da Basílio Imóveis estão consistentes no banco (nomes, equipes, corretores em plantão)
- Verificar que o ranking VGV está populado com vendas de demo coerentes
- Garantir que a fila de `/leads` está limpa antes de cada demo

### 10.2 — Acabamentos visuais críticos
- Remover ou corrigir o label de região vazio nos cards do pipeline (renderiza " • R$ valor" com espaço extra)

### 10.3 — Roteiro de demo documentado
- Criar `docs/roteiro-demo.md` com script pronto para o apresentador
- Incluir: ordem dos passos, o que dizer em cada tela, como reagir a perguntas do prospect

### 10.4 — Estabilidade operacional
- Validar que a sessão Supabase não expira durante uma demo de 30 minutos
- Confirmar que o deploy da Vercel está sempre na `main` antes de uma reunião

**Critério de conclusão:** gestor consegue apresentar o produto para um prospect novo em 10 minutos sem precisar de suporte técnico.

**O que NÃO entra na Fase 10:**
- WhatsApp, Meta Ads nativo, multi-tenant
- Novas rotas ou páginas
- Alterações de schema ou migrations
- Autenticação por papel para corretores

---

## Versão 1 — CRM operacional (pós-MVP)

Após a Fase 10 validar a demo com prospects reais:

| # | Funcionalidade |
|---|---------------|
| 1 | Botão "Distribuir" com endpoint real (`POST /api/leads/[id]/distribuir`) |
| 2 | Motivo de perda obrigatório ao mover para `perdido` |
| 3 | Registro de venda (imóvel, VGV, data) |
| 4 | Status de plantão editável pelo gerente na UI |
| 5 | Login individual para corretores (vínculo `usuarios` ↔ `corretores`) |
| 6 | Alertas de inatividade (lead parado > 48h) |
| 7 | SLA badge atualizando em tempo real (Client Component) |
| 8 | Filtros de ranking por equipe funcionais |
| 9 | Webhook com autenticação (secret no header) |

---

## Versão 2 — Distribuidor inteligente (pós-V1)

| # | Funcionalidade |
|---|---------------|
| 1 | Roteamento automático por campanha (tabela `config_campanhas`) |
| 2 | Roteamento por empreendimento (tabela `empreendimentos`) |
| 3 | Lead scoring com histórico de conversão |
| 4 | Dashboard de conversão por canal de origem |
| 5 | Relatório de SLA por equipe |
| 6 | Notificações via WhatsApp |
| 7 | Integração nativa com Meta Lead Ads |
| 8 | Multi-tenant (múltiplas imobiliárias) |
