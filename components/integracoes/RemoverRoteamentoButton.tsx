"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RemoverRoteamentoButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function remover() {
    if (!window.confirm("Remover este vínculo? Novos leads deste formulário deixarão de ir para a equipe escolhida.")) {
      return;
    }
    setErro(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/integracoes/meta/roteamentos/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(
          data.erro === "migration_pendente"
            ? "Integração ainda não instalada no banco."
            : data.detalhe ?? "Não foi possível remover. Tente novamente."
        );
        return;
      }
      router.refresh();
    } catch {
      setErro("Erro de conexão. Verifique a rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={remover}
        disabled={loading}
        className="rounded-lg border border-loss/30 px-3 py-1.5 text-xs font-medium text-loss transition-colors hover:bg-loss/10 disabled:opacity-50"
      >
        {loading ? "Removendo…" : "Remover"}
      </button>
      {erro && <p className="mt-1 text-[11px] text-loss">{erro}</p>}
    </div>
  );
}
