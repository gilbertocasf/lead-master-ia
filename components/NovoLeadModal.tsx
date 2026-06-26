"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Corretor, Equipe } from "@/lib/types";

interface NovoLeadModalProps {
  equipes: Equipe[];
  corretores: Corretor[];
}

interface ErroState {
  tipo: string;
  detalhe?: string;
  lead_existente?: { id: string; nome: string; created_at: string };
}

const ESTADO_VAZIO = (primeiraEquipe: string) => ({
  nome: "",
  telefone: "",
  origem: "Outro" as const,
  equipe_id: primeiraEquipe,
  interesse: "",
  faixa_valor: "",
  temCaptador: false,
  corretor_id: "",
});

export function NovoLeadModal({ equipes, corretores }: NovoLeadModalProps) {
  const router = useRouter();
  const primeiraEquipe = equipes[0]?.id ?? "";

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<ErroState | null>(null);
  const [form, setForm] = useState(ESTADO_VAZIO(primeiraEquipe));

  // Corretores ativos filtrados pela equipe selecionada no formulário
  const corretoresDaEquipe = corretores.filter(
    (c) => c.equipeId === form.equipe_id && c.ativo
  );

  function fechar() {
    setOpen(false);
    setErro(null);
    setForm(ESTADO_VAZIO(primeiraEquipe));
  }

  function campo(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => {
        const novo = { ...f, [key]: e.target.value };
        // Ao trocar de equipe, zera o corretor selecionado
        if (key === "equipe_id") novo.corretor_id = "";
        return novo;
      });
    };
  }

  function toggleCaptador(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((f) => ({ ...f, temCaptador: e.target.checked, corretor_id: "" }));
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    // Validação client-side: captador marcado mas não selecionado
    if (form.temCaptador && !form.corretor_id) {
      setErro({ tipo: "corretor_obrigatorio" });
      return;
    }

    setLoading(true);

    try {
      const payload: Record<string, string | null> = {
        nome: form.nome,
        telefone: form.telefone,
        origem: form.origem,
        equipe_id: form.equipe_id,
        interesse: form.interesse || null,
        faixa_valor: form.faixa_valor || null,
      };

      // Cenário A: inclui corretor_id apenas se captador foi identificado
      if (form.temCaptador && form.corretor_id) {
        payload.corretor_id = form.corretor_id;
      }

      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data: { erro?: string; detalhe?: string; lead_existente?: { id: string; nome: string; created_at: string } } = {};
      try {
        data = await res.json();
      } catch {
        setErro({ tipo: "erro_interno" });
        return;
      }

      if (res.status === 409) {
        setErro({ tipo: "duplicata", lead_existente: data.lead_existente });
        return;
      }

      if (!res.ok) {
        setErro({ tipo: data.erro ?? "erro_interno", detalhe: data.detalhe });
        return;
      }

      fechar();
      router.refresh();
    } catch {
      setErro({ tipo: "erro_rede" });
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-action focus:outline-none";

  function mensagemErro(e: ErroState): string {
    switch (e.tipo) {
      case "corretor_obrigatorio":
        return "Selecione o corretor que captou o lead.";
      case "corretor_invalido":
        return "Corretor inválido ou não pertence à equipe selecionada.";
      case "sem_equipe_disponivel":
        return "Nenhuma equipe ativa disponível.";
      case "servico_indisponivel":
        return "Serviço indisponível. Chave de serviço não configurada no servidor.";
      case "erro_rede":
        return "Erro de conexão. Verifique a rede e tente novamente.";
      default:
        return e.detalhe ? `Erro interno: ${e.detalhe}` : "Erro ao cadastrar lead. Tente novamente.";
    }
  }

  return (
    <>
      {/* Botão que abre o modal */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Cadastrar lead
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={fechar}
            aria-hidden="true"
          />

          {/* Painel */}
          <div className="relative w-full max-w-md rounded-2xl border border-base-border bg-base-surface shadow-2xl">
            {/* Cabeçalho */}
            <div className="flex items-center justify-between border-b border-base-border px-5 py-4">
              <h2 className="font-display text-base font-semibold text-ink">
                Novo lead
              </h2>
              <button
                onClick={fechar}
                className="rounded-lg p-1 text-ink-faint hover:text-ink"
                aria-label="Fechar"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Formulário */}
            <form onSubmit={submeter} className="space-y-4 p-5">
              {/* Erro de duplicata */}
              {erro?.tipo === "duplicata" && (
                <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm">
                  <p className="font-medium text-warn">
                    Telefone já cadastrado nas últimas 24h
                  </p>
                  {erro.lead_existente && (
                    <p className="mt-1 text-ink-muted">
                      Lead existente:{" "}
                      <span className="font-medium text-ink">
                        {erro.lead_existente.nome}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {/* Erro genérico */}
              {erro && erro.tipo !== "duplicata" && (
                <div className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
                  {mensagemErro(erro)}
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Nome *
                </label>
                <input
                  type="text"
                  required
                  value={form.nome}
                  onChange={campo("nome")}
                  className={inputCls}
                  placeholder="Nome completo do lead"
                />
              </div>

              {/* Telefone */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Telefone *
                </label>
                <input
                  type="tel"
                  required
                  value={form.telefone}
                  onChange={campo("telefone")}
                  className={inputCls}
                  placeholder="(00) 00000-0000"
                />
              </div>

              {/* Origem + Equipe */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                    Origem *
                  </label>
                  <select
                    required
                    value={form.origem}
                    onChange={campo("origem")}
                    className={inputCls}
                  >
                    <option value="Instagram">Instagram</option>
                    <option value="Facebook">Facebook</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                    Equipe *
                  </label>
                  {equipes.length === 1 ? (
                    <div className={`${inputCls} cursor-default select-none opacity-70`}>
                      {equipes[0].nome}
                    </div>
                  ) : (
                    <select
                      required
                      value={form.equipe_id}
                      onChange={campo("equipe_id")}
                      className={inputCls}
                    >
                      {equipes.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Interesse */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Interesse
                </label>
                <input
                  type="text"
                  value={form.interesse}
                  onChange={campo("interesse")}
                  className={inputCls}
                  placeholder="Ex.: Compra • Apto 2 quartos"
                />
              </div>

              {/* Faixa de valor */}
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                  Faixa de valor
                </label>
                <input
                  type="text"
                  value={form.faixa_valor}
                  onChange={campo("faixa_valor")}
                  className={inputCls}
                  placeholder="Ex.: R$ 400–600 mil"
                />
              </div>

              {/* ── Cenário A: captador conhecido ─────────────────────── */}
              <div className="rounded-xl border border-base-border bg-base-raised/40 px-4 py-3">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.temCaptador}
                    onChange={toggleCaptador}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-action"
                  />
                  <div>
                    <span className="text-sm font-medium text-ink">
                      Lead captado por corretor específico
                    </span>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      Marque quando o corretor trouxe o cliente por fora do
                      sistema (indicação, plantão físico, contato direto).
                    </p>
                  </div>
                </label>

                {/* Seletor de corretor — exibido somente se temCaptador */}
                {form.temCaptador && (
                  <div className="mt-3">
                    <label className="mb-1.5 block text-xs font-medium text-ink-muted">
                      Corretor captador *
                    </label>
                    {corretoresDaEquipe.length === 0 ? (
                      <p className="text-xs text-warn">
                        Nenhum corretor ativo encontrado nesta equipe.
                      </p>
                    ) : (
                      <select
                        required={form.temCaptador}
                        value={form.corretor_id}
                        onChange={campo("corretor_id")}
                        className={inputCls}
                      >
                        <option value="">Selecionar corretor…</option>
                        {corretoresDaEquipe.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
              </div>

              {/* Distribuição automática — nota informativa */}
              {!form.temCaptador && (
                <p className="text-xs text-ink-faint">
                  Sem captador definido: o lead será distribuído automaticamente
                  ao próximo corretor de plantão da equipe.
                </p>
              )}

              {/* Ações */}
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
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90 disabled:opacity-60"
                >
                  {loading ? "Cadastrando…" : "Cadastrar lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
