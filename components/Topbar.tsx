"use client";

export function Topbar({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-base-border bg-base/80 px-4 py-3 backdrop-blur lg:hidden">
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

      <span className="font-display text-sm font-bold tracking-tight text-ink">
        Lead Master <span className="text-gold">IA</span>
      </span>
    </header>
  );
}
