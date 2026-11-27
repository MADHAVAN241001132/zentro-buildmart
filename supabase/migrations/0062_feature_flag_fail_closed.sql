-- 0062: Fix feature flag fail-open bug.
--
-- Previously, app.store_feature_allowed returned COALESCE(flag_enabled, TRUE)
-- for setup and allowance stores, meaning any feature without an explicit flag
-- record defaulted to enabled. This caused features to remain visible even when
-- an admin explicitly turned them OFF (since turning OFF upserts enabled=false,
-- which works, but features that were NEVER toggled still defaulted to true).
--
-- The correct behaviour: a feature is enabled ONLY when the feature_flags record
-- exists AND has enabled=TRUE. Missing records always mean disabled.
-- This matches the fail-closed principle used everywhere else in the entitlements layer.

create or replace function app.store_feature_allowed(p_store uuid, p_key text, p_on date default app.ist_today())
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  st text;
  flag_enabled boolean;
  plan_features jsonb;
begin
  st := app.store_subscription_state(p_store, p_on);
  select f.enabled into flag_enabled from feature_flags f where f.store_id = p_store and f.feature_key = p_key;

  -- Fail closed: if no flag record exists, the feature is disabled.
  if flag_enabled is null or flag_enabled = false then
    return false;
  end if;

  -- Setup and allowance: flag is the only gate.
  if st in ('setup', 'allowance') then
    return true;
  end if;

  -- Non-active states: always disabled.
  if st <> 'active' then
    return false;
  end if;

  -- Active: also check the plan doesn't explicitly block the feature.
  select cp.features into plan_features from app.store_current_plan(p_store, p_on) cp;
  if plan_features ? p_key and jsonb_typeof(plan_features -> p_key) = 'boolean' and (plan_features ->> p_key)::boolean = false then
    return false;
  end if;
  return true;
end $$;
