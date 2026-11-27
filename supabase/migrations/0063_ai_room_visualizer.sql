-- AI Room Visualizer: per-store cost control settings & visualization session history

create table if not exists public.ai_visualizer_store_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  monthly_limit integer not null default 100 check (monthly_limit >= 0),
  daily_limit integer not null default 20 check (daily_limit >= 0),
  guest_session_daily_limit integer not null default 10 check (guest_session_daily_limit >= 0),
  default_model text not null default 'gpt-image-2.6-sunburst',
  preview_model text not null default 'gpt-image-2.6-flare',
  image_quality text not null default 'high' check (image_quality in ('low', 'medium', 'high', 'auto')),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_visualizer_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  guest_session_id uuid not null references public.guest_sessions(id) on delete cascade,
  source_photo_id uuid references public.guest_room_photos(id) on delete set null,
  config_hash text not null,
  room_analysis jsonb,
  selected_products jsonb not null default '[]'::jsonb,
  placement_plan jsonb not null default '[]'::jsonb,
  prompt_used text,
  model_used text not null,
  image_quality text not null default 'high',
  status text not null default 'pending' check (status in ('pending', 'analyzing', 'generating', 'completed', 'failed')),
  generated_bucket text not null default 'private-photos',
  generated_path text,
  estimated_cost_usd numeric(10, 4) not null default 0,
  latency_ms integer,
  error_message text,
  history_version integer not null default 1,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_viz_store_created
  on public.ai_visualizer_sessions (store_id, created_at desc);

create index if not exists idx_ai_viz_guest_created
  on public.ai_visualizer_sessions (store_id, guest_session_id, created_at desc);

create index if not exists idx_ai_viz_cache_lookup
  on public.ai_visualizer_sessions (store_id, source_photo_id, config_hash, status, expires_at desc);

alter table public.ai_visualizer_store_settings enable row level security;
alter table public.ai_visualizer_sessions enable row level security;

-- Only platform admins can view/update ai_visualizer_store_settings via standard client;
-- backend routes use service_role after explicit store/guest/admin authorization checks.
create policy ai_viz_settings_admin_all
  on public.ai_visualizer_store_settings
  for all
  using (exists (select 1 from public.platform_admins pa where pa.profile_id = auth.uid()))
  with check (exists (select 1 from public.platform_admins pa where pa.profile_id = auth.uid()));

create policy ai_viz_sessions_admin_read
  on public.ai_visualizer_sessions
  for select
  using (exists (select 1 from public.platform_admins pa where pa.profile_id = auth.uid()));

-- Seed default settings for existing stores
insert into public.ai_visualizer_store_settings (store_id)
select id from public.stores
on conflict (store_id) do nothing;
