"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MENSAGENS: Record<string, string> = {
  nome_obrigatorio: "O nome da equipe é obrigatório.",
  gerente_obrigatorio: "O nome do gerente responsável é obrigatório.",
  sem_permissao: "Sem permissão para criar equipes.",
  servico_indisponivel: "Serviço indisponível. Chave de serviço não configurada no servidor.",
  erro_interno: "Erro interno. Tente novamente.",
  erro_rede: "Erro de conexão. Verifique a rede.",
};

const ESTADO_VAZIO = { nome: "", gerente: "" };

export function NovaEquipeModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [form, setForm] = useState(ESTADO_VAZIO);

  function fechar() {
    if (loading) return;
    setOpen(false);
    setErro(null);
    setSucesso(false);
    setForm(ESTADO_VAZIO);
  }

  function campo(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    try {
      const res = await fetch("/api/equipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: form.nome, gerente: form.gerente }),
      });

      let data: { erro?: string; detalhe?: string } = {};
      try {
        data = await res.json();
      } catch {
        setErro(MENSAGENS.erro_interno);
        return;
      }

      if (!res.ok) {
        setErro(MENSAGENS[data.erro ?? ""] ?? data.detalhe ?? MENSAGENS.erro_interno);
        return;
      }

      setSucesso(true);
      router.refresh();
      setTimeout(() => {
        fechar();
      }, 1200);
    } catch {
      setErro(MENSAGENS.erro_rede);
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-action focus:outline-none";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Nova equipe
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={fechar} aria-hidden="true" />

          <div className="relative w-full max-w-sm rounded-2xl border border-base-border bg-base-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-base-border px-5 py-4">
              <h2 className="font-display text-base font-semibold text-ink">Nova equipe</h2>
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

            <form onSubmit={submeter} className="space-y-4 p-5">
              {erro && (
                <div className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
                  {erro}
                </div>
              )}

              {sucesso && (
                <div className="rounded-xl border border-win/30 bg-win/10 px-4 py-3 text-sm text-win">
                  Equipe criada com sucesso!
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Nome da equipe *
                </label>
                <input
                  type="text"
                  required
                  value={form.nome}
                  onChange={campo("nome")}
                  className={inputCls}
                  placeholder="Ex.: Equipe Atlântico"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Gerente responsável *
                </label>
                <input
                  type="text"
                  required
                  value={form.gerente}
                  onChange={campo("gerente")}
                  className={inputCls}
                  placeholder="Nome do gerente"
                  disabled={loading}
                />
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
                  type="submit"
                  disabled={loading || sucesso}
                  className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90 disabled:opacity-60"
                >
                  {loading ? "Criando…" : sucesso ? "Criado!" : "Criar equipe"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
