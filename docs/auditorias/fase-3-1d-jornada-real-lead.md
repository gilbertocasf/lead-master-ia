# Fase 3.1-D — Jornada Real do Lead
**Data:** 2026-06-19  
**Referências:** [fase-3-1c-regras-roteamento.md](./fase-3-1c-regras-roteamento.md) · [fase-3-1b-revisao-arquitetura.md](./fase-3-1b-revisao-arquitetura.md)  
**Status:** Aguardando aprovação  
**Metodologia:** Mapeamento operacional. Nenhum código alterado. Nenhuma migration criada.

---

## Contexto

As Fases 3, 3.1-B e 3.1-C definiram como distribuir e rotear leads. Este documento responde à pergunta que vem antes de tudo isso: **como um lead nasce e como ele entra no sistema?**

Sem entender a jornada real de entrada, qualquer arquitetura de distribuição começa do ponto errado. O roteamento mais elegante falha se o lead chega incompleto, duplicado, com campo errado, ou — o pior caso brasileiro — chega por WhatsApp pessoal do corretor e nunca entra no CRM.

Este documento mapeia as 7 origens de lead mais comuns em imobiliárias brasileiras e define os dois fluxos operacionais: o que existe hoje (V1) e o que deveria existir (V2).

---

## Parte 1 — As 7 Origens de Lead

---

### Origem 1 — Facebook Lead Ads

**O que são:**  
Anúncios do Facebook/Meta com formulário nativo. O lead preenche nome, telefone e e-mail diretamente na plataforma, sem sair do feed. A imobiliária cria o anúncio no Gerenciador de Anúncios e o formulário é servido pelo próprio Facebook.

---

**Dados que realmente chegam:**

| Campo | Situação |
|-------|----------|
| Nome completo | Sempre — pré-preenchido pela conta do Facebook |
| Telefone | Sempre — pré-preenchido pela conta do Facebook |
| E-mail | Sempre — pré-preenchido pela conta do Facebook |
| Campanha de origem | Sempre — via metadados do Lead Ads |
| Conjunto de anúncios | Sempre — via metadados |
| Anúncio específico | Sempre — via metadados |
| Data/hora do envio | Sempre |
| Empreendimento de interesse | Só se o formulário tiver campo customizado explícito |
| Faixa de renda ou orçamento | Raramente — exige campo customizado e o lead pode abandonar |
| Bairro ou localização preferida | Raramente — mesmo motivo |

**Problema crítico:** O Facebook pré-preenche os campos com os dados da conta do usuário. Isso significa que o telefone pode estar desatualizado, o e-mail pode ser o de recuperação (raramente verificado), e o nome pode ser o apelido do Facebook. A taxa de dados inválidos nesta origem é a mais alta de todas.

---

**Dados que normalmente NÃO chegam:**

- CPF (formulários curtos convertem melhor — adicionar CPF destrói a taxa de conversão)
- Endereço atual do lead
- Tipo de imóvel que busca (a não ser que o anúncio seja segmentado por produto)
- Intenção de compra vs. curiosidade (impossível distinguir sem qualificação)
- Renda comprovável (o lead declara, mas não há verificação)

---

**O que pode ser automatizado:**

- Captura do lead via webhook do Facebook (API de Lead Ads) — o CRM recebe o lead em segundos após o envio do formulário
- Criação automática do registro no CRM com todos os metadados da campanha
- Disparo automático de mensagem de boas-vindas via WhatsApp (dentro da janela de 24h antes do contato esfriar)
- Roteamento automático para equipe com base na campanha (se campanha A → equipe A)
- Deduplicação por telefone ou e-mail antes de criar o registro

**O que depende de intervenção humana:**

- Qualificação real: o lead quer comprar ou apenas "deu uma olhada"?
- Verificação do telefone: é o número que a pessoa usa de fato?
- Coleta de informações adicionais (renda, urgência, situação atual de moradia)
- Decisão sobre qual produto oferecer se o anúncio foi genérico

---

**Experiência ideal para o gestor:**

- Visualizar em tempo real quantos leads chegaram por campanha
- Saber qual campanha está gerando leads de melhor qualidade (taxa de contato, visita, fechamento)
- Pausar campanhas que geram leads que nunca convertem
- Ver custo por lead e custo por venda por campanha

**Experiência ideal para o corretor:**

- Ser notificado imediatamente quando um lead é atribuído (push, WhatsApp, app)
- Ver de qual anúncio veio o lead (contexto para a primeira conversa)
- Ter um botão único de "ligar agora" ou "abrir WhatsApp" sem precisar copiar número
- Registrar o resultado do primeiro contato em menos de 30 segundos

---

### Origem 2 — Instagram

**O que são:**  
Leads provenientes de anúncios no Instagram (Feed, Stories, Reels) com formulário nativo (via Meta Lead Ads), ou via DM (mensagem direta), ou via bio com link para landing page.

---

**Dados que realmente chegam:**

| Campo | Situação |
|-------|----------|
| Nome e telefone | Se formulário nativo: mesmo comportamento do Facebook Lead Ads |
| Mensagem de DM | Se contato por DM: texto livre, sem estrutura |
| @ do perfil | Disponível nos metadados se a pessoa interagiu via DM em conta conectada ao Meta Business Suite |
| Campanha/anúncio de origem | Disponível se formulário nativo |

**Diferença crítica do Facebook:** Uma parcela relevante dos leads do Instagram chega via DM — a pessoa manda "oi, vi o apartamento, tenho interesse". Isso **não é capturado automaticamente** por nenhum CRM sem integração específica. O corretor vê na DM do Instagram da imobiliária e muitas vezes responde de lá, sem nunca cadastrar no CRM.

---

**Dados que normalmente NÃO chegam:**

- Tudo que não chegaria no Facebook Lead Ads, mais:
- Contexto da DM (o lead disse qual produto quer, mas isso fica preso no Direct)
- Histórico de interações com o perfil (curtidas, salvamentos de posts)

---

**O que pode ser automatizado:**

- Se formulário nativo: igual ao Facebook — webhook captura e cria o lead
- Se DM: resposta automática inicial ("Olá! Recebi sua mensagem. Nossa equipe vai entrar em contato em instantes.") — mas o lead em si precisa ser digitado manualmente depois
- Com integração de inbox unificado (ex.: Kommo, RD Station, Zenvia): a DM pode virar um lead automaticamente, capturando o @ e o texto

**O que depende de intervenção humana:**

- Identificação do telefone real (o @ do Instagram não é o suficiente para contato)
- Cadastro manual se o lead veio por DM sem integração
- Qualificação do interesse

---

**Experiência ideal para o gestor:**

- Ver leads de DM e de formulário no mesmo painel
- Saber quais posts orgânicos estão gerando leads (não apenas anúncios pagos)
- Evitar que leads de DM morram na caixa de mensagens do Instagram sem nunca entrar no CRM

**Experiência ideal para o corretor:**

- Receber o lead com o contexto da DM (o que a pessoa perguntou)
- Poder responder via WhatsApp em vez de precisar ficar no DM do Instagram
- Não ter que cadastrar manualmente o que a pessoa disse no Direct

---

### Origem 3 — WhatsApp

**O que são:**  
Leads que entram em contato via WhatsApp — seja pelo número da imobiliária, pelo número do corretor, via link de clique em anúncio ("Clique para conversar no WhatsApp"), ou via botão de WhatsApp em portais e landing pages.

Esta é a origem mais complexa e mais crítica da realidade brasileira. É onde mais leads se perdem.

---

**Dados que realmente chegam:**

| Campo | Situação |
|-------|----------|
| Número de telefone (WhatsApp) | Sempre — é o identificador do contato |
| Nome salvo no celular | Às vezes — só se o corretor tiver o contato salvo |
| Texto da primeira mensagem | Sempre — mas é texto livre, sem estrutura |
| Data/hora | Sempre |
| Link de origem | Só se o lead clicou em um link UTM rastreado |

---

**Dados que normalmente NÃO chegam:**

- Nome completo (o lead pode assinar como "João", "João da Silva" ou nada)
- E-mail (raramente fornecido espontaneamente no WhatsApp)
- Qual produto de interesse (muitas vezes a mensagem é só "oi")
- Origem da campanha (a não ser que o link de entrada fosse rastreado)

**O maior problema do WhatsApp brasileiro:**  
O lead entra no WhatsApp pessoal do corretor, não no número da imobiliária. O corretor atende, negocia, e — se não vender — o lead some junto com o celular do corretor. O CRM nunca soube que aquele lead existiu. Quando o corretor sai da empresa, a imobiliária perde o histórico de todos os leads que passaram pelo WhatsApp pessoal dele.

---

**O que pode ser automatizado:**

- Com WhatsApp Business API (via BSP como Zenvia, Twilio, etc.): captura automática de todo contato que inicia conversa no número oficial
- Resposta automática de boas-vindas e menu de opções ("1 - Apartamentos / 2 - Casas / 3 - Comercial")
- Coleta progressiva de dados via fluxo de conversa (bot simples: "Qual seu nome?" → "Qual seu telefone para contato?" → cria o lead no CRM)
- Integração com CRM para criar o lead automaticamente com número e primeira mensagem

**O que depende de intervenção humana:**

- Qualificação real do interesse (bot não consegue qualificar intenção de compra)
- Confirmação de dados (o número do WhatsApp pode ser diferente do número de ligação)
- Decisão de qual produto apresentar
- Toda e qualquer conversa que aconteça no WhatsApp pessoal do corretor

---

**Experiência ideal para o gestor:**

- Zero leads no WhatsApp pessoal de corretor — tudo no número oficial rastreável
- Relatório de leads que entram pelo WhatsApp vs. leads que efetivamente entram no CRM
- Alertas de leads que ficaram sem resposta por mais de X horas

**Experiência ideal para o corretor:**

- Atender o WhatsApp sem precisar mudar de ferramenta
- O sistema criar o lead automaticamente — corretor só qualifica
- Histórico da conversa visível no CRM, não só no celular

---

### Origem 4 — Landing Pages

**O que são:**  
Páginas web específicas criadas para capturar leads de um empreendimento ou campanha. Geralmente têm formulário com nome, telefone, e-mail e às vezes perguntas de qualificação.

---

**Dados que realmente chegam:**

| Campo | Situação |
|-------|----------|
| Nome | Sempre (campo obrigatório) |
| Telefone | Sempre (campo obrigatório) |
| E-mail | Quase sempre (obrigatório na maioria das LPs) |
| Empreendimento de interesse | Sempre — o contexto da LP já define isso |
| UTM Source / Medium / Campaign | Se a LP foi acessada via link rastreado — captura automática |
| Perguntas de qualificação | Depende do formulário (renda, tipo de imóvel, urgência) |

**Vantagem sobre Facebook Ads:** O lead que preenche uma LP saiu do feed, acessou uma página, leu conteúdo e escolheu preencher um formulário. Esse nível de intenção é maior. Os dados são mais completos e mais confiáveis.

---

**Dados que normalmente NÃO chegam:**

- CPF (raramente solicitado no topo do funil)
- Endereço atual
- Situação financeira real

---

**O que pode ser automatizado:**

- Integração via webhook ou API para criação do lead no CRM imediatamente após envio
- Captura automática de UTM parameters para rastrear origem
- Confirmação automática por e-mail + WhatsApp ao lead
- Roteamento automático para equipe responsável pelo empreendimento
- Deduplicação por telefone

**O que depende de intervenção humana:**

- Verificação de dados (especialmente telefone)
- Qualificação financeira real
- Primeiro contato pessoal

---

**Experiência ideal para o gestor:**

- Ver qual LP está convertendo melhor
- Comparar custo por lead entre diferentes LPs e campanhas
- Saber qual tráfego (Google Ads, SEO, Instagram, Facebook) gera leads de melhor qualidade

**Experiência ideal para o corretor:**

- Receber o lead já com o empreendimento identificado
- Ver se o lead veio de Google (maior intenção de busca) ou de Social (mais passivo)
- Ter o contexto para a abordagem inicial

---

### Origem 5 — Portais Imobiliários

**O que são:**  
Plataformas como ZAP Imóveis, OLX, Viva Real, Imovelweb, Quinto Andar. O lead pesquisa um imóvel, clica em "Tenho Interesse" ou "Falar com Corretor" e o portal envia os dados para a imobiliária.

---

**Dados que realmente chegam:**

| Campo | Situação |
|-------|----------|
| Nome | Sempre |
| Telefone | Sempre |
| E-mail | Sempre |
| Código do anúncio / referência | Sempre — identifica qual imóvel gerou o interesse |
| Mensagem do lead | Às vezes — campo opcional que o lead pode preencher |
| Portal de origem | Sempre — ZAP, Viva Real, OLX etc. |

**Importante:** Os portais têm APIs ou enviam os leads por e-mail em formato padronizado. A maioria dos CRMs do mercado já tem integração nativa com os principais portais.

---

**Dados que normalmente NÃO chegam:**

- Comportamento do lead no portal (quantos imóveis visitou, faixa de preço que estava filtrando)
- Se o lead contatou outras imobiliárias pelo mesmo imóvel (o lead pode ter mandado para 10 imobiliárias ao mesmo tempo)
- Qualificação financeira

**Problema específico dos portais:** O mesmo lead pode ter clicado em "Tenho Interesse" em 5 anúncios diferentes, de 5 imobiliárias diferentes, ao mesmo tempo. A primeira a responder leva vantagem enorme. O tempo de resposta em leads de portal é crítico.

---

**O que pode ser automatizado:**

- Recebimento via API do portal ou parsing de e-mail → criação automática no CRM
- Roteamento por tipo de imóvel ou valor do anúncio
- Resposta automática imediata ao lead (antes do corretor entrar em ação)
- Alerta para o corretor responsável com urgência máxima

**O que depende de intervenção humana:**

- Contato nos primeiros minutos (janela de oportunidade curta)
- Qualificação para entender se o imóvel específico é o que o lead realmente quer
- Apresentação de alternativas se o imóvel já estiver vendido

---

**Experiência ideal para o gestor:**

- Ver quantos leads chegam por portal e qual o custo
- Medir tempo médio de resposta por portal e por corretor
- Identificar portais com leads de baixa qualidade (muita duplicação, pouca conversão)

**Experiência ideal para o corretor:**

- Notificação instantânea com contexto (imóvel de interesse, valor, localização)
- Botão de contato imediato integrado
- Registro simples do resultado do primeiro contato

---

### Origem 6 — Indicações

**O que são:**  
Leads indicados por clientes anteriores, parceiros (advogados, contadores, outros corretores), ou pela rede de relacionamento do corretor.

Esta é a origem com maior taxa de conversão em imobiliárias brasileiras — e a mais invisível para o CRM.

---

**Dados que realmente chegam:**

- Depende inteiramente do meio pelo qual a indicação foi feita
- Se por WhatsApp: texto livre, sem estrutura
- Se por telefone: o corretor anota no papel ou na memória
- Se por e-mail: relativamente estruturado, mas ainda depende de digitação

---

**Dados que normalmente NÃO chegam automaticamente:**

- Absolutamente nada chega de forma automática
- Nome do indicador (quem indicou) quase nunca é registrado
- Motivo da indicação (empreendimento específico? marca da imobiliária?)
- Vínculo entre o lead atual e o cliente que indicou

**Problema central:** A indicação é a prova mais clara de que um cliente ficou satisfeito. Mas sem registro do indicador, a imobiliária não consegue: agradecer formalmente, criar um programa de indicações, nem saber qual cliente é mais valioso como fonte de novos negócios.

---

**O que pode ser automatizado:**

- Praticamente nada na entrada — a indicação chega por canal humano
- Após o cadastro manual: envio automático de confirmação para o indicador
- Registro do vínculo (lead X foi indicado por cliente Y) para rastrear o ciclo

**O que depende de intervenção humana:**

- 100% da entrada do lead no sistema (digitação manual é obrigatória)
- Identificação e registro de quem indicou
- Qualificação inicial

---

**Experiência ideal para o gestor:**

- Saber qual percentual dos leads vem de indicação
- Identificar os 10 maiores indicadores da imobiliária
- Ter programa de reconhecimento/recompensa para indicadores

**Experiência ideal para o corretor:**

- Tela de cadastro rápido: nome, telefone, e-mail, "indicado por" (campo de busca no banco de clientes)
- O CRM criar automaticamente o vínculo entre lead e indicador
- Lembrete para agradecer o indicador após o primeiro contato

---

### Origem 7 — Leads Digitados Manualmente

**O que são:**  
Leads captados em eventos, plantões de vendas, feiras, abordagens presenciais, ou qualquer situação onde o corretor anotou os dados no papel ou na memória e precisa cadastrar depois.

---

**Dados que realmente chegam:**

- O que o corretor anotou — pode ser só um nome e telefone em um guardanapo
- Ou um formulário de papel com mais dados (eventos têm fichas de cadastro)
- A qualidade depende inteiramente da disciplina do corretor

---

**Dados que normalmente NÃO chegam:**

- Contexto da conversa (o que o lead disse que buscava, objeções mencionadas)
- Intenção de compra estimada
- Urgência (o lead precisa de imóvel em 30 dias ou está "só vendo")

**Problema central:** O lead digitado manualmente é o mais suscetível a nunca entrar no CRM. O corretor guarda o papel, esquece, perde, ou decide "cuidar ele mesmo" sem registrar. É o buraco negro onde os leads de evento morrem.

---

**O que pode ser automatizado:**

- Formulário mobile otimizado para cadastro rápido em plantão (nome, telefone, origem = "plantão X", empreendimento)
- QR Code no estande do evento levando para formulário que cria o lead automaticamente
- Scan de cartão de visita via câmera do celular com OCR (extrai nome, telefone, e-mail)

**O que depende de intervenção humana:**

- 100% da entrada — o registro acontece por decisão do corretor
- Qualificação do contexto da conversa (o que foi discutido no plantão)
- Priorização (o lead que disse "quero fechar esse mês" vs. o que estava passando)

---

**Experiência ideal para o gestor:**

- Saber quantos leads foram captados em cada evento/plantão
- Comparar eficiência de diferentes pontos de captação presencial
- Detectar corretores que captam muito mas registram pouco

**Experiência ideal para o corretor:**

- Cadastrar o lead em menos de 60 segundos pelo celular, sem internet (sincronia posterior)
- Campo de "notas rápidas" de voz para gravar o contexto da conversa enquanto ainda lembra
- Não perder tempo em formulários longos no momento do atendimento

---

## Parte 2 — Tabela Comparativa

| Origem | Dados automáticos | Qualidade dos dados | Velocidade de entrada | Risco de perda |
|--------|-------------------|--------------------|-----------------------|----------------|
| Facebook Lead Ads | Alta | Baixa (pré-preenchido sem verificação) | Instantânea (webhook) | Baixo se integrado |
| Instagram | Média (DM = zero) | Média | Instantânea (formulário) / Manual (DM) | Alto em DMs |
| WhatsApp | Baixa | Média | Manual ou semi-automático | Muito alto (celular pessoal) |
| Landing Pages | Alta | Alta (lead com mais intenção) | Instantânea (webhook) | Baixo se integrado |
| Portais | Alta | Média | Instantânea (API) | Baixo se integrado |
| Indicações | Zero | Alta (lead qualificado) | Manual | Muito alto (memória/papel) |
| Manual / Plantão | Zero | Variável | Manual | Alto (disciplina do corretor) |

---

## Parte 3 — Fluxos Operacionais

---

### FLUXO REAL DE ENTRADA DE LEADS — V1 (Como funciona hoje)

```
ORIGENS
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Facebook Ads ──────────────────────────────────┐                  │
│  Instagram (formulário) ────────────────────────┤                  │
│  Landing Page ──────────────────────────────────┤                  │
│  Portal Imobiliário ────────────────────────────┤                  │
│                                                 ▼                  │
│                                        E-mail para a               │
│                                        imobiliária                 │
│                                        (formato variável)          │
│                                                 │                  │
│  Instagram (DM) ────────────────────────────────┤                  │
│  WhatsApp pessoal do corretor ──────────────────┼─ NUNCA ENTRA     │
│  Indicação verbal ──────────────────────────────┤    NO CRM        │
│  Plantão/Evento sem registro ───────────────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                         (e-mails chegam)
                                │
                                ▼
        ┌───────────────────────────────────────┐
        │     CAIXA DE E-MAIL DA IMOBILIÁRIA    │
        │                                       │
        │  • Leads do portal misturados com     │
        │    spam e e-mails operacionais        │
        │  • Sem padronização de formato        │
        │  • Ninguém sabe quem é responsável    │
        │    por processar                      │
        └───────────────────────────────────────┘
                                │
                         (alguém vê o e-mail)
                                │
                         ┌──────┴──────┐
                         │             │
                    Recepção/    Corretor
                    ADM          diretamente
                         │             │
                         ▼             ▼
               ┌──────────────┐  ┌──────────────┐
               │ Anota em     │  │  Responde     │
               │ planilha     │  │  pelo         │
               │ Excel        │  │  WhatsApp     │
               │              │  │  pessoal      │
               └──────┬───────┘  └──────┬────────┘
                      │                 │
              Distribui no      NUNCA ENTRA
              grupo de          NO CRM
              WhatsApp
              da equipe
                      │
               ┌──────▼───────┐
               │ Corretor     │
               │ recebe nome  │
               │ e telefone   │
               │ no grupo     │
               └──────┬───────┘
                      │
              Liga ou manda
              WhatsApp
                      │
              ┌───────▼──────────┐
              │ Resultado:       │
              │ • Anotado no     │
              │   papel          │
              │ • No WhatsApp    │
              │   pessoal        │
              │ • Nunca volta    │
              │   ao CRM         │
              └──────────────────┘
```

**Diagnóstico do V1:**

- Sem ponto único de entrada — cada canal vai para um lugar diferente
- A maioria dos leads de WhatsApp e indicação nunca é registrada
- Distribuição manual via grupo de WhatsApp depende de alguém lembrar de fazer
- Resultado do atendimento fica preso no celular do corretor
- Gestão fica cega: não sabe quantos leads entraram, de onde vieram, quem atendeu
- Quando corretor sai, empresa perde histórico de dezenas ou centenas de leads

---

### FLUXO FUTURO DE ENTRADA DE LEADS — V2 (Como deveria funcionar)

```
ORIGENS
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  Facebook Lead Ads ─────────────────────────────┐                  │
│  Instagram (formulário) ────────────────────────┤                  │
│  Landing Page ──────────────────────────────────┤ webhook/API      │
│  Portal Imobiliário ────────────────────────────┤                  │
│                                                 │                  │
│  Instagram (DM) ────────────────────────────────┤ inbox unificado  │
│  WhatsApp número oficial ───────────────────────┤ BSP/API          │
│                                                 │                  │
│  Indicação ─────────────────────────────────────┤ formulário       │
│  Plantão/Evento ────────────────────────────────┘ mobile rápido   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                                │
                     PONTO ÚNICO DE ENTRADA
                                │
                                ▼
        ┌───────────────────────────────────────────────────────┐
        │                 LEAD MASTER IA                        │
        │                                                       │
        │  1. DEDUPLICAÇÃO                                      │
        │     └─ mesmo telefone/e-mail = atualiza, não duplica  │
        │                                                       │
        │  2. ENRIQUECIMENTO AUTOMÁTICO                         │
        │     └─ origem, campanha, empreendimento, data/hora    │
        │                                                       │
        │  3. ROTEAMENTO                                        │
        │     └─ campanha → equipe (regra da Fase 3.1-C)       │
        │     └─ fallback: rodízio entre equipes disponíveis    │
        │                                                       │
        │  4. DISTRIBUIÇÃO                                      │
        │     └─ round-robin com fairness (Fase 3)              │
        │                                                       │
        │  5. NOTIFICAÇÃO                                       │
        │     └─ corretor recebe push + WhatsApp em < 30 seg   │
        └───────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
           CORRETOR RECEBE           GESTOR VÊ
           • Nome e telefone         • Lead entrou no painel
           • Origem do lead          • Quem foi atribuído
           • Empreendimento          • Horário de atribuição
           • Contexto da campanha    • SLA iniciado
                    │
            Atende pelo canal
            de preferência do lead
            (WhatsApp, ligação, e-mail)
                    │
            Registra resultado
            no Lead Master IA
            (em < 60 segundos)
                    │
            ┌───────▼────────────┐
            │  PIPELINE ATUALIZA │
            │                    │
            │  novo → em_contato │
            │  → visita          │
            │  → proposta        │
            │  → fechado/perdido │
            └────────────────────┘
                    │
            Gestor acompanha
            em tempo real
            sem depender de
            relatório manual
```

**Princípios do V2:**

1. **Um canal de entrada.** Todo lead, de qualquer origem, entra em um único ponto antes de ser distribuído.
2. **Zero duplicação.** O sistema decide se o lead é novo ou se já existe antes de criar um registro.
3. **Roteamento automático.** Origem + empreendimento + campanha definem para onde vai. Humano só interfere na exceção.
4. **Notificação imediata.** O corretor sabe que tem um lead em menos de 30 segundos.
5. **Registro obrigatório.** Resultado de todo contato volta ao sistema — não fica no celular do corretor.
6. **Visibilidade total para o gestor.** Cada lead tem origem, responsável, histórico e status rastreável.

---

## Parte 4 — Implicações para o Lead Master IA

### O que o Lead Master IA precisa suportar (ordem de prioridade para o MVP)

**Prioridade 1 — Entrada manual com contexto:**  
Antes de qualquer automação, o sistema precisa ter um formulário de cadastro rápido onde o corretor ou ADM registre leads de WhatsApp, indicação e plantão. Sem isso, mesmo um sistema perfeito de distribuição opera com dados parciais.

**Prioridade 2 — Campo de origem obrigatório:**  
Cada lead deve ter uma origem registrada (Facebook, Instagram, Portal, WhatsApp, Indicação, Plantão, Outro). Sem isso é impossível medir qual canal traz melhor resultado.

**Prioridade 3 — Deduplicação por telefone:**  
Antes de criar um lead, checar se o telefone já existe. O mesmo lead vindo de Facebook e WhatsApp no mesmo dia é um lead, não dois.

**Prioridade 4 — Webhook para origens digitais:**  
Facebook Lead Ads, Landing Pages e Portais suportam webhook. A integração é técnica, mas é o caminho para eliminar entrada manual dos leads digitais.

**Prioridade 5 — Notificação imediata ao corretor:**  
O lead que entra e espera horas esfria. Notificação push ou WhatsApp para o corretor atribuído é requisito de negócio, não feature opcional.

---

## Conclusão

A jornada real do lead em uma imobiliária brasileira tem sete portas de entrada e uma única saída esperada: virar venda. O problema não é falta de leads — é que a maioria deles se perde antes de chegar a qualquer sistema.

O WhatsApp pessoal do corretor e a falta de registro de indicações são os dois maiores buracos negros. Qualquer arquitetura de distribuição (como a definida nas Fases 3 a 3.1-C) só funciona se o lead entrar no sistema. Distribuir leads que nunca foram cadastrados é impossível.

O V2 não exige tecnologia de ponta. Exige disciplina operacional suportada por um sistema que torne o registro fácil, rápido e obrigatório — e que trate qualquer canal de entrada com o mesmo nível de rastreabilidade.

---

Mapeamento operacional concluído. Aguardando aprovação.
