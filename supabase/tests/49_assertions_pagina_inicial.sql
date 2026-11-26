-- ============================================================================
-- Migration 20261129000001: página inicial (contagem por filial × dono ×
-- status, parados há mais tempo) e filtros vence5/aberto da barra de Casos.
-- ============================================================================

set role postgres;

\ir ../migrations/20261129000001_pagina_inicial_casos.sql

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

-- Casos em status/prazos variados (direto, sem as transições) + quando
-- entraram na etapa atual.
set local session_replication_role = replica;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, vendedor_original_nome, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf, filial, status_atual, caso_teste)
select ('49000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'alteracao_data', 'pedido_cliente', 'teste 49',
  dono::uuid, 'x', dono::uuid, current_date + prazo, '17490000000000', 'Cliente 49 ' || n, '11144477735', filial::filial_cvc, status::status_caso, teste
from (values
  (1, '00000000-0000-0000-0000-000000000005', '1714', 'inicial', -3, false),
  (2, '00000000-0000-0000-0000-000000000005', '1714', 'em_andamento_interno', 4, false),
  (3, '00000000-0000-0000-0000-000000000005', '1714', 'resolvido', -30, false),     -- resolvido vencido: não conta
  (4, '00000000-0000-0000-0000-000000000001', '1710', 'recepcionado', 5, false),
  (5, '00000000-0000-0000-0000-000000000002', '1710', 'ouvidoria', 6, false),
  (6, '00000000-0000-0000-0000-000000000001', '1710', 'inicial', -1, true)           -- teste: fora
) v (n, dono, filial, status, prazo, teste);
insert into public.status_historico (caso_id, status, entrou_em, alterado_por)
select ('49000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid, s::status_caso, now() - (d || ' days')::interval, '00000000-0000-0000-0000-000000000004'
from (values (1, 'inicial', 400), (2, 'em_andamento_interno', 300), (3, 'resolvido', 500), (4, 'recepcionado', 350), (5, 'ouvidoria', 1)) v (n, s, d);
set local session_replication_role = origin;

create temp table _d49 (quem text, filial text, dono uuid, status text, total bigint, vencidos bigint, vencem_5 bigint) on commit drop;
create temp table _l49 (quem text, filial text, dono uuid, status text, total bigint, vencidos bigint, vencem_5 bigint) on commit drop;
create temp table _p49 (quem text, id uuid, status text, entrou_em timestamptz, pos int) on commit drop;
grant insert on _d49, _l49, _p49 to authenticated;

create or replace function pg_temp.medir(p_quem text) returns void language plpgsql as $$
begin
  insert into _d49 select p_quem, filial::text, vendedor_dono, status::text, total, vencidos, vencem_5 from public.dashboard_casos_contagem(current_date);
  -- "Lista": o que a tela de Casos mostra para o mesmo usuário (RLS de casos).
  insert into _l49 select p_quem, filial::text, vendedor_dono, status_atual::text, count(*),
    count(*) filter (where status_atual <> 'resolvido' and prazo_vigencia < current_date),
    count(*) filter (where status_atual <> 'resolvido' and prazo_vigencia between current_date and current_date + 5)
  from public.casos where not caso_teste group by 1, 2, 3, 4;
  insert into _p49 select p_quem, id, status_atual::text, entrou_em, row_number() over () from public.casos_tempo_etapa(null, 50);
end;
$$;
grant execute on function pg_temp.medir(text) to authenticated;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.medir('adm_master');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select pg_temp.medir('gerente 1714');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.medir('gerente 1710');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.medir('vendedor A');
reset role;

create or replace function pg_temp.bate(p_quem text) returns boolean language sql as $$
  select not exists (
    (select filial, dono, status, total, vencidos, vencem_5 from _d49 where quem = p_quem
     except select filial, dono, status, total, vencidos, vencem_5 from _l49 where quem = p_quem)
    union all
    (select filial, dono, status, total, vencidos, vencem_5 from _l49 where quem = p_quem
     except select filial, dono, status, total, vencidos, vencem_5 from _d49 where quem = p_quem)
  )
$$;

select public._test_assert('contagem por (filial, dono, status) = lista sob RLS, para adm_master, gerentes e vendedor',
  pg_temp.bate('adm_master') and pg_temp.bate('gerente 1714') and pg_temp.bate('gerente 1710') and pg_temp.bate('vendedor A'));
select public._test_assert('vencidos e vencem em até 5 dias não contam resolvidos',
  (select vencidos = 0 from _d49 where quem = 'adm_master' and dono = '00000000-0000-0000-0000-000000000005' and status = 'resolvido' and filial = '1714')
  and (select sum(vencidos) = 1 and sum(vencem_5) = 1 from _d49 where quem = 'gerente 1714' and dono = '00000000-0000-0000-0000-000000000005'));
select public._test_assert('gerente só a filial dele; vendedor só os próprios; caso de teste fora',
  (select bool_and(filial = '1714') from _d49 where quem = 'gerente 1714')
  and (select bool_and(dono = '00000000-0000-0000-0000-000000000001') from _d49 where quem = 'vendedor A')
  and not exists (select 1 from _p49 where id = '49000000-0000-0000-0000-000000000006'));
select public._test_assert('parados: só não resolvidos, do mais parado ao menos, só os visíveis',
  (select array_agg(id order by pos) filter (where id::text like '49000000%') from _p49 where quem = 'adm_master')
    = array['49000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000004', '49000000-0000-0000-0000-000000000002', '49000000-0000-0000-0000-000000000005']::uuid[]
  and (select bool_and(status <> 'resolvido') from _p49)
  and (select bool_and(e1.entrou_em <= e2.entrou_em) from _p49 e1 join _p49 e2 on e1.quem = e2.quem and e2.pos = e1.pos + 1)
  and not exists (select 1 from _p49 where quem = 'gerente 1714' and id = '49000000-0000-0000-0000-000000000004'));

-- Barra da tela de Casos: prazo vence5 e aberto.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select public._test_assert('casos_contagem_status: aberto = sem resolvidos; vence5 = 0..5 dias, sem resolvidos',
  (select sum(total) filter (where status = 'resolvido') = 0 and sum(total) = (select count(*) from public.casos where status_atual <> 'resolvido' and not caso_teste)
   from public.casos_contagem_status(p_prazo => 'aberto', p_hoje => current_date))
  and (select sum(total) = (select count(*) from public.casos where status_atual <> 'resolvido' and not caso_teste and prazo_vigencia between current_date and current_date + 5)
   from public.casos_contagem_status(p_prazo => 'vence5', p_hoje => current_date)));
select public._test_assert('tempo na etapa de casos dados (ordem=parado) respeita a visibilidade',
  (select count(*) = 1 from public.casos_tempo_etapa(array['49000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000004']::uuid[])));
reset role;

rollback;

\ir ../migrations/20261129000001_pagina_inicial_casos.sql
select public._test_assert('reaplicar a migration é idempotente',
  to_regprocedure('public.dashboard_casos_contagem(date)') is not null and to_regprocedure('public.casos_tempo_etapa(uuid[], integer)') is not null);

drop function public._test_assert(text, boolean);

select 'todos os asserts da página inicial passaram' as status;
