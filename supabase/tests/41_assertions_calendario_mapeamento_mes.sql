-- ============================================================================
-- Migrations 20261118000001..3: feriados + calendário de importações,
-- mapeamento sem "ativo", vendas no mês de referência.
-- ============================================================================

set role postgres;

\ir ../migrations/20261118000001_feriados_calendario_importacoes.sql
\ir ../migrations/20261118000002_mapeamento_sem_ativo.sql
\ir ../migrations/20261118000003_vendas_mes_referencia.sql

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

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 1. Feriados
-- ----------------------------------------------------------------------------

select public._test_assert('semente 2026/2027: nacionais, estadual PR, Curitiba (1710/1714) e SJP (1730)',
  (select count(*) = 13 from public.feriados where abrangencia = 'nacional' and data between '2026-01-01' and '2026-12-31')
  and exists (select 1 from public.feriados where data = '2026-12-19' and abrangencia = 'estadual_PR' and filial is null)
  and (select array_agg(filial::text order by filial) from public.feriados where data = '2026-09-08') = '{1710,1714}'
  and (select array_agg(filial::text) from public.feriados where data = '2027-03-19') = '{1730}'
  and (select bool_and(facultativo) from public.feriados where nome in ('Carnaval', 'Corpus Christi'))
  and (select count(*) = 3 from public.feriados where nome in ('Carnaval', 'Corpus Christi') and data < '2027-01-01'));

select public._test_assert('reaplicar a migration não duplica feriados',
  (select count(*) from public.feriados) = (select count(distinct (data, coalesce(filial::text, '*'))) from public.feriados));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('vendedor lê feriados', exists (select 1 from public.feriados));
reset role;
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  insert into public.feriados (data, nome, abrangencia) values ('2026-12-24', 'Véspera', 'nacional');
  raise exception 'FALHOU: gerente incluiu feriado';
exception when insufficient_privilege then
  raise notice 'ok: gerente não inclui feriado';
end;
$$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
insert into public.feriados (data, nome, abrangencia, filial) values ('2026-06-29', 'Municipal de teste', 'municipal', '1730');
update public.feriados set nome = 'Municipal editado' where data = '2026-06-29' and filial = '1730';
delete from public.feriados where data = '2026-06-29' and filial = '1730';
reset role;
select public._test_assert('adm inclui, edita e exclui feriado', not exists (select 1 from public.feriados where data = '2026-06-29'));

-- ----------------------------------------------------------------------------
-- 1b. Calendário de importações
-- ----------------------------------------------------------------------------

insert into public.vendas_importacoes (id, filial, ate, importado_por, importado_em) values
  ('41000000-0000-0000-0000-000000000001', '1710', '2026-11-16', '00000000-0000-0000-0000-000000000004', '2026-11-17 13:05:00+00'),
  ('41000000-0000-0000-0000-000000000002', '1714', '2026-11-16', '00000000-0000-0000-0000-000000000006', '2026-11-17 14:00:00+00'),
  -- 01:30 UTC de 18/11 = 22:30 de 17/11 em São Paulo.
  ('41000000-0000-0000-0000-000000000003', '1710', '2026-11-17', '00000000-0000-0000-0000-000000000004', '2026-11-18 01:30:00+00'),
  ('41000000-0000-0000-0000-000000000004', '1730', '2026-10-30', '00000000-0000-0000-0000-000000000004', '2026-10-31 12:00:00+00');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
create temp table _cal41 as select * from public.vendas_importacoes_calendario('2026-11-01', '2026-11-30');
reset role;
select public._test_assert('calendário (adm_master): importações do mês, dia em São Paulo, nome de quem importou',
  (select count(*) = 3 from _cal41 where id::text like '41000000%')
  and (select dia = '2026-11-17' and ate = '2026-11-17' from _cal41 where id = '41000000-0000-0000-0000-000000000003')
  and (select importado_por_nome = 'Adm' from _cal41 where id = '41000000-0000-0000-0000-000000000002')
  and not exists (select 1 from _cal41 where id = '41000000-0000-0000-0000-000000000004'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert('calendário (gerente 1710): só a própria loja',
  (select bool_and(filial = '1710') and count(*) >= 2 from public.vendas_importacoes_calendario('2026-11-01', '2026-11-30')));
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('calendário (vendedor): nada', not exists (select 1 from public.vendas_importacoes_calendario('2026-11-01', '2026-11-30')));
reset role;

-- ----------------------------------------------------------------------------
-- 2. Mapeamento sem "ativo"
-- ----------------------------------------------------------------------------

select public._test_assert('todas as linhas do mapeamento com ativo = true', not exists (select 1 from public.systur_vendedor_mapeamento where not ativo));

insert into auth.users (id, email, raw_user_meta_data) values
  ('41000000-0000-0000-0000-0000000000a1', 'lia41@teste.com', '{"nome_completo":"Lia Equipe Atual","perfil":"gerente","filial":"1730"}'),
  ('41000000-0000-0000-0000-0000000000a2', 'rui41@teste.com', '{"nome_completo":"Rui Parece Ativo","perfil":"gerente","filial":"1730"}')
on conflict (id) do nothing;
-- Bloqueados (como se o adm tivesse desvinculado): sem isso o vínculo
-- automático (20261119000001) já vincularia os nomes iguais aos usuários.
insert into public.systur_vendedor_mapeamento (nome_systur, loja, vinculo_automatico_bloqueado) values
  ('Lia Equipe Atual', '1730', true), ('RUI PARECE ATIVO', '1730', true), ('Zé Saiu Sem Vínculo', '1730', false), ('Agencia De Viagens Cvc Tur - Internet', '1730', false)
on conflict do nothing;

create temp table _grupos41 (fase text, nome_systur text, grupo text, parece_ativo boolean);
grant insert on _grupos41 to authenticated;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
insert into _grupos41 select 'inicio', nome_systur, grupo, parece_ativo from public.systur_mapeamento_grupos('1730');
update public.systur_vendedor_mapeamento set usuario_id = '41000000-0000-0000-0000-0000000000a1' where loja = '1730' and nome_systur = 'Lia Equipe Atual';
insert into _grupos41 select 'vinculou', nome_systur, grupo, parece_ativo from public.systur_mapeamento_grupos('1730');
update public.usuarios set ativo = false where id = '41000000-0000-0000-0000-0000000000a1';
insert into _grupos41 select 'inativou', nome_systur, grupo, parece_ativo from public.systur_mapeamento_grupos('1730');
reset role;

select public._test_assert('grupos: sem vínculo, parece ativo, site',
  (select grupo = 'sem_vinculo' and parece_ativo from _grupos41 where fase = 'inicio' and nome_systur = 'Lia Equipe Atual')
  and (select grupo = 'sem_vinculo' and parece_ativo from _grupos41 where fase = 'inicio' and nome_systur = 'RUI PARECE ATIVO')
  and (select grupo = 'sem_vinculo' and not parece_ativo from _grupos41 where fase = 'inicio' and nome_systur = 'Zé Saiu Sem Vínculo')
  and (select grupo = 'site' from _grupos41 where fase = 'inicio' and nome_systur = 'Agencia De Viagens Cvc Tur - Internet'));
select public._test_assert('vincular a usuário ativo -> Equipe atual (e some de "parece")',
  (select grupo = 'atual' and not parece_ativo from _grupos41 where fase = 'vinculou' and nome_systur = 'Lia Equipe Atual'));
select public._test_assert('inativar o usuário -> sai da Equipe atual (sem vínculo / ex)',
  (select grupo = 'sem_vinculo' from _grupos41 where fase = 'inativou' and nome_systur = 'Lia Equipe Atual'));
select public._test_assert('ordem alfabética (sem acento/caixa)',
  (select array_agg(nome_systur) from public.systur_mapeamento_grupos('1730')) =
  (select array_agg(nome_systur order by public.normalizar_nome(nome_systur), loja) from public.systur_vendedor_mapeamento where loja = '1730'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert('grupos: só adm/adm_master', not exists (select 1 from public.systur_mapeamento_grupos(null)));
reset role;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  set local role authenticated;
  update public.systur_vendedor_mapeamento set ativo = false where nome_systur = 'RUI PARECE ATIVO';
  raise exception 'FALHOU: ativo do mapeamento ainda editável';
exception when insufficient_privilege then
  raise notice 'ok: ativo do mapeamento não é mais editável';
end;
$$;

-- conferencia_base/sync seguem vinculando pelo mapeamento (sem m.ativo).
update public.usuarios set ativo = true where id = '41000000-0000-0000-0000-0000000000a1';
select public.conferencia_base('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1730", "reservas": [ { "reserva": "R41-1", "vendedor_systur": "Lia Equipe Atual", "data_viagem": "2027-01-10",
    "contratantes": [ { "pessoa_id": "41001", "nome": "Cliente Da Lia", "valor": 10 } ] } ] }$json$::jsonb);
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1730", "excursoes": [ { "reserva": "R41-2", "vendedor_systur": "Lia Equipe Atual",
    "contratantes": [ { "pessoa_id": "41002", "nome": "Outro Cliente Da Lia" } ] } ] }$json$::jsonb);
select public._test_assert('coleta e sync vinculam o vendedor pelo mapeamento',
  (select bool_and(vendedor_usuario_id = '41000000-0000-0000-0000-0000000000a1') from public.cliente_excursoes where reserva in ('R41-1', 'R41-2')));

-- ----------------------------------------------------------------------------
-- 3. Vendas no mês de referência
-- ----------------------------------------------------------------------------

insert into public.vendedores_mapeamento (nome_planilha, filial, usuario_id, criado_por) values
  ('VEND A 41', '1710', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000004'),
  ('GER BATEL 41', '1714', '00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000004');
insert into public.vendas_importadas (filial, venda_numero, vendedor_nome_planilha, data_venda, pagante, produto, valor_total, importado_por) values
  ('1710', 4100001, 'VEND A 41', '2026-10-31', 'P', 'X', 1000, '00000000-0000-0000-0000-000000000004'),
  ('1710', 4100002, 'VEND A 41', '2026-11-01', 'P', 'X', 200, '00000000-0000-0000-0000-000000000004'),
  ('1710', 4100003, 'VEND A 41', '2026-11-17', 'P', 'X', 300, '00000000-0000-0000-0000-000000000004'),
  ('1710', 4100004, 'VEND A 41', '2026-11-18', 'P', 'X', 5000, '00000000-0000-0000-0000-000000000004'),
  ('1714', 4100005, 'GER BATEL 41', '2026-10-15', 'P', 'X', 70, '00000000-0000-0000-0000-000000000004'),
  ('1714', 4100006, 'GER BATEL 41', '2026-11-10', 'P', 'X', 9000, '00000000-0000-0000-0000-000000000004');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
create temp table _ref41 as select * from public.vendas_referencia_lojas();
create temp table _res41 as select * from public.vendas_resumo_periodos(
  '[{"filial":"1710","de":"2026-11-01","ate":"2026-11-17"},{"filial":"1714","de":"2026-10-01","ate":"2026-10-31"}]');
reset role;

select public._test_assert('referência: última importação de cada loja (por hora de importação)',
  (select count(*) = 3 from _ref41)
  and not exists (
    select 1 from _ref41 r
    where r.ate is distinct from (select i.ate from public.vendas_importacoes i where i.filial = r.loja order by i.importado_em desc limit 1)
  ));

-- A mais recente vale, mesmo com "vendas até" menor que a anterior.
insert into public.vendas_importacoes (id, filial, ate, importado_por, importado_em) values
  ('41000000-0000-0000-0000-000000000009', '1730', '2026-11-12', '00000000-0000-0000-0000-000000000004', now() + interval '1 day');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('referência usa a importação mais recente',
  (select ate = '2026-11-12' from public.vendas_referencia_lojas() where loja = '1730'));
reset role;
select public._test_assert('"Todas" soma cada filial no seu período (1710: 01–17/11; 1714: outubro)',
  (select total = 500 and quantidade = 2 from _res41 where usuario_id = '00000000-0000-0000-0000-000000000001')
  and (select total = 70 and quantidade = 1 from _res41 where usuario_id = '00000000-0000-0000-0000-000000000005'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert('gerente 1714: referência só da própria loja e resumo só das vendas dela',
  (select array_agg(loja::text) = '{1714}' from public.vendas_referencia_lojas())
  and not exists (select 1 from public.vendas_resumo_periodos('[{"filial":"1710","de":"2026-11-01","ate":"2026-11-30"}]')));
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('vendedor 1710: referência da filial dele; resumo só as próprias vendas',
  (select array_agg(loja::text) = '{1710}' from public.vendas_referencia_lojas())
  and (select bool_and(usuario_id = '00000000-0000-0000-0000-000000000001') from public.vendas_resumo_periodos('[{"filial":"1710","de":"2026-11-01","ate":"2026-11-30"}]')));
reset role;
reset request.jwt.claim.sub;

delete from public.vendas_importacoes where id::text like '41000000%';
drop function public._test_assert(text, boolean);
