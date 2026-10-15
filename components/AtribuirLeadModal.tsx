"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface CorretorOpcao {
  id: string;
  nome: string;
  emPlantao: boolean;
}

interface Props {
  leadId: string;
  leadNome: string;
  corretores: CorretorOpcao[];
}

const MENSAGENS: Record<string, string> = {
  migration_pendente: "Recurso indisponível: migrations pendentes no banco.",
  corretor_obrigatorio: "Escolha um corretor.",
  corretor_invalido: "Corretor inválido ou fora da equipe do lead.",
  lead_nao_encontrado: "Lead não encontrado.",
  sem_permissao: "Sem permissão para este lead.",
  nao_autenticado: "Sessão expirada.",
  erro_interno: "Erro interno. Tente novamente.",
  erro_rede: "Erro de conexão. Verifique a rede.",
};

export function AtribuirLeadModal({ leadId, leadNome, corretores }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [corretorId, setCorretorId] = useState("");

  function fechar() {
    if (loading) return;
    setOpen(false);
    setErro(null);
    setSucesso(null);
    setCorretorId("");
  }

  async function atribuir() {
    if (!corretorId) {
      setErro(MENSAGENS.corretor_obrigatorio);
      return;
    }
    setErro(null);
    setSucesso(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/leads/${leadId}/atribuir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corretor_id: corretorId }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErro(MENSAGENS[data.erro] ?? MENSAGENS.erro_interno);
        return;
      }

      setSucesso(
        data.corretor_nome
          ? `Lead atribuído a ${data.corretor_nome}.`
          : "Lead atribuído."
      );
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setSucesso(null);
        setCorretorId("");
      }, 1200);
    } catch {
      setErro(MENSAGENS.erro_rede);
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink focus:border-action focus:outline-none";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-lg border border-base-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-action hover:text-action"
      >
        Atribuir
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Atribuir lead"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={fechar}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-sm rounded-2xl border border-base-border bg-base-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-base-border px-5 py-4">
              <div className="min-w-0">
                <h2 className="font-display text-base font-semibold text-ink">
                  Atribuir lead
                </h2>
                <p className="truncate text-xs text-ink-muted">{leadNome}</p>
              </div>
              <button
                type="button"
                onClick={fechar}
                disabled={loading}
                className="rounded-lg p-1 text-ink-faint hover:text-ink disabled:opacity-50"
                aria-label="Fechar"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 p-5">
              {erro && (
                <div className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
                  {erro}
                </div>
              )}
              {sucesso && (
                <div className="rounded-xl border border-win/30 bg-win/10 px-4 py-3 text-sm text-win">
                  {sucesso}
                </div>
              )}

              <div>
                <label
                  htmlFor={`atribuir-${leadId}`}
                  className="mb-1.5 block text-xs font-medium text-ink-muted"
                >
                  Corretor
                </label>
                {corretores.length === 0 ? (
                  <p className="text-xs text-ink-faint">
                    Nenhum corretor ativo nesta equipe.
                  </p>
                ) : (
                  <select
                    id={`atribuir-${leadId}`}
                    value={corretorId}
                    onChange={(e) => setCorretorId(e.target.value)}
                    disabled={loading || !!sucesso}
                    className={inputCls}
                  >
                    <option value="">Selecione…</option>
                    {corretores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                        {c.emPlantao ? " (em plantão)" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={fechar}
                  disabled={loading}
                  className="rounded-xl border border-base-border px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={atribuir}
                  disabled={loading || !!sucesso || corretores.length === 0}
                  className="rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90 disabled:opacity-60"
                >
                  {loading ? "Atribuindo…" : sucesso ? "Atribuído!" : "Atribuir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
