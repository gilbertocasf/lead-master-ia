import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-base px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-gold">
          Erro 404
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
          Página não encontrada
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          O endereço não existe ou foi movido. Volte para o início ou abra a
          lista de leads.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="rounded-xl bg-action px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-action/90"
          >
            Início
          </Link>
          <Link
            href="/leads"
            className="rounded-xl border border-base-border bg-base-surface px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-base-raised hover:text-ink"
          >
            Leads
          </Link>
        </div>
      </div>
    </div>
  );
}
