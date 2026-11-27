-- Ensure catalog sync always persists a valid game version.
alter table public.games add column if not exists version text;

update public.games
set version = '1.0.0'
where version is null or btrim(version) = '';

alter table public.games
  alter column version set default '1.0.0',
  alter column version set not null;
