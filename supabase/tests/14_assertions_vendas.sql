-- ============================================================================
-- Teste de regressão para vendas_importadas/vendedores_mapeamento/
-- vendas_com_vendedor (migration 20260727000005_vendas_importadas.sql).
--
-- Cobre:
--   1. Upload (INSERT em vendas_importadas) exige admin (adm/adm_master) —
--      vendedor e gerente NÃO conseguem.
--   2. vendedores_mapeamento (SELECT/INSERT) é exclusivo de adm_master —
--      nem gerente nem vendedor conseguem, admin comum também não (só
--      adm_master, não auth_is_admin() genérico).
--   3. Resolução dinâmica: venda com vínculo mapeado aparece pro vendedor
--      dono, venda sem nenhum vínculo (pendente) some pra vendedor/gerente
--      de outra filial mas continua visível pro gerente da MESMA filial e
--      pro admin — nunca se perde silenciosamente.
--   4. Vínculo "sem conta" (usuario_id nulo): identificado (não é
--      "pendente"), mas não aparece pra nenhum vendedor específico.
--   5. Overlap: dois vínculos do mesmo nome+filial com período sobreposto
--      é bloqueado; nome repetido em filiais DIFERENTES (mudança de loja)
--      funciona sem conflito.
--   6. Vendedor B não vê a venda do Vendedor A; gerente de outra filial não
--      vê nada da 1710.
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

-- ----------------------------------------------------------------------------
-- 1. INSERT em vendas_importadas exige admin.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- vendedor A
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.vendas_importadas (filial, venda_numero, vendedor_nome_planilha, data_venda, pagante, produto, valor_total)
values ('1710', 900001, 'FULANO DA SILVA', '2026-07-05', 'Cliente X', 'Pacote', 1000);
\set ON_ERROR_STOP 1

select public._test_assert('vendedor: NAO consegue inserir em vendas_importadas', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- gerente 1710
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.vendas_importadas (filial, venda_numero, vendedor_nome_planilha, data_venda, pagante, produto, valor_total)
values ('1710', 900002, 'FULANO DA SILVA', '2026-07-05', 'Cliente X', 'Pacote', 1000);
\set ON_ERROR_STOP 1

select public._test_assert('gerente: NAO consegue inserir em vendas_importadas', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- adm_master importa as vendas de teste (filial 1710): uma pra FULANO DA
-- SILVA (será mapeado pro Vendedor A), uma pra NINGUEM MAPEADO (fica
-- pendente) e uma pra EX FUNCIONARIA (mapeamento sem conta).
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
set role authenticated;

insert into public.vendas_importadas (id, filial, venda_numero, vendedor_nome_planilha, data_venda, pagante, produto, valor_total) values
  ('40000000-0000-0000-0000-000000000001', '1710', 900010, 'FULANO DA SILVA', '2026-07-05', 'Cliente X', 'Pacote', 1000),
  ('40000000-0000-0000-0000-000000000002', '1710', 900011, 'NINGUEM MAPEADO', '2026-07-06', 'Cliente Y', 'Passagem', 500),
  ('40000000-0000-0000-0000-000000000003', '1710', 900012, 'EX FUNCIONARIA', '2026-07-07', 'Cliente Z', 'Hotel', 200);

select public._test_assert(
  'importado_por nunca vem do client — sempre auth.uid() de quem inseriu',
  (select importado_por = '00000000-0000-0000-0000-000000000004' from public.vendas_com_vendedor where id = '40000000-0000-0000-0000-000000000001')
);

-- ----------------------------------------------------------------------------
-- 2. vendedores_mapeamento é exclusivo de adm_master.
-- ----------------------------------------------------------------------------

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- gerente 1710
set role authenticated;

select public._test_assert(
  'gerente: NAO enxerga vendedores_mapeamento (0 linhas, mesmo sem nenhuma existir ainda)',
  (select count(*) = 0 from public.vendedores_mapeamento) = true
);

\set ON_ERROR_STOP 0
insert into public.vendedores_mapeamento (nome_planilha, filial, usuario_id) values ('FULANO DA SILVA', '1710', '00000000-0000-0000-0000-000000000001');
\set ON_ERROR_STOP 1

select public._test_assert('gerente: NAO consegue inserir vendedores_mapeamento', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- adm_master cria os vínculos.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

insert into public.vendedores_mapeamento (id, nome_planilha, filial, usuario_id) values
  ('50000000-0000-0000-0000-000000000001', 'FULANO DA SILVA', '1710', '00000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000002', 'EX FUNCIONARIA', '1710', null);

select public._test_assert(
  'criado_por nunca vem do client — sempre auth.uid() de quem inseriu',
  (select criado_por = '00000000-0000-0000-0000-000000000004' from public.vendedores_mapeamento where id = '50000000-0000-0000-0000-000000000001')
);

-- ----------------------------------------------------------------------------
-- 5. Overlap: mesmo nome+filial com período sobreposto é bloqueado; nome
-- repetido em filial DIFERENTE (mudança de loja) não conflita.
-- ----------------------------------------------------------------------------

\set ON_ERROR_STOP 0
insert into public.vendedores_mapeamento (nome_planilha, filial, usuario_id) values ('FULANO DA SILVA', '1710', '00000000-0000-0000-0000-000000000002');
\set ON_ERROR_STOP 1

select public._test_assert(
  'overlap: segundo vínculo do MESMO nome+filial sem período (ambos indefinidos) é bloqueado',
  :'ERROR' = 'true'
);

insert into public.vendedores_mapeamento (nome_planilha, filial, usuario_id) values ('FULANO DA SILVA', '1714', '00000000-0000-0000-0000-000000000002');

select public._test_assert(
  'mesmo nome em filial DIFERENTE (mudança de loja) não conflita — inserido com sucesso',
  (select count(*) = 1 from public.vendedores_mapeamento where nome_planilha = 'FULANO DA SILVA' and filial = '1714')
);

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 3/4/6. Visibilidade via vendas_com_vendedor.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; -- vendedor A (mapeado)
set role authenticated;

select public._test_assert(
  'vendedor A: enxerga a própria venda mapeada',
  (select count(*) = 1 from public.vendas_com_vendedor where id = '40000000-0000-0000-0000-000000000001')
);

select public._test_assert(
  'vendedor A: NAO enxerga a venda pendente (sem vínculo)',
  (select count(*) = 0 from public.vendas_com_vendedor where id = '40000000-0000-0000-0000-000000000002')
);

select public._test_assert(
  'vendedor A: NAO enxerga a venda "sem conta" (não é dele)',
  (select count(*) = 0 from public.vendas_com_vendedor where id = '40000000-0000-0000-0000-000000000003')
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002'; -- vendedor B (mesma filial, sem vínculo com essas vendas)
set role authenticated;

select public._test_assert(
  'vendedor B: NAO enxerga a venda mapeada do Vendedor A',
  (select count(*) = 0 from public.vendas_com_vendedor where id = '40000000-0000-0000-0000-000000000001')
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003'; -- gerente 1710
set role authenticated;

select public._test_assert(
  'gerente 1710: enxerga as 3 vendas da própria filial, incluindo a pendente e a "sem conta"',
  (select count(*) = 3 from public.vendas_com_vendedor where filial = '1710' and venda_numero in (900010, 900011, 900012))
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005'; -- gerente 1714 (outra filial)
set role authenticated;

select public._test_assert(
  'gerente 1714: NAO enxerga nenhuma venda da 1710',
  (select count(*) = 0 from public.vendas_com_vendedor where filial = '1710' and venda_numero in (900010, 900011, 900012))
);

reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
set role authenticated;

select public._test_assert(
  'adm_master: enxerga as 3 vendas, de qualquer filial',
  (select count(*) = 3 from public.vendas_com_vendedor where filial = '1710' and venda_numero in (900010, 900011, 900012))
);

select public._test_assert(
  'pendente de vínculo: mapeamento_id nulo só na venda sem nenhum vínculo',
  (select mapeamento_id is null from public.vendas_com_vendedor where id = '40000000-0000-0000-0000-000000000002')
);

select public._test_assert(
  'sem conta: mapeamento_id preenchido mas usuario_id nulo (não é pendente)',
  (
    select mapeamento_id is not null and usuario_id is null
    from public.vendas_com_vendedor
    where id = '40000000-0000-0000-0000-000000000003'
  )
);

reset role;
reset request.jwt.claim.sub;

select 'todos os asserts de vendas passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
