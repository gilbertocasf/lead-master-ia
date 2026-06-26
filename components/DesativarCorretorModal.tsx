"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Corretor } from "@/lib/types";

interface Props {
  corretor: Corretor;
}

const MENSAGENS: Record<string, string> = {
  nao_autenticado: "Sessão expirada. Faça login novamente.",
  sem_permissao: "Apenas administradores podem remover corretores.",
  corretor_nao_encontrado: "Corretor não encontrado.",
  erro_supabase: "Erro no banco de dados. Tente novamente.",
  erro_interno: "Erro interno. Tente novamente.",
  erro_rede: "Erro de conexão. Verifique a rede.",
};

export function DesativarCorretorModal({ corretor }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function fechar() {
    if (loading) return;
    setOpen(false);
    setErro(null);
    setSucesso(false);
  }

  async function confirmar() {
    setErro(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/corretores/${corretor.id}`, {
        method: "DELETE",
      });

      let data: { sucesso?: boolean; erro?: string; codigo?: string } = {};
      try {
        data = await res.json();
      } catch {
        setErro(MENSAGENS.erro_interno);
        return;
      }

      if (!res.ok) {
        const codigo = data.codigo ?? "";
        setErro(MENSAGENS[codigo] ?? data.erro ?? MENSAGENS.erro_interno);
        return;
      }

      setSucesso(true);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setSucesso(false);
      }, 1500);
    } catch {
      setErro(MENSAGENS.erro_rede);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full rounded-lg border border-loss/30 px-3 py-1.5 text-xs font-medium text-loss hover:border-loss hover:bg-loss/10"
      >
        Remover corretor
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={fechar}
            aria-hidden="true"
          />

          <div className="relative w-full max-w-sm rounded-2xl border border-base-border bg-base-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-base-border px-5 py-4">
              <div>
                <h2 className="font-display text-base font-semibold text-ink">
                  Remover corretor
                </h2>
                <p className="text-xs text-ink-muted">{corretor.nome}</p>
              </div>
              <button
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
                  Corretor desativado com sucesso.
                </div>
              )}

              {!sucesso && (
                <>
                  <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink-muted">
                    <p className="font-medium text-ink">O que acontece ao remover:</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                      <li>O corretor será <strong>desativado</strong> e sairá do plantão imediatamente.</li>
                      <li>Ele <strong>não receberá novos leads</strong>.</li>
                      <li>O <strong>histórico de leads e vendas</strong> é preservado.</li>
                      <li>O cadastro fica arquivado e pode ser consultado no banco.</li>
                    </ul>
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
                      onClick={confirmar}
                      disabled={loading}
                      className="rounded-xl bg-loss px-4 py-2 text-sm font-medium text-white hover:bg-loss/90 disabled:opacity-60"
                    >
                      {loading ? "Removendo…" : "Confirmar remoção"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
