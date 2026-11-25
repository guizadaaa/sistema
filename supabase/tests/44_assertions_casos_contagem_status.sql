-- ============================================================================
-- Migration 20261125000001: casos_contagem_status (barra "Casos por status").
-- ============================================================================

set role postgres;

\ir ../migrations/20261125000001_casos_contagem_status.sql

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

-- Casos em status variados (direto, sem as transições: triggers desligados).
set local session_replication_role = replica;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, vendedor_original_nome, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, filial, status_atual, caso_teste)
select ('44000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'alteracao_data', 'pedido_cliente', 'teste 44',
  dono::uuid, 'Dono 44', dono::uuid, current_date + prazo, '1710000000' || lpad(n::text, 4, '0'), 'Cliente 44 ' || n, '11144477735',
  filial::filial_cvc, status::status_caso, teste
from (values
  (1, '00000000-0000-0000-0000-000000000005', '1714', 'inicial', -3, false),
  (2, '00000000-0000-0000-0000-000000000005', '1714', 'inicial', 30, false),
  (3, '00000000-0000-0000-0000-000000000005', '1714', 'em_andamento_interno', 2, false),
  (4, '00000000-0000-0000-0000-000000000005', '1714', 'resolvido', -10, false),
  (5, '00000000-0000-0000-0000-000000000001', '1710', 'recepcionado', -1, false),
  (6, '00000000-0000-0000-0000-000000000002', '1710', 'reavaliacao', 5, false),
  (7, '00000000-0000-0000-0000-000000000002', '1710', 'ouvidoria', 6, false),
  (8, '00000000-0000-0000-0000-000000000001', '1710', 'inicial', 0, true)
) v (n, dono, filial, status, prazo, teste);
set local session_replication_role = origin;

-- Resultado da função e da "lista" (mesma consulta da tela: casos sob RLS)
-- para cada perfil.
create temp table _c44 (quem text, origem text, status text, total bigint, vencidos bigint, vencem_5 bigint) on commit drop;
grant insert on _c44 to authenticated;

create or replace function pg_temp.medir(p_quem text, p_filial filial_cvc default null, p_teste boolean default false)
returns void
language plpgsql
as $$
begin
  insert into _c44 select p_quem, 'funcao', status::text, total, vencidos, vencem_5
  from public.casos_contagem_status(p_filial => p_filial, p_teste => p_teste, p_hoje => current_date);
  insert into _c44 select p_quem, 'lista', status_atual::text, count(*),
    count(*) filter (where status_atual <> 'resolvido' and prazo_vigencia < current_date),
    count(*) filter (where status_atual <> 'resolvido' and prazo_vigencia - current_date between 0 and 5)
  from public.casos
  where caso_teste = p_teste and (p_filial is null or filial = p_filial)
  group by status_atual;
end;
$$;
grant execute on function pg_temp.medir(text, filial_cvc, boolean) to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.medir('adm_master');
select pg_temp.medir('adm_master 1714', '1714');
select pg_temp.medir('adm_master teste', null, true);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.medir('vendedor A');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.medir('gerente 1710');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.medir('gerente 1714');
reset role;

-- Vendedor B inativo (direto, sem a reatribuição de casos): não conta nada, como na lista.
set local session_replication_role = replica;
update public.usuarios set ativo = false where id = '00000000-0000-0000-0000-000000000002';
set local session_replication_role = origin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.medir('vendedor B inativo');
reset role;

-- Função x lista, status a status (status sem caso: a função devolve 0).
create or replace function pg_temp.bate(p_quem text) returns boolean language sql as $$
  select bool_and(coalesce(l.total, 0) = f.total and coalesce(l.vencidos, 0) = f.vencidos and coalesce(l.vencem_5, 0) = f.vencem_5)
  from _c44 f left join _c44 l on l.quem = f.quem and l.origem = 'lista' and l.status = f.status
  where f.quem = p_quem and f.origem = 'funcao'
$$;
create or replace function pg_temp.n(p_quem text, p_status text) returns bigint language sql as $$
  select total from _c44 where quem = p_quem and origem = 'funcao' and status = p_status
$$;

select public._test_assert('sempre os 6 status (zerados inclusive)',
  (select count(*) = 6 from _c44 where quem = 'gerente 1714' and origem = 'funcao'));
select public._test_assert('Filial 1714: a contagem bate com a lista filtrada por 1714',
  pg_temp.bate('adm_master 1714')
  and pg_temp.n('adm_master 1714', 'inicial') = (select count(*) from public.casos where filial = '1714' and status_atual = 'inicial' and not caso_teste)
  and (select sum(total) from _c44 where quem = 'adm_master 1714' and origem = 'funcao')
      = (select count(*) from public.casos where filial = '1714' and not caso_teste));
select public._test_assert('adm_master: bate com a lista (todas as filiais)', pg_temp.bate('adm_master'));
select public._test_assert('vendedor só conta os próprios casos (igual à lista)',
  pg_temp.bate('vendedor A')
  and (select sum(total) from _c44 where quem = 'vendedor A' and origem = 'funcao')
      = (select count(*) from public.casos where vendedor_dono = '00000000-0000-0000-0000-000000000001' and not caso_teste));
select public._test_assert('gerente só conta os casos da filial dele (igual à lista)',
  pg_temp.bate('gerente 1710') and pg_temp.bate('gerente 1714')
  and (select sum(total) from _c44 where quem = 'gerente 1714' and origem = 'funcao')
      = (select count(*) from public.casos where filial = '1714' and not caso_teste)
  and (select sum(total) from _c44 where quem = 'gerente 1710' and origem = 'funcao')
      = (select count(*) from public.casos where filial = '1710' and not caso_teste));
select public._test_assert('vencidos e "vencem em até 5 dias": só não resolvidos, mesma régua da coluna (1714: 1 vencido, 1 em 2 dias; resolvido vencido não conta)',
  (select sum(vencidos) = (select count(*) from public.casos where filial = '1714' and not caso_teste and status_atual <> 'resolvido' and prazo_vigencia < current_date)
     and sum(vencem_5) = (select count(*) from public.casos where filial = '1714' and not caso_teste and status_atual <> 'resolvido' and prazo_vigencia between current_date and current_date + 5)
   from _c44 where quem = 'adm_master 1714' and origem = 'funcao')
  and (select vencidos = 0 from _c44 where quem = 'adm_master 1714' and origem = 'funcao' and status = 'resolvido'));
-- Só os casos deste teste (p_ids): 1 vencido (inicial, -3), 1 em 2 dias,
-- resolvido vencido fora; reavaliação em 5 dias entra, ouvidoria em 6 não.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
create temp table _p44 on commit drop as
select * from public.casos_contagem_status(p_ids => array(select ('44000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 7) n), p_hoje => current_date);
reset role;
select public._test_assert('régua da coluna: vencido < hoje; em até 5 dias = 0..5 (5º dia entra, 6º não); resolvido não conta',
  (select vencidos = 1 and vencem_5 = 0 from _p44 where status = 'inicial')
  and (select vencidos = 0 and vencem_5 = 1 from _p44 where status = 'em_andamento_interno')
  and (select vencidos = 1 from _p44 where status = 'recepcionado')
  and (select vencem_5 = 1 from _p44 where status = 'reavaliacao')
  and (select vencem_5 = 0 and vencidos = 0 from _p44 where status = 'ouvidoria')
  and (select vencidos = 0 and total = 1 from _p44 where status = 'resolvido'));
select public._test_assert('usuário inativo não conta nada (igual à lista)',
  pg_temp.bate('vendedor B inativo')
  and (select sum(total) = 0 from _c44 where quem = 'vendedor B inativo' and origem = 'funcao'));
select public._test_assert('casos de teste: só com p_teste (adm_master), nunca somados aos reais',
  pg_temp.n('adm_master teste', 'inicial') = (select count(*) from public.casos where caso_teste and status_atual = 'inicial')
  and pg_temp.bate('adm_master teste'));

-- Filtros: tipo, vendedor, período, ids da busca e "só vencidos".
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select public._test_assert('filtro vendedor + ids (busca) + vencidos',
  (select sum(total) from public.casos_contagem_status(p_vendedor => '00000000-0000-0000-0000-000000000005'))
    = (select count(*) from public.casos where vendedor_dono = '00000000-0000-0000-0000-000000000005' and not caso_teste)
  and (select sum(total) from public.casos_contagem_status(p_ids => array['44000000-0000-0000-0000-000000000001', '44000000-0000-0000-0000-000000000006']::uuid[])) = 2
  and (select sum(total) from public.casos_contagem_status(p_ids => '{}'::uuid[])) = 0
  and (select sum(total) filter (where status = 'resolvido') = 0 and sum(total) = sum(vencidos)
       from public.casos_contagem_status(p_filial => '1714', p_prazo => 'vencido', p_hoje => current_date))
  and (select sum(total) from public.casos_contagem_status(p_tipo => 'alteracao_data', p_data_inicio => current_date, p_data_fim => current_date))
    = (select count(*) from public.casos where tipo_caso = 'alteracao_data' and not caso_teste
       and criado_em >= (current_date::text || 'T00:00:00')::timestamptz and criado_em <= (current_date::text || 'T23:59:59.999')::timestamptz));
reset role;

rollback;

do $$
begin
  perform set_config('role', 'anon', true);
  perform public.casos_contagem_status();
  raise exception 'FALHOU: anon executou a contagem';
exception when insufficient_privilege then
  raise notice 'ok: anon não executa a contagem';
end;
$$;

\ir ../migrations/20261125000001_casos_contagem_status.sql
select public._test_assert('reaplicar a migration é idempotente',
  to_regprocedure('public.casos_contagem_status(tipo_caso, filial_cvc, uuid, date, date, boolean, uuid[], text, date)') is not null);

drop function public._test_assert(text, boolean);

select 'todos os asserts da contagem de casos por status passaram' as status;
