"use client";

import { useState } from "react";

export function ComingSoonButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [mostrar, setMostrar] = useState(false);

  function handleClick() {
    if (mostrar) return;
    setMostrar(true);
    setTimeout(() => setMostrar(false), 1800);
  }

  return (
    <div className="relative inline-flex">
      {mostrar && (
        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-base-border bg-base-raised px-2 py-1 text-xs text-ink-muted">
          Disponível em breve
        </div>
      )}
      <button onClick={handleClick} className={className}>
        {children}
      </button>
    </div>
  );
}
