-- S0-2: core schema. This is a contract; changes need owner approval.
-- See docs/design.md and docs/tickets/S0-2-db-schema.md.
--
-- Access model:
--   * service_role (API, pipeline) bypasses RLS and has full access.
--   * authenticated (a signed-in user via Supabase) can only see their own rows, plus
--     the shared catalog (songs, artists). Client writes are limited to the few
--     things a client may do directly; everything else goes through the API.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type provider_preference as enum ('auto', 'apple', 'youtube');
create type playback_provider as enum ('apple', 'youtube');
create type seed_strategy as enum (
  'direct', 'fallback_artist', 'fallback_similar_artist', 'fallback_genre'
);
create type event_type as enum (
  'play_start', 'progress', 'pause', 'seek', 'skip', 'complete',
  'like', 'unlike', 'add_to_library', 'ban', 'start_radio_from', 'unavailable'
);
create type import_source as enum ('spotify', 'apple');
create type import_status as enum ('pending', 'processing', 'done', 'failed');
create type model_kind as enum ('item2vec', 'reranker');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create function forbid_update() returns trigger
language plpgsql
as $$
begin
  raise exception '% is immutable: rows cannot be updated', tg_table_name
    using errcode = 'restrict_violation';
end
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Pseudonymous id used in training data instead of `id`.
  training_id uuid not null unique default gen_random_uuid(),
  provider_preference provider_preference not null default 'auto',
  consent_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table artists (
  mbid uuid primary key,
  name text not null,
  mb_tags text[] not null default '{}',
  apple_genres text[] not null default '{}'
);

create table songs (
  id uuid primary key default gen_random_uuid(),
  -- Canonical id. Null for Apple-ID-only songs until a retrain resolves them.
  mbid uuid unique,
  isrc text,
  apple_id text unique,
  youtube_video_id text,
  youtube_match_flagged boolean not null default false,
  title text not null,
  artist text not null,
  artist_mbid uuid,
  duration_ms integer check (duration_ms > 0),
  genres text[] not null default '{}',
  -- Dimension is fixed (and an ANN index added) once item2vec exists (B2).
  embedding vector,
  updated_at timestamptz not null default now()
);
create index songs_isrc_idx on songs (isrc);
create index songs_artist_mbid_idx on songs (artist_mbid);
create trigger songs_set_updated_at before update on songs
  for each row execute function set_updated_at();

create table model_versions (
  -- Human-readable, e.g. 'item2vec-2026-11-25' or 'dummy'.
  id text primary key,
  kind model_kind not null,
  created_at timestamptz not null default now(),
  metrics jsonb not null default '{}',
  is_active boolean not null default false
);
-- At most one active model per kind.
create unique index model_versions_one_active_per_kind
  on model_versions (kind) where is_active;

create table radios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  seed_song_id uuid not null references songs (id),
  -- Set for "keep going" continuations.
  parent_radio_id uuid references radios (id) on delete cascade,
  -- Version string of the generator that produced this radio. Not a foreign key:
  -- a radio comes from a whole generator (e.g. item2vec + re-ranker, or 'dummy').
  model_version text not null,
  seed_strategy seed_strategy not null,
  created_at timestamptz not null default now()
);
create index radios_user_created_idx on radios (user_id, created_at desc);
create index radios_parent_idx on radios (parent_radio_id);

create table radio_tracks (
  radio_id uuid not null references radios (id) on delete cascade,
  position smallint not null check (position between 0 and 19),
  song_id uuid not null references songs (id),
  primary key (radio_id, position)
);
-- Radios are frozen. Deletes stay allowed (cascade from radios, delete-my-data).
create trigger radio_tracks_immutable before update on radio_tracks
  for each row execute function forbid_update();

create table events (
  -- Clients may supply the id so retried uploads are idempotent.
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  song_id uuid not null references songs (id),
  radio_id uuid references radios (id) on delete set null,
  type event_type not null,
  provider playback_provider,
  position_ms integer check (position_ms >= 0),
  radio_position smallint check (radio_position between 0 and 19),
  client_ts timestamptz not null,
  server_ts timestamptz not null default now(),
  payload jsonb not null default '{}'
);
create index events_user_server_ts_idx on events (user_id, server_ts);
create index events_radio_idx on events (radio_id);
create index events_song_idx on events (song_id);

create table likes (
  user_id uuid not null references users (id) on delete cascade,
  song_id uuid not null references songs (id),
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create table bans (
  user_id uuid not null references users (id) on delete cascade,
  song_id uuid not null references songs (id),
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

create table imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  source import_source not null,
  status import_status not null default 'pending',
  total_rows integer check (total_rows >= 0),
  matched_rows integer check (matched_rows >= 0),
  r2_key text,
  created_at timestamptz not null default now()
);
create index imports_user_idx on imports (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant all on all tables in schema public to service_role;

grant select on songs, artists to authenticated;
grant select on users to authenticated;
grant update (provider_preference, consent_at) on users to authenticated;
grant select on radios, radio_tracks, imports to authenticated;
grant select, insert on events to authenticated;
grant select, insert, delete on likes, bans to authenticated;
-- model_versions: service_role only.

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table users enable row level security;
alter table artists enable row level security;
alter table songs enable row level security;
alter table model_versions enable row level security;
alter table radios enable row level security;
alter table radio_tracks enable row level security;
alter table events enable row level security;
alter table likes enable row level security;
alter table bans enable row level security;
alter table imports enable row level security;

-- Shared catalog: readable by any signed-in user.
create policy songs_read on songs for select to authenticated using (true);
create policy artists_read on artists for select to authenticated using (true);

-- Own rows only.
create policy users_own on users for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy radios_own on radios for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy radio_tracks_own on radio_tracks for all to authenticated
  using (exists (
    select 1 from radios r where r.id = radio_tracks.radio_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from radios r where r.id = radio_tracks.radio_id and r.user_id = auth.uid()
  ));

create policy events_own on events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy likes_own on likes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy bans_own on bans for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy imports_own on imports for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
