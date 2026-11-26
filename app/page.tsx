export default function PlatformHome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gold">ZENTRO BuildMart</p>
      <h1 className="font-display text-4xl text-burgundy">Digital showroom and store management</h1>
      <p className="text-ink-muted">
        Shoppers open a store through its QR code. Store owners sign in at <code>/owner/login</code>.
        Platform administrators sign in at <code>/admin/login</code>.
      </p>
    </main>
  );
}
