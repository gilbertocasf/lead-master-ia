# Auditoria de Dados Operacionais Atuais

**Data**: 2026-06-23  
**Fonte**: `lib/mock-data.ts` — estrutura base de dados do sistema  
**Status**: Análise de integridade dos dados para demo Basílio Imóveis  
**Modo de Operação**: Mock mode (sem env Supabase) — banco em desenvolvimento

---

## 1. TODAS AS EQUIPES EXISTENTES

### Equipe 1: Atlântico

| Campo | Valor |
|-------|-------|
| id | `eq-azul` |
| nome | Equipe Atlântico |
| gerente | Roberto Tavares (g1) |
| ativo | true (padrão) |
| último_lead_recebido_em | NULL (não atualizado em mock mode) |
| corretores | 6 ativos |

**Composição de Corretores**:
- c1: Rafael Mendes (plantão: true, ativo: true)
- c2: Beatriz Lima (plantão: true, ativo: true)
- c3: Diego Farias (plantão: false, ativo: true)
- c4: Camila Souza (plantão: true, ativo: true)
- c5: Henrique Alves (plantão: true, ativo: true)
- c6: Patrícia Rocha (plantão: false, ativo: true)

**Status**: ✓ Completo

---

### Equipe 2: Horizonte

| Campo | Valor |
|-------|-------|
| id | `eq-verde` |
| nome | Equipe Horizonte |
| gerente | Cláudia Menezes (g2) |
| ativo | true (padrão) |
| último_lead_recebido_em | NULL (não atualizado em mock mode) |
| corretores | 6 ativos |

**Composição de Corretores**:
- c7: Lucas Pereira (plantão: true, ativo: true)
- c8: Aline Castro (plantão: true, ativo: true)
- c9: Marcos Vieira (plantão: true, ativo: true)
- c10: Juliana Dias (plantão: false, ativo: true)
- c11: Felipe Nunes (plantão: true, ativo: true)
- c12: Sofia Barros (plantão: true, ativo: true)

**Status**: ✓ Completo

---

## 2. TODOS OS CORRETORES EXISTENTES

### Equipe Atlântico (eq-azul)

| ID | Nome | Ordem | Ativo | Em Plantão | Último Lead | Status |
|----|----|-------|-------|-----------|------------|---------|
| c1 | Rafael Mendes | 1 | ✓ | ✓ | NULL | ✓ Disponível |
| c2 | Beatriz Lima | 2 | ✓ | ✓ | NULL | ✓ Disponível |
| c3 | Diego Farias | 3 | ✓ | ✗ | NULL | ⚠️ Folga |
| c4 | Camila Souza | 4 | ✓ | ✓ | NULL | ✓ Disponível |
| c5 | Henrique Alves | 5 | ✓ | ✓ | NULL | ✓ Disponível |
| c6 | Patrícia Rocha | 6 | ✓ | ✗ | NULL | ⚠️ Folga |

**Resumo Atlântico**:
- Total: 6 corretores
- Ativos: 6 (100%)
- Em plantão: 4
- Em folga: 2
- Distribuição de leads: 4 (c1, c1, c2, c4)

---

### Equipe Horizonte (eq-verde)

| ID | Nome | Ordem | Ativo | Em Plantão | Último Lead | Status |
|----|----|-------|-------|-----------|------------|---------|
| c7 | Lucas Pereira | 1 | ✓ | ✓ | NULL | ✓ Disponível |
| c8 | Aline Castro | 2 | ✓ | ✓ | NULL | ✓ Disponível |
| c9 | Marcos Vieira | 3 | ✓ | ✓ | NULL | ✓ Disponível |
| c10 | Juliana Dias | 4 | ✓ | ✗ | NULL | ⚠️ Folga |
| c11 | Felipe Nunes | 5 | ✓ | ✓ | NULL | ✓ Disponível |
| c12 | Sofia Barros | 6 | ✓ | ✓ | NULL | ✓ Disponível |

**Resumo Horizonte**:
- Total: 6 corretores
- Ativos: 6 (100%)
- Em plantão: 5
- Em folga: 1
- Distribuição de leads: 3 (c7, c8, c9)

---

## 3. TODOS OS LEADS EXISTENTES

### Fila de Distribuição (4 leads)

| ID | Nome | Status | Equipe | Corretor | Distribuído Em |
|----|------|--------|--------|----------|----------------|
| l1 | Marina Costa | novo | eq-azul | — | — |
| l2 | Eduardo Ramos | novo | eq-azul | — | — |
| l3 | Fernanda Aguiar | novo | eq-verde | — | — |
| l4 | Gustavo Lemos | novo | eq-verde | — | — |

**Características da Fila**:
- Total na fila: 4 leads (36% do total)
- Equipe Atlântico: 2 na fila
- Equipe Horizonte: 2 na fila
- Tempos de fila: entre 3h e 20h
- Aguardando distribuição automática ou manual

---

### Em Acompanhamento — Equipe Atlântico (4 leads distribuídos)

| ID | Nome | Status | Corretor | Criado | Observações |
|----|----|---------|----------|--------|-------------|
| l5 | Paula Andrade | em_contato | c1 | -2d | Contato inicial realizado |
| l6 | Ricardo Maia | visita | c2 | -4d | Visita agendada/realizada |
| l7 | Tatiane Reis | proposta | c1 | -6d | Aguardando resposta proposta |
| l8 | André Fontes | perdido | c4 | -8d | Comprou com concorrente |

**Análise Atlântico**:
- Distribuídos: 4 (100%)
- Ativo (novo/em_contato/visita/proposta): 3
- Encerrado (fechado/perdido): 1
- Pipeline: novo(0) → em_contato(1) → visita(1) → proposta(1) → fechado(0) / perdido(1)
- Taxa de conversão visível: 75% ainda abertos

---

### Em Acompanhamento — Equipe Horizonte (3 leads distribuídos)

| ID | Nome | Status | Corretor | Criado | Observações |
|----|----|---------|----------|--------|-------------|
| l9 | Vanessa Pires | em_contato | c7 | -3d | Contato inicial |
| l10 | Bruno Teixeira | visita | c8 | -5d | Interesse confirmado |
| l11 | Larissa Gomes | proposta | c9 | -7d | Aguardando assinatura |

**Análise Horizonte**:
- Distribuídos: 3 (100%)
- Ativo (novo/em_contato/visita/proposta): 3
- Encerrado (fechado/perdido): 0
- Pipeline: novo(0) → em_contato(1) → visita(1) → proposta(1) → fechado(0)
- Taxa de conversão: 0% encerrado (todos em andamento)

---

### Resumo Geral de Leads

| Métrica | Valor |
|---------|-------|
| Total de leads | 11 |
| Na fila | 4 (36%) |
| Distribuídos | 7 (64%) |
| Novo | 4 |
| Em contato | 2 |
| Visita | 2 |
| Proposta | 2 |
| Fechado | 0 |
| Perdido | 1 |
| Taxa perda visível | 12.5% (1/8 encerrados) |
| Taxa conversão ativa | 88% (7/8 ainda em pipeline) |

---

## 4. TODAS AS VENDAS EXISTENTES

### Ranking VGV por Corretor

| Corretor | Equipe | Qtd Vendas | VGV Total | Ticket Médio | Status |
|----------|--------|-----------|-----------|------------|--------|
| Rafael Mendes (c1) | eq-azul | 2 | R$ 1.770.000 | R$ 885.000 | 🥇 Líder |
| Beatriz Lima (c2) | eq-azul | 2 | R$ 2.870.000 | R$ 1.435.000 | 🥈 2º lugar |
| Lucas Pereira (c7) | eq-verde | 2 | R$ 2.990.000 | R$ 1.495.000 | 🥇 Líder |
| Henrique Alves (c5) | eq-azul | 1 | R$ 460.000 | R$ 460.000 | — |
| Marcos Vieira (c9) | eq-verde | 1 | R$ 780.000 | R$ 780.000 | — |
| Aline Castro (c8) | eq-verde | 1 | R$ 1.320.000 | R$ 1.320.000 | — |
| Felipe Nunes (c11) | eq-verde | 1 | R$ 670.000 | R$ 670.000 | — |

**Ranking Completo (ordenado por VGV)**:

1. **Lucas Pereira (c7, eq-verde)**: R$ 2.990.000 (2 vendas)
2. **Beatriz Lima (c2, eq-azul)**: R$ 2.870.000 (2 vendas)
3. **Rafael Mendes (c1, eq-azul)**: R$ 1.770.000 (2 vendas)
4. **Aline Castro (c8, eq-verde)**: R$ 1.320.000 (1 venda)
5. **Henrique Alves (c5, eq-azul)**: R$ 460.000 (1 venda)
6. **Marcos Vieira (c9, eq-verde)**: R$ 780.000 (1 venda)
7. **Felipe Nunes (c11, eq-verde)**: R$ 670.000 (1 venda)

---

### Resumo de Vendas

| Métrica | Valor |
|---------|-------|
| Total de vendas | 10 |
| VGV total | R$ 10.510.000 |
| Ticket médio geral | R$ 1.051.000 |
| Equipe Atlântico | R$ 5.560.000 (5 vendas) |
| Equipe Horizonte | R$ 4.950.000 (5 vendas) |
| Corretores com vendas | 7 de 12 (58%) |
| Corretores sem vendas | 5 de 12 (42%) |

**Distribuição por Equipe**:
- eq-azul: 5 vendas, R$ 5.560.000 (52.9% do total)
- eq-verde: 5 vendas, R$ 4.950.000 (47.1% do total)

---

## 5. INCONSISTÊNCIAS E ANOMALIAS IDENTIFICADAS

### 5.1 Corretores Sem Vendas

| Corretor | Equipe | Ordem | Status |
|----------|--------|-------|--------|
| Diego Farias (c3) | eq-azul | 3 | Ativo, EM FOLGA, 0 vendas |
| Camila Souza (c4) | eq-azul | 4 | Ativo, em plantão, 0 vendas (mas 1 lead perdido) |
| Patrícia Rocha (c6) | eq-azul | 6 | Ativo, EM FOLGA, 0 vendas |
| Juliana Dias (c10) | eq-verde | 4 | Ativo, EM FOLGA, 0 vendas |

**Análise**:
- 4 corretores sem vendas (33%)
- 3 estão em folga — esperado (c3, c6, c10)
- 1 em plantão sem vendas (c4) — pode ter leads em andamento ou pouca experiência

**Recomendação**: Investigar c4 se está recebendo leads; padrão esperado para novo sistema

---

### 5.2 Leads Sem Corretor (Na Fila)

| Situação | Quantidade | Status |
|----------|-----------|--------|
| Leads na fila | 4 | Aguardando distribuição |
| Corretores disponíveis para atender | 4+5 = 9 | ✓ Suficientes |

**Análise**:
- 4 leads na fila (36% do total)
- 9 corretores em plantão disponíveis (75% dos 12)
- Capacidade: suficiente para atender fila 2x

**Potencial Problema**:
- Fila não está sendo distribuída automaticamente (sistema está em mock mode, não há lógica ativa)
- Em produção, leads deveriam ser roteados quando criados
- Histórico: l1, l2 com 3-9h na fila; l3, l4 com 5-20h na fila

**Recomendação**: Normal em mock mode; em produção, validar se distribuição automática está funcionando

---

### 5.3 Leads Sem Equipe

| Situação | Quantidade |
|----------|-----------|
| Leads com equipe | 11 |
| Leads sem equipe | 0 |

**Status**: ✓ OK — Todos os leads têm equipe atribuída

---

### 5.4 Vendas Sem Corretor

| Situação | Quantidade |
|----------|-----------|
| Vendas com corretor | 10 |
| Vendas sem corretor | 0 |

**Status**: ✓ OK — Todas as vendas têm corretor responsável

---

### 5.5 Inconsistências de Plantão

| Situação | Descrição | Impacto |
|----------|-----------|---------|
| Corretores em folga com leads | c3 (Diego Farias), c6 (Patrícia Rocha) | Leads l5, l6 NÃO foram atribuídos a c3 ou c6 |
| Corretores em plantão ativos | c1-c2, c4-c5 (Atlântico); c7-c9, c11-c12 (Horizonte) | 9 corretores em plantão, capacidade suficiente |
| Distribuição respeitando plantão | Observado: SIM | Correto — apenas em_plantao=true recebem leads |

**Status**: ✓ OK — Sistema respeita corretamente o estado de plantão

---

### 5.6 Inconsistências de Distribuição

| Lead | Status | Equipe | Corretor | Tempo | Observação |
|------|--------|--------|----------|-------|------------|
| l1 | novo | eq-azul | — | 3h na fila | Aguardando — capacidade existe |
| l2 | novo | eq-azul | — | 9h na fila | Aguardando — sem motivo aparente |
| l3 | novo | eq-verde | — | 5h na fila | Aguardando — capacidade existe |
| l4 | novo | eq-verde | — | 20h na fila | ⚠️ CRÍTICO — tempo elevado |

**Análise**:
- l4: 20h na fila é anômalo para novo sistema
- Possível causa: mock mode não atualiza `ultimo_lead_recebido_em`, logo distribuição não avança
- Em produção, leads devem ser distribuídos em minutos

**Recomendação**: 
- Validar lógica de distribuição automática ao sair do mock mode
- Confirmar que `ultimo_lead_recebido_em` é atualizado corretamente
- Implementar timeout/SLA para fila

---

## 6. AVALIAÇÃO DE APTIDÃO PARA DEMO BASÍLIO IMÓVEIS

### Critério 1: Integridade Estrutural

| Aspecto | Status | Evidência |
|---------|--------|-----------|
| Todas as equipes têm ID, nome, gerente | ✓ | 2 equipes, ambas com dados completos |
| Todos os corretores têm equipe | ✓ | 12 corretores, 0 órfãos |
| Todos os leads têm equipe | ✓ | 11 leads, 0 órfãos |
| Todos os corretores com vendas existem | ✓ | 7 corretores com vendas, todos presentes |

**Resultado**: ✓ PASSOU — Estrutura íntegra, sem FKs quebradas

---

### Critério 2: Cobertura de Dados

| Aspecto | Ideal | Atual | Status |
|---------|-------|-------|--------|
| Equipes ativas | 2+ | 2 | ✓ |
| Corretores por equipe | 5+ | 6 | ✓ |
| Leads em fila | 3+ | 4 | ✓ |
| Leads em acompanhamento | 5+ | 7 | ✓ |
| Vendas/ranking | 5+ | 10 | ✓ |
| Leads perdidos | 1+ | 1 | ✓ |
| Corretores em folga | 2+ | 3 | ✓ |

**Resultado**: ✓ PASSOU — Cobertura completa

---

### Critério 3: Realismo da Jornada

| Etapa | Existe | Exemplo |
|-------|--------|---------|
| Lead novo criado | ✓ | l1, l2, l3, l4 (na fila) |
| Lead em contato | ✓ | l5, l9 (distribuído, contato inicial) |
| Lead em visita | ✓ | l6, l10 (progrediu na jornada) |
| Lead em proposta | ✓ | l7, l11 (estágio avançado) |
| Lead perdido | ✓ | l8 (motivo: concorrência) |
| Venda fechada | ✓ | v1-v10 (histórico de 10 vendas) |

**Resultado**: ✓ PASSOU — Jornada completa representada

---

### Critério 4: Conformidade de Dados

| Regra | Status | Detalhe |
|------|--------|---------|
| Sem equipes inativas | ✓ | Ambas ativas |
| Sem corretores inativos | ✓ | 12/12 ativo=true |
| Sem leads duplicados por telefone | ✓ | 11 leads, 11 telefones únicos |
| Sem corretores órfãos | ✓ | 12/12 têm equipe |
| Sem leads órfãos | ✓ | 11/11 têm equipe |
| Sem vendas órfãs | ✓ | 10/10 têm corretor |
| Sem referências circulares | ✓ | Grafo acíclico |

**Resultado**: ✓ PASSOU — Conformidade total

---

### Critério 5: Risco de Perda de Dados

| Tipo | Risco | Ação Necessária |
|------|--------|-----------------|
| Leads na fila | ⚠️ BAIXO | Serão distribuídos ao ativar distribuição |
| Leads em andamento | ✓ SEGURO | Permanecerão com status e corretor |
| Vendas históricas | ✓ SEGURO | lead_id null permitido para legado |
| Ranking | ✓ SEGURO | Baseado em vendas, não será perdido |

**Resultado**: ⚠️ ATENÇÃO — Perda improvável, mas validar distribuição

---

### Critério 6: Viabilidade de Conversão

| Aspecto | Impacto | Ação |
|---------|--------|------|
| Mock → Supabase | ✓ MAPEÁVEL | Estrutura SQL match com tipos |
| Imobiliária mock → Basílio | ⚠️ PRECISA DECISÃO | Ver seção 7 abaixo |
| Leads com origem válida | ✓ | l1-l11 têm origem in ['Instagram', 'Facebook', 'Outro'] |
| Equipes renomeáveis | ✓ | Mudar nome não quebra FKs |

**Resultado**: ⚠️ PARCIAL — Possível, mas requer decisão sobre tenant

---

## 7. CENÁRIOS DE CONVERSÃO PARA BASÍLIO IMÓVEIS

### Cenário A: Importar Como Dados Históricos (Recomendado para Demo)

**Ação**:
1. Criar tenant Basílio Imóveis no banco
2. Importar equipes, corretores, leads, vendas com `imobiliaria_id = <basilio_id>`
3. Usuários da demo logam com credenciais Basílio

**Vantagens**:
- ✓ Dados históricos reais da empresa fictícia
- ✓ Demonstra volume realista
- ✓ SLA visível (leads antigos)
- ✓ Ranking completo com 10 vendas

**Desvantagens**:
- ⚠️ Precisa criar usuários/auth para cada corretor
- ⚠️ Precisa decidir se l1-l4 (fila) vão para demo ou não

**Status**: ✓ VIÁVEL

---

### Cenário B: Usar Como Template Base

**Ação**:
1. Manter dados mock como referência
2. Criar dados de produção vazios para Basílio
3. Popular durante a demo interativamente

**Vantagens**:
- ✓ Demonstra fluxo completo (novo lead → distribuição → venda)
- ✓ Público vê ações em tempo real

**Desvantagens**:
- ⚠️ Requer scripts de geração de dados realistas
- ⚠️ Sem histórico aparente na demo

**Status**: ⚠️ POSSÍVEL, menos ideal

---

### Cenário C: Dados Mistos (Histórico + Live)

**Ação**:
1. Importar vendas v1-v10 (histórico)
2. Importar corretores c1-c12 (equipes reais)
3. Criar novos leads durante demo
4. Deixar l1-l4 na fila como exemplo

**Vantagens**:
- ✓ Ranking autêntico desde início
- ✓ Novo lead entrado durante demo será roteado
- ✓ Combina histórico com dinâmica

**Desvantagens**:
- ⚠️ Mais complexo de setup

**Status**: ✓ RECOMENDADO

---

## 8. RESULTADO FINAL DA AUDITORIA

### ✓ APTO PARA DEMO BASÍLIO IMÓVEIS

**Conclusão**:
Os dados atuais estão **estruturalmente íntegros** e **possuem cobertura completa** para uma demonstração efetiva. 

**Dados Prontos**:
- 2 equipes com identidade clara e distinta
- 12 corretores organizados com hierarquia de plantão
- 11 leads em diferentes estágios do pipeline
- 10 vendas com histórico realista de VGV
- 1 lead perdido (demonstra ciclo completo)

**Sem Perda de Integridade**:
- Nenhuma FK quebrada
- Nenhum dado órfão
- Nenhuma colisão de dados

**Recomendações Antes da Demo**:

1. **Decisão de Tenant**: Confirm se dados ficarão mock ou migrarão para Supabase real
2. **Distribuição de Fila**: Validar se l1-l4 devem entrar já distribuídos ou permanecer na fila
3. **Usuários de Autenticação**: Se usar Supabase, criar auth users para corretores que fizerem login
4. **Marca**: Decidir se mantém equipes "Atlântico/Horizonte" ou renomeia para Basílio

**Dados Aceitáveis Para Demo**: ✓ 100%

---

**Fim da Auditoria de Dados**
