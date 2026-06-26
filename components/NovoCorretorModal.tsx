"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Equipe } from "@/lib/types";

interface Props {
  equipes: Equipe[];
}

const MENSAGENS: Record<string, string> = {
  nome_obrigatorio: "O nome do corretor é obrigatório.",
  equipe_obrigatorio: "Selecione a equipe do corretor.",
  equipe_invalida: "Equipe inválida ou não pertence à imobiliária.",
  email_ja_cadastrado: "Este e-mail já está cadastrado para outro corretor.",
  sem_permissao: "Sem permissão para criar corretores.",
  servico_indisponivel: "Serviço indisponível. Chave de serviço não configurada no servidor.",
  erro_interno: "Erro interno. Tente novamente.",
  erro_rede: "Erro de conexão. Verifique a rede.",
};

const estadoVazio = (primeiraEquipe: string) => ({
  nome: "",
  email: "",
  telefone: "",
  equipe_id: primeiraEquipe,
  em_plantao: false,
  ativo: true,
});

export function NovoCorretorModal({ equipes }: Props) {
  const router = useRouter();
  const primeiraEquipe = equipes[0]?.id ?? "";

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);
  const [form, setForm] = useState(estadoVazio(primeiraEquipe));

  function fechar() {
    if (loading) return;
    setOpen(false);
    setErro(null);
    setSucesso(false);
    setForm(estadoVazio(primeiraEquipe));
  }

  function campo(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };
  }

  function toggle(key: "em_plantao" | "ativo") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.checked }));
    };
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);

    try {
      const res = await fetch("/api/corretores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          email: form.email || null,
          telefone: form.telefone || null,
          equipe_id: form.equipe_id,
          em_plantao: form.em_plantao,
          ativo: form.ativo,
        }),
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
    "w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-action focus:outline-none disabled:opacity-60";

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
        Adicionar corretor
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={fechar} aria-hidden="true" />

          <div className="relative w-full max-w-md rounded-2xl border border-base-border bg-base-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-base-border px-5 py-4">
              <h2 className="font-display text-base font-semibold text-ink">Adicionar corretor</h2>
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
                  Corretor adicionado com sucesso!
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Nome completo *
                </label>
                <input
                  type="text"
                  required
                  value={form.nome}
                  onChange={campo("nome")}
                  className={inputCls}
                  placeholder="Nome do corretor"
                  disabled={loading}
                />
              </div>

              {/* Equipe */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Equipe *
                </label>
                {equipes.length === 1 ? (
                  <div className={`${inputCls} cursor-default opacity-70`}>
                    {equipes[0].nome}
                  </div>
                ) : (
                  <select
                    required
                    value={form.equipe_id}
                    onChange={campo("equipe_id")}
                    className={inputCls}
                    disabled={loading}
                  >
                    {equipes.map((eq) => (
                      <option key={eq.id} value={eq.id}>{eq.nome}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* E-mail + Telefone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={campo("email")}
                    className={inputCls}
                    placeholder="corretor@imob.com"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                    Telefone
                  </label>
                  <input
                    type="tel"
                    value={form.telefone}
                    onChange={campo("telefone")}
                    className={inputCls}
                    placeholder="(00) 00000-0000"
                    disabled={loading}
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2 rounded-xl border border-base-border bg-base-raised/40 px-4 py-3">
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <div>
                    <span className="text-sm font-medium text-ink">Ativo</span>
                    <p className="text-xs text-ink-muted">Corretor visível no sistema e elegível para receber leads.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={toggle("ativo")}
                    className="h-4 w-4 shrink-0 accent-action"
                    disabled={loading}
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-base-border pt-2">
                  <div>
                    <span className="text-sm font-medium text-ink">Em plantão</span>
                    <p className="text-xs text-ink-muted">Entra imediatamente na fila de distribuição.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.em_plantao}
                    onChange={toggle("em_plantao")}
                    className="h-4 w-4 shrink-0 accent-action"
                    disabled={loading}
                  />
                </label>
              </div>

              <p className="text-[11px] text-ink-faint">
                A ordem de plantão é definida automaticamente como a próxima disponível da equipe. O vínculo com usuário de login pode ser feito depois em &ldquo;Editar vínculo&rdquo;.
              </p>

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
                  {loading ? "Adicionando…" : sucesso ? "Adicionado!" : "Adicionar corretor"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
