-- ============================================================================
-- Teste de regressão para a ordem das transições imposta no banco
-- (migration 20261006000003_ordem_transicoes_status.sql).
--
-- Cobre:
--   1. Criação do caso continua gerando o item Inicial.
--   2. Transições válidas passam (inclusive os três ramos a partir de Em
--      andamento interno).
--   3. Pular etapa falha; repetir o mesmo status falha; Inicial manual falha.
--   4. Ouvidoria por não-admin falha (regra antiga mantida).
--   5. Sair de Resolvido: vendedor e gerente falham; admin reabre para Em
--      andamento interno ou Reavaliação, mas não para outro status.
--   6. Mensagens em português, e quem não pode avançar o caso recebe só o
--      erro genérico da RLS (a trigger não revela o status atual).
--   7. "Resolvido exige comentário" continua valendo.
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

-- Insere como o usuário dado e devolve a mensagem de erro (null = sucesso).
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
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- Delegação ativa do gerente 1710 (pode já existir de 04_* / 20_*).
insert into public.delegacoes (adm_id, gerente_id, inicio, fim, ativa)
select '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003', now() - interval '1 day', now() + interval '10 days', true
where not exists (
  select 1 from public.delegacoes
  where gerente_id = '00000000-0000-0000-0000-000000000003' and ativa and now() >= inicio and (fim is null or now() <= fim)
);

-- Três casos do Vendedor A (1710): X (caminho direto), Y (reavaliação), Z (ouvidoria).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf) values
  ('21000000-0000-0000-0000-00000000000a', 'alteracao_data', 'pedido_cliente', 'ordem X',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000211', 'Cliente X', '11144477735'),
  ('21000000-0000-0000-0000-00000000000b', 'alteracao_data', 'pedido_cliente', 'ordem Y',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000212', 'Cliente Y', '11144477735'),
  ('21000000-0000-0000-0000-00000000000c', 'alteracao_data', 'pedido_cliente', 'ordem Z',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000213', 'Cliente Z', '11144477735');
insert into public.casos_complementos (caso_id, texto) values
  ('21000000-0000-0000-0000-00000000000a', 'comentário X'),
  ('21000000-0000-0000-0000-00000000000b', 'comentário Y'),
  ('21000000-0000-0000-0000-00000000000c', 'comentário Z');
reset role;
reset request.jwt.claim.sub;

select public._test_assert(
  'criação do caso continua gerando exatamente um item Inicial',
  (select count(*) = 3 from public.status_historico
   where caso_id in ('21000000-0000-0000-0000-00000000000a', '21000000-0000-0000-0000-00000000000b', '21000000-0000-0000-0000-00000000000c')
     and status = 'inicial')
);

-- Atalhos de usuário.
\set vendedor '''00000000-0000-0000-0000-000000000001'''
\set gerente '''00000000-0000-0000-0000-000000000003'''
\set adm '''00000000-0000-0000-0000-000000000006'''
\set X '''21000000-0000-0000-0000-00000000000a'''
\set Y '''21000000-0000-0000-0000-00000000000b'''
\set Z '''21000000-0000-0000-0000-00000000000c'''

-- ----------------------------------------------------------------------------
-- Pular etapa / Inicial manual / repetir
-- ----------------------------------------------------------------------------

select public._test_assert(
  'pular etapa (Inicial -> Resolvido) falha, com mensagem em português',
  public._test_tentar_status(:vendedor, :X, 'resolvido') = 'Transição de status inválida: de Inicial não é possível ir para Resolvido.'
);

select public._test_assert(
  'pular etapa (Inicial -> Em andamento interno) falha também para admin',
  public._test_tentar_status(:adm, :X, 'em_andamento_interno') like 'Transição de status inválida%'
);

select public._test_assert(
  'Inicial manual é recusado',
  public._test_tentar_status(:adm, :X, 'inicial') is not null
);

select public._test_assert('Inicial -> Recepcionado passa', public._test_tentar_status(:vendedor, :X, 'recepcionado') is null);

select public._test_assert(
  'repetir o mesmo status falha',
  public._test_tentar_status(:vendedor, :X, 'recepcionado') = 'O caso já está em Recepcionado.'
);

select public._test_assert(
  'Recepcionado -> Reavaliação (pular Em andamento interno) falha',
  public._test_tentar_status(:gerente, :X, 'reavaliacao') like 'Transição de status inválida%'
);

select public._test_assert('Recepcionado -> Em andamento interno passa', public._test_tentar_status(:vendedor, :X, 'em_andamento_interno') is null);
select public._test_assert('Em andamento interno -> Resolvido passa', public._test_tentar_status(:vendedor, :X, 'resolvido') is null);

-- Ramo Reavaliação (Y) pelo gerente delegado.
select public._test_assert('Y: Inicial -> Recepcionado (gerente)', public._test_tentar_status(:gerente, :Y, 'recepcionado') is null);
select public._test_assert('Y: -> Em andamento interno (gerente)', public._test_tentar_status(:gerente, :Y, 'em_andamento_interno') is null);
select public._test_assert('Y: Em andamento interno -> Reavaliação passa', public._test_tentar_status(:gerente, :Y, 'reavaliacao') is null);
select public._test_assert(
  'Y: Reavaliação -> Em andamento interno (voltar) falha',
  public._test_tentar_status(:gerente, :Y, 'em_andamento_interno') like 'Transição de status inválida%'
);
select public._test_assert('Y: Reavaliação -> Resolvido passa', public._test_tentar_status(:gerente, :Y, 'resolvido') is null);

-- Ramo Ouvidoria (Z).
select public._test_assert('Z: -> Recepcionado', public._test_tentar_status(:vendedor, :Z, 'recepcionado') is null);
select public._test_assert('Z: -> Em andamento interno', public._test_tentar_status(:vendedor, :Z, 'em_andamento_interno') is null);
select public._test_assert(
  'Ouvidoria por vendedor falha',
  public._test_tentar_status(:vendedor, :Z, 'ouvidoria') = 'Somente o adm pode mover um caso para Ouvidoria.'
);
select public._test_assert(
  'Ouvidoria por gerente delegado falha',
  public._test_tentar_status(:gerente, :Z, 'ouvidoria') = 'Somente o adm pode mover um caso para Ouvidoria.'
);
select public._test_assert('Ouvidoria por admin passa', public._test_tentar_status(:adm, :Z, 'ouvidoria') is null);
select public._test_assert(
  'Ouvidoria -> Reavaliação falha',
  public._test_tentar_status(:adm, :Z, 'reavaliacao') like 'Transição de status inválida%'
);
select public._test_assert('Ouvidoria -> Resolvido passa', public._test_tentar_status(:adm, :Z, 'resolvido') is null);

-- ----------------------------------------------------------------------------
-- Sair de Resolvido
-- ----------------------------------------------------------------------------

select public._test_assert(
  'vendedor NAO reabre caso Resolvido',
  public._test_tentar_status(:vendedor, :X, 'em_andamento_interno') like 'Caso Resolvido não pode mudar de status%'
);
select public._test_assert(
  'gerente delegado NAO reabre caso Resolvido',
  public._test_tentar_status(:gerente, :Y, 'reavaliacao') like 'Caso Resolvido não pode mudar de status%'
);
select public._test_assert(
  'admin NAO reabre Resolvido para Recepcionado (só Em andamento interno ou Reavaliação)',
  public._test_tentar_status(:adm, :X, 'recepcionado') like 'Caso Resolvido não pode mudar de status%'
);
select public._test_assert('admin reabre Resolvido -> Em andamento interno', public._test_tentar_status(:adm, :X, 'em_andamento_interno') is null);
select public._test_assert('admin reabre Resolvido -> Reavaliação', public._test_tentar_status(:adm, :Y, 'reavaliacao') is null);

select public._test_assert(
  'casos reabertos ficam no status escolhido pelo admin',
  (select status_atual = 'em_andamento_interno' from public.casos where id = :X)
  and (select status_atual = 'reavaliacao' from public.casos where id = :Y)
);

-- Depois de reaberto, o fluxo normal volta a valer para o vendedor.
select public._test_assert('X reaberto: vendedor volta a resolver normalmente', public._test_tentar_status(:vendedor, :X, 'resolvido') is null);

-- ----------------------------------------------------------------------------
-- Quem não pode avançar recebe só o erro da RLS; comentário continua exigido.
-- ----------------------------------------------------------------------------

select public._test_assert(
  'vendedor sem acesso ao caso: erro genérico da RLS, sem revelar o status atual',
  public._test_tentar_status('00000000-0000-0000-0000-000000000002', :Z, 'em_andamento_interno') like 'new row violates row-level security policy%'
);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf) values
  ('21000000-0000-0000-0000-00000000000d', 'alteracao_data', 'pedido_cliente', 'ordem sem comentário',
   '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-12-31', '17100000000214', 'Cliente W', '11144477735');
reset role;
reset request.jwt.claim.sub;

select public._test_assert('W: -> Recepcionado', public._test_tentar_status(:vendedor, '21000000-0000-0000-0000-00000000000d', 'recepcionado') is null);
select public._test_assert('W: -> Em andamento interno', public._test_tentar_status(:vendedor, '21000000-0000-0000-0000-00000000000d', 'em_andamento_interno') is null);
select public._test_assert(
  'transição válida para Resolvido sem comentário continua barrada pelo trigger de comentário',
  public._test_tentar_status(:vendedor, '21000000-0000-0000-0000-00000000000d', 'resolvido') like 'Não é possível marcar como Resolvido sem pelo menos um comentário%'
);

select 'todos os asserts de ordem das transições passaram' as status;

set role postgres;
drop function public._test_tentar_status(uuid, uuid, status_caso);
drop function public._test_assert(text, boolean);
reset role;
