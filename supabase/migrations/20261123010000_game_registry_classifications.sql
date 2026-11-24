-- Preserve generated catalog acquisition/runtime/save/test classifications in the server registry.
alter table public.games add column if not exists acquisition_status text not null default 'unverified';
alter table public.games add column if not exists runtime_status text not null default 'unverified';
alter table public.games add column if not exists network_dependency text not null default 'unverified';
alter table public.games add column if not exists save_level integer;
alter table public.games add column if not exists save_status text not null default 'unverified';
alter table public.games add column if not exists test_status text not null default 'unverified';
alter table public.games add column if not exists acquisition_evidence jsonb not null default '[]'::jsonb;

alter table public.games drop constraint if exists games_acquisition_status_check;
alter table public.games add constraint games_acquisition_status_check check (acquisition_status in ('local-payload', 'local-wrapper', 'external-only', 'unverified'));
alter table public.games drop constraint if exists games_runtime_status_check;
alter table public.games add constraint games_runtime_status_check check (runtime_status in ('local', 'external-required', 'unverified'));
alter table public.games drop constraint if exists games_network_dependency_check;
alter table public.games add constraint games_network_dependency_check check (network_dependency in ('not-required', 'optional', 'required', 'unverified'));
alter table public.games drop constraint if exists games_save_level_check;
alter table public.games add constraint games_save_level_check check (save_level is null or save_level between 0 and 3);
alter table public.games drop constraint if exists games_save_status_check;
alter table public.games add constraint games_save_status_check check (save_status in ('game-managed', 'hub-adapter', 'unsupported', 'unverified'));
alter table public.games drop constraint if exists games_test_status_check;
alter table public.games add constraint games_test_status_check check (test_status in ('verified', 'partial', 'not-run', 'unverified'));
