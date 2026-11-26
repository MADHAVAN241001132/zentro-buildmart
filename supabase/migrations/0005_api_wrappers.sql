-- ZENTRO BuildMart: public wrappers for internal helpers the application needs.
-- PostgREST exposes only the public schema, so the app schema counter is wrapped here.

create or replace function public.next_document_number(p_store uuid, p_kind text, p_prefix text)
returns text
language sql security definer set search_path = public as $$
  select app.next_number(p_store, p_kind, p_prefix)
$$;

revoke execute on function public.next_document_number(uuid, text, text) from public, anon, authenticated;
grant execute on function public.next_document_number(uuid, text, text) to service_role;
