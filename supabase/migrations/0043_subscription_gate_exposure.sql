-- 0043: subscription gate functions were callable by anonymous and by unrelated signed-in users for any store id.
-- They now require the caller to be an active member of that store, a platform administrator, or the server.
-- The application calls them through the service role, so server code is unaffected.

create or replace function public.zb_subscription_state(p_store uuid)
returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (app.is_server() or app.is_platform_admin() or app.is_store_member(p_store)) then
    raise exception 'forbidden: not a member of this store' using errcode = '42501';
  end if;
  return app.store_subscription_state(p_store, app.ist_today());
end $$;

create or replace function public.zb_feature_allowed(p_store uuid, p_key text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (app.is_server() or app.is_platform_admin() or app.is_store_member(p_store)) then
    raise exception 'forbidden: not a member of this store' using errcode = '42501';
  end if;
  return app.store_feature_allowed(p_store, p_key, app.ist_today());
end $$;

create or replace function public.zb_commerce_allowed(p_store uuid)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (app.is_server() or app.is_platform_admin() or app.is_store_member(p_store)) then
    raise exception 'forbidden: not a member of this store' using errcode = '42501';
  end if;
  return app.store_commerce_allowed(p_store, app.ist_today());
end $$;

revoke all on function public.zb_subscription_state(uuid) from public, anon;
revoke all on function public.zb_feature_allowed(uuid, text) from public, anon;
revoke all on function public.zb_commerce_allowed(uuid) from public, anon;
grant execute on function public.zb_subscription_state(uuid) to authenticated, service_role;
grant execute on function public.zb_feature_allowed(uuid, text) to authenticated, service_role;
grant execute on function public.zb_commerce_allowed(uuid) to authenticated, service_role;
