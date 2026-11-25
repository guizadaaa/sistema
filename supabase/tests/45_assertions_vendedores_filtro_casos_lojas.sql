-- ============================================================================
-- Migration 20261126000001: vendedores_filtro_casos_lojas (filtro Vendedor
-- respeita a Filial em Acompanhar Casos).
-- ============================================================================

set role postgres;

\ir ../migrations/20261126000001_vendedores_filtro_casos_lojas.sql

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condicao, false) then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

begin;

-- Jean: transferido da 1710 para a 1730 (casos antigos na 1710 e um novo na
-- 1730). Sophia: saiu da 1710 (inativa) com caso na 1710. Teo: ativo na 1730,
-- sem casos.
insert into auth.users (id, email, raw_user_meta_data) values
  ('45000000-0000-0000-0000-000000000001', 'jean45@teste.com', '{"nome_completo":"Jean 45","perfil":"vendedor","filial":"1730"}'),
  ('45000000-0000-0000-0000-000000000002', 'sophia45@teste.com', '{"nome_completo":"Sophia 45","perfil":"vendedor","filial":"1710"}'),
  ('45000000-0000-0000-0000-000000000003', 'teo45@teste.com', '{"nome_completo":"Teo 45","perfil":"vendedor","filial":"1730"}');

set local session_replication_role = replica;
update public.usuarios set ativo = false where id = '45000000-0000-0000-0000-000000000002';
insert into public.casos (tipo_caso, motivo, descricao, vendedor_dono, vendedor_original_nome, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, filial, caso_teste)
select 'alteracao_data', 'pedido_cliente', 'teste 45', dono::uuid, 'x', dono::uuid, current_date + 10, '17450000000000', 'Cliente 45', '11144477735', filial::filial_cvc, teste
from (values
  ('45000000-0000-0000-0000-000000000001', '1710', false),
  ('45000000-0000-0000-0000-000000000001', '1730', false),
  ('45000000-0000-0000-0000-000000000002', '1710', false),
  ('45000000-0000-0000-0000-000000000003', '1714', true)  -- só caso de teste: não conta
) v (dono, filial, teste);
set local session_replication_role = origin;

create temp table _v45 (quem text, id uuid, nome text, filial text, ativo boolean, filiais text[]) on commit drop;
grant insert on _v45 to authenticated;

create or replace function pg_temp.ler(p_quem text) returns void language sql as $$
  insert into _v45 select p_quem, id, nome_completo, filial::text, ativo, filiais_casos::text[] from public.vendedores_filtro_casos_lojas()
$$;
grant execute on function pg_temp.ler(text) to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.ler('adm_master');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.ler('gerente 1710');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.ler('gerente 1714');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.ler('vendedor 1710');
set local request.jwt.claim.sub = '45000000-0000-0000-0000-000000000002';
select pg_temp.ler('inativo');
reset role;

create or replace function pg_temp.linha(p_quem text, p_id text) returns _v45 language sql as $$
  select * from _v45 where quem = p_quem and id = p_id::uuid
$$;

select public._test_assert('adm_master: transferido com loja atual 1730 e casos na 1710 e 1730',
  (select filial = '1730' and ativo and filiais = '{1710,1730}' from pg_temp.linha('adm_master', '45000000-0000-0000-0000-000000000001')));
select public._test_assert('adm_master: inativo com caso na 1710 aparece (ativo = false)',
  (select filial = '1710' and not ativo and filiais = '{1710}' from pg_temp.linha('adm_master', '45000000-0000-0000-0000-000000000002')));
select public._test_assert('adm_master: ativos das 3 lojas; caso de teste não conta como "caso na filial"',
  (select count(distinct filial) = 3 from _v45 where quem = 'adm_master' and ativo)
  and (select filiais = '{}' from pg_temp.linha('adm_master', '45000000-0000-0000-0000-000000000003')));
select public._test_assert('gerente 1710: ativos da 1710 + transferido e inativo com casos na 1710 (só a 1710 em filiais_casos)',
  (select bool_and((ativo and filial = '1710') or filiais @> '{1710}') from _v45 where quem = 'gerente 1710')
  and (select filiais = '{1710}' from pg_temp.linha('gerente 1710', '45000000-0000-0000-0000-000000000001'))
  and (select not ativo from pg_temp.linha('gerente 1710', '45000000-0000-0000-0000-000000000002'))
  and pg_temp.linha('gerente 1710', '45000000-0000-0000-0000-000000000003') is null
  and pg_temp.linha('gerente 1710', '00000000-0000-0000-0000-000000000005') is null);
select public._test_assert('gerente 1714: nada da 1710 nem da 1730 (nem o transferido)',
  (select bool_and(filial = '1714' or filiais @> '{1714}') from _v45 where quem = 'gerente 1714')
  and pg_temp.linha('gerente 1714', '45000000-0000-0000-0000-000000000001') is null
  and pg_temp.linha('gerente 1714', '45000000-0000-0000-0000-000000000002') is null);
select public._test_assert('vendedor: como hoje — só ativos da própria filial, sem donos de outras lojas',
  (select bool_and(ativo and filial = '1710' and filiais = '{}') from _v45 where quem = 'vendedor 1710')
  and (select count(*) > 0 from _v45 where quem = 'vendedor 1710')
  and pg_temp.linha('vendedor 1710', '45000000-0000-0000-0000-000000000001') is null);
select public._test_assert('usuário inativo: nada', not exists (select 1 from _v45 where quem = 'inativo'));
select public._test_assert('mesmos ativos de vendedores_filtro_casos para cada perfil (só ganhou loja e donos)',
  (select array_agg(id order by id) from _v45 where quem = 'gerente 1710' and ativo and filial = '1710')
  = (select array_agg(u.id order by u.id) from public.usuarios u where u.ativo and u.perfil in ('vendedor', 'gerente') and u.filial = '1710'));

rollback;

do $$
begin
  perform set_config('role', 'anon', true);
  perform public.vendedores_filtro_casos_lojas();
  raise exception 'FALHOU: anon executou';
exception when insufficient_privilege then
  raise notice 'ok: anon não executa';
end;
$$;

\ir ../migrations/20261126000001_vendedores_filtro_casos_lojas.sql
select public._test_assert('reaplicar a migration é idempotente', to_regprocedure('public.vendedores_filtro_casos_lojas()') is not null);

drop function public._test_assert(text, boolean);

select 'todos os asserts do filtro de vendedor por filial passaram' as status;
