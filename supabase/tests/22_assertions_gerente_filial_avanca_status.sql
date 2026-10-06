-- ============================================================================
-- Teste de regressão para "gerente da filial avança status sem delegação"
-- (migration 20261006000004_gerente_filial_avanca_status.sql).
--
-- Cobre:
--   1. Gerente SEM delegação avança caso da própria filial (de qualquer
--      vendedor da filial), registrado como autor e sem "via delegação".
--   2. Gerente sem delegação NÃO avança caso de outra filial.
--   3. Continua sem Ouvidoria, sujeito à ordem das transições e sem
--      registrar desfecho/implicação (isso ainda exige delegação).
--   4. Vendedor e admin sem regressão.
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

create or replace function public._test_tentar_status(p_usuario uuid, p_caso uuid, p_status status_caso)
returns text
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_usuario::text, true);
  execute 'set local role authenticated';
  insert into public.status_historico (caso_id, status) values (p_caso, p_status);
  execute 'reset role';
  return null;
exception when others then
  execute 'reset role';
  return sqlerrm;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000017', 'vendedorC1714@teste.com', '{"nome_completo":"Vendedor C 1714","perfil":"vendedor","filial":"1714"}'),
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

select public._test_assert(
  'pré-condição: gerente 1714 não tem delegação ativa',
  not exists (
    select 1 from public.delegacoes
    where gerente_id = '00000000-0000-0000-0000-000000000005' and ativa and now() >= inicio and (fim is null or now() <= fim)
  )
);

-- Caso P (Vendedor C, 1714) e caso Q (Vendedor B, 1710).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000017';
set role authenticated;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('22000000-0000-0000-0000-00000000000a', 'alteracao_data', 'pedido_cliente', 'caso 1714 p/ gerente',
  '00000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000017', '2026-12-31', '17140000000221', 'Cliente P', '11144477735');
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf)
values ('22000000-0000-0000-0000-00000000000b', 'alteracao_data', 'pedido_cliente', 'caso 1710 fora do gerente 1714',
  '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '2026-12-31', '17100000000222', 'Cliente Q', '11144477735');
reset role;
reset request.jwt.claim.sub;

\set gerente1714 '''00000000-0000-0000-0000-000000000005'''
\set P '''22000000-0000-0000-0000-00000000000a'''
\set Q '''22000000-0000-0000-0000-00000000000b'''

-- ----------------------------------------------------------------------------
-- 1. Gerente sem delegação avança caso da própria filial.
-- ----------------------------------------------------------------------------

select public._test_assert('gerente sem delegação: Inicial -> Recepcionado na própria filial', public._test_tentar_status(:gerente1714, :P, 'recepcionado') is null);
select public._test_assert('gerente sem delegação: -> Em andamento interno', public._test_tentar_status(:gerente1714, :P, 'em_andamento_interno') is null);

select public._test_assert(
  'histórico: gerente como autor, sem "via delegação"',
  (select bool_and(alterado_por = '00000000-0000-0000-0000-000000000005' and not via_delegacao) and count(*) = 2
   from public.status_historico where caso_id = :P and status in ('recepcionado', 'em_andamento_interno'))
);

select public._test_assert(
  'auditoria: mudança de status_atual com o gerente como autor',
  exists (select 1 from public.auditoria
          where tabela = 'casos' and registro_id = :P and acao = 'update'
            and realizado_por = '00000000-0000-0000-0000-000000000005'
            and dados_novos ->> 'status_atual' = 'em_andamento_interno')
);

-- ----------------------------------------------------------------------------
-- 2 e 3. Negativos.
-- ----------------------------------------------------------------------------

select public._test_assert(
  'gerente sem delegação: NAO avança caso de outra filial',
  public._test_tentar_status(:gerente1714, :Q, 'recepcionado') like 'new row violates row-level security policy%'
);

select public._test_assert(
  'gerente sem delegação: NAO move para Ouvidoria',
  public._test_tentar_status(:gerente1714, :P, 'ouvidoria') = 'Somente o adm pode mover um caso para Ouvidoria.'
);

select public._test_assert(
  'gerente sem delegação: sujeito à ordem (Em andamento interno -> Recepcionado falha)',
  public._test_tentar_status(:gerente1714, :P, 'recepcionado') like 'Transição de status inválida%'
);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;

\set ON_ERROR_STOP 0
insert into public.desfechos (caso_id, tipo, valor) values (:P, 'carta_credito', 100);
\set ON_ERROR_STOP 1
select public._test_assert('gerente sem delegação: NAO registra desfecho (ainda exige delegação)', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
update public.casos set status_atual = 'resolvido' where id = :P;
\set ON_ERROR_STOP 1
reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'gerente sem delegação: UPDATE direto em casos.status_atual não muda nada',
  (select status_atual = 'em_andamento_interno' from public.casos where id = :P)
);

-- ----------------------------------------------------------------------------
-- 4. Sem regressão.
-- ----------------------------------------------------------------------------

select public._test_assert(
  'vendedor de outro caso da filial continua NAO avançando caso do colega',
  public._test_tentar_status('00000000-0000-0000-0000-000000000002', :P, 'reavaliacao') like 'new row violates row-level security policy%'
);
select public._test_assert('vendedor dono continua avançando o próprio caso', public._test_tentar_status('00000000-0000-0000-0000-000000000017', :P, 'reavaliacao') is null);
select public._test_assert('admin continua avançando caso de qualquer filial', public._test_tentar_status('00000000-0000-0000-0000-000000000006', :Q, 'recepcionado') is null);

select 'todos os asserts de gerente da filial avança status passaram' as status;

set role postgres;
drop function public._test_tentar_status(uuid, uuid, status_caso);
drop function public._test_assert(text, boolean);
reset role;
