# components/pipeline/StatusDropdown.tsx

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
