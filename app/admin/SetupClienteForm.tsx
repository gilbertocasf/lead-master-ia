"use client";

import { useState } from "react";
import { criarCliente, type SetupResult } from "./actions";

const ERROS: Record<string, string> = {
  nao_autenticado: "Sessão expirada. Faça login novamente.",
  sem_permissao: "Seu e-mail não está autorizado a usar esta página.",
  nome_imobiliaria_obrigatorio: "Informe o nome da imobiliária.",
  nome_admin_obrigatorio: "Informe o nome do administrador.",
  email_invalido: "Informe um e-mail válido para o administrador.",
  senha_muito_curta: "A senha precisa ter pelo menos 8 caracteres.",
  servico_indisponivel: "Chave de serviço não configurada. Contate o suporte técnico.",
  erro_criar_imobiliaria: "Erro ao criar imobiliária no banco de dados.",
  erro_criar_auth_user: "Erro ao criar usuário de autenticação.",
  erro_criar_usuario: "Erro ao criar perfil do usuário.",
};

export function SetupClienteForm() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await criarCliente(fd);
      setResult(res);
    } finally {
      setLoading(false);
    }
  }

  const inputCls =
    "w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-action focus:outline-none";

  if (result?.ok && result.dados) {
    return (
      <div className="rounded-2xl border border-win/30 bg-win/10 p-6 text-sm space-y-3">
        <p className="font-semibold text-win">Cliente criado com sucesso.</p>
        <div className="space-y-1 text-xs text-ink-muted font-mono bg-base-raised rounded-xl p-3">
          <p>imobiliaria_id: {result.dados.imobiliaria_id}</p>
          <p>usuario_id: {result.dados.usuario_id}</p>
          <p>auth_user_id: {result.dados.auth_user_id}</p>
        </div>
        <p className="text-xs text-ink-muted">
          Anote os IDs acima. O admin pode fazer login com as credenciais que você informou.
        </p>
        <button
          onClick={() => setResult(null)}
          className="mt-2 rounded-xl border border-base-border px-4 py-2 text-xs font-medium text-ink-muted hover:text-ink"
        >
          Criar outro cliente
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-base-border bg-base-surface p-6">
      {result && !result.ok && (
        <div className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
          {ERROS[result.erro ?? ""] ?? result.detalhe ?? "Erro desconhecido."}
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold uppercase tracking-widest text-ink-faint mb-3">
          Imobiliária
        </legend>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">
            Nome da imobiliária *
          </label>
          <input
            type="text"
            name="nome_imobiliaria"
            required
            className={inputCls}
            placeholder="Ex.: Imobiliária Central"
          />
        </div>
      </fieldset>

      <div className="border-t border-base-border pt-4">
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold uppercase tracking-widest text-ink-faint mb-3">
            Administrador inicial
          </legend>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">
              Nome completo *
            </label>
            <input
              type="text"
              name="nome_admin"
              required
              className={inputCls}
              placeholder="Ex.: João Silva"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">
              E-mail *
            </label>
            <input
              type="email"
              name="email_admin"
              required
              className={inputCls}
              placeholder="admin@imobiliaria.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-muted">
              Senha inicial *
            </label>
            <input
              type="password"
              name="senha_admin"
              required
              minLength={8}
              className={inputCls}
              placeholder="Mínimo 8 caracteres"
            />
          </div>
        </fieldset>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-medium text-white hover:bg-action/90 disabled:opacity-60"
        >
          {loading ? "Criando…" : "Criar cliente"}
        </button>
      </div>
    </form>
  );
}
