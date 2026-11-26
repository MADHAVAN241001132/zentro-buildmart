import Link from 'next/link';

/** Pagination links that keep the current query string. */
export function Pagination({ basePath, params, page, pageCount }: { basePath: string; params: Record<string, string | undefined>; page: number; pageCount: number }) {
  if (pageCount <= 1) return null;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    qs.set('page', String(p));
    return `${basePath}?${qs.toString()}`;
  };
  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-4 text-sm">
      {page > 1 ? <Link href={href(page - 1)} className="font-semibold text-burgundy">Previous</Link> : <span />}
      <span className="text-ink-muted">Page {page} of {pageCount}</span>
      {page < pageCount ? <Link href={href(page + 1)} className="font-semibold text-burgundy">Next</Link> : <span />}
    </nav>
  );
}
