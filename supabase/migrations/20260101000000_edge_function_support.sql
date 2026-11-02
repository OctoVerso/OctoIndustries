-- Support objects for the Edge Functions. Run once against the Supabase project
-- (supabase db push, or paste into the SQL editor).

create table if not exists public.admin_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 0
);

create table if not exists public.admin_sessions (
  session_id text primary key,
  expires_at timestamptz not null
);

create index if not exists admin_rate_limits_window_start_idx
  on public.admin_rate_limits (window_start);
create index if not exists admin_sessions_expires_at_idx
  on public.admin_sessions (expires_at);

create or replace function public.bump_rate_limit(p_key text, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.admin_rate_limits as limits (key, window_start, request_count)
  values (p_key, now(), 1)
  on conflict (key) do update set
    request_count = case when limits.window_start < now() - make_interval(secs => p_window_seconds)
      then 1 else limits.request_count + 1 end,
    window_start = case when limits.window_start < now() - make_interval(secs => p_window_seconds)
      then now() else limits.window_start end
  returning request_count into current_count;
  delete from public.admin_rate_limits where window_start < now() - interval '2 days';
  return current_count;
end;
$$;

revoke all on function public.bump_rate_limit(text, integer) from public, anon, authenticated;
grant execute on function public.bump_rate_limit(text, integer) to service_role;

-- Browsers never query the database directly: only the Edge Functions (service role) do.
alter table public.games enable row level security;
alter table public.jobs enable row level security;
alter table public.activity enable row level security;
alter table public.roadmap enable row level security;
alter table public.feedback enable row level security;
alter table public.proposals enable row level security;
alter table public.admin_rate_limits enable row level security;
alter table public.admin_sessions enable row level security;
