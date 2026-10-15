-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: disparo automático do Linkly — timeout do pg_net e coleta
--
-- Diagnóstico (produção, cron.job_run_details): toda execução do job
-- sincronizar-linkly falhava com "status ERROR, mensagem: Timeout of 5000 ms
-- reached". O botão "Atualizar agora" (Next.js -> Edge Function direto)
-- funcionava, então a Edge Function está ok: o problema era o timeout
-- PADRÃO de 5 s do net.http_post. A sincronização percorre 4 workspaces em
-- sequência (GET /workspaces + GET /list_links em cada um, mais um upsert
-- por link) e passa de 5 s.
--
-- 1. timeout_milliseconds = 60000 no net.http_post. Se a Edge Function um
--    dia passar de ~50 s, o caminho é dividir a sincronização por workspace
--    (um disparo por workspace), não aumentar mais o timeout.
--
-- 2. Coleta da resposta. O loop anterior (herdado do backup, 20260724000005)
--    só repetia em "request matching request_id not found" e desistia em
--    7,5 s — com um timeout de 60 s, uma resposta ainda em andamento viraria
--    falsa falha. Mantido o padrão que funcionou no backup (procedure sem
--    security definer + COMMIT depois de enfileirar, para o worker do pg_net
--    enxergar a requisição; collect via net._http_collect_response, nunca a
--    pública quebrada), só que agora:
--      - espera enquanto o resultado for PENDING (pg_net ainda processando)
--        OU ERROR "not found" (worker ainda não pegou a requisição);
--      - janela de 75 tentativas x 1 s = 75 s (60 s de timeout da própria
--        requisição + folga para o worker pegar e gravar a resposta);
--      - qualquer outro ERROR (inclusive o timeout de 60 s) sai na hora.
--    Resultado: 2xx => CALL termina normal (job "succeeded"); erro,
--    timeout ou HTTP >= 300 => exceção com mensagem clara (job "failed").
--
-- Mesma assinatura (out p_status_code integer) e mesmos grants (execute só
-- postgres e service_role). URL e agendamento não mudam.
-- ============================================================================

create or replace procedure public.disparar_sincronizacao_linkly(out p_status_code integer)
language plpgsql
as $$
declare
  v_service_role_key text;
  v_supabase_url text := 'https://csquqrcmctcyxfxlmdwk.supabase.co';
  v_timeout_ms integer := 60000;
  v_max_tentativas integer := 75;
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
    url := v_supabase_url || '/functions/v1/sincronizar-linkly',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := v_timeout_ms
  ) into v_request_id;

  -- Commit obrigatório — o worker do pg_net (conexão própria) só enxerga a
  -- requisição enfileirada depois do commit (ver 20260724000004).
  commit;

  loop
    v_resposta := net._http_collect_response(v_request_id);
    exit when not (
      v_resposta.status = 'PENDING'
      or (v_resposta.status = 'ERROR' and v_resposta.message ilike '%not found%')
    );
    v_tentativas := v_tentativas + 1;
    exit when v_tentativas >= v_max_tentativas;
    perform pg_sleep(1);
  end loop;

  if v_resposta.status = 'PENDING' or (v_resposta.status = 'ERROR' and v_resposta.message ilike '%not found%') then
    raise exception 'Falha ao disparar sincronização do Linkly — sem resposta da Edge Function em % s (último status %, mensagem: %).',
      v_max_tentativas, v_resposta.status, v_resposta.message;
  end if;

  if v_resposta.status <> 'SUCCESS' then
    raise exception 'Falha ao disparar sincronização do Linkly — requisição não teve sucesso (status %, mensagem: %).',
      v_resposta.status, v_resposta.message;
  end if;

  p_status_code := (v_resposta.response).status_code;

  if p_status_code is null or p_status_code >= 300 then
    raise exception 'Falha ao disparar sincronização do Linkly (HTTP status %). Corpo: %',
      p_status_code, left(coalesce((v_resposta.response).body, ''), 500);
  end if;
end;
$$;

comment on procedure public.disparar_sincronizacao_linkly(out integer) is
  'Chamada pelo pg_cron (job sincronizar-linkly, de hora em hora) com CALL. timeout de 60 s no pg_net e espera de até 75 s pela resposta (20261006000009). 2xx => sucesso; qualquer outra coisa => exceção com a causa.';

revoke all on procedure public.disparar_sincronizacao_linkly(out integer) from public;
grant execute on procedure public.disparar_sincronizacao_linkly(out integer) to postgres, service_role;

-- ----------------------------------------------------------------------------
-- Agendamento registrado no repositório (idempotente): só roda onde o
-- pg_cron existe (produção). Mesmo nome, mesmo horário e mesmo comando do
-- job já criado à mão — cron.schedule com nome existente atualiza o job em
-- vez de duplicar. Em bancos sem pg_cron (testes locais), é pulado.
-- ----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sincronizar-linkly', '0 * * * *', 'call public.disparar_sincronizacao_linkly(null)');
  end if;
end
$$;
