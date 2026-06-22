import { Lead } from "@/lib/types";

function getSlaText(minutes: number) {
  if (minutes <= 30) return "Dentro do SLA";
  if (minutes <= 120) return "Atenção SLA";
  return "SLA estourado";
}

function getSlaColor(minutes: number) {
  if (minutes <= 30) return "text-ink";
  if (minutes <= 120) return "text-warn";
  return "text-loss";
}

function getBaseTimestamp(lead: Lead) {
  return new Date(lead.distribuidoEm ?? lead.criadoEm).getTime();
}

export function PipelineSlaBadge({ lead }: { lead: Lead }) {
  const baseTimestamp = getBaseTimestamp(lead);
  const minutes = Math.max(0, Math.round((Date.now() - baseTimestamp) / 60000));
  const text = getSlaText(minutes);
  const colorClass = getSlaColor(minutes);

  return (
    <div className={`text-[11px] font-semibold ${colorClass}`}>
      {text}
    </div>
  );
}
