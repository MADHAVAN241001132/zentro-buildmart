export function FormMessage({ ok, message }: { ok: boolean | null; message?: string }) {
  if (!message) return null;
  return (
    <p
      role={ok ? 'status' : 'alert'}
      className={`rounded-control px-3 py-2 text-sm ${ok ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
    >
      {message}
    </p>
  );
}
