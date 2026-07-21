-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: contratos adicionais vinculados a um caso
--
-- Abordagem híbrida (decisão confirmada com o cliente): casos.contrato_numero
-- continua exatamente como está — é o contrato principal, e é dele que
-- set_caso_defaults deriva a filial quando o dono não tem filial própria
-- (adm/adm_master). Esta tabela cobre só os números adicionais que também
-- fazem parte do mesmo caso — não participa da derivação de filial nem de
-- nenhum outro trigger de casos.
--
-- RLS copiada do padrão de public.anexos (mesma tabela filha 1:N de casos,
-- mesma regra de visibilidade): quem já enxerga o caso pode ver e adicionar
-- contratos; sem policy de UPDATE/DELETE por ora, mesmo racional de anexos
-- (não há previsão de edição/remoção na especificação atual).
-- ============================================================================

create table public.casos_contratos_adicionais (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid not null references public.casos (id) on delete cascade,
  contrato_numero text not null,
  criado_por uuid not null references public.usuarios (id),
  criado_em timestamptz not null default now(),

  -- Mesmo formato de casos.contrato_numero (casos_contrato_numero_formato,
  -- 20260720000003) e sem repetir o mesmo número duas vezes no mesmo caso.
  constraint casos_contratos_adicionais_formato check (contrato_numero ~ '^\d{14}$'),
  constraint casos_contratos_adicionais_unico unique (caso_id, contrato_numero)
);

create index casos_contratos_adicionais_caso_id_idx on public.casos_contratos_adicionais (caso_id);

-- Um número "adicional" igual ao contrato principal do mesmo caso não é uma
-- duplicata útil — é só o mesmo contrato reinserido. unique(caso_id,
-- contrato_numero) acima não pega este caso (a constraint enxerga só a
-- própria tabela), daí o trigger.
create function public.check_contrato_adicional_nao_duplica_principal()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.casos c
    where c.id = new.caso_id and c.contrato_numero = new.contrato_numero
  ) then
    raise exception 'Este número de contrato já é o contrato principal do caso.';
  end if;
  return new;
end;
$$;

create trigger casos_contratos_adicionais_check_duplicidade
  before insert on public.casos_contratos_adicionais
  for each row execute function public.check_contrato_adicional_nao_duplica_principal();

create function public.set_contrato_adicional_criado_por()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.criado_por := auth.uid();
  return new;
end;
$$;

create trigger casos_contratos_adicionais_set_criado_por
  before insert on public.casos_contratos_adicionais
  for each row execute function public.set_contrato_adicional_criado_por();

alter table public.casos_contratos_adicionais enable row level security;

create policy casos_contratos_adicionais_select
  on public.casos_contratos_adicionais for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = casos_contratos_adicionais.caso_id
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

-- Igual anexos_insert: liberado para qualquer perfil que já enxerga o caso,
-- não exige delegação (registrar um contrato adicional não é uma ação
-- exclusiva do fluxo adm).
create policy casos_contratos_adicionais_insert
  on public.casos_contratos_adicionais for insert to authenticated
  with check (
    exists (
      select 1 from public.casos c
      where c.id = casos_contratos_adicionais.caso_id
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

-- Sem DELETE/UPDATE por ora — mesmo racional de anexos.

grant select, insert
  on public.casos_contratos_adicionais
  to authenticated;

grant select, insert, update, delete
  on public.casos_contratos_adicionais
  to service_role;
