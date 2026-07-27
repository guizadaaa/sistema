-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: informação complementar em um caso já criado
--
-- Cobre o cenário de o vendedor esquecer de preencher algo na criação do
-- caso — em vez de reabrir/editar os campos originais (que ficariam sem
-- rastro de quando/quem mudou), um complemento é um registro novo, append-only,
-- sempre visível no histórico do caso com data e autor.
--
-- Mesmo padrão de casos_contratos_adicionais (20260721000002) — tabela
-- filha 1:N de casos, mesma regra de visibilidade (auth_pode_ver_caso,
-- centralizada desde 22/07), criado_por nunca vem do client (trigger lê
-- auth.uid()), sem UPDATE/DELETE (histórico imutável).
-- ============================================================================

create table public.casos_complementos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  texto text not null,
  criado_por uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),

  constraint casos_complementos_texto_nao_vazio check (length(trim(texto)) > 0)
);

create index casos_complementos_caso_id_idx on public.casos_complementos (caso_id);

create function public.set_complemento_criado_por()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.criado_por := auth.uid();
  return new;
end;
$$;

create trigger casos_complementos_set_criado_por
  before insert on public.casos_complementos
  for each row execute function public.set_complemento_criado_por();

alter table public.casos_complementos enable row level security;

create policy casos_complementos_select
  on public.casos_complementos for select to authenticated
  using (public.auth_pode_ver_caso(casos_complementos.caso_id));

-- Igual anexos_insert/casos_contratos_adicionais_insert: liberado pra
-- qualquer perfil que já enxerga o caso (não exige delegação nem admin —
-- complementar uma informação esquecida não é uma ação exclusiva do fluxo
-- adm). auth_pode_ver_caso já nega isto pra caso_teste=true fora do
-- adm_master, então casos de teste seguem a mesma regra sem esforço extra.
create policy casos_complementos_insert
  on public.casos_complementos for insert to authenticated
  with check (public.auth_pode_ver_caso(casos_complementos.caso_id));

-- Sem UPDATE/DELETE — histórico imutável, mesmo racional de anexos/contratos
-- adicionais/status_historico.

grant select, insert on public.casos_complementos to authenticated;
grant select, insert, update, delete on public.casos_complementos to service_role;
