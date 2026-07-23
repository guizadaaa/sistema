-- ============================================================================
-- Teste de regressão para os dois bugs de produção encontrados em sequência:
--  1) "column status_code not found in data type net.http_response_result"
--     (20260724000001) — o código HTTP mora em response.status_code, não no
--     topo do tipo.
--  2) "query has no destination for result data" (20260724000002) — a
--     função pública net.http_collect_response está de fato quebrada nesta
--     versão do pg_net (um `select` sem destino dentro dela mesma); as
--     funções agora chamam net._http_collect_response (privada) direto, e é
--     essa que os testes abaixo substituem para simular sucesso/falha.
--
-- Cobre os dois pontos que o mock antigo (fictício) nunca teria pego: (1) o
-- caminho de sucesso de verdade lendo response.status_code corretamente, e
-- (2) os dois caminhos de falha (status da requisição = ERROR; e HTTP >= 300
-- com status = SUCCESS) — confirmando que nada é purgado/considerado feito
-- quando a chamada falha.
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

insert into vault.decrypted_secrets (name, decrypted_secret) values ('service_role_key', 'chave-de-teste-service-role')
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------
-- disparar_backup_dados_sensiveis — caminho de sucesso (mock padrão: SUCCESS/200)
-- ----------------------------------------------------------------------------

select public._test_assert(
  'disparar_backup_dados_sensiveis: le response.status_code corretamente no caminho de sucesso',
  public.disparar_backup_dados_sensiveis() = 200
);

-- ----------------------------------------------------------------------------
-- disparar_backup_dados_sensiveis — falha de requisição (status = ERROR)
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('ERROR'::net.request_status, 'timeout simulado', null::net.http_response)::net.http_response_result
$$;

do $$
begin
  perform public.disparar_backup_dados_sensiveis();
  raise exception 'FALHOU: disparar_backup_dados_sensiveis nao levantou excecao com status ERROR simulado';
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice 'ok: disparar_backup_dados_sensiveis levanta excecao quando net retorna status ERROR (nao SUCCESS)';
end
$$;

-- ----------------------------------------------------------------------------
-- disparar_backup_dados_sensiveis — requisição teve sucesso mas HTTP 500
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('SUCCESS'::net.request_status, null, row(500, '{}'::jsonb, 'erro interno simulado')::net.http_response)::net.http_response_result
$$;

do $$
begin
  perform public.disparar_backup_dados_sensiveis();
  raise exception 'FALHOU: disparar_backup_dados_sensiveis nao levantou excecao com HTTP 500 simulado';
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice 'ok: disparar_backup_dados_sensiveis levanta excecao quando response.status_code >= 300';
end
$$;

-- Restaura o mock de sucesso padrão antes de seguir.
create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('SUCCESS'::net.request_status, null, row(200, '{}'::jsonb, '')::net.http_response)::net.http_response_result
$$;

-- ----------------------------------------------------------------------------
-- purgar_anexos_retencao_vencida — mesmo bug, nunca exercitado em produção
-- (só roda o net.http_delete quando existe pelo menos 1 anexo elegível).
-- Caso resolvido há mais de 90 dias, com 3 anexos — um por cenário.
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;

insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '10000000-0000-0000-0000-000000000003', 'alteracao_data', 'pedido_cliente', 'teste purga pg_net',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '2026-01-01',
  '17100000000003', 'Cliente Purga', '11144477735'
);

insert into public.anexos (caso_id, tipo_documento, storage_path, nome_arquivo) values
  ('10000000-0000-0000-0000-000000000003', 'outro', '10000000-0000-0000-0000-000000000003/sucesso.pdf', 'sucesso.pdf'),
  ('10000000-0000-0000-0000-000000000003', 'outro', '10000000-0000-0000-0000-000000000003/erro-status.pdf', 'erro-status.pdf'),
  ('10000000-0000-0000-0000-000000000003', 'outro', '10000000-0000-0000-0000-000000000003/http500.pdf', 'http500.pdf');

reset role;
reset request.jwt.claim.sub;

-- status_historico com entrou_em retroativo (>90 dias) — como adm_master,
-- não como postgres puro: a RLS de status_historico_insert exige admin (ou
-- gerente delegado), e o trigger sync_caso_status faz um UPDATE em casos
-- logo em seguida que passa por enforce_casos_update_permissions — esse
-- trigger sempre roda (SECURITY DEFINER não muda o que auth.uid() resolve,
-- só o contexto de privilégio/RLS), então precisa de um auth.uid() que
-- bata com auth_is_admin() de verdade, não só o bypass de role postgres.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
insert into public.status_historico (caso_id, status, alterado_por, entrou_em)
values ('10000000-0000-0000-0000-000000000003', 'resolvido', '00000000-0000-0000-0000-000000000004', now() - interval '100 days');
reset role;
reset request.jwt.claim.sub;

set role postgres;

-- Caminho de sucesso: purga tudo que está elegível (os 3 anexos de uma vez,
-- já que a função processa em lote) — confirma que os 3 saem.
select public._test_assert(
  'purgar_anexos_retencao_vencida: purga os 3 anexos elegiveis no caminho de sucesso',
  public.purgar_anexos_retencao_vencida() = 3
);

select public._test_assert(
  'purgar_anexos_retencao_vencida: excluido_em preenchido e storage_path nulo apos a purga',
  (
    select count(*) = 3 from public.anexos
    where caso_id = '10000000-0000-0000-0000-000000000003'
      and storage_path is null and excluido_em is not null
  )
);

-- Nada mais elegível agora — confirma que rodar de novo não erra nem
-- "reprocessa" nada (a query de elegibilidade já não acha as 3 anteriores).
select public._test_assert(
  'purgar_anexos_retencao_vencida: nao ha mais nada elegivel apos a purga (retorna 0)',
  public.purgar_anexos_retencao_vencida() = 0
);

-- Novo anexo elegível, agora simulando falha (status ERROR) — nada deve ser
-- marcado como excluído. Como authenticated (não postgres puro): o trigger
-- anexos_set_enviado_por exige auth.uid() não nulo (enviado_por is not null).
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.anexos (caso_id, tipo_documento, storage_path, nome_arquivo)
values ('10000000-0000-0000-0000-000000000003', 'outro', '10000000-0000-0000-0000-000000000003/falha.pdf', 'falha.pdf');
reset role;
reset request.jwt.claim.sub;

set role postgres;

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('ERROR'::net.request_status, 'timeout simulado', null::net.http_response)::net.http_response_result
$$;

do $$
begin
  perform public.purgar_anexos_retencao_vencida();
  raise exception 'FALHOU: purgar_anexos_retencao_vencida nao levantou excecao com status ERROR simulado';
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  raise notice 'ok: purgar_anexos_retencao_vencida levanta excecao quando net retorna status ERROR';
end
$$;

select public._test_assert(
  'purgar_anexos_retencao_vencida: anexo NAO foi marcado como excluido apos falha simulada',
  (
    select storage_path is not null and excluido_em is null from public.anexos
    where caso_id = '10000000-0000-0000-0000-000000000003' and nome_arquivo = 'falha.pdf'
  )
);

-- Restaura o mock de sucesso padrão para qualquer teste que rode depois.
create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('SUCCESS'::net.request_status, null, row(200, '{}'::jsonb, '')::net.http_response)::net.http_response_result
$$;

reset role;

select 'todos os asserts de pg_net response passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
