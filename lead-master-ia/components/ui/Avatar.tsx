export function Avatar({
  iniciais,
  cor = "#8A96AD",
  size = 36,
}: {
  iniciais: string;
  cor?: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-display text-xs font-semibold text-ink"
      style={{
        width: size,
        height: size,
        backgroundColor: `${cor}22`,
        border: `1px solid ${cor}55`,
        color: cor,
      }}
      aria-hidden
    >
      {iniciais}
    </div>
  );
}
