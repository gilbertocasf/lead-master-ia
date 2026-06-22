"use client";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-base-border bg-base/80 px-4 py-3 backdrop-blur lg:px-8">
      {/* Botão menu — só mobile */}
      <button
        onClick={onMenu}
        className="rounded-lg p-2 text-ink-muted hover:bg-base-raised hover:text-ink lg:hidden"
        aria-label="Abrir menu"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Filtro de período (mock visual) */}
      <div className="flex items-center gap-2 rounded-xl border border-base-border bg-base-surface px-3 py-2 text-sm text-ink-muted">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-ink-faint" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        Junho 2026
      </div>

    </header>
  );
}
