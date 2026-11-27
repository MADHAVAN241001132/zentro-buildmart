'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { parseRupeesToPaise } from '@/lib/money';
import { friendly } from '@/lib/errors';
import { checkFeature } from '@/lib/services/entitlements';
import { requireOwnerPermission } from '@/lib/services/owner';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/pos';

export interface CouponState {
  ok: boolean;
  message?: string;
}

const CODE = /^[A-Z0-9_-]{3,32}$/;

function text(fd: FormData, key: string): string {
  const value = fd.get(key);
  return typeof value === 'string' ? value : '';
}

/** Creates a coupon. The database check constraints enforce one discount type per coupon. */
export async function createCouponAction(_prev: CouponState, fd: FormData): Promise<CouponState> {
  const owner = await requireOwnerPermission('store_settings');
  const blocked = await checkFeature(owner.storeId, 'coupons');
  if (blocked) return { ok: false, message: blocked };

  const code = text(fd, 'code').trim().toUpperCase();
  if (!CODE.test(code)) return { ok: false, message: 'Code: 3 to 32 letters, digits, dash or underscore' };

  const type = text(fd, 'discountType');
  let discountBps: number | null = null;
  let discountPaise: number | null = null;
  if (type === 'percent') {
    const pct = Number(text(fd, 'percent'));
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { ok: false, message: 'Percentage must be above 0 and up to 100' };
    discountBps = Math.round(pct * 100);
  } else if (type === 'flat') {
    discountPaise = parseRupeesToPaise(text(fd, 'flatRupees'));
    if (discountPaise === null || discountPaise <= 0) return { ok: false, message: 'Flat amount must be more than zero' };
  } else {
    return { ok: false, message: 'Choose a discount type' };
  }

  const minOrder = parseRupeesToPaise(text(fd, 'minOrderRupees') || '0');
  if (minOrder === null || minOrder < 0) return { ok: false, message: 'Minimum order must be an amount in rupees' };

  const maxUsesText = text(fd, 'maxUses').trim();
  const maxUses = maxUsesText === '' ? null : Number(maxUsesText);
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) return { ok: false, message: 'Max uses must be a whole number above 0' };

  const endsOn = text(fd, 'endsOn').trim();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('coupons').insert({
    store_id: owner.storeId,
    code,
    discount_type: type,
    discount_bps: discountBps,
    discount_paise: discountPaise,
    min_order_paise: minOrder,
    max_uses: maxUses,
    ends_at: endsOn ? `${endsOn}T23:59:59+05:30` : null,
    is_active: true,
  });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath('/owner/coupons');
  return { ok: true, message: `Coupon ${code} created` };
}

export async function toggleCouponAction(fd: FormData): Promise<void> {
  const owner = await requireOwnerPermission('store_settings');
  const blocked = await checkFeature(owner.storeId, 'coupons');
  if (blocked) redirect(`/owner/coupons?error=${encodeURIComponent(blocked)}`);
  const id = uuidSchema.safeParse(text(fd, 'couponId'));
  if (!id.success) redirect('/owner/coupons?error=Coupon%20not%20found');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('coupons')
    .update({ is_active: text(fd, 'to') === 'on' })
    .eq('id', id.data)
    .eq('store_id', owner.storeId);
  if (error) redirect(`/owner/coupons?error=${encodeURIComponent(friendly(error.message))}`);
  revalidatePath('/owner/coupons');
  redirect('/owner/coupons');
}
