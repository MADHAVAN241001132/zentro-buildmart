import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl text-burgundy">Page not found</h1>
      <p className="text-ink-muted">The page you are looking for does not exist or has moved.</p>
      <Link className="rounded-control bg-burgundy px-4 py-2 text-cream" href="/">Back to home</Link>
    </main>
  );
}
