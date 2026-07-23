-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: janela de retry do pg_net dimensionada com medição real
--
-- A janela anterior (20260724000003/000004: 5 tentativas x 0.4s = ~2s) era
-- uma estimativa, não uma medição — e ficou perto demais do delay real:
-- medindo de verdade em produção (net.http_post + commit + loop de coleta,
-- com resultado gravado numa tabela e lido por SELECT, sem depender de
-- cronômetro humano nem de aba de notices), o pg_net resolveu a requisição
-- na 3ª tentativa, em 2.03 segundos — ou seja, o budget de ~2s estava bem
-- no limite exato do delay observado, explicando por que falhava
-- intermitentemente mesmo já com o commit (20260724000004) em vigor.
--
-- Nova janela: 15 tentativas x 0.5s = até 7.5s de budget total — margem de
-- ~3.7x sobre os 2.03s medidos, sem prender a transação por tempo
-- excessivo (7.5s é aceitável tanto pro cron semanal do backup quanto pro
-- cron mais frequente da purga de anexos).
--
-- Aproveitando esta migration: remove a tabela `public._diagnostico_pg_net_delay`,
-- criada manualmente em produção (fora de qualquer migration) só para essa
-- medição — não deve ficar de lixo de debug no banco.
-- ============================================================================

create or replace procedure public.purgar_anexos_retencao_vencida(out p_total_purgado integer)
language plpgsql
as $$
declare
  v_ids uuid[];
  v_paths text[];
  v_service_role_key text;
  v_supabase_url text := 'https://csquqrcmctcyxfxlmdwk.supabase.co';
  v_request_id bigint;
  v_resposta net.http_response_result;
  v_status_code integer;
  v_tentativas integer := 0;
begin
  select array_agg(a.id), array_agg(a.storage_path)
  into v_ids, v_paths
  from public.anexos a
  join public.casos c on c.id = a.caso_id
  join lateral (
    select sh.entrou_em
    from public.status_historico sh
    where sh.caso_id = c.id and sh.status = 'resolvido'
    order by sh.entrou_em desc
    limit 1
  ) ultimo_resolvido on true
  where a.excluido_em is null
    and a.storage_path is not null
    and c.status_atual = 'resolvido'
    and ultimo_resolvido.entrou_em < now() - interval '90 days';

  if v_ids is null or array_length(v_ids, 1) is null then
    p_total_purgado := 0;
    return;
  end if;

  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_service_role_key is null then
    raise exception 'Secret "service_role_key" não encontrado no Vault — configure antes de agendar esta rotina no pg_cron (ver instruções de ativação).';
  end if;

  -- Exclusão em lote via Storage API (mesmo endpoint que o app usa em
  -- validarEEnviarAnexos/upload — não um DELETE direto em storage.objects).
  select net.http_delete(
    url := v_supabase_url || '/storage/v1/object/anexos',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'apikey', v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('prefixes', v_paths)
  ) into v_request_id;

  -- Commit obrigatório: sem isso, o worker do pg_net (conexão própria)
  -- nunca enxerga esta requisição enfileirada enquanto ficamos tentando
  -- coletar a resposta dela mesma nesta mesma transação — ver
  -- 20260724000004.
  commit;

  -- Janela de retry dimensionada com medição real (ver nota no topo desta
  -- migration): 15 tentativas x 0.5s = até 7.5s, ~3.7x o delay observado
  -- (2.03s, resolvido na 3a tentativa).
  loop
    v_resposta := net._http_collect_response(v_request_id);
    exit when v_resposta.status <> 'ERROR' or v_resposta.message not ilike '%not found%';
    v_tentativas := v_tentativas + 1;
    exit when v_tentativas >= 15;
    perform pg_sleep(0.5);
  end loop;

  if v_resposta.status <> 'SUCCESS' then
    raise exception 'Falha ao excluir anexos no Storage — requisição não teve sucesso (status %, mensagem: %). Nenhuma linha foi marcada como excluída nesta execução.',
      v_resposta.status, v_resposta.message;
  end if;

  v_status_code := (v_resposta.response).status_code;

  if v_status_code is null or v_status_code >= 300 then
    raise exception 'Falha ao excluir anexos no Storage (HTTP status %) — nenhuma linha foi marcada como excluída nesta execução.', v_status_code;
  end if;

  update public.anexos
  set storage_path = null, nome_arquivo = null, excluido_em = now()
  where id = any(v_ids);

  p_total_purgado := array_length(v_ids, 1);
end;
$$;

create or replace procedure public.disparar_backup_dados_sensiveis(out p_status_code integer)
language plpgsql
as $$
declare
  v_service_role_key text;
  v_supabase_url text := 'https://csquqrcmctcyxfxlmdwk.supabase.co';
  v_request_id bigint;
  v_resposta net.http_response_result;
  v_tentativas integer := 0;
begin
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_service_role_key is null then
    raise exception 'Secret "service_role_key" não encontrado no Vault — configure antes de agendar esta rotina no pg_cron.';
  end if;

  select net.http_post(
    url := v_supabase_url || '/functions/v1/backup-dados-sensiveis',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  -- Commit obrigatório — mesma razão de purgar_anexos_retencao_vencida
  -- acima: sem isso, o worker do pg_net nunca vê esta requisição enquanto
  -- ainda estamos tentando coletar a resposta dela mesma.
  commit;

  -- Janela de retry dimensionada com medição real (ver nota no topo desta
  -- migration): 15 tentativas x 0.5s = até 7.5s, ~3.7x o delay observado
  -- (2.03s, resolvido na 3a tentativa).
  loop
    v_resposta := net._http_collect_response(v_request_id);
    exit when v_resposta.status <> 'ERROR' or v_resposta.message not ilike '%not found%';
    v_tentativas := v_tentativas + 1;
    exit when v_tentativas >= 15;
    perform pg_sleep(0.5);
  end loop;

  if v_resposta.status <> 'SUCCESS' then
    raise exception 'Falha ao disparar backup de dados sensíveis — requisição não teve sucesso (status %, mensagem: %).',
      v_resposta.status, v_resposta.message;
  end if;

  p_status_code := (v_resposta.response).status_code;

  if p_status_code is null or p_status_code >= 300 then
    raise exception 'Falha ao disparar backup de dados sensíveis (HTTP status %).', p_status_code;
  end if;
end;
$$;

-- Tabela de diagnóstico criada manualmente em produção (fora de qualquer
-- migration) só para medir o delay real do worker do pg_net — não é
-- schema permanente do sistema, limpa aqui.
drop table if exists public._diagnostico_pg_net_delay;
