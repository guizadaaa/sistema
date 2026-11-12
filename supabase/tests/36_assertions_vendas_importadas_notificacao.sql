-- ============================================================================
-- Migrations 20261112000001/2: aviso "Vendas da loja atualizadas".
-- ============================================================================

set role postgres;

\ir ../migrations/20261112000002_vendas_importadas_notificacao.sql

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

-- Adm (quem importa; adm não tem filial) e o vendedor inativo da 1710 criado
-- e desativado em 18_assertions_vendedores_filtro_casos.sql.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

select public._test_assert('pré-condição: vendedor 1710 inativo existe',
  (select not ativo and filial = '1710' from public.usuarios where id = '00000000-0000-0000-0000-000000000018'));

select public._test_assert('tipo vendas_importadas existe no enum',
  'vendas_importadas' = any (enum_range(null::tipo_notificacao)::text[]));

-- Quantos ativos da 1710 (fora o adm que importa) devem receber.
select count(*) as esperados from public.usuarios
 where filial = '1710' and ativo and id <> '00000000-0000-0000-0000-000000000006' \gset

-- 1ª importação, pelo adm.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public.notificar_vendas_importadas('1710', '2026-11-05') as avisados1 \gset
reset role;
set role postgres;

select public._test_assert('devolve quantos foram avisados', :avisados1 = :esperados and :esperados >= 3);

select public._test_assert('vendedor A, vendedor B e gerente da 1710 recebem',
  (select count(*) from public.notificacoes
    where tipo = 'vendas_importadas' and lida_em is null
      and destinatario_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
                              '00000000-0000-0000-0000-000000000003')) = 3);

select public._test_assert('texto: Vendas da loja 1710 atualizadas até 05/11.',
  (select mensagem from public.notificacoes
    where tipo = 'vendas_importadas' and destinatario_id = '00000000-0000-0000-0000-000000000001')
  = 'Vendas da loja 1710 atualizadas até 05/11.');

select public._test_assert('gerente da 1714 não recebe',
  not exists (select 1 from public.notificacoes where tipo = 'vendas_importadas'
               and destinatario_id = '00000000-0000-0000-0000-000000000005'));

select public._test_assert('usuário inativo não recebe',
  not exists (select 1 from public.notificacoes where tipo = 'vendas_importadas'
               and destinatario_id = '00000000-0000-0000-0000-000000000018'));

select public._test_assert('adm que importou não recebe',
  not exists (select 1 from public.notificacoes where tipo = 'vendas_importadas'
               and destinatario_id = '00000000-0000-0000-0000-000000000006'));

select public._test_assert('importação registrada com loja, até e quem importou',
  (select count(*) from public.vendas_importacoes
    where filial = '1710' and ate = '2026-11-05' and importado_por = '00000000-0000-0000-0000-000000000006') = 1);

-- Gerente confirma ("Li e estou ciente") antes da 2ª importação.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
update public.notificacoes set lida_em = now()
 where tipo = 'vendas_importadas' and destinatario_id = '00000000-0000-0000-0000-000000000003';
reset role;
set role postgres;

-- 2ª importação em seguida, pelo adm_master (transação própria).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public.notificar_vendas_importadas('1710', '2026-11-08') as avisados2 \gset
reset role;
set role postgres;

select public._test_assert('2ª importação avisa os mesmos usuários',
  :avisados2 = :esperados);

select public._test_assert('duas importações seguidas: 1 só não lida por usuário, com a data mais recente',
  (select count(*) from public.notificacoes
    where tipo = 'vendas_importadas' and lida_em is null
      and destinatario_id = '00000000-0000-0000-0000-000000000001') = 1
  and (select mensagem from public.notificacoes
        where tipo = 'vendas_importadas' and lida_em is null
          and destinatario_id = '00000000-0000-0000-0000-000000000001')
      = 'Vendas da loja 1710 atualizadas até 08/11.');

-- Lista de confirmações: adm_master vê tudo.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
create temp table _lista36 as select * from public.listar_vendas_importacoes(5);
reset role;
set role postgres;

select public._test_assert('lista traz as 2 importações da 1710, mais recente primeiro',
  (select array_agg(ate order by importado_em desc) from _lista36 where filial = '1710')
  = array['2026-11-08'::date, '2026-11-05'::date]);

select public._test_assert('1ª importação: gerente confirmado, vendedor A substituído',
  (select d->>'status' from _lista36 l, jsonb_array_elements(l.destinatarios) d
    where l.ate = '2026-11-05' and d->>'nome' = 'Gerente 1710') = 'confirmado'
  and (select d->>'confirmado_em' from _lista36 l, jsonb_array_elements(l.destinatarios) d
        where l.ate = '2026-11-05' and d->>'nome' = 'Gerente 1710') is not null
  and (select d->>'status' from _lista36 l, jsonb_array_elements(l.destinatarios) d
        where l.ate = '2026-11-05' and d->>'nome' = 'Vendedor A') = 'substituido');

select public._test_assert('2ª importação: todos pendentes, importado por Adm Master',
  (select bool_and(d->>'status' = 'pendente') from _lista36 l, jsonb_array_elements(l.destinatarios) d
    where l.ate = '2026-11-08')
  and (select importado_por_nome from _lista36 where ate = '2026-11-08') = 'Adm Master');

-- Gerente da 1714 não vê importações da 1710; gerente 1710 vê; vendedor não vê nada.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select count(*) as ger1714 from public.listar_vendas_importacoes(5) \gset
select count(*) as ger1714_tab from public.vendas_importacoes \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select count(*) as ger1710 from public.listar_vendas_importacoes(5) \gset
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select count(*) as vend from public.listar_vendas_importacoes(5) \gset
reset role;
set role postgres;

select public._test_assert('visibilidade: gerente só da própria loja, vendedor nenhuma',
  :ger1714 = 0 and :ger1714_tab = 0 and :ger1710 = 2 and :vend = 0);

-- Chamada por não-adm: erro.
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  begin
    perform public.notificar_vendas_importadas('1710', '2026-11-09');
    raise exception 'FALHOU: gerente conseguiu notificar importação';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok: não-adm recebe erro (%)', sqlerrm;
  end;
end;
$$;

-- Cliente não insere em vendas_importacoes nem troca importacao_id.
do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  set local role authenticated;
  begin
    insert into public.vendas_importacoes (filial, ate, importado_por)
    values ('1710', '2026-11-09', '00000000-0000-0000-0000-000000000004');
    raise exception 'FALHOU: insert direto em vendas_importacoes';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok: insert direto barrado (%)', sqlerrm;
  end;
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  set local role authenticated;
  begin
    update public.notificacoes set importacao_id = null
     where tipo = 'vendas_importadas' and destinatario_id = '00000000-0000-0000-0000-000000000001';
    raise exception 'FALHOU: importacao_id alterado';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok: importacao_id imutável (%)', sqlerrm;
  end;
end;
$$;

reset request.jwt.claim.sub;
