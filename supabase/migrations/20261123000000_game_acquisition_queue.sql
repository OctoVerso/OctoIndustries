-- Explicit acquisition/update queue with evidence and approval state.
-- Queue records are operational metadata only; they do not create or publish a game payload.
create table if not exists public.game_acquisition_queue (
  id text primary key,
  game_id text not null,
  title text not null,
  action text not null check (action in ('acquire', 'update')),
  state text not null check (state in ('proposed', 'source-review', 'acquiring', 'awaiting-evidence', 'awaiting-approval', 'approved', 'imported', 'update-available', 'updating', 'rejected', 'failed')),
  approval_state text not null default 'not-requested' check (approval_state in ('not-requested', 'pending', 'approved', 'rejected')),
  source_url text,
  requested_version text,
  acquisition_status text not null default 'unverified' check (acquisition_status in ('local-payload', 'local-wrapper', 'external-only', 'unverified')),
  evidence jsonb not null default '[]'::jsonb,
  notes text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists game_acquisition_queue_state_idx on public.game_acquisition_queue (state, updated_at desc);
create index if not exists game_acquisition_queue_game_idx on public.game_acquisition_queue (game_id, created_at desc);
alter table public.game_acquisition_queue enable row level security;
