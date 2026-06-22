# Fase 8 — Pipeline Funcional: Implementação

**Data:** 2026-06-22  
**Status:** Implementado — aguardando Migration 004 no Supabase  
**Build:** `npm run build` passou sem erros

---

## Arquivos criados

| Arquivo | Tipo |
|---------|------|
| `supabase/migrations/004_rpc_alterar_status.sql` | Migration (aplicar manualmente no Supabase) |
| `app/api/leads/[id]/status/route.ts` | API Route — PATCH |
| `components/pipeline/StatusDropdown.tsx` | Client Component |

## Arquivos alterados

| Arquivo | O que mudou |
|---------|-------------|
| `app/(app)/pipeline/page.tsx` | Adicionado `<StatusDropdown>` em cada card; removida nota de mock |

---

## Migration 004 — `supabase/migrations/004_rpc_alterar_status.sql`

```sql
-- =====================================================================
-- Migration 004 — RPC: alterar_status_lead
-- Lead Master IA
-- =====================================================================
-- Cria a stored procedure que encapsula a alteração de status de um lead
-- + registro em historico_leads em uma única transação atômica.
--
-- POR QUE RPC:
--   O Supabase JS client não suporta BEGIN/COMMIT explícito.
--   Esta função garante que UPDATE leads e INSERT historico_leads
--   ocorrem juntos — qualquer falha reverte os dois.
--
-- RETORNO:
--   { status: 'ok', lead_id, status_anterior, status_novo }
--   { status: 'lead_nao_encontrado' }
--   { status: 'status_igual' }
--
-- NÃO ALTERA:
--   Nenhuma tabela. Nenhuma coluna. Apenas cria a função.
--
-- IDEMPOTÊNCIA:
--   CREATE OR REPLACE — seguro para reaplicar.
-- =====================================================================

CREATE OR REPLACE FUNCTION alterar_status_lead(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_lead_id         UUID;
  v_imob_id         UUID;
  v_usuario_id      UUID;
  v_status_novo     TEXT;
  v_status_anterior lead_status;
BEGIN
  v_lead_id     := (p->>'lead_id')::UUID;
  v_imob_id     := (p->>'imobiliaria_id')::UUID;
  v_usuario_id  := NULLIF(TRIM(COALESCE(p->>'usuario_id', '')), '')::UUID;
  v_status_novo := p->>'status_novo';

  -- Buscar status atual e travar a linha para evitar race condition
  SELECT status INTO v_status_anterior
  FROM leads
  WHERE id = v_lead_id AND imobiliaria_id = v_imob_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'lead_nao_encontrado');
  END IF;

  IF v_status_anterior::TEXT = v_status_novo THEN
    RETURN jsonb_build_object('status', 'status_igual');
  END IF;

  -- Atualizar status do lead
  UPDATE leads
  SET status = v_status_novo::lead_status
  WHERE id = v_lead_id;

  -- Registrar evento no histórico
  INSERT INTO historico_leads (
    lead_id, imobiliaria_id, tipo_evento, criado_por, usuario_id, dados
  )
  VALUES (
    v_lead_id, v_imob_id,
    'status_alterado', 'usuario', v_usuario_id,
    jsonb_build_object(
      'status_anterior', v_status_anterior,
      'status_novo',     v_status_novo
    )
  );

  RETURN jsonb_build_object(
    'status',          'ok',
    'lead_id',         v_lead_id,
    'status_anterior', v_status_anterior,
    'status_novo',     v_status_novo
  );
END;
$$;

COMMENT ON FUNCTION alterar_status_lead(JSONB)
  IS 'Altera status de um lead e registra evento status_alterado em historico_leads. Tudo em uma única transação.';
```

---

## API Route — `app/api/leads/[id]/status/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isMockMode } from "@/lib/supabase";
import { LeadStatus } from "@/lib/types";

const STATUS_VALIDOS: LeadStatus[] = [
  "novo",
  "em_contato",
  "visita",
  "proposta",
  "fechado",
  "perdido",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (isMockMode) {
    return NextResponse.json(
      { erro: "supabase_nao_configurado" },
      { status: 503 }
    );
  }

  // 1. Autenticação
  const sbServer = createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await sbServer.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ erro: "nao_autenticado" }, { status: 401 });
  }

  // 2. Buscar perfil do usuário autenticado
  const { data: usuario } = await sbServer
    .from("usuarios")
    .select("id, imobiliaria_id, role")
    .eq("auth_user_id", user.id)
    .eq("ativo", true)
    .single();

  if (!usuario?.imobiliaria_id) {
    return NextResponse.json(
      { erro: "usuario_sem_imobiliaria" },
      { status: 403 }
    );
  }

  // 3. Validar payload
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "payload_invalido" }, { status: 400 });
  }

  const status_novo =
    typeof body.status_novo === "string" ? body.status_novo : "";

  if (!STATUS_VALIDOS.includes(status_novo as LeadStatus)) {
    return NextResponse.json({ erro: "status_invalido" }, { status: 400 });
  }

  const lead_id = params.id;
  const admin = createSupabaseAdmin();

  // 4. Se corretor, verificar que o lead pertence a ele
  if (usuario.role === "corretor") {
    const [{ data: lead }, { data: corretor }] = await Promise.all([
      admin
        .from("leads")
        .select("corretor_id")
        .eq("id", lead_id)
        .eq("imobiliaria_id", usuario.imobiliaria_id)
        .single(),
      admin
        .from("corretores")
        .select("id")
        .eq("usuario_id", usuario.id)
        .eq("imobiliaria_id", usuario.imobiliaria_id)
        .single(),
    ]);

    if (!lead || !corretor || lead.corretor_id !== corretor.id) {
      return NextResponse.json({ erro: "sem_permissao" }, { status: 403 });
    }
  }

  // 5. Chamar RPC atômica
  const { data, error: rpcError } = await admin.rpc("alterar_status_lead", {
    p: {
      lead_id,
      status_novo,
      imobiliaria_id: usuario.imobiliaria_id,
      usuario_id: usuario.id,
    },
  });

  if (rpcError) {
    console.error(
      "[PATCH /api/leads/[id]/status] RPC error:",
      rpcError.message
    );
    return NextResponse.json({ erro: "erro_interno" }, { status: 500 });
  }

  const result = data as {
    status: string;
    lead_id?: string;
    status_anterior?: string;
    status_novo?: string;
  };

  if (result.status === "lead_nao_encontrado") {
    return NextResponse.json({ erro: "lead_nao_encontrado" }, { status: 404 });
  }

  if (result.status === "status_igual") {
    return NextResponse.json({ erro: "status_igual" }, { status: 409 });
  }

  return NextResponse.json(result, { status: 200 });
}
```

---

## Client Component — `components/pipeline/StatusDropdown.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LeadStatus, STATUS_LABEL, PIPELINE_ORDER } from "@/lib/types";

const ALL_STATUS: LeadStatus[] = [...PIPELINE_ORDER, "perdido"];

interface Props {
  leadId: string;
  statusAtual: LeadStatus;
}

export function StatusDropdown({ leadId, statusAtual }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const status_novo = e.target.value as LeadStatus;
    setErro(null);

    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status_novo }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setErro(body.erro ?? "erro_desconhecido");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div>
      <select
        defaultValue={statusAtual}
        onChange={handleChange}
        disabled={isPending}
        className="w-full rounded-lg border border-base-border bg-base-raised px-2 py-1 text-xs text-ink-muted focus:border-action focus:outline-none disabled:opacity-50"
      >
        {ALL_STATUS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      {erro && <p className="mt-1 text-[10px] text-loss">{erro}</p>}
    </div>
  );
}
```

---

## Pipeline Page — `app/(app)/pipeline/page.tsx`

```tsx
import { PageHeader } from "@/components/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { fetchTudo } from "@/lib/supabase-queries";
import { PIPELINE_ORDER, STATUS_LABEL, LeadStatus } from "@/lib/types";
import { StatusDropdown } from "@/components/pipeline/StatusDropdown";

const COLUMN_ACCENT: Record<LeadStatus, string> = {
  novo: "#3B82F6",
  em_contato: "#F59E0B",
  visita: "#D4A636",
  proposta: "#E8C875",
  fechado: "#22C55E",
  perdido: "#EF4444",
};

export default async function PipelinePage() {
  const dados = await fetchTudo();
  const leads = dados.pistas;
  const getCorretor = (id: string | null) =>
    id ? dados.corretores.find((c) => c.id === id) ?? null : null;
  const getEquipe = (id: string) => dados.equipes.find((e) => e.id === id);

  return (
    <>
      <PageHeader
        eyebrow="Acompanhamento"
        title="Pipeline"
        description="Movimente cada lead pelas etapas até o fechamento. Cada coluna é um estágio do funil."
      />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_ORDER.map((status) => {
          const cards = leads.filter((l) => l.status === status);
          const accent = COLUMN_ACCENT[status];
          return (
            <div key={status} className="flex w-72 shrink-0 flex-col">
              {/* Cabeçalho da coluna */}
              <div className="mb-3 flex items-center justify-between rounded-xl border border-base-border bg-base-surface px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} />
                  <span className="text-sm font-semibold text-ink">{STATUS_LABEL[status]}</span>
                </div>
                <span className="tnum rounded-full bg-base-raised px-2 py-0.5 text-xs font-medium text-ink-muted">
                  {cards.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2.5">
                {cards.length === 0 && (
                  <div className="rounded-xl border border-dashed border-base-border py-6 text-center text-xs text-ink-faint">
                    Sem leads
                  </div>
                )}
                {cards.map((lead) => {
                  const corretor = getCorretor(lead.corretorId);
                  const equipe = getEquipe(lead.equipeId);
                  return (
                    <div
                      key={lead.id}
                      className="rounded-xl border border-base-border bg-base-surface p-3 shadow-card transition-colors hover:border-base-raised"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{lead.nome}</span>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: equipe?.cor }} title={equipe?.nome} />
                      </div>
                      <p className="mb-3 text-xs text-ink-muted">{lead.interesse}</p>
                      <div className="mb-3 text-xs text-ink-faint">{lead.regiao} • {lead.faixaValor}</div>
                      <div className="flex items-center justify-between border-t border-base-border pt-2.5">
                        {corretor ? (
                          <div className="flex items-center gap-2">
                            <Avatar iniciais={corretor.avatarIniciais} cor={equipe?.cor} size={24} />
                            <span className="text-xs text-ink-muted">{corretor.nome.split(" ")[0]}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-warn">Aguardando distribuição</span>
                        )}
                      </div>
                      <div className="mt-2.5">
                        <StatusDropdown leadId={lead.id} statusAtual={lead.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
```

---

## Ação manual necessária

Aplicar a Migration 004 no **SQL Editor do Supabase Dashboard** antes de testar:

```
Supabase Dashboard → SQL Editor → colar o conteúdo de 004_rpc_alterar_status.sql → Run
```

Sem isso, a API route retorna `erro_interno` ao tentar chamar `alterar_status_lead`.

---

## Critério de conclusão

- [ ] Migration 004 aplicada no Supabase
- [ ] Clicar no select muda `leads.status` no banco
- [ ] `historico_leads` registra `status_alterado` com `status_anterior` e `status_novo`
- [ ] Card some da coluna atual e aparece na nova após `router.refresh()`
- [ ] Corretor não consegue alterar lead de outro (HTTP 403)
- [ ] `npm run build` passou ✓
