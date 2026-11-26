export default function AdminLoading() {
  return (
    <div className="grid gap-6 animate-pulse" role="status" aria-live="polite">
      <div className="h-8 w-1/3 rounded bg-line" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 rounded-card bg-line/60" />
        ))}
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
