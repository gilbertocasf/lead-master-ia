"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReprocessarEventoButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function reprocessar() {
    setErro(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/integracoes/meta/eventos/${id}/reprocessar`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(
          data.erro === "migration_pendente"
            ? "Integração ainda não instalada no banco."
            : data.detalhe ?? "Não foi possível reprocessar."
        );
        return;
      }
      router.refresh();
    } catch {
      setErro("Erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={reprocessar}
        disabled={loading}
        className="whitespace-nowrap rounded-lg border border-action/30 px-3 py-1 text-xs font-medium text-action transition-colors hover:bg-action/10 disabled:opacity-50"
      >
        {loading ? "Reprocessando…" : "Reprocessar"}
      </button>
      {erro && <p className="mt-1 text-[11px] text-loss">{erro}</p>}
    </div>
  );
}
