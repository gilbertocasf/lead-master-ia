# Skill: lead-master-product-architect

Orientação operacional permanente para trabalhar no Lead Master IA.
Invocar com `/lead-master-product-architect` antes de iniciar qualquer tarefa de implementação ou planejamento.

---

## Identidade do projeto

**Lead Master IA é um distribuidor inteligente de leads para imobiliárias.**

Não tratar como CRM genérico. O diferencial é a fila de plantão com distribuição automática por equipe — algo que planilhas e CRMs genéricos (RD Station, Pipedrive) não fazem.

---

## Decisões já aprovadas — não reabrir

| Decisão | Status |
|---------|--------|
| Foco: captura, registro e distribuição de leads | Aprovado |
| Distribuição automática é o núcleo do produto | Aprovado |
| Cadastro manual existe como fallback operacional | Aprovado |
| Origem do lead é obrigatória em toda entrada | Aprovado |
| Deduplicação por telefone (janela 24h) é obrigatória | Aprovado |
| Roteamento MVP: `equipe_id` no payload → direto; sem → rodízio entre equipes ativas | Aprovado |
| Distribuição MVP: round-robin com fairness por `ultimo_lead_recebido_em` | Aprovado |
| Separar `ativo` de `em_plantao` nos corretores | Aprovado |
| `historico_leads` obrigatório desde a primeira operação de escrita | Aprovado |
| SLA visual (30 min amarelo / 2h vermelho) faz parte do MVP | Aprovado |
| Google Sheets não é núcleo do MVP | Aprovado |
| Webhook (`POST /api/leads`) é canal ideal para Meta Ads | Aprovado |
| Deploy Vercel: resolvido. Root Directory: resolvido. Mock-data vs Supabase: resolvido. | Encerrado |

Não reabrir nenhuma dessas discussões salvo nova evidência concreta (não suposição).

---

## Ordem de prioridade de implementação

1. Captura de leads (formulário + webhook)
2. Deduplicação por telefone
3. Roteamento para equipe
4. Distribuição automática para corretor
5. Histórico do lead
6. Pipeline funcional (mover status)
7. SLA visual
8. Ranking e métricas
9. Integrações externas (Meta Ads nativo, WhatsApp)

---

## Regras de execução obrigatórias

**Antes de implementar:**
- Planejar: listar o que será feito, em que ordem, quais arquivos serão tocados
- Para alterações no banco: listar cada migration antes de aplicar
- Para alterações na UI: descrever o fluxo antes de escrever código

**Durante a implementação:**
- Nunca fazer implementação ampla em uma única etapa
- Dividir em fases pequenas e verificáveis
- Nunca alterar `schema.sql` sem confirmação explícita do usuário
- Nunca alterar `package.json` sem confirmação explícita do usuário
- Nunca fazer push sem confirmação explícita do usuário

**Depois de alterar:**
- Rodar `npm run build` e confirmar que passou
- Reportar arquivos alterados, resultado do build e git status

**Para tarefas de análise/auditoria:**
- Sempre salvar relatório em `docs/auditorias/` com nome de fase
- Nunca só responder no chat quando o resultado deve ser permanente

---

## Documentos de referência obrigatória

Consultar antes de implementar qualquer funcionalidade:

| Documento | Quando consultar |
|-----------|-----------------|
| `docs/DECISOES-ARQUITETURA.md` | Antes de qualquer decisão técnica |
| `docs/PROXIMAS-FASES.md` | Para saber o escopo da fase atual |
| `docs/auditorias/fase-3-1c-regras-roteamento.md` | Antes de implementar roteamento |
| `docs/auditorias/fase-3-arquitetura-distribuicao.md` | Antes de implementar distribuição |
| `docs/auditorias/fase-3-1d-jornada-real-lead.md` | Antes de implementar entrada de leads |
| `supabase/schema.sql` | Antes de propor qualquer migration |

---

## Estado atual do projeto (2026-06-19)

- Auditorias estratégicas (Fases 1–3.1-D): **concluídas**
- App publicado na Vercel com Supabase conectado: **funcionando**
- Leitura de dados reais: **funcionando**
- Operações de escrita: **não implementadas**
- Próxima fase: **Fase 4 — Planejamento técnico da captura e distribuição**

---

## Checklist de início de tarefa

Antes de começar qualquer tarefa de implementação, confirmar:

- [ ] Li `docs/DECISOES-ARQUITETURA.md`
- [ ] Li o documento de auditoria relevante para a tarefa
- [ ] Sei quais arquivos serão tocados
- [ ] Tenho aprovação do usuário para alterar código
- [ ] Tenho aprovação para migrations (se aplicável)
- [ ] Sei o critério de conclusão da tarefa
