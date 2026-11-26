const TONES: Record<string, string> = {
  PAID: 'bg-success/10 text-success',
  PENDING: 'bg-warning/10 text-warning',
  CASH_PENDING: 'bg-warning/10 text-warning',
  PROCESSING: 'bg-warning/10 text-warning',
  FAILED: 'bg-danger/10 text-danger',
  EXPIRED: 'bg-danger/10 text-danger',
  CANCELLED: 'bg-danger/10 text-danger',
  REFUNDED: 'bg-ink-muted/10 text-ink-muted',
  PARTIALLY_REFUNDED: 'bg-ink-muted/10 text-ink-muted',
  PLACED: 'bg-gold/15 text-burgundy',
  CONFIRMED: 'bg-gold/15 text-burgundy',
  PACKED: 'bg-gold/15 text-burgundy',
  READY_FOR_PICKUP: 'bg-success/10 text-success',
  COMPLETED: 'bg-success/10 text-success',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = TONES[status] ?? 'bg-ink-muted/10 text-ink-muted';
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
