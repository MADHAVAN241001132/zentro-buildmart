-- 0059: Shared line-amount policy for tax-exclusive and tax-inclusive prices (GST Priority 2, section A, first step).
-- 1. app.line_amounts: taxable value, tax and payable total of one line, from its discounted gross amount.
--    Exclusive: the configured price is before GST; GST is added on top.
--    Inclusive: the configured price already contains GST; the taxable value is extracted from it, and no GST is added.
--    Not-collecting stores (composition, unregistered): the configured price is the amount payable. No GST is extracted
--    or added, so the price is never reduced or increased.
-- 2. A guard on orders: a store that prices inclusively AND collects GST cannot place orders yet, because the checkout
--    calculation (guest_checkout_place, migration 0058) is exclusive-only. The refusal is explicit rather than silent.
-- Released migrations 0001-0058 are not modified.

create or replace function app.line_amounts(
  p_gross bigint, p_rate_bps integer, p_inclusive boolean, p_collect boolean
) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_taxable bigint;
  v_tax bigint;
begin
  if p_gross < 0 or p_rate_bps < 0 then
    raise exception 'line amounts cannot be negative' using errcode = '22023';
  end if;
  if not p_collect then
    return jsonb_build_object('taxable', p_gross, 'tax', 0, 'total', p_gross);
  end if;
  if p_inclusive then
    v_taxable := round((p_gross::numeric * 10000) / (10000 + p_rate_bps))::bigint;
    v_tax := p_gross - v_taxable;
    return jsonb_build_object('taxable', v_taxable, 'tax', v_tax, 'total', p_gross);
  end if;
  v_tax := app.line_tax(p_gross, p_rate_bps);
  return jsonb_build_object('taxable', p_gross, 'tax', v_tax, 'total', p_gross + v_tax);
end $$;

create or replace function app.guard_pricing_mode()
returns trigger
language plpgsql set search_path = public as $$
declare
  v_inclusive boolean;
begin
  select s.prices_include_gst into v_inclusive from stores s where s.id = new.store_id;
  if coalesce(v_inclusive, false) and new.tax_mode = 'taxed' then
    raise exception 'pricing_mode_unsupported: tax-inclusive pricing is not yet available for orders at this showroom'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists orders_pricing_mode_guard on orders;
create trigger orders_pricing_mode_guard before insert on orders
  for each row execute function app.guard_pricing_mode();
