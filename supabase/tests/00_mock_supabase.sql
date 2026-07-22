-- ============================================================================
-- Mock mínimo do ambiente Supabase-managed, rodando em Postgres puro local
-- (sem Docker — o ambiente de dev/CI não consegue subir `supabase start`).
--
-- Objetivo: aplicar supabase/migrations/*.sql de verdade por cima disto e
-- testar RLS de verdade, impersonando papéis com
--   set role authenticated; set request.jwt.claim.sub = '<uuid>';
-- em vez de confiar só na leitura do SQL. Nunca rodar isto contra um projeto
-- Supabase real — é só para o banco de testes efêmero criado por
-- scripts/test-rls.sh.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- auth
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz not null default now()
);

-- No Supabase real, storage.objects/buckets já vêm com RLS habilitada pela
-- plataforma antes de qualquer migration de usuário rodar; aqui precisa ser
-- explícito, senão as policies criadas pelas migrations ficam sem efeito
-- (achado durante a montagem deste harness: sem isso, todo mundo com GRANT
-- de tabela enxergava toda linha de storage.objects, mascarando o teste).
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $$
  select case
    when array_length(string_to_array(name, '/'), 1) <= 1 then array[]::text[]
    else (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
  end
$$;

-- ---------------------------------------------------------------------------
-- net (pg_net) — só o suficiente para as migrations de retenção de anexos
-- (20260720000001) e backup (20260723000004) compilarem; nenhuma faz uma
-- chamada HTTP de verdade nos testes (mockada como sucesso/200).
-- ---------------------------------------------------------------------------
create schema if not exists net;

create type net.http_response_result as (status_code integer, content text);

create or replace function net.http_delete(
  url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select 1::bigint $$;

create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select 1::bigint $$;

create or replace function net.http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result language sql as $$ select row(200, '')::net.http_response_result $$;

-- ---------------------------------------------------------------------------
-- vault — idem, só para a migration de retenção compilar.
-- ---------------------------------------------------------------------------
create schema if not exists vault;

create table vault.decrypted_secrets (name text primary key, decrypted_secret text);

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

grant authenticated to current_user;
grant anon to current_user;
grant service_role to current_user;

-- No Supabase real isso já vem provisionado pela plataforma; aqui precisa
-- ser explícito para as policies que chamam auth.uid()/storage.foldername()
-- diretamente (não só via wrapper security definer) funcionarem sob `set
-- role authenticated`.
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
grant usage on schema storage to authenticated, anon, service_role;
grant select, insert on storage.objects to authenticated, anon, service_role;
grant select, insert, update, delete on storage.buckets to service_role;
