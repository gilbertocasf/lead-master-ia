// Formatadores pt-BR

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

// VGV grande e legível: R$ 4,2 mi / R$ 850 mil
export function formatBRLCompact(value: number): string {
  if (value >= 1_000_000) {
    const v = value / 1_000_000;
    return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (value >= 1_000) {
    const v = value / 1_000;
    return `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  }
  return formatBRL(value);
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

// "há 2 dias", "há 5 horas" — usado na fila de distribuição
export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const horas = Math.floor(diff / 3_600_000);
  if (horas < 1) return "agora há pouco";
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}
