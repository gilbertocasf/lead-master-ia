import { ReactNode } from "react";

export function KpiCard({
  label,
  value,
  hint,
  accent = false,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  icon?: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border bg-base-surface p-5 shadow-card ${
        accent ? "border-gold/40 shadow-gold" : "border-base-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </span>
        {icon && <span className={accent ? "text-gold" : "text-ink-faint"}>{icon}</span>}
      </div>
      <div
        className={`tnum mt-3 font-display text-3xl font-bold tracking-tight ${
          accent ? "text-gold-soft" : "text-ink"
        }`}
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}
