# Fase 3.95 — Skill Operacional do Claude
**Data:** 2026-06-19  
**Status:** Concluído  
**Metodologia:** Criação de documentação de orientação permanente. Nenhum código alterado. Nenhuma migration criada.

---

## Objetivo

Criar uma orientação permanente para o Claude trabalhar no Lead Master IA sem reabrir decisões já encerradas e sem perder contexto entre sessões.

---

## Problema que esta fase resolve

Entre sessões, o Claude pode:

- Reabrir discussões sobre Vercel 404 (resolvido), Root Directory (resolvido) ou mock-data (resolvido)
- Tratar o produto como CRM genérico em vez de distribuidor de leads
- Implementar features fora da ordem de prioridade aprovada
- Fazer alterações amplas sem planejamento prévio
- Esquecer de rodar build ou reportar status após alterar arquivos

A skill centraliza as decisões aprovadas e as regras de execução em um único arquivo invocável, mantendo consistência entre sessões.

---

## O que foi criado

### `.claude/commands/lead-master-product-architect.md`

Skill registrada como slash command local do projeto. Disponível via `/lead-master-product-architect`.

Contém:

| Seção | Conteúdo |
|-------|----------|
| Identidade do projeto | Definição como distribuidor inteligente, não CRM |
| Decisões já aprovadas | 12 decisões encerradas com status explícito |
| Ordem de prioridade | 9 itens priorizados para implementação |
| Regras de execução | Antes / durante / depois de implementar |
| Documentos de referência | 6 documentos com quando consultar cada um |
| Estado atual | Snapshot do projeto em 2026-06-19 |
| Checklist de início de tarefa | 6 itens de verificação antes de começar |

---

## Como funciona a skill

Em Claude Code, arquivos `.md` em `.claude/commands/` são registrados como slash commands locais do projeto.

- **Invocação:** `/lead-master-product-architect` ou `/project:lead-master-product-architect`
- **Escopo:** projeto (disponível apenas neste repositório)
- **Persistência:** o arquivo é versionado no git — a skill está disponível para qualquer instância do Claude Code que abrir este repositório

A skill não substitui o `CLAUDE.md` — eles têm papéis complementares:

| Arquivo | Papel |
|---------|-------|
| `CLAUDE.md` | Carregado automaticamente em toda sessão; guia estrutural |
| `.claude/commands/lead-master-product-architect.md` | Invocado manualmente antes de tarefas; guia operacional detalhado |

---

## Arquivos alterados

| Arquivo | Tipo de alteração |
|---------|------------------|
| `.claude/commands/lead-master-product-architect.md` | Criado |
| `CLAUDE.md` | Atualizado — adicionada referência à skill na seção Commands |
| `docs/auditorias/fase-3-95-skill-operacional-claude.md` | Criado (este arquivo) |

---

## Resultado do build

```
✓ Compiled successfully
✓ Generating static pages (9/9)
```

Build passou sem erros. Nenhum arquivo de aplicação foi alterado.

---

## Decisões tomadas nesta fase

**Por que `.claude/commands/` e não `CLAUDE.md` diretamente?**

O `CLAUDE.md` já contém as informações estruturais do projeto. Adicionar toda a orientação operacional nele tornaria o arquivo muito longo e difícil de manter. O modelo de slash command permite invocar a orientação completa quando necessário, sem poluir o contexto automático de toda sessão.

**Por que não usar `skills-lock.json`?**

O `skills-lock.json` registra skills externas hospedadas no GitHub. A skill operacional deste projeto é local e específica — não faz sentido publicá-la externamente. O mecanismo de commands locais é o mais adequado.

---

## Estado após esta fase

| Item | Status |
|------|--------|
| Auditorias estratégicas (Fases 1–3.1-D) | Concluídas |
| Documentação de decisões (`docs/DECISOES-ARQUITETURA.md`) | Criada |
| Roadmap de implementação (`docs/PROXIMAS-FASES.md`) | Criado |
| Skill operacional | Ativa |
| `CLAUDE.md` atualizado | Sim |
| Próxima fase | Fase 4 — Planejamento técnico da captura e distribuição |
