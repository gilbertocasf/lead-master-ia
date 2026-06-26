function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-base-raised ${className}`} />;
}

export default function LeadsLoading() {
  return (
    <>
      {/* PageHeader skeleton */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Bone className="h-3 w-16" />
          <Bone className="h-8 w-32" />
          <Bone className="h-3 w-72 max-w-full" />
        </div>
        <Bone className="h-9 w-36 shrink-0" />
      </div>

      {/* Table card */}
      <div className="rounded-2xl border border-base-border bg-base-surface shadow-card">
        <div className="border-b border-base-border px-5 py-4">
          <Bone className="h-4 w-28" />
          <Bone className="mt-2 h-3 w-40" />
        </div>
        <div className="space-y-0 divide-y divide-base-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <Bone className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Bone className="h-3 w-36" />
                <Bone className="h-3 w-24" />
              </div>
              <Bone className="hidden h-3 w-20 sm:block" />
              <Bone className="h-6 w-20 rounded-full" />
              <Bone className="hidden h-3 w-16 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
