export default function WishlistLoading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <div className="h-8 w-48 animate-pulse rounded bg-line" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-72 animate-pulse rounded-card bg-line/60" />
        ))}
      </div>
      <p className="sr-only">Loading your wishlist</p>
    </div>
  );
}
