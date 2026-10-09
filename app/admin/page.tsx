import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { SetupClienteForm } from "./SetupClienteForm";

function emailsAutorizados(): string[] {
  const raw = process.env.INTERNAL_OWNER_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export default async function SetupClientePage() {
  const sb = createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user?.email) redirect("/login");

  const autorizados = emailsAutorizados();
  const autorizado =
    autorizados.length > 0 &&
    autorizados.includes(user.email.toLowerCase());

  if (!autorizado) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-bg p-4">
        <div className="w-full max-w-sm rounded-2xl border border-loss/30 bg-base-surface p-8 text-center">
          <p className="text-sm font-semibold text-loss">Acesso não autorizado</p>
          <p className="mt-2 text-xs text-ink-muted">
            Esta página é restrita a operadores internos do sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-ink-faint">
            Lead Master IA — Operação interna
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold text-ink">
            Novo cliente
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Cria uma imobiliária e o primeiro usuário administrador.
          </p>
        </div>

        <div className="rounded-2xl border border-warn/30 bg-warn/5 px-4 py-3 text-xs text-warn mb-6">
          Página interna. Não compartilhe esta URL com clientes.
        </div>

        <SetupClienteForm />
      </div>
    </div>
  );
}
