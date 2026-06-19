import { LeadStatus, STATUS_LABEL } from "@/lib/types";

const STYLES: Record<LeadStatus, string> = {
  novo: "bg-action/15 text-action border-action/30",
  em_contato: "bg-warn/15 text-warn border-warn/30",
  visita: "bg-gold/15 text-gold-soft border-gold/30",
  proposta: "bg-gold/20 text-gold-soft border-gold/40",
  fechado: "bg-win/15 text-win border-win/30",
  perdido: "bg-loss/15 text-loss border-loss/30",
};

export function StatusPill({ status }: { status: LeadStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
