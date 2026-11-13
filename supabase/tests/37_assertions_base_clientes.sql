-- ============================================================================
-- Migration 20261113000001: base de clientes + coleta do bot.
-- ============================================================================

set role postgres;

-- Testes anteriores reaplicam versões antigas (policies por vendedor,
-- _conferencia_recalcular_cliente): reaplica esta.
\ir ../migrations/20261113000001_base_clientes.sql

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
-- 1. conferencia_base: lote da 1710
-- ----------------------------------------------------------------------------

create temp table _lote37 (corpo jsonb);
insert into _lote37 values ($json${
  "versao_extensao": "0.12.0", "loja": "1710",
  "janela": { "de": "2026-01-01", "ate": "2026-10-31" },
  "fim_da_janela": true,
  "reservas": [
    { "reserva": "R37-1", "roteiro": "1", "excursao": "9.1.1", "vendedor_systur": "Vendedor Novo 37",
      "data_confirmacao": "2026-10-01", "data_viagem": "2027-01-10", "data_retorno": "2027-01-20",
      "tipo_produto": "AEREO", "descricao_roteiro": "ORLANDO - 11 Dias 0 Noites",
      "origem": { "pais": "BRASIL", "estado": "PR", "cidade": "CURITIBA" },
      "destino": { "pais": "ESTADOS UNIDOS", "estado": "FL", "cidade": "ORLANDO" },
      "tem_voo": true, "fornecedores": [], "tipos_servico": ["aereo"],
      "contratantes": [
        { "pessoa_id": "37001", "nome": "Ana Campanha", "recibo": "1710-0000370001", "valor": 3000,
          "taxa_embarque": 120, "taxa_du": 0, "taxa_remessa": 0, "taxa_iof": 33.59,
          "passageiros": ["Ana Campanha", "Filho Ana"],
          "telefones": [ { "numero": "41 99999-0001", "tipo": "Celular", "contato": "" } ] },
        { "pessoa_id": "37002", "nome": "Bruno Dois", "recibo": "1710-0000370002", "valor": 2000,
          "taxa_embarque": 0, "taxa_du": 0, "taxa_remessa": 0, "taxa_iof": 0, "passageiros": ["Bruno Dois"] } ] },
    { "reserva": "R37-2", "excursao": "9.1.2", "vendedor_systur": "Vendedor Novo 37",
      "data_confirmacao": "2026-10-05", "data_viagem": "2027-02-01", "data_retorno": "2027-02-10",
      "destino": { "cidade": "ORLANDO" }, "tem_voo": true, "tipos_servico": ["aereo"],
      "contratantes": [ { "pessoa_id": "37003", "nome": "Carla Com Ingresso", "valor": 2500 } ] },
    { "reserva": "R37-3", "excursao": "1.1.3", "vendedor_systur": "Vendedor Novo 37",
      "data_confirmacao": "2026-10-06", "data_viagem": "2027-02-03", "data_retorno": "2027-02-03",
      "destino": { "cidade": "DISNEY - ORLANDO" }, "tipos_servico": ["ingresso"],
      "contratantes": [ { "pessoa_id": "37003", "nome": "Carla Com Ingresso", "valor": 900 } ] },
    { "reserva": "R37-4", "excursao": "9.1.4", "vendedor_systur": "Vendedor Novo 37",
      "data_confirmacao": "2026-02-01", "data_viagem": "2027-03-01", "data_retorno": "2027-03-08",
      "destino": { "cidade": "Orlando" }, "tem_voo": true, "tipos_servico": ["aereo"],
      "contratantes": [ { "pessoa_id": "37004", "nome": "Davi Outra Viagem", "valor": 4100 } ] },
    { "reserva": "R37-5", "excursao": "1.1.5", "vendedor_systur": "Vendedor Novo 37",
      "data_confirmacao": "2026-02-01", "data_viagem": "2026-06-01", "data_retorno": "2026-06-01",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["ingresso"],
      "contratantes": [ { "pessoa_id": "37004", "nome": "Davi Outra Viagem", "valor": 800 } ] }
  ]
}$json$::jsonb);

select public.conferencia_base('00000000-0000-0000-0000-000000000004', corpo) as r1 from _lote37 \gset

select public._test_assert('resposta: 5 recebidas, 5 novas, 4 clientes novos, vendedor sem vínculo',
  (:'r1'::jsonb ->> 'recebidas')::int = 5 and (:'r1'::jsonb ->> 'novas')::int = 5
  and (:'r1'::jsonb ->> 'atualizadas')::int = 0 and (:'r1'::jsonb ->> 'clientes_novos')::int = 4
  and :'r1'::jsonb -> 'vendedores_sem_vinculo' = '["Vendedor Novo 37"]'::jsonb);

select public._test_assert('reserva com 2 contratantes gera 2 compras',
  (select count(*) = 2 from public.cliente_compras where reserva = 'R37-1'));

select public._test_assert('valor_total = soma dos contratantes (taxas fora)',
  (select valor_total = 5000 from public.cliente_excursoes where reserva = 'R37-1'));

select public._test_assert('compra guarda valor, taxas, passageiros e recibo do contratante',
  (select valor = 3000 and taxa_iof = 33.59 and taxa_embarque = 120 and passageiros = '{Ana Campanha,Filho Ana}'
     and recibo = '1710-0000370001' and loja = '1710' and destino_cidade = 'ORLANDO' and tipos_servico = '{aereo}'
   from public.cliente_compras where reserva = 'R37-1' and pessoa_id_systur = '37001'));

select public._test_assert('reserva guarda produto, roteiro, origem/destino, voo e coletado_em',
  (select tipo_produto = 'AEREO' and descricao_roteiro = 'ORLANDO - 11 Dias 0 Noites' and destino_pais = 'ESTADOS UNIDOS'
     and destino_estado = 'FL' and destino_cidade = 'ORLANDO' and origem_cidade = 'CURITIBA' and tem_voo
     and fornecedores = '[]'::jsonb and coletado_em is not null and categoria_codigo = 9
   from public.cliente_excursoes where reserva = 'R37-1'));

select public._test_assert('mapeamento: nome novo criado sem vínculo',
  (select usuario_id is null from public.systur_vendedor_mapeamento where loja = '1710' and nome_systur = 'Vendedor Novo 37'));

select public._test_assert('cliente criado com telefone; totais a partir das compras',
  (select telefones -> 0 ->> 'numero' = '41 99999-0001' and total_comprado = 3000 and qtd_viagens = 1
     and proxima_viagem = '2027-01-10' and primeira_compra = '2026-10-01'
   from public.clientes where pessoa_id_systur = '37001'));

select public._test_assert('janela registrada (fim_da_janela)',
  (select reservas = 5 and coletado_por = '00000000-0000-0000-0000-000000000004'
   from public.base_coleta_janelas where loja = '1710' and de = '2026-01-01' and ate = '2026-10-31'));

-- Campos da conferência não são tocados pela coleta.
update public.cliente_excursoes set status_voos = 'ok', avisos = '[{"x":1}]', pendencias = '[1]', apolices = '[{"n":"A1"}]'
where reserva = 'R37-1';

-- 2. Idempotência: mesmo lote de novo.
select public.conferencia_base('00000000-0000-0000-0000-000000000004', corpo) as r2 from _lote37 \gset

select public._test_assert('reenvio: 0 novas, 5 atualizadas, 0 clientes novos',
  (:'r2'::jsonb ->> 'novas')::int = 0 and (:'r2'::jsonb ->> 'atualizadas')::int = 5
  and (:'r2'::jsonb ->> 'clientes_novos')::int = 0);

select public._test_assert('reenvio não duplica compras, clientes nem janelas',
  (select count(*) = 6 from public.cliente_compras where reserva like 'R37-%')
  and (select count(*) = 4 from public.clientes where pessoa_id_systur like '3700%')
  and (select count(*) = 1 from public.base_coleta_janelas where loja = '1710' and de = '2026-01-01'));

select public._test_assert('reenvio preserva voos/avisos/pendências/apólices',
  (select status_voos = 'ok' and avisos = '[{"x":1}]'::jsonb and pendencias = '[1]'::jsonb and apolices = '[{"n":"A1"}]'::jsonb
   from public.cliente_excursoes where reserva = 'R37-1'));

-- 3. sync da conferência sobre a mesma reserva: grava compras, não apaga valor.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "R37-1", "vendedor_systur": "Vendedor Novo 37", "destino": "ORLANDO",
      "contratantes": [ { "pessoa_id": "37001", "nome": "Ana Campanha" }, { "pessoa_id": "37002", "nome": "Bruno Dois" } ] },
    { "reserva": "R37-SYNC", "vendedor_systur": "Vendedor Novo 37", "data_viagem": "2027-05-01", "destino": "LISBOA",
      "contratantes": [ { "pessoa_id": "37005", "nome": "Eva Só Sync" } ] } ]
}$json$::jsonb);

select public._test_assert('sync não apaga valor/passageiros gravados pelo bot',
  (select valor = 3000 and taxa_iof = 33.59 and passageiros = '{Ana Campanha,Filho Ana}'
   from public.cliente_compras where reserva = 'R37-1' and pessoa_id_systur = '37001'));

select public._test_assert('sync grava em cliente_compras com o que tiver (sem valor)',
  (select valor is null and destino_cidade = 'LISBOA' and data_viagem = '2027-05-01'
   from public.cliente_compras where reserva = 'R37-SYNC' and pessoa_id_systur = '37005'));

-- Contratante que sai da reserva no bot deixa de ser compra.
select public.conferencia_base('00000000-0000-0000-0000-000000000004', jsonb_set(corpo, '{reservas}', jsonb_build_array(
  jsonb_set(corpo -> 'reservas' -> 0, '{contratantes}', jsonb_build_array(corpo #> '{reservas,0,contratantes,0}'))
))) from _lote37;
select public._test_assert('contratante removido sai das compras; total do cliente recalculado',
  (select count(*) = 1 from public.cliente_compras where reserva = 'R37-1')
  and (select total_comprado = 0 and qtd_viagens = 0 from public.clientes where pessoa_id_systur = '37002'));
select public.conferencia_base('00000000-0000-0000-0000-000000000004', corpo) from _lote37;

-- Lote da 1714: Ana também comprou lá (hotel em Paris).
select public.conferencia_base('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1714", "janela": { "de": "2026-01-01", "ate": "2026-12-31" }, "fim_da_janela": false,
  "reservas": [
    { "reserva": "R37-6", "vendedor_systur": "Vendedor Batel 37", "data_confirmacao": "2026-03-01",
      "data_viagem": "2026-05-10", "data_retorno": "2026-05-15", "destino": { "cidade": "PARIS" },
      "tipos_servico": ["hotel"],
      "contratantes": [ { "pessoa_id": "37001", "nome": "Ana Campanha", "valor": 1500 } ] } ]
}$json$::jsonb);

select public._test_assert('cliente com compras em 2 lojas: total soma as duas',
  (select total_comprado = 4500 and qtd_viagens = 2 from public.clientes where pessoa_id_systur = '37001'));
select public._test_assert('fim_da_janela false não registra janela',
  not exists (select 1 from public.base_coleta_janelas where loja = '1714'));

-- Limite e validação.
do $$
begin
  perform public.conferencia_base('00000000-0000-0000-0000-000000000004', jsonb_build_object(
    'loja', '1710', 'reservas', (select jsonb_agg(jsonb_build_object('reserva', 'X' || g)) from generate_series(1, 201) g)));
  raise exception 'FALHOU: aceitou 201 reservas';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: mais de 200 reservas recusado (%)', sqlerrm;
end;
$$;

do $$
begin
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
  set local role authenticated;
  perform public.conferencia_base('00000000-0000-0000-0000-000000000004', '{"loja":"1710","reservas":[]}');
  raise exception 'FALHOU: authenticated chamou conferencia_base';
exception when insufficient_privilege then
  raise notice 'ok: conferencia_base só service_role';
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. RLS: loja da venda
-- ----------------------------------------------------------------------------

select count(*) as compras_1710 from public.cliente_compras where loja = '1710' \gset
select count(*) as clientes_1710 from public.clientes c
  where exists (select 1 from public.cliente_compras x where x.cliente_id = c.id and x.loja = '1710')
     or exists (select 1 from public.cliente_excursoes x where x.cliente_id = c.id and x.loja = '1710')
     or exists (select 1 from public.recibos x where x.cliente_id = c.id and x.loja = '1710') \gset
select count(*) as compras_todas from public.cliente_compras \gset

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('vendedor 1710 vê todas as compras da 1710 e nenhuma da 1714',
  (select count(*) from public.cliente_compras) = :compras_1710
  and not exists (select 1 from public.cliente_compras where loja = '1714'));
select public._test_assert('vendedor 1710 vê todos os clientes da 1710 (inclusive de outro vendedor)',
  (select count(*) from public.clientes) = :clientes_1710);
select public._test_assert('vendedor 1710 vê reservas da 1710 e nenhuma da 1714',
  exists (select 1 from public.cliente_excursoes where reserva = 'R37-1')
  and not exists (select 1 from public.cliente_excursoes where loja = '1714'));
select public._test_assert('vendedor 1710: Ana expandida mostra só a compra da 1710',
  (select array_agg(reserva) = '{R37-1}' from public.base_clientes_compras(
     (select id from public.clientes where pessoa_id_systur = '37001'))));
select public._test_assert('vendedor 1710 não lê janelas de coleta', not exists (select 1 from public.base_coleta_janelas));
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert('gerente 1714 vê a Ana (comprou na 1714) e só a compra da 1714',
  exists (select 1 from public.clientes where pessoa_id_systur = '37001')
  and (select array_agg(reserva) = '{R37-6}' from public.cliente_compras where pessoa_id_systur = '37001')
  and not exists (select 1 from public.cliente_compras where loja <> '1714')
  and (select array_agg(reserva) = '{R37-6}' from public.base_clientes_compras(
     (select id from public.clientes where pessoa_id_systur = '37001'))));
select public._test_assert('gerente 1714 não vê clientes só da 1710',
  not exists (select 1 from public.clientes where pessoa_id_systur in ('37002', '37003', '37004')));
select public._test_assert('busca do gerente 1714: total visível da Ana = só a 1714',
  (select total_comprado = 1500 and lojas = '{1714}' from public.base_clientes_buscar('{}', 50, 0)
   where nome = 'Ana Campanha'));
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert('adm vê tudo', (select count(*) from public.cliente_compras) = :compras_todas);
select public._test_assert('adm não lê janelas (só adm_master)', not exists (select 1 from public.base_coleta_janelas));
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('adm_master lê as janelas de coleta', exists (select 1 from public.base_coleta_janelas where loja = '1710'));
select public._test_assert('adm_master: Ana com as duas lojas e total 4500',
  (select total_comprado = 4500 and lojas = '{1710,1714}' and qtd_viagens = 2
   from public.base_clientes_buscar('{}', 50, 0) where nome = 'Ana Campanha'));
reset role;

-- ----------------------------------------------------------------------------
-- 5. Campanha: aéreo para Orlando, embarque futuro, sem ingresso
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
create temp table _camp37 as
  select * from public.base_clientes_buscar(
    '{"camp":"adicional","ca_tipo":"aereo","ca_destino":"orlândo","ca_de":"2026-11-01","ca_sem_tipo":"ingresso"}', 50, 0)
  where nome in ('Ana Campanha', 'Bruno Dois', 'Carla Com Ingresso', 'Davi Outra Viagem');
reset role;

select public._test_assert('aéreo Orlando sem ingresso aparece (Ana, Bruno)',
  exists (select 1 from _camp37 where nome = 'Ana Campanha') and exists (select 1 from _camp37 where nome = 'Bruno Dois'));
select public._test_assert('com ingresso na mesma viagem (embarque −3/retorno +3) NÃO aparece',
  not exists (select 1 from _camp37 where nome = 'Carla Com Ingresso'));
select public._test_assert('com ingresso em outra viagem aparece',
  exists (select 1 from _camp37 where nome = 'Davi Outra Viagem'));
select public._test_assert('compra que casou = o aéreo; soma e total de clientes coerentes',
  (select compra_reserva = 'R37-4' and compra_valor = 4100 and compra_tipos = '{aereo}' from _camp37 where nome = 'Davi Outra Viagem')
  and (select bool_and(total_clientes = 3) from _camp37)
  and (select bool_and(soma_valores = 3000 + 2000 + 4100) from _camp37));

-- Recompra: comprou no 1º semestre e nada no 2º (adm vê as 3 lojas).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert('recompra: comprou entre jan-jun e nada entre jul-dez -> só Davi entre os de teste',
  (select array_agg(nome order by nome) from public.base_clientes_buscar(
     '{"camp":"recompra","cr_a_de":"2026-01-01","cr_a_ate":"2026-06-30","cr_b_de":"2026-07-01","cr_b_ate":"2026-12-31","cr_escopo":"nada"}', 500, 0)
   where nome like any (array['Ana%', 'Bruno%', 'Carla%', 'Davi%'])) = '{Davi Outra Viagem}');

-- Filtros simples.
select public._test_assert('destino sem acento/maiúsculas + tipo + só viagem futura',
  (select array_agg(nome order by nome) from public.base_clientes_buscar(
     '{"destino":"ÓRLANDO","tipo":"ingresso","futura":"1"}', 50, 0)) = '{Carla Com Ingresso,Davi Outra Viagem}');
select public._test_assert('valor da compra de/até e total do cliente de/até',
  (select array_agg(nome order by nome) from public.base_clientes_buscar('{"valor_de":"2500","valor_ate":"3000"}', 50, 0)
   where nome like any (array['Ana%', 'Bruno%', 'Carla%', 'Davi%'])) = '{Ana Campanha,Carla Com Ingresso}'
  and (select array_agg(nome order by nome) from public.base_clientes_buscar('{"total_de":"4000"}', 50, 0)
   where nome like any (array['Ana%', 'Bruno%', 'Carla%', 'Davi%'])) = '{Ana Campanha,Davi Outra Viagem}');
select public._test_assert('paginação: limite e total_clientes',
  (select count(*) = 2 and bool_and(total_clientes >= 5) from public.base_clientes_buscar('{}', 2, 0)));
select public._test_assert('sugestão de destino',
  exists (select 1 from public.base_clientes_destinos('orl') where destino = 'ORLANDO'));
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 6. Filtros salvos (por usuário) e recálculo de tipos
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
insert into public.cliente_filtros_salvos (nome, filtros) values ('Orlando sem ingresso', '{"camp":"adicional"}');
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
select public._test_assert('filtro salvo é só de quem salvou', not exists (select 1 from public.cliente_filtros_salvos));
reset role;
reset request.jwt.claim.sub;

select public.clientes_gravar_tipos_servico('[{"reserva":"R37-SYNC","tipos":["aereo"]},{"reserva":"R37-1","tipos":["hotel"]}]', true) as gravados \gset
select public._test_assert('gravar tipos (só vazios): preenche o sync, não sobrescreve o do bot; propaga para compras',
  :gravados = 1
  and (select tipos_servico = '{aereo}' from public.cliente_compras where reserva = 'R37-SYNC')
  and (select tipos_servico = '{aereo}' from public.cliente_excursoes where reserva = 'R37-1'));
select public.clientes_gravar_tipos_servico('[{"reserva":"R37-1","tipos":["aereo","hotel"]}]', false);
select public._test_assert('recalcular (sobrescreve): compras acompanham',
  (select bool_and(tipos_servico = '{aereo,hotel}') from public.cliente_compras where reserva = 'R37-1'));

-- Idempotência da migration.
select count(*) as compras_antes, sum(coalesce(valor, 0)) as valor_antes from public.cliente_compras \gset
\ir ../migrations/20261113000001_base_clientes.sql
select public._test_assert('reaplicar a migration não duplica nem perde compras',
  (select count(*) = :compras_antes and sum(coalesce(valor, 0)) = :valor_antes from public.cliente_compras)
  and (select count(*) = 8 from public.cliente_compras where reserva like 'R37-%'));

drop function public._test_assert(text, boolean);
