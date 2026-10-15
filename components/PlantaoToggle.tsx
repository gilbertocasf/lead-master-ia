"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  corretorId: string;
  emPlantao: boolean;
  nome: string;
}

const MENSAGENS: Record<string, string> = {
  sem_permissao: "Sem permissão.",
  corretor_inativo: "Corretor inativo.",
  corretor_nao_encontrado: "Corretor não encontrado.",
  nao_autenticado: "Sessão expirada.",
  erro_rede: "Falha de conexão.",
  erro_interno: "Erro. Tente novamente.",
};

export function PlantaoToggle({ corretorId, emPlantao, nome }: Props) {
  const router = useRouter();
  const [ligado, setLigado] = useState(emPlantao);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mantém o estado alinhado com o servidor após router.refresh()
  useEffect(() => {
    setLigado(emPlantao);
  }, [emPlantao]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function alternar() {
    if (loading) return;
    const novo = !ligado;
    setErro(null);
    setInfo(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/corretores/${corretorId}/plantao`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ em_plantao: novo }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(MENSAGENS[data.erro] ?? MENSAGENS.erro_interno);
        return;
      }

      setLigado(Boolean(data.em_plantao ?? novo));

      if (novo && data.fila) {
        const d = Number(data.fila.distribuidos ?? 0);
        const r = Number(data.fila.restantes ?? 0);
        if (d > 0) {
          setInfo(
            `${d} ${d === 1 ? "lead distribuído" : "leads distribuídos"} da fila` +
              (r > 0 ? `, ${r} aguardando` : "")
          );
        }
      }
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setInfo(null), 5000);

      router.refresh();
    } catch {
      setErro(MENSAGENS.erro_rede);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 border-t border-base-border pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-muted">
          {loading ? "Atualizando…" : ligado ? "Em plantão" : "Fora do plantão"}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={ligado}
          aria-label={`Plantão de ${nome}`}
          onClick={alternar}
          disabled={loading}
          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action disabled:opacity-60 ${
            ligado ? "bg-win" : "bg-base-raised border border-base-border"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              ligado ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {erro && (
        <p role="alert" className="mt-1.5 text-[11px] text-loss">
          {erro}
        </p>
      )}
      {info && !erro && (
        <p role="status" className="mt-1.5 text-[11px] text-win">
          {info}
        </p>
      )}
    </div>
  );
}
