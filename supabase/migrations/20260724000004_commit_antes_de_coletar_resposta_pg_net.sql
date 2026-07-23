-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: commit explícito antes de coletar a resposta do pg_net
--
-- Causa raiz REAL do "request matching request_id not found" persistindo
-- mesmo com o retry (20260724000003) esgotando as 5 tentativas — confirmada
-- por diagnóstico direto em produção, não suposição:
--
--   1. Worker do pg_net saudável (extensão 0.20.4 ativa, `net.worker_restart()`
--      OK, tabelas `net._http_response`/`net.http_request_queue` existem).
--   2. `net.http_get('https://httpbin.org/get')` chamado manualmente: sucesso
--      real. Rede/worker do pg_net funcionam em geral.
--   3. `net.http_post(...)` chamado MANUALMENTE (como instrução top-level
--      separada, não dentro de uma função) com a MESMA URL, MESMOS headers
--      (Authorization: Bearer <service_role_key> do Vault) e MESMO body
--      '{}' que `disparar_backup_dados_sensiveis()` usa: sucesso total — a
--      Edge Function respondeu HTTP 200 de verdade, com o JSON de
--      confirmação do backup.
--   4. Ou seja: URL, headers e body estão corretos — a diferença não é o
--      que é enviado, é COMO é enviado.
--
-- A diferença real: no teste manual, `net.http_post(...)` e
-- `net._http_collect_response(...)` foram duas instruções SQL separadas,
-- cada uma commitada por conta própria (autocommit) antes da próxima
-- rodar. Dentro de `disparar_backup_dados_sensiveis()` (uma FUNCTION
-- plpgsql), tudo — o enfileiramento E o loop de coleta — roda em UMA ÚNICA
-- transação, que só commitaria quando a função inteira retornasse.
--
-- pg_net enfileira a requisição numa tabela (`net.http_request_queue`) que
-- um worker em BACKGROUND, rodando numa conexão própria, lê periodicamente.
-- Esse worker só enxerga linhas já COMMITADAS — é assim que MVCC/isolamento
-- de transação funciona entre conexões diferentes. Enquanto a transação da
-- nossa função continua aberta (porque ela está ocupada tentando coletar a
-- resposta do MESMO request que acabou de enfileirar, sem nunca ter dado
-- commit), o worker literalmente não consegue ver a linha enfileirada — não
-- é uma questão de "esperar mais um pouco": a linha fica invisível pra ele
-- até a transação commitar, e a transação só commitaria depois que a função
-- retornasse com sucesso, mas ela nunca retorna com sucesso porque a
-- resposta nunca chega, porque o worker nunca viu o pedido. Um impasse de
-- visibilidade, não uma questão de tempo — por isso nenhum número de
-- tentativas ou tempo de espera (20260724000003) resolveria isso, e por
-- isso a Edge Function tinha zero invocações registradas mesmo depois do
-- retry esgotar: a requisição de fato nunca saiu (e some de vez quando a
-- função levanta a exceção final e a transação inteira sofre ROLLBACK,
-- desfazendo até o enfileiramento).
--
-- Fix: dar COMMIT logo após enfileirar (`net.http_post`/`net.http_delete`),
-- ANTES do loop de coleta — assim o worker consegue ver e processar a
-- requisição enquanto ainda esperamos a resposta. PL/pgSQL só permite
-- controle de transação (COMMIT/ROLLBACK) dentro de PROCEDURES (ou blocos
-- DO chamados no nível mais alto), não dentro de FUNCTIONS — por isso as
-- duas funções abaixo viram PROCEDURES.
--
-- Descoberta ao testar localmente (não estava óbvio por inspeção): COMMIT
-- dentro de uma procedure só é permitido se ela NÃO tiver `security
-- definer` nem nenhuma cláusula `set <parametro> = ...` — qualquer uma das
-- duas faz o Postgres embrulhar a execução numa subtransação implícita
-- (pra poder restaurar role/GUC no fim), e "COMMIT dentro de subtransação"
-- é sempre erro ("invalid transaction termination"), pelo mesmo motivo que
-- um bloco com EXCEPTION também bloquearia. Confirmado isolando o caso:
-- `security definer` sozinho quebra, `set search_path = ...` sozinho
-- também quebra, sem nenhum dos dois funciona.
--
-- Isso é seguro de remover aqui porque os dois únicos contextos reais de
-- chamada — pg_cron (agendado via `cron.schedule`, que roda como quem
-- chamou, normalmente `postgres`) e o SQL Editor do dashboard (também
-- `postgres`) — já têm privilégio direto pra tudo que o corpo precisa
-- (ler `vault.decrypted_secrets`, bypassar RLS de `anexos`/`casos`/
-- `status_historico`, chamar `net.*`), sem precisar de elevação via
-- SECURITY DEFINER. Todas as referências no corpo já são qualificadas por
-- schema (`net.*`, `vault.*`, `public.*`), então tirar o `set search_path`
-- não muda resolução de nome nenhuma.
--
-- Como as duas deixam de ter SECURITY DEFINER, o EXECUTE implícito pra
-- PUBLIC (comportamento padrão do Postgres pra função/procedure nova, que
-- nunca tinha sido revogado nestas duas) passa a importar de verdade — sem
-- a elevação de privilégio, uma chamada de um role sem privilégio real
-- falharia ao ler o Vault/RLS, mas mesmo assim é mais seguro restringir
-- EXECUTE explicitamente a quem de fato deveria chamar isso, então esta
-- migration também revoga de PUBLIC/authenticated/anon e concede só a
-- postgres/service_role.
--
-- Consequência operacional (documentada em RESTAURACAO.md e a ser avisada
-- separadamente): procedures são chamadas com `CALL`, não `SELECT`. Isso
-- inclui o job de pg_cron de `purgar_anexos_retencao_vencida` que já está
-- agendado e rodando em produção (com `select ...`) — precisa ser
-- reagendado com `call ...` junto da aplicação desta migration, senão passa
-- a falhar em toda execução (mesmo no caminho que só retorna 0 sem tocar
-- em pg_net, porque `SELECT` não pode invocar uma procedure de jeito
-- nenhum, independente do que roda por dentro dela).
-- ============================================================================

drop function if exists public.purgar_anexos_retencao_vencida();

create procedure public.purgar_anexos_retencao_vencida(out p_total_purgado integer)
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
  -- coletar a resposta dela mesma nesta mesma transação — ver nota no
  -- topo desta migration.
  commit;

  loop
    v_resposta := net._http_collect_response(v_request_id);
    exit when v_resposta.status <> 'ERROR' or v_resposta.message not ilike '%not found%';
    v_tentativas := v_tentativas + 1;
    exit when v_tentativas >= 5;
    perform pg_sleep(0.4);
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

comment on procedure public.purgar_anexos_retencao_vencida(out integer) is
  'LGPD §12 — purga (Storage + colunas sensíveis) anexos de casos resolvidos há mais de 90 dias. Chamar via CALL (não SELECT — é procedure). Testar manualmente com `call public.purgar_anexos_retencao_vencida(null);` antes de agendar via pg_cron.';

revoke all on procedure public.purgar_anexos_retencao_vencida(out integer) from public;
grant execute on procedure public.purgar_anexos_retencao_vencida(out integer) to postgres, service_role;

drop function if exists public.disparar_backup_dados_sensiveis();

create procedure public.disparar_backup_dados_sensiveis(out p_status_code integer)
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

  loop
    v_resposta := net._http_collect_response(v_request_id);
    exit when v_resposta.status <> 'ERROR' or v_resposta.message not ilike '%not found%';
    v_tentativas := v_tentativas + 1;
    exit when v_tentativas >= 5;
    perform pg_sleep(0.4);
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

comment on procedure public.disparar_backup_dados_sensiveis(out integer) is
  'Chamar via pg_cron (semanal — ver supabase/backups/RESTAURACAO.md) com CALL (não SELECT — é procedure) para exportar+criptografar+subir o backup e limpar retenção antiga. Não agendado nesta migration.';

revoke all on procedure public.disparar_backup_dados_sensiveis(out integer) from public;
grant execute on procedure public.disparar_backup_dados_sensiveis(out integer) to postgres, service_role;
