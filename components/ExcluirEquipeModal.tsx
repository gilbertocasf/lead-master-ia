"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Equipe } from "@/lib/types";

interface Props {
  equipe: Equipe;
}

const MENSAGENS: Record<string, string> = {
  nao_autenticado: "Sessão expirada. Faça login novamente.",
  sem_permissao: "Apenas administradores podem remover equipes.",
  equipe_nao_encontrada: "Equipe não encontrada.",
  equipe_com_corretores: "Transfira ou desative os corretores desta equipe antes de remover a equipe.",
  equipe_com_historico: "Esta equipe possui histórico vinculado e não pode ser excluída com segurança agora.",
  schema_sem_ativo: "Esta equipe possui histórico vinculado e não pode ser excluída com segurança agora.",
  erro_supabase: "Erro no banco de dados. Tente novamente.",
  erro_interno: "Erro interno. Tente novamente.",
  erro_rede: "Erro de conexão. Verifique a rede.",
};

export function ExcluirEquipeModal({ equipe }: Props) {
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
      const res = await fetch(`/api/equipes/${equipe.id}`, {
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
        className="rounded-lg border border-loss/30 px-3 py-1.5 text-xs font-medium text-loss hover:border-loss hover:bg-loss/10"
      >
        Remover equipe
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
                  Remover equipe
                </h2>
                <p className="text-xs text-ink-muted">{equipe.nome}</p>
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
                  Equipe desativada com sucesso.
                </div>
              )}

              {!sucesso && (
                <>
                  <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-ink-muted">
                    <p className="font-medium text-ink">O que acontece ao remover:</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                      <li>A equipe será <strong>desativada</strong> e não aparecerá para novos cadastros.</li>
                      <li>Se houver corretores ativos, a remoção será <strong>bloqueada</strong> — transfira-os primeiro.</li>
                      <li>O <strong>histórico de leads</strong> da equipe será preservado.</li>
                      <li>Corretores inativos vinculados não são apagados automaticamente.</li>
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
