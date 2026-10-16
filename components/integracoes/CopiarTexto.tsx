"use client";

import { useState } from "react";

export function CopiarTexto({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [estado, setEstado] = useState<"idle" | "ok" | "erro">("idle");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("ok");
    } catch {
      setEstado("erro");
    }
    setTimeout(() => setEstado("idle"), 2000);
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="shrink-0 rounded-lg border border-base-border bg-base-raised px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
    >
      {estado === "ok" ? "Copiado!" : estado === "erro" ? "Não foi possível copiar" : rotulo}
    </button>
  );
}
