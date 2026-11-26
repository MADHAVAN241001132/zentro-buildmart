-- 0034: The onboarding store RPC applies the platform brand colour when the caller omits one.
create or replace function public.onboarding_create_store(p_onboarding uuid, p_fields jsonb, p_step_data jsonb, p_step integer)
returns uuid
language plpgsql security definer set search_path = public, app as $$
declare
  ob store_onboardings%rowtype;
  new_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Only a platform administrator can create stores' using errcode = '42501';
  end if;
  if p_step is null or p_step < 1 or p_step > 8 then
    raise exception 'invalid onboarding step' using errcode = '22023';
  end if;
  select * into ob from store_onboardings where id = p_onboarding for update;
  if not found then raise exception 'onboarding not found' using errcode = 'P0002'; end if;
  if ob.status <> 'in_progress' then raise exception 'this onboarding is already closed' using errcode = 'P0001'; end if;
  if ob.store_id is not null then raise exception 'this onboarding already has a store' using errcode = 'P0001'; end if;

  insert into stores (slug, name, status, address_line, city, state, pincode, phone, email, brand_colour,
                      business_category, business_description)
  values (p_fields->>'slug', p_fields->>'name', 'draft', p_fields->>'addressLine', p_fields->>'city', p_fields->>'state',
          p_fields->>'pincode', p_fields->>'phone', p_fields->>'email', coalesce(nullif(p_fields->>'brandColour', ''), '#6A0D2A'),
          p_fields->>'category', p_fields->>'description')
  returning id into new_id;

  update store_onboardings
     set store_id = new_id, step_data = p_step_data, current_step = greatest(current_step, p_step)
   where id = p_onboarding;
  return new_id;
end $$;
