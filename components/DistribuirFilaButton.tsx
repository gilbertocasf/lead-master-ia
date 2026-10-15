"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  equipeId: string;
}

const MENSAGENS: Record<string, string> = {
  migration_pendente: "Recurso indisponível: migrations pendentes no banco.",
  sem_permissao: "Sem permissão para esta equipe.",
  equipe_nao_encontrada: "Equipe não encontrada.",
  nao_autenticado: "Sessão expirada.",
  erro_rede: "Falha de conexão.",
  erro_interno: "Erro. Tente novamente.",
};

export function DistribuirFilaButton({ equipeId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  async function distribuir() {
    if (loading) return;
    setErro(null);
    setResultado(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/equipes/${equipeId}/distribuir-fila`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(MENSAGENS[data.erro] ?? MENSAGENS.erro_interno);
        return;
      }

      const d = Number(data.distribuidos ?? 0);
      const r = Number(data.restantes ?? 0);
      setResultado(
        `${d} ${d === 1 ? "distribuído" : "distribuídos"}, ${r} aguardando`
      );
      router.refresh();
    } catch {
      setErro(MENSAGENS.erro_rede);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={distribuir}
        disabled={loading}
        className="whitespace-nowrap rounded-lg border border-base-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-action hover:text-action disabled:opacity-50"
      >
        {loading ? "Distribuindo…" : "Distribuir fila"}
      </button>
      {erro && (
        <p role="alert" className="max-w-[16rem] text-right text-[11px] text-loss">
          {erro}
        </p>
      )}
      {resultado && !erro && (
        <p role="status" className="text-right text-[11px] text-win">
          {resultado}
        </p>
      )}
    </div>
  );
}
