import { PageHeader } from '@/components/owner/page-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatINR } from '@/lib/money';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { cleanSearch } from '@/lib/validation/pos';
import { toggleCouponAction } from './actions';
import { CouponForm } from './coupon-form';

export const dynamic = 'force-dynamic';

interface CouponRow {
  id: string;
  code: string;
  discount_type: string;
  discount_bps: number | null;
  discount_paise: number | null;
  min_order_paise: number;
  max_uses: number | null;
  used_count: number;
  ends_at: string | null;
  is_active: boolean;
}

function describe(row: CouponRow): string {
  return row.discount_type === 'percent' ? `${((row.discount_bps ?? 0) / 100).toFixed(2)}% off` : `${formatINR(row.discount_paise ?? 0)} off`;
}

export default async function CouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; test?: string; subtotal?: string }>;
}) {
  const owner = await requireOwnerPermission('store_settings');
  const sp = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('coupons')
    .select('id, code, discount_type, discount_bps, discount_paise, min_order_paise, max_uses, used_count, ends_at, is_active')
    .order('created_at', { ascending: false })
    .limit(200);
  const coupons = (data ?? []) as CouponRow[];

  // Preview: runs the same server validation that a checkout would use, without redeeming anything.
  let preview: string | null = null;
  const testCode = cleanSearch(sp.test ?? '');
  const subtotalRupees = Number(sp.subtotal ?? '');
  if (testCode && Number.isFinite(subtotalRupees) && subtotalRupees > 0) {
    const { data: quote, error } = await supabase.rpc('coupon_quote', {
      p_store: owner.storeId,
      p_code: testCode,
      p_subtotal_paise: Math.round(subtotalRupees * 100),
    });
    preview = error
      ? `Not valid: ${error.message.replace(/^[^:]*:\s*/, '')}`
      : `Would give ${formatINR((quote as { discount_paise: number }).discount_paise)} off a ${formatINR(Math.round(subtotalRupees * 100))} order. Preview only; nothing is redeemed.`;
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Marketing"
        title="Coupons"
        description="Coupons are checked on the server. This screen previews a code without redeeming it."
      />
      {sp.error ? <p role="alert" className="text-sm text-danger">{sp.error}</p> : null}

      <CouponForm />

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">Preview a code<input name="test" defaultValue={testCode} className="rounded-control border border-line bg-card px-3 py-2 text-sm uppercase" /></label>
        <label className="grid gap-1 text-sm">Order subtotal ₹<input name="subtotal" inputMode="decimal" defaultValue={sp.subtotal ?? ''} className="rounded-control border border-line bg-card px-3 py-2 text-sm" /></label>
        <Button type="submit" variant="secondary">Preview</Button>
      </form>
      {preview ? <p className="text-sm">{preview}</p> : null}

      {coupons.length === 0 ? (
        <EmptyState title="No coupons yet" body="Create a coupon above. Each code is checked by the server when it is used." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-card">
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Discount</th>
                <th className="px-4 py-3">Minimum</th>
                <th className="px-4 py-3">Used</th>
                <th className="px-4 py-3">Ends</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono">{coupon.code}</td>
                  <td className="px-4 py-3">{describe(coupon)}</td>
                  <td className="px-4 py-3">{formatINR(coupon.min_order_paise)}</td>
                  <td className="px-4 py-3">{coupon.used_count}{coupon.max_uses ? ` / ${coupon.max_uses}` : ''}</td>
                  <td className="px-4 py-3">{coupon.ends_at ? new Date(coupon.ends_at).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="px-4 py-3">{coupon.is_active ? 'Active' : 'Off'}</td>
                  <td className="px-4 py-3 text-right">
                    {
                      <form action={toggleCouponAction}>
                        <input type="hidden" name="couponId" value={coupon.id} />
                        <input type="hidden" name="to" value={coupon.is_active ? 'off' : 'on'} />
                        <Button type="submit" variant="ghost">{coupon.is_active ? 'Switch off' : 'Switch on'}</Button>
                      </form>
}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
