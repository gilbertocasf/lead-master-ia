# Notificação por E-mail ao Corretor — Lead Atribuído

**Data:** 2026-06-25  
**Build:** ✅ Passou sem erros TypeScript  
**Pacote novo instalado:** Nenhum — implementação via `fetch` nativo (Resend REST API)

---

## 1. Arquivos alterados

| Arquivo | Tipo de mudança |
|---------|----------------|
| `lib/email.ts` | **Novo.** Função `notificarCorretorNovoLead` — encapsula chamada ao Resend |
| `app/api/leads/route.ts` | **Atualizado.** Chama notificação após RPC retornar `corretor_id` |
| `.env.local.example` | **Atualizado.** Documentação das novas variáveis `RESEND_API_KEY` e `EMAIL_FROM` |

---

## 2. Variáveis de ambiente necessárias

| Variável | Obrigatória? | Detalhe |
|----------|-------------|---------|
| `RESEND_API_KEY` | Para envio funcionar | Chave da API do Resend. Nunca usar prefixo `NEXT_PUBLIC_`. |
| `EMAIL_FROM` | Para envio funcionar | Remetente no formato `"Lead Master IA <notificacoes@seudominio.com>"`. O domínio precisa estar verificado no Resend. |

**Sem essas variáveis:** o sistema funciona normalmente. O e-mail não é enviado, um aviso aparece no log do servidor (`[email] RESEND_API_KEY ou EMAIL_FROM não configurados`) e a resposta inclui `email_notificacao: "nao_configurado"`.

**Onde configurar:**
- Localmente: `.env.local` (jamais commitado)
- Vercel: Settings → Environment Variables

---

## 3. Onde o e-mail é disparado

```
POST /api/leads
  └── app/api/leads/route.ts
        ├── RPC criar_e_distribuir_lead() → retorna { status, lead }
        ├── Se status === "duplicata" → retorna 409 (sem e-mail)
        └── Se status === "criado":
              ├── Se lead.corretor_id não é null:
              │     ├── SELECT corretores.email WHERE id = corretor_id
              │     ├── Se email válido → notificarCorretorNovoLead(email)
              │     └── Se sem email ou inválido → email_notificacao = "nao_enviado"
              └── Retorna 201 independente do resultado do e-mail
```

**E-mail NÃO é disparado em:**
- Renderização de páginas (`/`, `/leads`, `/pipeline`, `/ranking`, `/corretores`)
- Alteração de status no pipeline (`PATCH /api/leads/[id]/status`)
- Qualquer outro evento fora de `POST /api/leads`

---

## 4. Conteúdo do e-mail

| Campo | Valor |
|-------|-------|
| `from` | Valor de `EMAIL_FROM` (configurável) |
| `to` | E-mail do corretor atribuído (buscado em `corretores.email`) |
| `subject` | `Novo lead recebido` |
| `text` | `Você recebeu um novo Lead, acesse o painel para maiores informações` |

**Nenhum dado pessoal do lead** é incluído — nem nome, telefone, origem, interesse ou faixa de valor.

---

## 5. Comportamento em caso de falha

| Cenário | Comportamento |
|---------|--------------|
| `RESEND_API_KEY` não configurada | Log de aviso; `email_notificacao: "nao_configurado"`; lead criado normalmente |
| `EMAIL_FROM` não configurada | Idem acima |
| Corretor sem e-mail (`corretores.email = NULL`) | `email_notificacao: "nao_enviado"`; lead criado normalmente |
| Resend retorna HTTP erro (4xx/5xx) | Log de erro com status e corpo; `email_notificacao: "falhou"`; lead criado normalmente |
| Erro de rede / timeout ao chamar Resend | Log de erro com exceção; `email_notificacao: "falhou"`; lead criado normalmente |
| Lead na fila (`corretor_id = NULL`) | Sem tentativa de e-mail; `email_notificacao: "nao_enviado"` |

**Garantia:** nenhuma falha de e-mail altera o status HTTP da resposta de criação do lead.

---

## 6. Campo `email_notificacao` na resposta da API

A resposta de `POST /api/leads` agora inclui o campo extra:

```json
{
  "status": "criado",
  "distribuido": true,
  "motivo": null,
  "lead": { ... },
  "email_notificacao": "enviado"
}
```

**Valores possíveis:**

| Valor | Significado |
|-------|-------------|
| `"enviado"` | Resend aceitou e retornou 2xx |
| `"falhou"` | Resend retornou erro ou houve erro de rede |
| `"nao_enviado"` | Corretor sem e-mail ou lead ficou na fila sem corretor |
| `"nao_configurado"` | Variáveis de ambiente ausentes |

**Compatibilidade:** o front-end atual não lê `email_notificacao`. Adicionar o campo não quebra nenhum contrato existente.

---

## 7. Checklist de teste manual

### Pré-requisito
- `RESEND_API_KEY` e `EMAIL_FROM` configuradas no ambiente (Vercel ou `.env.local`)
- O corretor atribuído deve ter e-mail válido em `corretores.email`

### Teste 1 — E-mail enviado com sucesso (Cenário A: captador conhecido)
- [ ] Abrir `/leads` como gerente/admin
- [ ] Criar lead com "captador conhecido" selecionando um corretor com e-mail cadastrado
- [ ] Verificar resposta da API: `email_notificacao: "enviado"`
- [ ] Verificar caixa de entrada do corretor: assunto "Novo lead recebido"
- [ ] Confirmar que o corpo é exatamente: "Você recebeu um novo Lead, acesse o painel para maiores informações"
- [ ] Confirmar que não há nome, telefone ou dados do cliente no e-mail

### Teste 2 — E-mail enviado com sucesso (Cenário B: rodízio)
- [ ] Criar lead sem marcar captador
- [ ] Verificar que o sistema distribuiu ao próximo da fila
- [ ] Verificar resposta da API: `email_notificacao: "enviado"` (se o corretor tem e-mail)

### Teste 3 — Lead na fila sem corretor
- [ ] Forçar cenário onde não há corretor em plantão (`em_plantao = false` em todos)
- [ ] Criar lead → deve ficar na fila (`corretor_id = NULL`)
- [ ] Verificar resposta: `email_notificacao: "nao_enviado"`, `distribuido: false`
- [ ] Verificar que nenhum e-mail foi enviado

### Teste 4 — Corretor sem e-mail
- [ ] Garantir que o próximo da fila tem `email = NULL` no banco
- [ ] Criar lead → deve distribuir ao corretor sem e-mail
- [ ] Verificar resposta: `email_notificacao: "nao_enviado"`
- [ ] Lead criado e atribuído normalmente

### Teste 5 — Sem variáveis de ambiente
- [ ] Remover `RESEND_API_KEY` do ambiente local temporariamente
- [ ] Criar lead → deve funcionar normalmente
- [ ] Verificar resposta: `email_notificacao: "nao_configurado"`
- [ ] Log do servidor: `[email] RESEND_API_KEY ou EMAIL_FROM não configurados`

### Teste 6 — Regressão
- [ ] Pipeline (`/pipeline`) continua funcionando normalmente
- [ ] Alterar status de um lead no pipeline → verificar que nenhum e-mail é disparado
- [ ] Dashboard (`/`) carrega sem erros
- [ ] Ranking (`/ranking`) carrega sem erros

---

## 8. Arquitetura de segurança

- `RESEND_API_KEY` lida em `lib/email.ts` via `process.env` — sem prefixo `NEXT_PUBLIC_`
- `lib/email.ts` é importado apenas em `app/api/leads/route.ts` (Route Handler, sempre server-side)
- A chave jamais trafega para o cliente — Next.js não inclui variáveis sem `NEXT_PUBLIC_` no bundle do browser
- O corpo do e-mail é literal (hardcoded) — não há interpolação de dados do lead

---

## 9. Próximos passos recomendados

1. **Configurar domínio no Resend** — verificar o domínio de `EMAIL_FROM` no painel do Resend para evitar filtros de spam
2. **Configurar variáveis na Vercel** — `RESEND_API_KEY` e `EMAIL_FROM` em Settings → Environment Variables → Production
3. **Template HTML** — se quiser e-mail visualmente formatado (logo, botão "Acessar painel"), adicionar campo `html` na chamada do Resend dentro de `lib/email.ts`
4. **Vincular `corretores.usuario_id`** — garantir que o e-mail do corretor está cadastrado em `corretores.email`
