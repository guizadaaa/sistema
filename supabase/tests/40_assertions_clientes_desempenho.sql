-- ============================================================================
-- Migration 20261116000004: desempenho da base de clientes. A regra de quem
-- vê o quê não pode mudar: para cada perfil, o que as policies novas
-- (loja = any ((select _lojas_visiveis()))) devolvem é exatamente o que a
-- regra anterior (pode_ver_loja(loja), por linha) devolveria.
-- ============================================================================

set role postgres;

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

-- Usuário inativo da 1710 (criado e inativado em 18_assertions).
select public._test_assert('pré-condição: inativo existe', exists (select 1 from public.usuarios where id = '00000000-0000-0000-0000-000000000018' and not ativo));

create temp table _esperado (usuario uuid, tabela text, chave text);
create temp table _visto (usuario uuid, tabela text, chave text);
grant insert on _visto to authenticated;

do $$
declare
  u uuid;
begin
  foreach u in array array[
    '00000000-0000-0000-0000-000000000001', -- vendedor 1710
    '00000000-0000-0000-0000-000000000003', -- gerente 1710
    '00000000-0000-0000-0000-000000000005', -- gerente 1714
    '00000000-0000-0000-0000-000000000006', -- adm
    '00000000-0000-0000-0000-000000000004', -- adm_master
    '00000000-0000-0000-0000-000000000018'  -- inativo
  ]::uuid[] loop
    -- Regra anterior, linha a linha (como postgres, sem RLS).
    perform set_config('request.jwt.claim.sub', u::text, true);
    insert into _esperado
      select u, 'cliente_compras', id::text from public.cliente_compras where public.pode_ver_loja(loja)
      union all select u, 'cliente_excursoes', reserva from public.cliente_excursoes where public.pode_ver_loja(loja)
      union all select u, 'recibos', recibo from public.recibos where public.pode_ver_loja(loja)
      union all select u, 'cliente_voo_eventos', v.id::text from public.cliente_voo_eventos v
        where exists (select 1 from public.cliente_excursoes e where e.reserva = v.reserva and public.pode_ver_loja(e.loja))
      union all select u, 'clientes', c.id::text from public.clientes c
        where exists (select 1 from public.cliente_compras x where x.cliente_id = c.id and public.pode_ver_loja(x.loja))
           or exists (select 1 from public.cliente_excursoes x where x.cliente_id = c.id and public.pode_ver_loja(x.loja))
           or exists (select 1 from public.recibos x where x.cliente_id = c.id and public.pode_ver_loja(x.loja))
      union all select u, 'storage', o.name from storage.objects o
        where o.bucket_id = 'recibos' and exists (select 1 from public.recibos r where r.pdf_path = o.name and public.pode_ver_loja(r.loja));
  end loop;
end;
$$;

-- Policies novas, como authenticated.
\set u1 '00000000-0000-0000-0000-000000000001'
\set u3 '00000000-0000-0000-0000-000000000003'
\set u5 '00000000-0000-0000-0000-000000000005'
\set u6 '00000000-0000-0000-0000-000000000006'
\set u4 '00000000-0000-0000-0000-000000000004'
\set u18 '00000000-0000-0000-0000-000000000018'

\set QUIET on
select :'u1' as u \gset
\ir 40_visto.inc
select :'u3' as u \gset
\ir 40_visto.inc
select :'u5' as u \gset
\ir 40_visto.inc
select :'u6' as u \gset
\ir 40_visto.inc
select :'u4' as u \gset
\ir 40_visto.inc
select :'u18' as u \gset
\ir 40_visto.inc
\set QUIET off

select public._test_assert('mesmas linhas visíveis por perfil e tabela (vendedor, gerentes, adm, adm_master, inativo)',
  not exists (select * from _esperado except select * from _visto)
  and not exists (select * from _visto except select * from _esperado));
select public._test_assert('teste cobre dados (não é vazio)', (select count(*) > 20 from _esperado));
select public._test_assert('inativo não vê nada', not exists (select 1 from _visto where usuario = '00000000-0000-0000-0000-000000000018'));
select public._test_assert('vendedor 1710 não vê a 1714',
  not exists (select 1 from _visto v join public.cliente_compras c on c.id::text = v.chave
              where v.usuario = '00000000-0000-0000-0000-000000000001' and v.tabela = 'cliente_compras' and c.loja <> '1710'));

-- Colunas geradas.
select public._test_assert('destino_norm e vendedor_site calculados na gravação',
  (select bool_and(destino_norm is not distinct from public.normalizar_nome(destino_cidade)) from public.cliente_compras)
  and (select bool_and(vendedor_site = public.vendedor_eh_site(vendedor_nome_systur)) from public.cliente_excursoes));

drop function public._test_assert(text, boolean);
