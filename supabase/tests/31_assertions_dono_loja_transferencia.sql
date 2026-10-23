-- ============================================================================
-- Etapa 1b (migration 20261027000001): dono pela loja da venda +
-- transferência de vendedor.
--
-- Cobre:
--   1. Jean (hoje na 1730) com vendas na 1710 e 1714: não vê 1710 nem 1714;
--      Dayane (gerente 1710) vê as da 1710; Tálita (gerente 1714) as da
--      1714; Jean vê as dele da 1730. Clientes e "responsável".
--   2. Vendedor ativo na loja vê as suas; outro vendedor da loja não vê;
--      gerente vê todas.
--   3. Inativar -> deixa de ver; gerente continua vendo.
--   4. Transferir e voltar -> visibilidade volta; histórico.
--   5. Permissões da transferência (gerente só da própria loja; adm qualquer).
--   6. Linkly: vínculo da loja de origem é encerrado (nada apagado) e os
--      cliques contam só até o encerramento.
--   7. Sync continua gravando (regra é só de leitura).
-- ============================================================================

set role postgres;

-- Os testes 28 e 30 reaplicam migrations anteriores (idempotência), que
-- redefinem linkly_cliques_mes e as policies da conferência — reaplica esta.
\ir ../migrations/20261027000001_conferencia_dono_loja_transferencia.sql

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
  ('31000000-0000-0000-0000-000000000001', 'jean@teste.com', '{"nome_completo":"Jean Carlos Campos Olynik","perfil":"vendedor","filial":"1730"}'),
  ('31000000-0000-0000-0000-000000000002', 'dayane@teste.com', '{"nome_completo":"Dayane Peres Kawaguchi","perfil":"gerente","filial":"1710"}'),
  ('31000000-0000-0000-0000-000000000003', 'talita.g@teste.com', '{"nome_completo":"Tálita Gerente 1714","perfil":"gerente","filial":"1714"}'),
  ('31000000-0000-0000-0000-000000000004', 'gerente1730@teste.com', '{"nome_completo":"Gerente 1730","perfil":"gerente","filial":"1730"}'),
  ('31000000-0000-0000-0000-000000000005', 'ana@teste.com', '{"nome_completo":"Ana Vendedora 1730","perfil":"vendedor","filial":"1730"}'),
  ('31000000-0000-0000-0000-000000000006', 'carlos@teste.com', '{"nome_completo":"Carlos Vendedor 1710","perfil":"vendedor","filial":"1710"}')
on conflict (id) do nothing;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- Mapeamento Systur (nome por loja da venda).
update public.systur_vendedor_mapeamento set usuario_id = '31000000-0000-0000-0000-000000000001'
where loja = '1710' and nome_systur = 'Jean Carlos Campos Olynik';
insert into public.systur_vendedor_mapeamento (nome_systur, loja, usuario_id) values
  ('Jean Carlos Campos Olynik', '1714', '31000000-0000-0000-0000-000000000001'),
  ('Jean Carlos Campos Olynik', '1730', '31000000-0000-0000-0000-000000000001'),
  ('Ana Vendedora', '1730', '31000000-0000-0000-0000-000000000005'),
  ('Carlos Vendedor', '1710', '31000000-0000-0000-0000-000000000006')
on conflict (loja, nome_systur) do update set usuario_id = excluded.usuario_id;

-- 7. Sync grava normalmente (service_role / função), em três lojas.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${ "loja": "1710", "excursoes": [
  { "reserva": "J-1710", "vendedor_systur": "Jean Carlos Campos Olynik", "contratantes": [{"pessoa_id": "J1", "nome": "Cliente Jean 1710"}], "recibos": ["1710-0000000901"] },
  { "reserva": "C-1710", "vendedor_systur": "Carlos Vendedor", "contratantes": [{"pessoa_id": "C1", "nome": "Cliente Carlos"}] },
  { "reserva": "X-1710", "vendedor_systur": "Nome Sem Vinculo 1b", "contratantes": [{"pessoa_id": "X1", "nome": "Cliente Sem Vendedor"}] } ] }$json$::jsonb) as r1710 \gset
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${ "loja": "1714", "excursoes": [
  { "reserva": "J-1714", "vendedor_systur": "Jean Carlos Campos Olynik", "contratantes": [{"pessoa_id": "J2", "nome": "Cliente Jean 1714"}] } ] }$json$::jsonb);
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${ "loja": "1730", "excursoes": [
  { "reserva": "J-1730", "vendedor_systur": "Jean Carlos Campos Olynik", "contratantes": [{"pessoa_id": "J3", "nome": "Cliente Jean 1730"}] },
  { "reserva": "A-1730", "vendedor_systur": "Ana Vendedora", "contratantes": [{"pessoa_id": "A1", "nome": "Cliente Ana"}] } ] }$json$::jsonb);
select public.conferencia_recibos('00000000-0000-0000-0000-000000000004', $json${ "loja": "1710", "data_venda": "2026-10-20",
  "recibos": [ { "recibo": "17100000000901", "cliente": "Cliente Jean 1710", "valor": 100 } ] }$json$::jsonb);

select public._test_assert('sync: grava as vendas das três lojas',
  (:'r1710'::jsonb ->> 'novas')::int = 3
  and (select count(*) = 6 from public.cliente_excursoes where reserva in ('J-1710', 'C-1710', 'X-1710', 'J-1714', 'J-1730', 'A-1730')));
select public._test_assert('sync: vendedor_usuario_id gravado mesmo com Jean fora da 1710 (nada é regravado depois)',
  (select vendedor_usuario_id = '31000000-0000-0000-0000-000000000001' from public.cliente_excursoes where reserva = 'J-1710')
  and (select vendedor_usuario_id = '31000000-0000-0000-0000-000000000001' from public.recibos where recibo = '17100000000901'));

-- ----------------------------------------------------------------------------
-- 1. Jean / Dayane / Tálita
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('Jean vê a venda dele da 1730',
  (select array_agg(reserva order by reserva) = '{J-1730}' from public.cliente_excursoes));
select public._test_assert('Jean não vê recibo da 1710', not exists (select 1 from public.recibos));
select public._test_assert('Jean vê só o cliente da 1730',
  (select array_agg(pessoa_id_systur) = '{J3}' from public.clientes));
select public._test_assert('responsável da venda da 1730 = Jean; não é da gerência',
  (select public.responsavel(e) = 'Jean Carlos Campos Olynik' and not public.da_gerencia(e)
   from public.cliente_excursoes e where reserva = 'J-1730'));
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000002';
set role authenticated;
select public._test_assert('Dayane (gerente 1710) vê J-1710, C-1710 e X-1710, nada da 1714/1730',
  (select count(*) = 3 from public.cliente_excursoes where reserva in ('J-1710', 'C-1710', 'X-1710'))
  and not exists (select 1 from public.cliente_excursoes where loja <> '1710'));
select public._test_assert('Dayane vê o recibo do Jean na 1710', exists (select 1 from public.recibos where recibo = '17100000000901'));
select public._test_assert('Dayane vê o cliente do Jean na 1710, não o da 1714',
  exists (select 1 from public.clientes where pessoa_id_systur = 'J1') and not exists (select 1 from public.clientes where pessoa_id_systur = 'J2'));
select public._test_assert('venda do Jean na 1710: responsável = Gerência da loja 1710',
  (select public.responsavel(e) = 'Gerência da loja 1710' and public.da_gerencia(e)
   from public.cliente_excursoes e where reserva = 'J-1710')
  and (select public.responsavel(r) = 'Gerência da loja 1710' from public.recibos r where recibo = '17100000000901'));
select public._test_assert('venda sem vínculo no mapeamento: da gerência',
  (select public.da_gerencia(e) from public.cliente_excursoes e where reserva = 'X-1710'));
select public._test_assert('cliente do Jean na 1710: da gerência; cliente do Carlos: responsável Carlos',
  (select public.da_gerencia(c) and public.responsavel(c) = 'Gerência da loja 1710' from public.clientes c where pessoa_id_systur = 'J1')
  and (select not public.da_gerencia(c) and public.responsavel(c) = 'Carlos Vendedor 1710' from public.clientes c where pessoa_id_systur = 'C1'));
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert('Tálita (gerente 1714) vê J-1714 e nada da 1710/1730',
  exists (select 1 from public.cliente_excursoes where reserva = 'J-1714')
  and not exists (select 1 from public.cliente_excursoes where loja <> '1714'));
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 2. Vendedor da loja / outro vendedor / gerente
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert('Carlos (1710) vê a própria venda e não a do Jean nem a sem vínculo',
  (select array_agg(reserva) = '{C-1710}' from public.cliente_excursoes where reserva in ('J-1710', 'C-1710', 'X-1710')));
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('outro vendedor da 1710 (Vendedor A) não vê a venda do Carlos',
  not exists (select 1 from public.cliente_excursoes where reserva = 'C-1710'));
reset role;
reset request.jwt.claim.sub;

-- adm vê tudo.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert('adm vê as vendas das três lojas',
  (select count(*) = 6 from public.cliente_excursoes where reserva in ('J-1710', 'C-1710', 'X-1710', 'J-1714', 'J-1730', 'A-1730')));
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 3. Inativar
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert('Ana (ativa, 1730) vê a própria venda', exists (select 1 from public.cliente_excursoes where reserva = 'A-1730'));
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
update public.usuarios set ativo = false where id = '31000000-0000-0000-0000-000000000005';
reset role;

set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert('Ana inativada deixa de ver', not exists (select 1 from public.cliente_excursoes));
reset role;
set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('gerente 1730 continua vendo a venda da Ana, agora da gerência',
  (select public.da_gerencia(e) and public.responsavel(e) = 'Gerência da loja 1730' from public.cliente_excursoes e where reserva = 'A-1730'));
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 4/5/6. Transferência
-- ----------------------------------------------------------------------------

-- Link do Linkly do Carlos na 1710, vínculo aberto desde o início do mês de
-- "ontem" (SP). Snapshots: base antes do mês = 100, ontem = 150, hoje = 170.
select (now() at time zone 'America/Sao_Paulo')::date as hoje,
       (now() at time zone 'America/Sao_Paulo')::date - 1 as ontem,
       date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date - 1)::date as mes_ontem
\gset

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
insert into public.linkly_links (id, workspace_secret, linkly_link_id, short_url, tipo, filial) values
  ('31000000-0000-0000-0000-0000000000f1', 'linkly_api_key_1710', 'transf-f1', 'https://linkly.link/transf', 'vendedor', '1710');
reset role;
set role postgres;
insert into public.linkly_vendedor_mapeamento (link_id, usuario_id, cliques_totais_no_inicio, vigente_desde, criado_por)
values ('31000000-0000-0000-0000-0000000000f1', '31000000-0000-0000-0000-000000000006', 100, :'mes_ontem', '00000000-0000-0000-0000-000000000004');
insert into public.linkly_cliques_snapshots (link_id, data, total) values
  ('31000000-0000-0000-0000-0000000000f1', :'mes_ontem'::date - 1, 100),
  ('31000000-0000-0000-0000-0000000000f1', :'ontem', 150),
  ('31000000-0000-0000-0000-0000000000f1', :'hoje', 170)
on conflict do nothing;
insert into public.linkly_cliques_totais (link_id, total_cliques) values ('31000000-0000-0000-0000-0000000000f1', 170);

-- Permissões.
do $$
declare
  v_casos text[][] := array[
    -- [quem, comando]
    ['31000000-0000-0000-0000-000000000006', $q$select public.transferir_usuario_loja('31000000-0000-0000-0000-000000000006', '1714')$q$],
    ['31000000-0000-0000-0000-000000000002', $q$select public.transferir_usuario_loja('31000000-0000-0000-0000-000000000001', '1710')$q$],
    ['31000000-0000-0000-0000-000000000002', $q$select public.transferir_usuario_loja('00000000-0000-0000-0000-000000000003', '1714')$q$],
    ['31000000-0000-0000-0000-000000000003', $q$select public.transferir_usuario_loja('31000000-0000-0000-0000-000000000006', '1714')$q$]
  ];
  i int;
begin
  for i in 1 .. array_length(v_casos, 1) loop
    begin
      perform set_config('request.jwt.claim.sub', v_casos[i][1], true);
      set local role authenticated;
      execute v_casos[i][2];
      raise exception 'FALHOU: transferência deveria ser negada: %', v_casos[i][2];
    exception when insufficient_privilege then
      raise notice 'ok: transferência negada (%)', i;
    end;
    reset role;
  end loop;
end;
$$;
select public._test_assert('transferências negadas não mudaram nada',
  (select filial = '1710' from public.usuarios where id = '31000000-0000-0000-0000-000000000006')
  and (select filial = '1730' from public.usuarios where id = '31000000-0000-0000-0000-000000000001')
  and not exists (select 1 from public.usuario_transferencias));

do $$
begin
  perform set_config('request.jwt.claim.sub', '31000000-0000-0000-0000-000000000002', true);
  set local role authenticated;
  perform public.transferir_usuario_loja('31000000-0000-0000-0000-000000000006', '1710');
  raise exception 'FALHOU: transferência para a mesma loja deveria falhar';
exception when invalid_parameter_value then
  raise notice 'ok: mesma loja recusada';
end;
$$;

-- Gerente 1710 (Dayane) transfere Carlos para a 1714.
set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000002';
set role authenticated;
select public.transferir_usuario_loja('31000000-0000-0000-0000-000000000006', '1714', 'Cobrir férias no Batel') is not null as transferiu;
reset role;
reset request.jwt.claim.sub;

select public._test_assert('transferência muda usuarios.filial e registra histórico',
  (select filial = '1714' from public.usuarios where id = '31000000-0000-0000-0000-000000000006')
  and (select count(*) = 1 from public.usuario_transferencias
       where usuario_id = '31000000-0000-0000-0000-000000000006' and loja_de = '1710' and loja_para = '1714'
         and feito_por = '31000000-0000-0000-0000-000000000002' and observacao = 'Cobrir férias no Batel'));
select public._test_assert('Linkly: vínculo da 1710 encerrado ontem, nada apagado, nenhum vínculo novo',
  (select count(*) = 1 from public.linkly_vendedor_mapeamento where link_id = '31000000-0000-0000-0000-0000000000f1')
  and (select vigente_ate = greatest(vigente_desde, :'ontem'::date) from public.linkly_vendedor_mapeamento
       where link_id = '31000000-0000-0000-0000-0000000000f1'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('Linkly: cliques do Carlos contam até o encerramento (150 - 100)',
  (select cliques = 50 from public.linkly_cliques_mes(:'mes_ontem') where link_id = '31000000-0000-0000-0000-0000000000f1'));
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert('Carlos transferido não vê mais a venda da 1710', not exists (select 1 from public.cliente_excursoes where reserva = 'C-1710'));
reset role;
set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000002';
set role authenticated;
select public._test_assert('gerente 1710 continua vendo a venda do Carlos (da gerência)',
  (select public.da_gerencia(e) from public.cliente_excursoes e where reserva = 'C-1710'));
select public._test_assert('gerente 1710 vê o histórico (loja de origem)', exists (select 1 from public.usuario_transferencias));
reset role;
set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('gerente 1730 não vê o histórico', not exists (select 1 from public.usuario_transferencias));
reset role;
reset request.jwt.claim.sub;

-- Volta: Tálita (gerente 1714, agora a loja do Carlos) devolve para a 1710.
set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert('gerente 1714 vê o histórico (loja de destino) com nome de quem fez',
  (select feito_por_nome = 'Dayane Peres Kawaguchi' from public.usuario_transferencias_historico('31000000-0000-0000-0000-000000000006')));
select public.transferir_usuario_loja('31000000-0000-0000-0000-000000000006', '1710') is not null as voltou;
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '31000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert('Carlos de volta à 1710 volta a ver a venda',
  exists (select 1 from public.cliente_excursoes where reserva = 'C-1710'));
reset role;
reset request.jwt.claim.sub;
select public._test_assert('histórico com ida e volta', (select count(*) = 2 from public.usuario_transferencias
  where usuario_id = '31000000-0000-0000-0000-000000000006'));

-- adm transfere gerente (de qualquer loja).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public.transferir_usuario_loja('31000000-0000-0000-0000-000000000004', '1714') is not null as adm_transferiu;
reset role;
reset request.jwt.claim.sub;
select public._test_assert('adm transfere gerente de outra loja',
  (select filial = '1714' from public.usuarios where id = '31000000-0000-0000-0000-000000000004'));

-- authenticated não grava o histórico direto.
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  set local role authenticated;
  insert into public.usuario_transferencias (usuario_id, loja_de, loja_para, feito_por)
  values ('31000000-0000-0000-0000-000000000006', '1710', '1714', '00000000-0000-0000-0000-000000000004');
  raise exception 'FALHOU: insert direto em usuario_transferencias';
exception when insufficient_privilege then
  raise notice 'ok: usuario_transferencias só via transferir_usuario_loja';
end;
$$;

-- Idempotência.
\ir ../migrations/20261027000001_conferencia_dono_loja_transferencia.sql
select public._test_assert('reaplicar a migration não perde o histórico',
  (select count(*) = 3 from public.usuario_transferencias));

drop function public._test_assert(text, boolean);

select 'todos os asserts de dono pela loja e transferência passaram' as status;
