-- ============================================================================
-- Teste de regressão para os bugs de produção corrigidos em sequência nas
-- migrations 20260724000001/000002/000004:
--  1) "column status_code not found in data type net.http_response_result"
--     — o código HTTP mora em response.status_code, não no topo do tipo.
--  2) "query has no destination for result data" — a função pública
--     net.http_collect_response está de fato quebrada nesta versão do
--     pg_net; as funções chamam net._http_collect_response (privada) direto.
--  3) "request matching request_id not found" persistindo mesmo com retry —
--     causa raiz real: net.http_post/http_delete e o loop de coleta rodavam
--     na MESMA transação, e o worker do pg_net (conexão própria) só enxerga
--     requisições já commitadas. Por isso purgar_anexos_retencao_vencida e
--     disparar_backup_dados_sensiveis viraram PROCEDURES com `commit;` logo
--     após enfileirar — ver 20260724000004_commit_antes_de_coletar_resposta_pg_net.sql
--     e scripts/test-pg-net-commit-visibilidade.sh (prova isolada do
--     mecanismo com duas conexões reais, sem pg_net/mock nenhum).
--
-- Por serem procedures agora, chamam-se com CALL (não SELECT), e o retorno
-- vem por parâmetro OUT — por isso os testes de sucesso abaixo usam blocos
-- `do $$ ... $$` com uma variável pra capturar o OUT. No caminho de FALHA,
-- não dá pra envolver o CALL num bloco `exception when others`: a procedure
-- dá `commit;` internamente, e COMMIT é proibido dentro da subtransação
-- implícita que um bloco com EXCEPTION cria ("invalid transaction
-- termination", não o erro de negócio que estamos simulando). Em vez disso,
-- os testes de falha desligam `ON_ERROR_STOP` só para aquele CALL e conferem
-- a variável automática `:ERROR` do psql (true/false, atualizada a cada
-- comando) — sem esse conflito.
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

do $$
declare
  v_status integer;
begin
  call public.disparar_backup_dados_sensiveis(v_status);
  perform public._test_assert(
    'disparar_backup_dados_sensiveis: le response.status_code corretamente no caminho de sucesso',
    v_status = 200
  );
end
$$;

-- ----------------------------------------------------------------------------
-- disparar_backup_dados_sensiveis — falha de requisição (status = ERROR)
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('ERROR'::net.request_status, 'timeout simulado', null::net.http_response)::net.http_response_result
$$;

\set ON_ERROR_STOP 0
call public.disparar_backup_dados_sensiveis(null);
\set ON_ERROR_STOP 1

select public._test_assert(
  'disparar_backup_dados_sensiveis: levanta excecao quando net retorna status ERROR (nao SUCCESS)',
  :'ERROR' = 'true'
);

-- ----------------------------------------------------------------------------
-- disparar_backup_dados_sensiveis — requisição teve sucesso mas HTTP 500
-- ----------------------------------------------------------------------------

create or replace function net._http_collect_response(request_id bigint, async boolean default true)
returns net.http_response_result
language sql
as $$
  select row('SUCCESS'::net.request_status, null, row(500, '{}'::jsonb, 'erro interno simulado')::net.http_response)::net.http_response_result
$$;

\set ON_ERROR_STOP 0
call public.disparar_backup_dados_sensiveis(null);
\set ON_ERROR_STOP 1

select public._test_assert(
  'disparar_backup_dados_sensiveis: levanta excecao quando response.status_code >= 300',
  :'ERROR' = 'true'
);

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
do $$
declare
  v_total integer;
begin
  call public.purgar_anexos_retencao_vencida(v_total);
  perform public._test_assert(
    'purgar_anexos_retencao_vencida: purga os 3 anexos elegiveis no caminho de sucesso',
    v_total = 3
  );
end
$$;

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
do $$
declare
  v_total integer;
begin
  call public.purgar_anexos_retencao_vencida(v_total);
  perform public._test_assert(
    'purgar_anexos_retencao_vencida: nao ha mais nada elegivel apos a purga (retorna 0)',
    v_total = 0
  );
end
$$;

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

\set ON_ERROR_STOP 0
call public.purgar_anexos_retencao_vencida(null);
\set ON_ERROR_STOP 1

select public._test_assert(
  'purgar_anexos_retencao_vencida: levanta excecao quando net retorna status ERROR simulado',
  :'ERROR' = 'true'
);

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
