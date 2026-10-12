-- Minimal stand-in for the parts of Supabase our migrations depend on.
-- Used only by local and CI database tests; never applied to a real Supabase project.

create extension if not exists pgcrypto;

do $$ begin
  create role anon nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin noinherit bypassrls;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email varchar(255)
);

-- Same contract as Supabase: reads the `sub` claim set per transaction.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')),
    '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants table privileges to these roles by default; RLS is what restricts them.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
