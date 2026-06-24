function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-base-raised ${className}`} />;
}

function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-base-border bg-base-surface shadow-card">
      <div className="border-b border-base-border px-5 py-4">
        <Bone className="h-4 w-32" />
        <Bone className="mt-2 h-3 w-48" />
      </div>
      <div className="space-y-3 p-5">
        {Array.from({ length: rows }).map((_, i) => (
          <Bone key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <>
      {/* PageHeader skeleton */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Bone className="h-3 w-20" />
          <Bone className="h-8 w-48" />
          <Bone className="h-3 w-80 max-w-full" />
        </div>
        <Bone className="h-9 w-32 shrink-0" />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-base-border bg-base-surface p-5 shadow-card">
            <Bone className="mb-3 h-3 w-24" />
            <Bone className="h-8 w-20" />
            <Bone className="mt-2 h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Content cards */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CardSkeleton rows={4} />
        </div>
        <CardSkeleton rows={5} />
      </div>
    </>
  );
}
