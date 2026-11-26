-- 0046: public wrappers for the server-side provisioning service. The app schema functions are not exposed by
-- the API; these wrappers are granted to the service role only and call the same checked functions.

create or replace function public.zb_prov_create(p_store uuid, p_actor uuid, p_actor_type text, p_key uuid, p_email text,
  p_full_name text, p_phone text, p_role text, p_permissions text[], p_onboarding uuid)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select to_jsonb(app.prov_create(p_store, p_actor, p_actor_type, p_key, p_email, p_full_name, p_phone, p_role, p_permissions, p_onboarding));
$$;

create or replace function public.zb_prov_claim(p_id uuid, p_lease_seconds integer default 120)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_claim(p_id, p_lease_seconds);
$$;

create or replace function public.zb_prov_record_auth(p_id uuid, p_token uuid, p_profile uuid)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_record_auth(p_id, p_token, p_profile);
$$;

create or replace function public.zb_prov_link_membership(p_id uuid, p_token uuid)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_link_membership(p_id, p_token);
$$;

create or replace function public.zb_prov_link_onboarding(p_id uuid, p_token uuid)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_link_onboarding(p_id, p_token);
$$;

create or replace function public.zb_prov_complete(p_id uuid, p_token uuid)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_complete(p_id, p_token);
$$;

create or replace function public.zb_prov_fail(p_id uuid, p_token uuid, p_code text, p_message text)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_fail(p_id, p_token, p_code, p_message);
$$;

create or replace function public.zb_prov_flag_reconciliation(p_id uuid, p_token uuid, p_reason text)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_flag_reconciliation(p_id, p_token, p_reason);
$$;

create or replace function public.zb_prov_reconcile_link_existing(p_id uuid, p_actor uuid, p_profile uuid, p_note text)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_reconcile_link_existing(p_id, p_actor, p_profile, p_note);
$$;

create or replace function public.zb_prov_reconcile_reset(p_id uuid, p_actor uuid, p_note text)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_reconcile_reset(p_id, p_actor, p_note);
$$;

create or replace function public.zb_prov_reconcile_cancel(p_id uuid, p_actor uuid, p_note text)
returns jsonb language sql security definer set search_path = public, app, pg_temp as $$
  select app.prov_reconcile_cancel(p_id, p_actor, p_note);
$$;

revoke all on function public.zb_prov_create(uuid, uuid, text, uuid, text, text, text, text, text[], uuid) from public, anon, authenticated;
revoke all on function public.zb_prov_claim(uuid, integer) from public, anon, authenticated;
revoke all on function public.zb_prov_record_auth(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.zb_prov_link_membership(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zb_prov_link_onboarding(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zb_prov_complete(uuid, uuid) from public, anon, authenticated;
revoke all on function public.zb_prov_fail(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.zb_prov_flag_reconciliation(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.zb_prov_reconcile_link_existing(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.zb_prov_reconcile_reset(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.zb_prov_reconcile_cancel(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.zb_prov_create(uuid, uuid, text, uuid, text, text, text, text, text[], uuid) to service_role;
grant execute on function public.zb_prov_claim(uuid, integer) to service_role;
grant execute on function public.zb_prov_record_auth(uuid, uuid, uuid) to service_role;
grant execute on function public.zb_prov_link_membership(uuid, uuid) to service_role;
grant execute on function public.zb_prov_link_onboarding(uuid, uuid) to service_role;
grant execute on function public.zb_prov_complete(uuid, uuid) to service_role;
grant execute on function public.zb_prov_fail(uuid, uuid, text, text) to service_role;
grant execute on function public.zb_prov_flag_reconciliation(uuid, uuid, text) to service_role;
grant execute on function public.zb_prov_reconcile_link_existing(uuid, uuid, uuid, text) to service_role;
grant execute on function public.zb_prov_reconcile_reset(uuid, uuid, text) to service_role;
grant execute on function public.zb_prov_reconcile_cancel(uuid, uuid, text) to service_role;
