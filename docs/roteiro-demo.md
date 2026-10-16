# Roteiro de Demo Comercial — Lead Master IA
**Duração:** 12 a 15 minutos  
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

**O que mostrar:** fila de entrada (leads sem corretor, quando houver), botão "Distribuir fila" e tabela completa com leads já no pipeline.

**O que falar:**

> "Aqui está a fila de entrada. Quando o lead chega e não há corretor de plantão na equipe, ele espera aqui. Assim que alguém entra de plantão, a fila é distribuída. O gestor também pode distribuir a fila na hora com este botão, ou atribuir um lead a um corretor específico."

**O que NÃO falar:** não prometer notificação por WhatsApp (só e-mail ao corretor).

---

### Tela 2B — Plantão e fila (`/corretores`)

**O que mostrar:** a chave de plantão dos corretores. Desligar o plantão de todos os corretores de uma equipe, cadastrar um lead para essa equipe (fica na fila em `/leads`), depois ligar o plantão de um corretor e voltar a `/leads`.

**O que falar:**

> "O gestor liga e desliga o plantão aqui, direto pelo sistema. Vou deixar todo mundo da equipe fora do plantão e cadastrar um lead: ele fica na fila, sem corretor. Agora ligo o plantão deste corretor... a fila é distribuída sozinha para ele. O gestor não precisou distribuir nada."

**Atenção:** gestor só controla a própria equipe; o admin controla todas. Ensaiar antes e usar uma equipe de demonstração.

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

### Tela 4B — Lead da Meta ao vivo (ferramenta de teste)

**O que mostrar:** na ferramenta de leads de teste da Meta, enviar um lead com nome e telefone fictícios. Em `/leads` (ou `/pipeline`) ele aparece, já distribuído a um corretor, com origem Facebook/Instagram.

**O que falar:**

> "Agora o caminho real. Este é o formulário de anúncio da Meta; vou enviar um lead de teste... Em alguns segundos ele aparece aqui, já na equipe certa e já com o corretor de plantão. Ninguém copiou nem colou nada."

**O que NÃO falar:** não dizer que é "um clique": a conexão exige configuração inicial na Meta (feita uma vez). Não prometer WhatsApp.

**Plano B:** se a Meta não colaborar (teste não dispara, atraso, instabilidade), não insistir por mais de 1 minuto. Cadastre o lead manualmente pelo "Novo lead" (origem Instagram) e diga: "Quando o lead vem da Meta, o resultado é exatamente este. Vou mostrar o registro de um lead que já chegou por lá." Em seguida mostre a página de um lead de origem Meta já existente (histórico e anúncio) e a tela de Integrações com os eventos processados.

---

### Tela 4C — Página do lead (`/leads/[id]`)

**O que mostrar:** abrir o lead (pela lista). Linha do tempo com criação, distribuição e mudanças de status; dados de origem (anúncio e campanha, quando vieram da Meta); respostas do formulário.

**O que falar:**

> "Cada lead tem sua página com o histórico completo: quando entrou, de qual anúncio e campanha veio, para quem foi distribuído e o que aconteceu depois. Se o mesmo cliente chamar de novo, a nova entrada também fica registrada aqui, em vez de criar um lead repetido."

**O que NÃO falar:** o lead de teste da Meta pode não trazer nome de anúncio e campanha; não prometer o mesmo detalhe em testes.

---

### Tela 4D — Integrações (`/integracoes`, só admin)

**O que mostrar:** estado das variáveis (configurado/pendente), vínculos Página/formulário com a equipe, lista dos últimos eventos com status.

**O que falar:**

> "Aqui o gestor-administrador acompanha a ligação com a Meta: cada Página e formulário aponta para uma equipe, e cada lead recebido aparece como evento. Se algo falha, o sistema tenta de novo sozinho e avisa por e-mail, e o evento com erro pode ser reprocessado com um clique."

**O que NÃO falar:** não mostrar valores de tokens (a tela não os exibe); não abrir a tela se houver eventos de erro antigos sem explicação.

---

### Tela 5 — Ranking (`/ranking`)

**O que mostrar:** ranking de corretores por VGV, filtro por equipe (Genesis / Arkanjos).

**O que falar:**

> "E aqui o ranking de produção. Quem fechou mais, quanto em VGV. Pode filtrar por equipe. Isso é o que motiva corretor — ver o próprio nome subindo."

**O que NÃO falar:** não prometer que o ranking mostra leads ativos ou conversão por canal — mostra apenas vendas fechadas registradas.

---

## Perguntas frequentes — como responder

---

**"E esse botão Distribuir fila, para que serve?"**

> "Quando o lead entra e ninguém está de plantão, ele espera na fila. A fila é distribuída automaticamente quando um corretor entra de plantão, e o gestor pode distribuir na hora com esse botão. Também dá para atribuir um lead a um corretor específico."

---

**"Vocês têm integração com WhatsApp?"**

> "Ainda não nativamente. O que temos hoje é o webhook: qualquer formulário externo, anúncio ou ferramenta que consiga fazer uma chamada HTTP pode jogar o lead aqui direto. WhatsApp como canal de notificação para o corretor é algo que está no roadmap, mas não está disponível hoje."

---

**"E Meta Ads, integra automaticamente?"**

> "Sim, com os formulários de lead do Facebook e Instagram. Depois de uma configuração inicial, feita uma vez, cada lead entra sozinho, vai para a equipe vinculada ao formulário e é distribuído. Se um aviso da Meta se perder, uma rotina busca os leads das últimas horas. A configuração depende da conta da Meta da imobiliária."

---

**"Funciona para mais de uma imobiliária? Posso usar para a minha rede?"**

> "Hoje o sistema opera com uma imobiliária por vez. Suporte a múltiplas imobiliárias está no roadmap. Se for esse o caso, a gente conversa sobre como estruturar isso."

---

**"Quanto custa?"**

> "Ainda estamos validando o modelo comercial. O que posso dizer é que o produto está rodando em produção e a estrutura de custo de infraestrutura é baixa. Vamos agendar uma conversa específica sobre isso?"

---

**"Posso ver o histórico de alterações de um lead?"**

> "Sim. Abrindo o lead você vê a linha do tempo: criação, distribuição, mudanças de status e novas entradas do mesmo cliente, cada uma com data e hora."

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
- [ ] Ensaiar o plantão: desligar/ligar um corretor e ver a fila ser distribuída
- [ ] Meta: enviar um lead de teste antes da reunião e conferir em `/integracoes` o status Processado
- [ ] Deixar a ferramenta de leads de teste da Meta aberta e logada, formulário já escolhido
- [ ] Abrir `/integracoes` e conferir variáveis configuradas e vínculo da Página com a equipe
- [ ] Ter à mão um lead de origem Meta já existente (plano B)
- [ ] Corretores de demonstração em plantão antes do lead ao vivo
- [ ] Confirmar que o último deploy da Vercel está na branch `main` (com as migrations 009 a 011 aplicadas)
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
| Pediu para ver o histórico de leads ou auditoria (página do lead) | Pensa em adotar operacionalmente |
| Perguntou como conectar ao Meta Ads ou CRM atual | Está pensando na integração real |
| Pediu um teste com os próprios dados | Quer validar antes de decidir |
| Mencionou um problema específico que o produto resolve | Reconheceu fit com a dor |
| Pediu uma segunda reunião com outro decisor presente | Está levando internamente |

Se nenhum desses ocorrer, o prospect está apenas curioso — não avançar no funil ainda.
