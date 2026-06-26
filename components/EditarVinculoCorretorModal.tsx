"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Corretor, Equipe } from "@/lib/types";
import type { UsuarioCorretor } from "@/lib/supabase-queries";

interface Props {
  corretor: Corretor;
  equipes: Equipe[];
  usuariosCorretores: UsuarioCorretor[];
}

const MENSAGENS: Record<string, string> = {
  equipe_invalida: "Equipe inválida ou não pertence à imobiliária.",
  usuario_invalido: "Usuário inválido, inativo ou não tem perfil de corretor.",
  usuario_ja_vinculado: "Este usuário já está vinculado a outro corretor.",
  nenhum_campo_para_atualizar: "Nenhuma alteração detectada.",
  sem_permissao: "Sem permissão para esta operação.",
  corretor_nao_encontrado: "Corretor não encontrado.",
  erro_interno: "Erro interno. Tente novamente.",
  erro_rede: "Erro de conexão. Verifique a rede.",
};

export function EditarVinculoCorretorModal({
  corretor,
  equipes,
  usuariosCorretores,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [equipeId, setEquipeId] = useState(corretor.equipeId);
  const [usuarioId, setUsuarioId] = useState(corretor.usuarioId ?? "");

  function fechar() {
    if (loading) return;
    setOpen(false);
    setErro(null);
    setSucesso(false);
    setEquipeId(corretor.equipeId);
    setUsuarioId(corretor.usuarioId ?? "");
  }

  async function salvar() {
    setErro(null);
    setSucesso(false);
    setLoading(true);

    try {
      const body = {
        equipe_id: equipeId,
        usuario_id: usuarioId || null,
      };

      const res = await fetch(`/api/corretores/${corretor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setErro(MENSAGENS[data.erro] ?? MENSAGENS.erro_interno);
        return;
      }

      setSucesso(true);
      router.refresh();
      setTimeout(() => {
        setOpen(false);
        setSucesso(false);
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
        onClick={() => setOpen(true)}
        className="mt-3 w-full rounded-lg border border-base-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:border-action hover:text-action"
      >
        Editar vínculo
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
                  Editar vínculo
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
                  Vínculo atualizado com sucesso.
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Equipe
                </label>
                <select
                  value={equipeId}
                  onChange={(e) => setEquipeId(e.target.value)}
                  disabled={loading}
                  className={inputCls}
                >
                  {equipes.map((eq) => (
                    <option key={eq.id} value={eq.id}>
                      {eq.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Usuário de login
                </label>
                <select
                  value={usuarioId}
                  onChange={(e) => setUsuarioId(e.target.value)}
                  disabled={loading}
                  className={inputCls}
                >
                  <option value="">Sem usuário vinculado</option>
                  {usuariosCorretores.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-ink-faint">
                  Selecione o usuário de login deste corretor.
                </p>
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
                  onClick={salvar}
                  disabled={loading || sucesso}
                  className="rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90 disabled:opacity-60"
                >
                  {loading ? "Salvando…" : sucesso ? "Salvo!" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
