-- ============================================================================
-- Migration 20261116000003: vendedores atuais × ex × site, aviso de vínculo,
-- cobertura por mês.
-- ============================================================================

set role postgres;

-- Testes anteriores reaplicam versões antigas de base_clientes_buscar.
\ir ../migrations/20261116000003_clientes_vendedores_cobertura.sql
\ir ../migrations/20261116000004_clientes_desempenho.sql

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

-- Usuários da 1730: Bia (vai ser vinculada e depois inativada) e Caio (ativo,
-- nome igual a um nome do Systur ainda sem vínculo). Perfil gerente: inativar
-- vendedor exige exatamente 1 gerente na loja (regra de casos, fora daqui).
insert into auth.users (id, email, raw_user_meta_data) values
  ('39000000-0000-0000-0000-000000000001', 'bia39@teste.com', '{"nome_completo":"Bia Atual Trinta","perfil":"gerente","filial":"1730"}'),
  ('39000000-0000-0000-0000-000000000002', 'caio39@teste.com', '{"nome_completo":"Caio Sem Vínculo","perfil":"gerente","filial":"1730"}'),
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

select public.conferencia_base('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1730", "janela": { "de": "2026-01-01", "ate": "2026-03-31" }, "fim_da_janela": true,
  "reservas": [
    { "reserva": "R39-1", "vendedor_systur": "Bia Atual Trinta", "data_confirmacao": "2025-12-01", "data_viagem": "2026-01-10",
      "contratantes": [ { "pessoa_id": "39001", "nome": "Cliente Da Bia", "valor": 100 } ] },
    { "reserva": "R39-2", "vendedor_systur": "Fulano Que Saiu", "data_confirmacao": "2025-12-02", "data_viagem": "2026-01-20",
      "contratantes": [ { "pessoa_id": "39002", "nome": "Cliente Do Fulano", "valor": 200 } ] },
    { "reserva": "R39-3", "vendedor_systur": "Agencia De Viagens Cvc Tur - Internet", "data_confirmacao": "2025-12-03", "data_viagem": "2026-03-05",
      "contratantes": [ { "pessoa_id": "39003", "nome": "Cliente Do Site", "valor": 300 } ] },
    { "reserva": "R39-4", "vendedor_systur": "CAIO SEM VINCULO", "data_confirmacao": "2025-12-04", "data_viagem": "2026-03-06",
      "contratantes": [ { "pessoa_id": "39004", "nome": "Cliente Do Caio", "valor": 400 } ] }
  ]
}$json$::jsonb);

select public._test_assert('categoria: site pelo nome, mesmo sem vínculo',
  public.vendedor_categoria('Agencia De Viagens Cvc Tur - Internet', null) = 'site'
  and public.vendedor_categoria('Loja Internet Curitiba', true) = 'site'
  and public.vendedor_categoria('Fulano', null) = 'ex'
  and public.vendedor_categoria('Fulano', false) = 'ex'
  and public.vendedor_categoria('Fulano', true) = 'atual');

-- Aviso: só os nomes sem vínculo que batem com usuário ativo.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('aviso: conta só nomes sem vínculo iguais (sem acento/caixa) a usuário ativo',
  (select array_agg(nome_systur order by nome_systur) from public.systur_nomes_parecem_ativos() where loja = '1730')
  = '{Bia Atual Trinta,CAIO SEM VINCULO}');
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('aviso: vendedor não vê', not exists (select 1 from public.systur_nomes_parecem_ativos()));
reset role;

-- Vincula Bia (admin pelo mapeamento: o gatilho propaga para as vendas).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
update public.systur_vendedor_mapeamento set usuario_id = '39000000-0000-0000-0000-000000000001'
where loja = '1730' and nome_systur = 'Bia Atual Trinta';

set role authenticated;
select public._test_assert('vinculado: some do aviso',
  not exists (select 1 from public.systur_nomes_parecem_ativos() where nome_systur = 'Bia Atual Trinta'));
create temp table _op39a as select * from public.base_clientes_vendedores_opcoes();
create temp table _ex39a as select * from public.base_clientes_buscar('{"loja":"1730","vendedor":"grupo:ex"}', 50, 0);
create temp table _site39 as select * from public.base_clientes_buscar('{"loja":"1730","vendedor":"grupo:site"}', 50, 0);
create temp table _bia39a as select * from public.base_clientes_buscar('{"vendedor":"usuario:39000000-0000-0000-0000-000000000001"}', 50, 0);
create temp table _fulano39 as select * from public.base_clientes_buscar('{"vendedor":"Fulano Que Saiu"}', 50, 0);
reset role;

select public._test_assert('vinculada a usuário ativo: Bia na "Equipe atual", com a loja do usuário',
  exists (select 1 from _op39a where categoria = 'atual' and valor = 'usuario:39000000-0000-0000-0000-000000000001'
            and rotulo = 'Bia Atual Trinta' and loja = '1730')
  and not exists (select 1 from _op39a where categoria = 'ex' and valor = 'Bia Atual Trinta'));
select public._test_assert('Equipe atual filtra as vendas da Bia; vendedor exibido = nome do usuário, categoria atual',
  (select array_agg(nome) = '{Cliente Da Bia}' and bool_and(compra_vendedor_categoria = 'atual')
     and bool_and(compra_vendedor = 'Bia Atual Trinta') from _bia39a));
select public._test_assert('Ex-vendedores (todos): nome sem vínculo, sem o site e sem a Bia',
  (select array_agg(nome order by nome) from _ex39a where nome like 'Cliente D%') = '{Cliente Do Caio,Cliente Do Fulano}'
  and (select bool_and(compra_vendedor_categoria = 'ex') from _ex39a) and not exists (select 1 from _ex39a where nome = 'Cliente Do Site'));
select public._test_assert('Site / Internet é um grupo próprio',
  (select array_agg(nome) = '{Cliente Do Site}' and bool_and(compra_vendedor_categoria = 'site') from _site39 where nome like 'Cliente D%') and (select bool_and(compra_vendedor_categoria = 'site') from _site39)
  and exists (select 1 from _op39a where categoria = 'ex' and valor = 'Fulano Que Saiu')
  and not exists (select 1 from _op39a where valor like 'Agencia De Viagens%'));
select public._test_assert('ex-vendedor específico (nome do Systur) filtra só as vendas dele',
  (select array_agg(nome) = '{Cliente Do Fulano}' and bool_and(compra_vendedor = 'Fulano Que Saiu') from _fulano39));

-- Inativa a Bia: volta para ex-vendedor na hora (nada regravado).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
update public.usuarios set ativo = false where id = '39000000-0000-0000-0000-000000000001';
create temp table _op39b as select * from public.base_clientes_vendedores_opcoes();
create temp table _ex39b as select * from public.base_clientes_buscar('{"loja":"1730","vendedor":"grupo:ex"}', 50, 0);
create temp table _comp39 as select * from public.base_clientes_compras((select id from public.clientes where pessoa_id_systur = '39001'));
reset role;

select public._test_assert('inativada: sai da Equipe atual e vira ex-vendedor',
  not exists (select 1 from _op39b where categoria = 'atual' and valor = 'usuario:39000000-0000-0000-0000-000000000001')
  and exists (select 1 from _op39b where categoria = 'ex' and valor = 'Bia Atual Trinta'));
select public._test_assert('inativada: vendas da Bia em "Ex-vendedores (todos)", com o nome do Systur',
  (select array_agg(nome order by nome) from _ex39b where nome like 'Cliente D%') = '{Cliente Da Bia,Cliente Do Caio,Cliente Do Fulano}'
  and (select compra_vendedor = 'Bia Atual Trinta' and compra_vendedor_categoria = 'ex' from _ex39b where nome = 'Cliente Da Bia'));
select public._test_assert('compras do cliente: categoria ex', (select vendedor_categoria = 'ex' from _comp39));
select public._test_assert('vínculo continua gravado (nada regravado)',
  (select vendedor_usuario_id = '39000000-0000-0000-0000-000000000001' from public.cliente_excursoes where reserva = 'R39-1'));

-- Reativa: volta a ser atual.
set role authenticated;
update public.usuarios set ativo = true where id = '39000000-0000-0000-0000-000000000001';
select public._test_assert('reativada: volta para a Equipe atual',
  exists (select 1 from public.base_clientes_vendedores_opcoes() where valor = 'usuario:39000000-0000-0000-0000-000000000001'));
reset role;

-- Mapeamento marcado inativo: vira ex.
update public.systur_vendedor_mapeamento set ativo = false where loja = '1730' and nome_systur = 'Bia Atual Trinta';
set role authenticated;
select public._test_assert('nome inativo no mapeamento: ex-vendedor',
  (select compra_vendedor_categoria = 'ex' from public.base_clientes_buscar('{"loja":"1730"}', 50, 0) where nome = 'Cliente Da Bia'));
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Cobertura por mês
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
create temp table _cob39 as select * from public.base_cobertura_meses() where loja = '1730';
create temp table _res39 as select * from public.base_cobertura_resumo() where loja = '1730';
reset role;

select public._test_assert('cobertura: meses da janela cobertos, reservas por data_viagem',
  (select array_agg(to_char(mes, 'YYYY-MM') || ':' || coberto || ':' || reservas order by mes) from _cob39
   where mes between '2026-01-01' and '2026-03-01')
  = '{2026-01:true:2,2026-02:true:0,2026-03:true:2}');
select public._test_assert('resumo: faixa de saídas, reservas coletadas e última coleta',
  (select saida_de = (select min(de) from public.base_coleta_janelas where loja = '1730')
     and saida_ate = (select max(ate) from public.base_coleta_janelas where loja = '1730')
     and reservas = (select count(*) from public.cliente_excursoes where loja = '1730' and coletado_em is not null)
     and reservas >= 4 and ultima_coleta is not null from _res39));

-- Buraco na coleta: janela de maio sem abril -> abril vazio.
select public.conferencia_base('00000000-0000-0000-0000-000000000004',
  '{"loja":"1730","janela":{"de":"2026-05-01","ate":"2026-05-31"},"fim_da_janela":true,"reservas":[]}');
set role authenticated;
select public._test_assert('mês sem janela aparece como não coberto',
  (select not coberto from public.base_cobertura_meses() where loja = '1730' and mes = '2026-04-01')
  and (select coberto from public.base_cobertura_meses() where loja = '1730' and mes = '2026-05-01'));
reset role;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert('cobertura só para adm_master',
  not exists (select 1 from public.base_cobertura_meses()) and not exists (select 1 from public.base_cobertura_resumo()));
reset role;
reset request.jwt.claim.sub;

drop function public._test_assert(text, boolean);
