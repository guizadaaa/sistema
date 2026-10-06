-- ============================================================================
-- Teste de regressão para imagens coladas na Descrição (migration
-- 20261006000001_anexos_imagem_descricao.sql): anexo com tipo
-- imagem_descricao segue a mesma RLS/Storage/retenção dos anexos.
--
-- Cobre:
--   1. Dono do caso grava a imagem (linha + objeto no bucket anexos).
--   2. Gerente da filial e admin leem a linha e o objeto.
--   3. Colega da mesma filial (não dono) e gerente de outra filial NÃO leem
--      nem a linha nem o objeto.
--   4. Quem não enxerga o caso não consegue gravar imagem nele.
--   5. A purga de retenção não filtra tipo_documento (cobre a imagem).
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- Vendedor A cria um caso e cola uma imagem na descrição.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '19000000-0000-0000-0000-000000000001', 'alteracao_data', 'pedido_cliente', 'print da tela do fornecedor',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31',
  '17100000000191', 'Cliente Imagem', '11144477735'
);

insert into storage.objects (bucket_id, name, owner)
values ('anexos', '19000000-0000-0000-0000-000000000001/img-colada.png', '00000000-0000-0000-0000-000000000001');

insert into public.anexos (id, caso_id, tipo_documento, storage_path, nome_arquivo) values (
  '19100000-0000-0000-0000-000000000001', '19000000-0000-0000-0000-000000000001', 'imagem_descricao',
  '19000000-0000-0000-0000-000000000001/img-colada.png', 'img-colada.png'
);

select public._test_assert(
  'vendedor dono: grava e lê a imagem da descrição',
  (select count(*) = 1 from public.anexos where id = '19100000-0000-0000-0000-000000000001')
  and (select count(*) = 1 from storage.objects where bucket_id = 'anexos' and name = '19000000-0000-0000-0000-000000000001/img-colada.png')
);

reset role;
reset request.jwt.claim.sub;

-- Gerente 1710 e adm: leem.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert(
  'gerente da filial: lê linha e objeto da imagem',
  (select count(*) = 1 from public.anexos where id = '19100000-0000-0000-0000-000000000001')
  and (select count(*) = 1 from storage.objects where name = '19000000-0000-0000-0000-000000000001/img-colada.png')
);
reset role;
reset request.jwt.claim.sub;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public._test_assert(
  'adm: lê linha e objeto da imagem',
  (select count(*) = 1 from public.anexos where id = '19100000-0000-0000-0000-000000000001')
  and (select count(*) = 1 from storage.objects where name = '19000000-0000-0000-0000-000000000001/img-colada.png')
);
reset role;
reset request.jwt.claim.sub;

-- Vendedor B (mesma filial, não dono): não lê nem grava.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;

select public._test_assert(
  'vendedor sem acesso ao caso: NAO lê a linha da imagem',
  (select count(*) = 0 from public.anexos where id = '19100000-0000-0000-0000-000000000001')
);

select public._test_assert(
  'vendedor sem acesso ao caso: NAO lê o objeto da imagem no Storage',
  (select count(*) = 0 from storage.objects where name = '19000000-0000-0000-0000-000000000001/img-colada.png')
);

\set ON_ERROR_STOP 0
insert into public.anexos (caso_id, tipo_documento, storage_path, nome_arquivo) values (
  '19000000-0000-0000-0000-000000000001', 'imagem_descricao', '19000000-0000-0000-0000-000000000001/intrusa.png', 'intrusa.png'
);
\set ON_ERROR_STOP 1
select public._test_assert('vendedor sem acesso ao caso: NAO grava imagem nele', :'ERROR' = 'true');

\set ON_ERROR_STOP 0
insert into storage.objects (bucket_id, name) values ('anexos', '19000000-0000-0000-0000-000000000001/intrusa.png');
\set ON_ERROR_STOP 1
select public._test_assert('vendedor sem acesso ao caso: NAO sobe objeto no path do caso', :'ERROR' = 'true');

reset role;
reset request.jwt.claim.sub;

-- Gerente 1714: não lê.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert(
  'gerente de outra filial: NAO lê linha nem objeto da imagem',
  (select count(*) = 0 from public.anexos where id = '19100000-0000-0000-0000-000000000001')
  and (select count(*) = 0 from storage.objects where name = '19000000-0000-0000-0000-000000000001/img-colada.png')
);
reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'retenção: purgar_anexos_retencao_vencida não filtra tipo_documento (cobre imagem_descricao)',
  pg_get_functiondef('public.purgar_anexos_retencao_vencida()'::regprocedure) not ilike '%tipo_documento%'
);

select 'todos os asserts de imagem_descricao passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
