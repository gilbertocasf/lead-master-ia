# Configurar a integração com a Meta (Facebook e Instagram Lead Ads)

Guia para o dono do sistema. Ao final, todo lead que preencher um formulário de anúncio
da Meta entra no Lead Master IA, vai para a equipe certa e é distribuído ao corretor de plantão.

Como funciona, em resumo: a Meta avisa o sistema (webhook) que chegou um lead; o sistema
usa o token para ler os dados do lead na Meta, cria o lead e distribui. Se o aviso se perder,
uma rotina agendada (cron) busca de novo os leads das últimas 3 horas.

Os nomes de menus da Meta mudam com frequência. Os passos abaixo descrevem o objetivo de
cada etapa; se um menu tiver outro nome, procure pela função descrita.

---

## 1. Pré-requisitos

- As migrations 009, 010 e 011 aplicadas no Supabase (`docs/setup/aplicar-migrations-009-011.md`).
- Este branch publicado na Vercel (a integração só existe depois do deploy).
- Uma Página do Facebook da imobiliária, usada nos anúncios de formulário (Lead Ads).
- Um Gerenciador de Negócios (Meta Business) com a Página e a conta de anúncios.
- Uma pessoa com acesso de administrador no Gerenciador de Negócios e com tarefa **Anunciar**
  na Página.
- Acesso de administrador ao Lead Master IA e acesso à Vercel.
- Opcional, mas recomendado: `RESEND_API_KEY` e `EMAIL_FROM` já configurados, para receber alertas.

---

## 2. Variáveis de ambiente na Vercel

Vercel > seu projeto > Settings > Environment Variables. Marque o ambiente Production.
Depois de salvar, faça um **novo deploy** (variáveis só valem para deploys novos).

| Nome | Para que serve | Onde obter |
| --- | --- | --- |
| `META_APP_SECRET` | Confere a assinatura dos avisos da Meta (recusa avisos falsos) | Painel de desenvolvedores da Meta > seu app > Configurações > Básico > Chave secreta do app |
| `META_VERIFY_TOKEN` | Senha combinada com a Meta quando você cadastra o webhook | Você inventa (veja abaixo) |
| `META_ACCESS_TOKEN` | Permite ao sistema ler os dados do lead | Token de Usuário do Sistema (passo 5) |
| `META_GRAPH_VERSION` | Versão da API da Meta. Opcional; padrão `v25.0` | Deixe vazio, salvo orientação contrária |
| `CRON_SECRET` | Protege a rotina `/api/cron/meta` | Você inventa (veja abaixo) |
| `ALERTA_EMAILS` | E-mails que recebem alertas (token vencido, lead sem equipe...), separados por vírgula | Seus e-mails |

Como gerar `META_VERIFY_TOKEN` e `CRON_SECRET`: qualquer texto aleatório longo (40 caracteres
ou mais, só letras e números). Duas formas:

- Terminal: `openssl rand -hex 32`
- Sem terminal: use um gerador de senhas e peça 40 caracteres. Gere um valor diferente para cada.

Guarde os dois: o `META_VERIFY_TOKEN` será digitado também no painel da Meta.

Sem `META_APP_SECRET` o webhook responde 503 de propósito (nunca aceita avisos sem assinatura).
A rotina de cron também responde 503 sem `CRON_SECRET`; por isso a tela `/integracoes` o lista como obrigatório.

---

## 3. Criar o app na Meta

1. Entre no painel de desenvolvedores da Meta (developers.facebook.com) com a conta que administra o Gerenciador de Negócios.
2. Crie um app (tipo Negócios/Empresa) e **vincule-o ao Gerenciador de Negócios** da imobiliária.
3. Copie a Chave secreta do app (Configurações > Básico) para `META_APP_SECRET`.
4. Adicione ao app o produto **Webhooks**.

Permissões que o app precisa usar: `leads_retrieval`, `pages_manage_metadata`,
`pages_show_list`, `pages_read_engagement`, `ads_management`. Para acesso a todos os dados
também pode ser necessária `pages_manage_ads`.

**Acesso padrão x avançado (importante):**
- Com **Acesso Padrão**, o app só recebe leads de Páginas/anúncios de pessoas que têm função no app
  (administrador, desenvolvedor ou testador). Serve para testar e, se a Página é do próprio dono, pode já bastar.
  Adicione na aba de funções do app quem administra a Página.
- **Acesso Avançado** exige **Análise do App** e **Verificação da Empresa** na Meta. Só é necessário
  se o app for receber leads de Páginas de terceiros (outros clientes). A análise leva dias: comece cedo.
- O app precisa estar em modo **Publicado/Ativo** para receber avisos de leads reais; em modo de
  desenvolvimento chegam apenas avisos de teste.

---

## 4. Configurar o webhook

1. Abra `/integracoes` no Lead Master IA e copie a **URL do webhook** (termina em `/api/webhooks/meta`).
2. No app da Meta, em Webhooks, escolha o objeto **Page**.
3. Cadastre a URL de callback (HTTPS) e, em "Verificar token", cole o mesmo valor de `META_VERIFY_TOKEN`.
4. Clique em verificar e salvar. A Meta chama a URL e o sistema responde. Se falhar: confirme que as variáveis
   estão na Vercel **e que houve um deploy novo depois de salvá-las**.
5. Assine (inscreva) o campo **leadgen** do objeto Page.

---

## 5. Gerar o token de acesso

Recomendado: token de **Usuário do Sistema**, que não depende de uma pessoa.

1. No Gerenciador de Negócios, vá à área de Usuários do sistema e crie um usuário do sistema
   (função de administrador).
2. Atribua a ele, como ativos: o **app** (controle total) e a **Página** (com a tarefa Anunciar/gerenciar leads).
3. Gere o token para o app, marcando as permissões `leads_retrieval`, `pages_show_list`, `pages_read_engagement`,
   `pages_manage_metadata` e `ads_management`. Escolha **sem expiração** se a opção existir; senão a de 60 dias
   (e anote a data para renovar).
4. Copie o token para `META_ACCESS_TOKEN` na Vercel e faça novo deploy.

Trate o token como senha: não envie por e-mail ou chat, não salve em arquivos do repositório.

---

## 6. Instalar o app na Página

A Meta só envia avisos de uma Página depois que o app é instalado nela (assinatura do campo `leadgen`).
Isso é feito por uma chamada à API, com o token **da Página** (não o do usuário do sistema), de alguém
com a tarefa **Anunciar** nela.

1. Obtenha o token da Página: pela Ferramenta de Explorador da Graph API, escolha seu app, gere um token de
   usuário com `pages_manage_metadata` e `pages_show_list` e consulte `GET /me/accounts`. A resposta lista cada
   Página com seu `id` e seu `access_token`.
2. Instale o app na Página:

```bash
curl -X POST "https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps" \
  -d "subscribed_fields=leadgen" \
  -d "access_token=<TOKEN_DA_PAGINA>"
```

Resposta esperada: `{"success":true}`. Para conferir depois:

```bash
curl "https://graph.facebook.com/v25.0/<PAGE_ID>/subscribed_apps?access_token=<TOKEN_DA_PAGINA>"
```

3. Se a Meta pedir, libere o app no **Gerenciamento de Acesso a Leads** da Página/Gerenciador de Negócios
   (nome aproximado: configuração de integrações de CRM/acesso a leads). Sem isso, a leitura do lead pode ser negada.

---

## 7. Cadastrar a Página e os formulários em /integracoes

Sem este cadastro o sistema não sabe de qual imobiliária é o lead nem para qual equipe mandá-lo.

**Quem cadastra a Página:** o primeiro cadastro de uma Página nova (um `page_id` que ainda não está
ligado a nenhuma imobiliária) é feito **pelo operador do Lead Master**, logado com um e-mail que esteja
em `INTERNAL_OWNER_EMAILS` na Vercel, dentro da conta da imobiliária. Isso impede que alguém vincule à
própria conta a Página de outra empresa. Se o admin da imobiliária tentar cadastrar uma Página ainda não
liberada, recebe a mensagem "Esta Página ainda não foi liberada para a sua imobiliária". Depois que a
Página está liberada, o próprio admin da imobiliária pode criar e alterar os vínculos de formulário
dessa Página. Uma Página já ligada a outra imobiliária nunca pode ser cadastrada (nem pelo operador).

**Como descobrir o ID da Página (`page_id`):** na Página do Facebook, em Sobre/Transparência da Página
(o número aparece ali), ou na resposta de `GET /me/accounts` do passo 6.

**Como descobrir o ID do formulário (`form_id`):** no Gerenciador de Anúncios/Meta Business Suite, em
Formulários de Lead da Página (o ID aparece na lista/detalhe do formulário), ou pela API:
`GET /<PAGE_ID>/leadgen_forms?access_token=<TOKEN_DA_PAGINA>`.
Outra forma: depois do primeiro lead de teste, o `form_id` aparece na lista de eventos de `/integracoes`.

Em `/integracoes`, preencha o formulário de vínculo:

- **ID da Página** (obrigatório) e, se quiser, o nome.
- **ID do formulário**: deixe vazio para criar a **regra padrão da Página** (vale para qualquer formulário sem regra própria).
  Preencha para mandar aquele formulário para uma equipe específica.
- **Equipe de destino** (obrigatório).

Regra de escolha da equipe: vínculo do formulário > regra padrão da Página > rodízio entre equipes ativas
(com alerta "formulário sem equipe"). Recomendação: sempre crie ao menos a regra padrão.

---

## 8. Agendar a rotina (cron)

A rotina `GET /api/cron/meta` (a) tenta de novo eventos com erro, (b) distribui filas paradas e
(c) busca os leads das últimas 3 horas de cada formulário cadastrado, para recuperar avisos perdidos.
Rode a cada 5 minutos (recomendado). **No mínimo, o agendador precisa rodar a cada 1 a 2 horas:** a
reconciliação olha só as últimas 3 horas, então um intervalo maior deixa leads com aviso perdido fora da
busca (e eles não são recuperados depois). Por isso o cron diário do plano Hobby **não basta** sozinho.
Escolha **uma** das opções.

### Opção A: Vercel Cron (plano Pro)

Crie `vercel.json` na raiz do projeto:

```json
{
  "crons": [
    { "path": "/api/cron/meta", "schedule": "*/5 * * * *" }
  ]
}
```

A Vercel envia sozinha o header `Authorization: Bearer <CRON_SECRET>` quando a variável `CRON_SECRET` existe.

**Atenção:** no plano **Hobby** só é permitido cron com frequência de **no máximo uma vez por dia**.
Um cron mais frequente faz o **deploy falhar**. Por isso este repositório não traz `vercel.json`.
Só adicione o arquivo se o projeto estiver no plano Pro.

### Opção B: agendador externo (qualquer plano)

Use um serviço de agendamento (por exemplo cron-job.org, GitHub Actions agendado ou o cron de um servidor seu)
para chamar a cada 5 minutos (nunca com intervalo maior que 1 a 2 horas):

```bash
curl -fsS -H "Authorization: Bearer <CRON_SECRET>" https://<seu-dominio>/api/cron/meta
```

Resposta 200 com um resumo em JSON = ok. 401 = segredo errado. 503 = `CRON_SECRET` ou migrations ausentes.

---

## 9. Testar com a ferramenta de leads de teste

1. Na Meta, abra a ferramenta de teste de Lead Ads (Ferramentas de Lead Ads / "Lead Ads Testing Tool").
2. Escolha a Página e o formulário, preencha dados fictícios (com um telefone brasileiro válido) e envie.
3. Em até alguns segundos, em `/integracoes`, a lista de eventos deve mostrar o evento com status **Processado**.
4. Abra `/leads`: o lead deve aparecer, com origem Facebook/Instagram, e atribuído ao corretor de plantão
   (ou na fila, se ninguém estiver de plantão).
5. Abra o lead: o histórico mostra a criação e a distribuição.

Dica: antes do teste, ponha ao menos um corretor da equipe de destino em plantão.
Observação: o lead de teste da Meta pode não trazer todos os campos de anúncio (nome da campanha, anúncio).

---

## 10. Se der errado

Primeiro olhe a lista de eventos em `/integracoes`: a coluna de erro mostra o código técnico.
Se nenhum evento apareceu, o problema está antes do sistema (webhook/instalação na Página).

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Meta não consegue verificar a URL | `META_VERIFY_TOKEN` diferente, ausente, ou sem deploy após salvar | Confirme o valor idêntico nos dois lados e refaça o deploy |
| Webhook responde 503 (`meta_nao_configurada`) | `META_APP_SECRET` ausente | Cadastre e faça deploy |
| Webhook responde 401 (`assinatura_invalida`) | `META_APP_SECRET` errado, ou outro app enviando | Copie de novo a chave secreta do app correto |
| Webhook responde 500 (`migration_pendente`) | Migration 010 não aplicada | Aplique as migrations |
| Nenhum evento aparece ao enviar lead de teste | App não instalado na Página, campo `leadgen` não assinado, app em modo desenvolvimento ou sem função | Refaça o passo 6, confira assinatura `leadgen` e funções no app |
| Evento com erro `pagina_nao_cadastrada` | Página não cadastrada em `/integracoes` | Cadastre (passo 7). O sistema tenta de novo sozinho |
| Evento com erro `meta_nao_configurada` | `META_ACCESS_TOKEN` ou `META_APP_SECRET` ausentes | Cadastre na Vercel e faça deploy |
| Erro `graph_token:...` (e e-mail "Token inválido ou expirado") | Token vencido, revogado ou errado | Gere novo token (passo 5), atualize, faça deploy. Os eventos são tentados de novo |
| Erro `graph_permissao:...` | Token sem `leads_retrieval` ou sem acesso à Página; app sem liberação em Acesso a Leads; Acesso Padrão e Página de terceiros | Confira ativos e permissões do Usuário do Sistema e a liberação do app. Depois use Reprocessar |
| Erro `graph_permanente:...` (ex.: código 100/190) | Lead não existe mais, ID inválido, campo recusado | Verifique o lead na Meta; se corrigido, Reprocessar. Não é repetido sozinho |
| Erro `graph_transitorio:...` | Falha de rede ou limite da Meta | Nada; o sistema repete sozinho |
| Erro `sem_telefone` | Formulário não pede telefone ou o número é inválido | Inclua o campo de telefone no formulário. O lead não foi criado; cadastre manualmente se for real |
| Erro `sem_equipe_disponivel` | A imobiliária não tem equipe ativa | Ative uma equipe. Repetido sozinho |
| Erro `migration_pendente` ou `rpc_erro:...` | Migration 011 não aplicada ou erro do banco | Aplique/confira as migrations; use Reprocessar |
| Erro `rpc:imobiliaria_obrigatoria`, `rpc:canal_invalido`, `rpc:criado_por_invalido` | Versão da função no banco diferente do app | Reaplique a migration 011 e use Reprocessar |
| Erro `erro_inesperado` | Falha não prevista | Veja os logs da Vercel (sem dados pessoais) e use Reprocessar |
| Evento "Ignorado" (`pagina_inativa`, `imobiliaria_inativa`) | Página desativada no cadastro ou imobiliária inativa | Reative, se não foi intencional |
| Evento "Duplicado" (`duplicata_telefone_24h`) | Mesmo telefone já cadastrado nas últimas 24 h | Esperado; o histórico do lead existente registra a nova entrada |
| Evento "Processado" com `aviso:formulario_sem_equipe` | Formulário sem vínculo nem regra padrão | Crie o vínculo; o lead foi pelo rodízio |
| Evento "Processado" com `aviso:equipe_roteada_inativa` | Vínculo aponta para equipe inativa | Atualize o vínculo |
| Lead criado mas sem corretor (`aviso:...` e alerta de plantão) | Ninguém em plantão na equipe | Ligue o plantão de alguém: a fila é distribuída |
| Erro esgotado (8 tentativas; e-mail "esgotou as tentativas") | Causa persistente | Corrija a causa e use o botão Reprocessar |
| Cron responde 401 | Segredo errado no agendador | Use `Authorization: Bearer <CRON_SECRET>` |
| Cron responde 503 | `CRON_SECRET` ausente ou migrations pendentes | Configure e faça deploy |
| Deploy da Vercel falha após criar `vercel.json` | Cron mais frequente que diário no plano Hobby | Remova o `vercel.json` e use a Opção B |

Tentativas automáticas: após uma falha temporária o sistema tenta de novo depois de 1, 5, 15, 60, 180, 360 e 720
minutos, até 8 tentativas no total. A Meta também reenvia avisos não confirmados por até 36 horas.

---

## 11. Contingência

Se a integração parar (token vencido, Meta fora do ar, app suspenso):

1. **Nenhum lead se perde na Meta.** Os formulários continuam gravando os leads lá. Baixe-os pela Meta
   (Gerenciador de Anúncios/Business Suite, "Leads" do formulário, exportação CSV) e cadastre-os em **Novo lead** no sistema.
2. Para novos leads durante a pane, cadastre manualmente (origem Facebook/Instagram) para entrarem na distribuição.
3. Quando corrigir a causa, a rotina de reconciliação recupera automaticamente os leads das últimas 3 horas.
   Leads mais antigos que isso não são buscados sozinhos: cadastre manualmente.
4. Cadastro manual de um lead que depois chegue pela Meta: o sistema detecta o telefone repetido (24 h) e registra
   uma reentrada no histórico em vez de duplicar.
5. Em caso de vazamento do token: revogue o token no Gerenciador de Negócios, gere outro e atualize na Vercel.
