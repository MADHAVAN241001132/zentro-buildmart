export default function VisualizerLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <div className="h-8 w-72 animate-pulse rounded bg-line" />
      <div className="h-40 animate-pulse rounded-card bg-line/60" />
      <div className="h-96 animate-pulse rounded-card bg-line/60" />
      <p className="sr-only">Loading the room visualizer</p>
    </div>
  );
}
