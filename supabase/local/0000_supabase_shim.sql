-- LOCAL / CI ONLY. Never apply this to a real Supabase project.
--
-- Recreates the small part of Supabase's built-in setup that our migrations rely on,
-- so they run unchanged on plain Postgres (docker compose, pytest, CI):
--   * roles: anon, authenticated, service_role (service_role bypasses RLS)
--   * auth.users (id only) and auth.uid(), which reads the JWT `sub` claim
-- Roles are cluster-wide, so creation is idempotent.

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

-- Same definition Supabase uses.
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claim.sub', true),
      (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;
