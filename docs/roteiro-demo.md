# Roteiro de Demo Comercial — Lead Master IA
**Duração:** 10 minutos  
**Público:** Gestor ou sócio de imobiliária  
**Ambiente:** Vercel produção, dados Basílio Imóveis carregados, login feito antes da reunião

---

## Abertura — 30 segundos

> "Toda imobiliária tem o mesmo problema: lead chega fora de hora, ninguém sabe de quem é, o gestor para o que está fazendo para distribuir manualmente e o corretor que deveria receber já atendeu três leads esse dia.
>
> O Lead Master resolve isso. O lead entra — pelo site, pelo formulário, pelo anúncio — e o sistema já distribui para o corretor de plantão automaticamente. Sem o gestor tocar em nada. É isso que vou mostrar agora."

---

## Demonstração por tela

---

### Tela 1 — Dashboard (`/`)

**O que mostrar:** KPIs no topo (leads novos, em contato, propostas, taxa de conversão), funil de pipeline, próximo corretor de plantão.

**O que falar:**

> "Essa é a visão geral da operação. Em uma tela você vê quantos leads estão em cada fase, qual é a taxa de conversão e quem é o próximo corretor que vai receber um lead. O gestor não precisa perguntar para ninguém."

**O que NÃO falar:** não mencionar alertas de inatividade nem relatório de SLA por equipe — não estão implementados.

---

### Tela 2 — Leads (`/leads`)

**O que mostrar:** fila de entrada vazia, tabela completa com leads já no pipeline.

**O que falar:**

> "Aqui está a fila de entrada — está vazia porque todos os leads que entraram já foram distribuídos automaticamente. Quando o lead entra pelo formulário, o sistema já atribui um corretor na hora. Vou mostrar."

**O que NÃO falar:** não explicar o botão "Distribuir" por iniciativa. Se o prospect perguntar, ver seção "Perguntas frequentes".

---

### Tela 3 — Cadastro de lead (modal "Novo lead")

**O que mostrar:** clicar em "Novo lead", preencher nome, telefone, origem (Instagram), equipe (Genesis), clicar "Cadastrar lead".

**O que falar:**

> "Vou cadastrar um lead agora. Nome, telefone, de onde veio — Instagram, Facebook, indicação — e a equipe. Clico em cadastrar."
>
> *(aguardar o modal fechar e a tela atualizar)*
>
> "Pronto. O sistema já atribuiu para um corretor. Não precisei clicar em nada de distribuição. O algoritmo escolhe o corretor de plantão que está há mais tempo sem receber lead — para ser justo com todo mundo."

**O que NÃO falar:** não mencionar webhook neste momento a menos que o prospect pergunte.

---

### Tela 4 — Pipeline (`/pipeline`)

**O que mostrar:** o lead recém-criado na coluna "Novo" com o nome do corretor atribuído e o badge SLA verde. Demonstrar a mudança de status pelo dropdown para "Em contato".

**O que falar:**

> "Aqui está o lead que acabamos de criar — já na coluna 'Novo', já com o nome do corretor. E esse indicador verde é o SLA: ele fica verde por 30 minutos, amarelo até 2 horas, vermelho depois disso. O gestor vê em tempo real quem está deixando lead parado."
>
> *(abrir o dropdown de status)*
>
> "O corretor move o lead pelo pipeline assim. Cada mudança fica registrada no histórico."

**O que NÃO falar:** não prometer drag-and-drop — ainda não implementado. Não prometer que o badge atualiza sem recarregar a página.

---

### Tela 5 — Ranking (`/ranking`)

**O que mostrar:** ranking de corretores por VGV, filtro por equipe (Genesis / Arkanjos).

**O que falar:**

> "E aqui o ranking de produção. Quem fechou mais, quanto em VGV. Pode filtrar por equipe. Isso é o que motiva corretor — ver o próprio nome subindo."

**O que NÃO falar:** não prometer que o ranking mostra leads ativos ou conversão por canal — mostra apenas vendas fechadas registradas.

---

## Perguntas frequentes — como responder

---

**"E esse botão Distribuir na fila de leads, para que serve?"**

> "É um fallback. Se por algum motivo o lead entrou quando nenhum corretor estava de plantão, o gestor pode distribuir manualmente depois. No fluxo normal, quando há corretor disponível, a distribuição já acontece no momento do cadastro — sem precisar clicar nisso."

---

**"Vocês têm integração com WhatsApp?"**

> "Ainda não nativamente. O que temos hoje é o webhook: qualquer formulário externo, anúncio ou ferramenta que consiga fazer uma chamada HTTP pode jogar o lead aqui direto. WhatsApp como canal de notificação para o corretor é algo que está no roadmap, mas não está disponível hoje."

---

**"E Meta Ads, integra automaticamente?"**

> "O Meta Ads pode ser conectado via webhook — o lead que vem do formulário de lead do Meta pode cair aqui automaticamente com uma configuração simples. Não é um clique, mas é configurável. Posso mostrar como funciona tecnicamente se quiser aprofundar."

---

**"Funciona para mais de uma imobiliária? Posso usar para a minha rede?"**

> "Hoje o sistema opera com uma imobiliária por vez. Suporte a múltiplas imobiliárias está no roadmap. Se for esse o caso, a gente conversa sobre como estruturar isso."

---

**"Quanto custa?"**

> "Ainda estamos validando o modelo comercial. O que posso dizer é que o produto está rodando em produção e a estrutura de custo de infraestrutura é baixa. Vamos agendar uma conversa específica sobre isso?"

---

**"Posso ver o histórico de alterações de um lead?"**

> "Sim. Cada evento — criação, distribuição, mudança de status — fica registrado com timestamp. Hoje esse histórico está no banco; a tela de visualização por lead está no roadmap próximo."

---

## Checklist antes da demo

Executar no mínimo 5 minutos antes da reunião:

- [ ] Fazer login no app em produção (sessão expira em 1 hora)
- [ ] Confirmar que a URL é Vercel, não localhost
- [ ] Abrir `/leads` — verificar que a tabela tem leads no pipeline e a fila está limpa
- [ ] Abrir `/pipeline` — verificar que há leads em pelo menos 3 colunas diferentes
- [ ] Abrir `/ranking` — verificar que há corretores com VGV > 0
- [ ] Abrir `/corretores` — confirmar que há corretores listados
- [ ] Testar o modal "Novo lead" uma vez antes (criar e apagar se necessário)
- [ ] Confirmar que o último deploy da Vercel está na branch `main`
- [ ] Fechar abas desnecessárias — deixar apenas o app aberto

---

## Checklist depois da demo

- [ ] Registrar nome e cargo do prospect
- [ ] Anotar perguntas que geraram mais interesse
- [ ] Anotar objeções levantadas
- [ ] Definir próximo passo com data: nova reunião, proposta, teste com dados reais?
- [ ] Limpar o lead criado durante a demo (opcional — não polui a demo se ficar)

---

## Critério de interesse real

O prospect demonstrou interesse real se ao menos **dois** dos seguintes ocorrerem:

| Sinal | O que significa |
|-------|----------------|
| Perguntou sobre preço ou modelo comercial | Está avaliando viabilidade |
| Pediu para ver o histórico de leads ou auditoria | Pensa em adotar operacionalmente |
| Perguntou como conectar ao Meta Ads ou CRM atual | Está pensando na integração real |
| Pediu um teste com os próprios dados | Quer validar antes de decidir |
| Mencionou um problema específico que o produto resolve | Reconheceu fit com a dor |
| Pediu uma segunda reunião com outro decisor presente | Está levando internamente |

Se nenhum desses ocorrer, o prospect está apenas curioso — não avançar no funil ainda.
