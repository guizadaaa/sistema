-- ============================================================================
-- Teste de regressão para vendedores_filtro_casos (migration
-- 20261005000002_vendedores_filtro_casos.sql) — opções do filtro "Vendedor"
-- em Acompanhar Casos.
--
-- Cobre:
--   1. Vendedor e gerente: só vendedores/gerentes ativos da própria filial;
--      pedir outra filial devolve vazio (não vaza nomes de fora).
--   2. Admin: todos; com p_filial, só daquela filial. Nunca adm/adm_master
--      na lista, nunca usuário inativo.
--   3. Formato: só (id, nome_completo); anon sem EXECUTE.
--   4. Filtrar casos por um dono que o perfil não enxerga não revela caso
--      nenhum (a RLS de casos continua mandando).
-- ============================================================================

set role postgres;

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not p_condicao then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

-- Garante os usuários usados aqui independentemente da ordem dos arquivos.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000017', 'vendedorC1714@teste.com', '{"nome_completo":"Vendedor C 1714","perfil":"vendedor","filial":"1714"}'),
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}'),
  ('00000000-0000-0000-0000-000000000018', 'inativo1710@teste.com', '{"nome_completo":"Vendedor Inativo 1710","perfil":"vendedor","filial":"1710"}')
on conflict (id) do nothing;

-- Inativação é sempre via adm_master (auditoria exige ator).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
update public.usuarios set ativo = false where id = '00000000-0000-0000-0000-000000000018';
reset role;
reset request.jwt.claim.sub;
set role postgres;

-- Snapshot esperado: vendedores/gerentes ativos por filial, direto da tabela.
create temp table _esperado_1710 as
  select id from public.usuarios where ativo and perfil in ('vendedor', 'gerente') and filial = '1710';
create temp table _esperado_todos as
  select id from public.usuarios where ativo and perfil in ('vendedor', 'gerente');
grant select on _esperado_1710, _esperado_todos to authenticated;

select public._test_assert(
  'sanidade: há vendedores/gerentes ativos em mais de uma filial',
  (select count(distinct filial) > 1 from public.usuarios where ativo and perfil in ('vendedor', 'gerente'))
);

-- ----------------------------------------------------------------------------
-- Vendedor A (1710)
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

select public._test_assert(
  'vendedor: lista exatamente os vendedores/gerentes ativos da própria filial',
  (select array_agg(id order by id) from public.vendedores_filtro_casos())
    = (select array_agg(id order by id) from _esperado_1710)
);

select public._test_assert(
  'vendedor: nenhum nome de outra filial (Vendedor C 1714 / Gerente 1714)',
  not exists (
    select 1 from public.vendedores_filtro_casos()
    where id in ('00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000005')
  )
);

select public._test_assert(
  'vendedor: pedir outra filial explicitamente devolve vazio',
  (select count(*) = 0 from public.vendedores_filtro_casos('1714'))
);

select public._test_assert(
  'vendedor: inativo e admins nunca aparecem',
  not exists (
    select 1 from public.vendedores_filtro_casos()
    where id in (
      '00000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000006'
    )
  )
);

-- Filtrar casos pelo dono de outra filial não revela nada (RLS de casos).
select public._test_assert(
  'vendedor: filtrar casos por dono de outra filial não revela caso nenhum',
  (select count(*) = 0 from public.casos where vendedor_dono = '00000000-0000-0000-0000-000000000017')
);

-- Filtrar pelo colega da mesma filial também não revela casos dele.
select public._test_assert(
  'vendedor: filtrar por colega da mesma filial não revela casos do colega',
  (select count(*) = 0 from public.casos where vendedor_dono = '00000000-0000-0000-0000-000000000002')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Gerente 1714
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;

select public._test_assert(
  'gerente 1714: lista só gente da 1714 (ele e o Vendedor C)',
  (select array_agg(nome_completo order by nome_completo) from public.vendedores_filtro_casos())
    = array['Gerente 1714', 'Vendedor C 1714']
);

select public._test_assert(
  'gerente 1714: pedir 1710 devolve vazio',
  (select count(*) = 0 from public.vendedores_filtro_casos('1710'))
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Admin (adm comum) e adm_master
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;

select public._test_assert(
  'adm: sem filial, lista todos os vendedores/gerentes ativos',
  (select array_agg(id order by id) from public.vendedores_filtro_casos())
    = (select array_agg(id order by id) from _esperado_todos)
);

select public._test_assert(
  'adm: com filial 1710, só os da 1710',
  (select array_agg(id order by id) from public.vendedores_filtro_casos('1710'))
    = (select array_agg(id order by id) from _esperado_1710)
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

select public._test_assert(
  'adm_master: com filial 1714, só os da 1714',
  (select array_agg(nome_completo order by nome_completo) from public.vendedores_filtro_casos('1714'))
    = array['Gerente 1714', 'Vendedor C 1714']
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Formato
-- ----------------------------------------------------------------------------

select public._test_assert(
  'vendedores_filtro_casos expõe apenas (id, nome_completo)',
  pg_get_function_result('public.vendedores_filtro_casos(filial_cvc)'::regprocedure) = 'TABLE(id uuid, nome_completo text)'
);

select public._test_assert(
  'anon não tem EXECUTE em vendedores_filtro_casos',
  not has_function_privilege('anon', 'public.vendedores_filtro_casos(filial_cvc)', 'execute')
);

select 'todos os asserts de vendedores_filtro_casos passaram' as status;

set role postgres;
drop table _esperado_1710, _esperado_todos;
drop function public._test_assert(text, boolean);
reset role;
