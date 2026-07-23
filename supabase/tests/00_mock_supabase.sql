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
-- net (pg_net) — estrutura real confirmada contra a instalação de produção
-- (pg_net 0.20.4, via pg_attribute/pg_get_functiondef — não suposição, ver
-- migration 20260724000001_fix_pg_net_response_status.sql): o status_code
-- mora dentro de um campo `response` aninhado, não no topo de
-- http_response_result. Nenhuma chamada HTTP de verdade acontece nos
-- testes (mockada como sucesso/200).
-- ---------------------------------------------------------------------------
create schema if not exists net;

create type net.request_status as enum ('PENDING', 'SUCCESS', 'ERROR');

create type net.http_response as (status_code integer, headers jsonb, body text);

create type net.http_response_result as (status net.request_status, message text, response net.http_response);

create or replace function net.http_delete(
  url text, headers jsonb default '{}'::jsonb, body jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select 1::bigint $$;

create or replace function net.http_post(
  url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb, timeout_milliseconds integer default 5000
) returns bigint language sql as $$ select 1::bigint $$;

-- net._http_collect_response é a implementação real (privada) — funcional.
create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('SUCCESS'::net.request_status, null, row(200, '{}'::jsonb, '')::net.http_response)::net.http_response_result
$$;

-- net.http_collect_response (pública, deprecated) reproduzida byte-a-byte
-- da definição real capturada em produção via pg_get_functiondef — um
-- `select` sem destino dentro de uma função plpgsql, que SEMPRE lança
-- "query has no destination for result data" (42601) quando chamada,
-- independente de quem/como a chama. Confirmado em produção com a
-- migration 20260724000001 (que ainda chamava a pública) — descoberto só
-- ao testar de verdade, não por inspeção. Mantido aqui exatamente quebrado
-- de propósito: é isso que garante que ninguém no nosso código volte a
-- chamar a pública sem que o harness acuse o erro.
create or replace function net.http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language plpgsql
as $$
begin
  raise notice 'The net.http_collect_response function is deprecated.';
  select net._http_collect_response(request_id, async);
end;
$$;

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
