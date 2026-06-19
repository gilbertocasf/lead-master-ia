import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase-server";
import { isMockMode } from "@/lib/supabase";
import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  // Mock mode (dev local sem Supabase): redireciona direto para o app.
  if (isMockMode) redirect("/");

  const sb = createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (user) redirect("/");

  const errMsg = searchParams.error
    ? decodeURIComponent(searchParams.error)
    : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="w-full max-w-sm">
        {/* Marca */}
        <div className="mb-8 text-center">
          <div className="mb-2 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/15 ring-1 ring-gold/40">
              <TrophyIcon />
            </div>
          </div>
          <div className="font-display text-2xl font-bold tracking-tight text-ink">
            Lead Master <span className="text-gold">IA</span>
          </div>
          <p className="mt-1 text-sm text-ink-faint">Acesso ao sistema</p>
        </div>

        {/* Erro */}
        {errMsg && (
          <div className="mb-4 rounded-xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss">
            {errMsg}
          </div>
        )}

        {/* Formulário */}
        <form action={login} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-ink-muted"
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="seu@email.com"
              className="w-full rounded-xl border border-base-border bg-base-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-ink-muted"
            >
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-xl border border-base-border bg-base-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-action focus:outline-none focus:ring-1 focus:ring-action"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-action px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-action/90"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-faint">
          Sem cadastro público. Solicite acesso ao administrador.
        </p>
      </div>
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6 text-gold"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}
