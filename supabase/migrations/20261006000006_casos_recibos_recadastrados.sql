-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: números dos recibos recadastrados (casos de Recadastro)
--
-- Um caso de Recadastro (tipo_caso = 'recadastro_sem_reserva') pode ter um
-- ou mais recibos recadastrados. Segue exatamente o modelo de
-- casos_contratos_adicionais (20260721000002 + 20260722000004): tabela filha
-- 1:N de casos, número com 14 dígitos (mesma regra de
-- casos_contrato_numero_formato), sem repetir no mesmo caso, criado_por
-- sempre auth.uid(), e RLS = auth_pode_ver_caso (quem enxerga o caso vê e
-- adiciona; sem UPDATE/DELETE, mesmo racional de anexos/contratos).
--
-- Diferença única: só aceita caso do tipo Recadastro (trigger abaixo).
-- Idempotente (if not exists / or replace / drop if exists).
-- ============================================================================

create table if not exists public.casos_recibos_recadastrados (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  recibo_numero text not null,
  criado_por uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),

  constraint casos_recibos_recadastrados_formato check (recibo_numero ~ '^\d{14}$'),
  constraint casos_recibos_recadastrados_unico unique (caso_id, recibo_numero)
);

create index if not exists casos_recibos_recadastrados_caso_id_idx
  on public.casos_recibos_recadastrados (caso_id);

-- Busca de casos por número de recibo (ilike '%termo%').
create index if not exists casos_recibos_recadastrados_numero_idx
  on public.casos_recibos_recadastrados (recibo_numero);

create or replace function public.set_recibo_recadastrado_criado_por()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.criado_por := auth.uid();
  return new;
end;
$$;

drop trigger if exists casos_recibos_recadastrados_set_criado_por on public.casos_recibos_recadastrados;
create trigger casos_recibos_recadastrados_set_criado_por
  before insert on public.casos_recibos_recadastrados
  for each row execute function public.set_recibo_recadastrado_criado_por();

create or replace function public.check_recibo_recadastrado_tipo_caso()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.casos c
    where c.id = new.caso_id and c.tipo_caso = 'recadastro_sem_reserva'
  ) then
    raise exception 'Recibo recadastrado só pode ser informado em caso do tipo Recadastro.';
  end if;
  return new;
end;
$$;

drop trigger if exists casos_recibos_recadastrados_check_tipo on public.casos_recibos_recadastrados;
create trigger casos_recibos_recadastrados_check_tipo
  before insert on public.casos_recibos_recadastrados
  for each row execute function public.check_recibo_recadastrado_tipo_caso();

alter table public.casos_recibos_recadastrados enable row level security;

drop policy if exists casos_recibos_recadastrados_select on public.casos_recibos_recadastrados;
create policy casos_recibos_recadastrados_select
  on public.casos_recibos_recadastrados for select to authenticated
  using (public.auth_pode_ver_caso(casos_recibos_recadastrados.caso_id));

drop policy if exists casos_recibos_recadastrados_insert on public.casos_recibos_recadastrados;
create policy casos_recibos_recadastrados_insert
  on public.casos_recibos_recadastrados for insert to authenticated
  with check (public.auth_pode_ver_caso(casos_recibos_recadastrados.caso_id));

-- Sem UPDATE/DELETE — mesmo racional de casos_contratos_adicionais.

grant select, insert on public.casos_recibos_recadastrados to authenticated;
grant select, insert, update, delete on public.casos_recibos_recadastrados to service_role;
