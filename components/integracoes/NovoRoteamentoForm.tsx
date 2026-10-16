"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface EquipeOpcao {
  id: string;
  nome: string;
}

const VAZIO = { page_id: "", page_nome: "", form_id: "", form_nome: "", equipe_id: "" };

// Mensagens por código de erro de POST /api/integracoes/meta/roteamentos.
const MENSAGENS_ERRO: Record<string, string> = {
  pagina_nao_liberada:
    "Esta Página ainda não foi liberada para a sua imobiliária. Fale com o suporte do Lead Master.",
  pagina_de_outra_imobiliaria:
    "Esta Página já está vinculada a outra imobiliária. Confira o ID ou fale com o suporte do Lead Master.",
  equipe_invalida: "Equipe inválida ou inativa. Escolha uma equipe ativa.",
  page_id_invalido: "ID da Página inválido: use apenas números.",
  form_id_invalido: "ID do formulário inválido: use apenas números ou deixe em branco.",
  conflito_concorrente: "Este vínculo acabou de ser salvo em outra sessão. Atualize a página e confira.",
  migration_pendente: "Integração em configuração pela equipe Lead Master.",
  sem_permissao: "Somente o administrador da imobiliária pode criar vínculos.",
  usuario_sem_imobiliaria: "Seu usuário não está ligado a uma imobiliária.",
  nao_autenticado: "Sua sessão expirou. Entre novamente.",
  payload_invalido: "Dados inválidos. Revise os campos e tente de novo.",
  servico_indisponivel: "Serviço temporariamente indisponível. Tente novamente em instantes.",
  supabase_nao_configurado: "Serviço temporariamente indisponível. Tente novamente em instantes.",
};

const inputCls =
  "w-full rounded-xl border border-base-border bg-base-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-action focus:outline-none disabled:opacity-60";

export function NovoRoteamentoForm({ equipes }: { equipes: EquipeOpcao[] }) {
  const router = useRouter();
  const [form, setForm] = useState(VAZIO);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function campo(key: keyof typeof VAZIO) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((f) => ({ ...f, [key]: e.target.value }));
    };
  }

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);

    const pageId = form.page_id.trim();
    if (!/^\d+$/.test(pageId)) {
      setErro("O ID da Página deve conter apenas números.");
      return;
    }
    const formId = form.form_id.trim();
    if (formId && !/^\d+$/.test(formId)) {
      setErro("O ID do formulário deve conter apenas números.");
      return;
    }
    if (!form.equipe_id) {
      setErro("Escolha a equipe de destino.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/integracoes/meta/roteamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page_id: pageId,
          page_nome: form.page_nome.trim() || undefined,
          form_id: formId || null,
          form_nome: form.form_nome.trim() || undefined,
          equipe_id: form.equipe_id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const codigo = typeof data.erro === "string" ? data.erro : "";
        setErro(
          MENSAGENS_ERRO[codigo] ??
            (typeof data.detalhe === "string" ? data.detalhe : null) ??
            "Não foi possível salvar o vínculo. Tente novamente."
        );
        return;
      }
      setSucesso(true);
      setForm(VAZIO);
      router.refresh();
    } catch {
      setErro("Erro de conexão. Verifique a rede.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submeter} className="space-y-4 border-t border-base-border p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Novo vínculo</div>

      {erro && (
        <div className="rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">{erro}</div>
      )}
      {sucesso && (
        <div className="rounded-xl border border-win/30 bg-win/10 px-4 py-3 text-sm text-win">
          Vínculo salvo.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">ID da Página *</label>
          <input
            type="text"
            inputMode="numeric"
            required
            value={form.page_id}
            onChange={campo("page_id")}
            className={inputCls}
            placeholder="Ex.: 123456789012345"
            disabled={loading}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Nome da Página</label>
          <input
            type="text"
            value={form.page_nome}
            onChange={campo("page_nome")}
            className={inputCls}
            placeholder="Opcional, só para você reconhecer"
            disabled={loading}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">ID do formulário</label>
          <input
            type="text"
            inputMode="numeric"
            value={form.form_id}
            onChange={campo("form_id")}
            className={inputCls}
            placeholder="Vazio = regra padrão da Página"
            disabled={loading}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Nome do formulário</label>
          <input
            type="text"
            value={form.form_nome}
            onChange={campo("form_nome")}
            className={inputCls}
            placeholder="Opcional"
            disabled={loading}
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1.5 block text-xs font-medium text-ink-muted">Equipe de destino *</label>
          <select
            required
            value={form.equipe_id}
            onChange={campo("equipe_id")}
            className={inputCls}
            disabled={loading}
          >
            <option value="">Selecione a equipe</option>
            {equipes.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading || equipes.length === 0}
          className="rounded-xl bg-action px-4 py-2 text-sm font-medium text-white hover:bg-action/90 disabled:opacity-60"
        >
          {loading ? "Salvando…" : "Salvar vínculo"}
        </button>
      </div>
    </form>
  );
}
