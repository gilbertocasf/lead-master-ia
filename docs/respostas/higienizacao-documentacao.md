# Higienização da pasta docs/respostas

Data: 2026-06-24

Objetivo: classificar cada arquivo em `docs/respostas/` segundo critérios de utilidade para desenvolvimento futuro.

Legenda: **Manter** = documento útil e de referência técnica; **Arquivar** = manter registro, não usado ativamente; **Remover** = log/artefato operacional, temporário ou redundante.

- `2026-06-22-components-pipeline-StatusDropdown.md`: **Arquivar** — snapshot de código já presente em `components/pipeline/StatusDropdown.tsx`; útil como referência pontual, mas redundante no repo.
- `2026-06-22-git-log.md`: **Remover** — log operacional curto (output do `git log`); não é documento de projeto.
- `2026-06-22-git-status-2.md`: **Remover** — saída do `git status` com lista de arquivos; artefato operacional.
- `2026-06-22-git-status.md`: **Remover** — idem — log operacional temporário.
- `2026-06-22-grep-StatusDropdown.md`: **Remover** — resultado de comando `grep` (diagnóstico rápido); não documentacional.
- `2026-06-22-ls-app-api-leads.md`: **Remover** — saída de `ls` (artefato de sessão), sem valor futuro.
- `2026-06-22-ls-components-pipeline-2.md`: **Remover** — saída de `ls` redundante.
- `2026-06-22-ls-components-pipeline.md`: **Remover** — saída de `ls` redundante.
- `2026-06-22-migration-004-diagnostico.md`: **Manter** — diagnóstico e SQL da migration 004; documento operacional útil para aplicação segura e troubleshooting.
- `auditoria-dados-operacionais-atuais.md`: **Manter** — auditoria detalhada de dados operacionais (útil para decisões de substituição/limpeza).
- `auditoria-estado-real-banco-basilio.md`: **Manter** — queries de inspeção e orientação; referência essencial antes de rodar SQL em produção.
- `auditoria-estrutura-real-tabelas-parte-2.md`: **Manter** — documentação de schema e semântica de colunas (útil para devs e DBAs).
- `auditoria-estrutura-real-tabelas.md`: **Manter** — visão global da estrutura e RLS; conservar.
- `auditoria-final-estado-real-banco-basilio.md`: **Manter** — resumo final e checklist pré-demo; alto valor operacional e histórico.
- `auditoria-impacto-substituicao-corretores.md`: **Manter** — análise de impacto em FK/constraints; importante para migrações seguras.
- `auditoria-preparacao-demo-basilio-imoveis.md`: **Manter** — plano de substituição e riscos; documento estratégico e operacional.
- `correcao-server-actions-codespaces.md`: **Manter** — solução aplicada para Codespaces; documento técnico útil para desenvolvimento em devcontainers.
- `fase-9-auditoria-transicao.md`: **Manter** — auditoria de transição e lista de bloqueadores; referência importante para Fase 9.
- `fase-9-planejamento-final.md`: **Manter** — roteiro final da Fase 9; manter como referência de aceitação.
- `fase-9-validacao-bloqueadores.md`: **Manter** — análise dos bloqueadores e decisão revisada; valioso para runs operacionais.
- `git-status-2026-06-22c.md`: **Remover** — log operacional (snapshot do git); artefato temporário.
- `git-status-2026-06-22d.md`: **Remover** — log operacional com sugestão de .gitignore; é um checkpoint temporário e gera ruído.
- `git-status-2026-06-22e.md`: **Remover** — log operacional contendo lista de arquivos criados — artefato de sessão.
- `mini-fase-acabamento-pre-demo.md`: **Manter** — plano tático pré-demo; útil e acionável.
- `mini-fase-analise-botao-novo-lead.md`: **Manter** — análise arquitetural e recomendação (decisão de UX); relevante.
- `rm-2026-06-22c.md`: **Remover** — registro de `rm` (operacional) — sem valor histórico importante.
- `sql-final-demo-basilio-imoveis.md`: **Manter** — script SQL completo para preparar demo (documento crítico para operações controladas).
- `sql-substituicao-demo-basilio-imoveis.md`: **Manter** — script SQL seguro e de revisão (útil para execução cuidadosa em produção).

Resumo das ações recomendadas
- Apagar os arquivos marcados como **Remover** do repositório (ou movê-los para um local externo não rastreado). Esses arquivos são logs/artefatos de sessão e poluem o histórico.
- Arquivar (mover para `docs/respostas/arquivadas/` ou compactar) os itens marcados **Arquivar** que são redundantes com o código-fonte (ex.: snapshots de componentes).
- Manter os arquivos marcados **Manter** no diretório `docs/respostas/` — são auditorias, scripts SQL e planejamento valioso para fases futuras.

Observação final
Esta higienização não altera código nem banco de dados — apenas organiza documentação. Recomendo aplicar as remoções e arquivamentos em um commit separado após revisão.
