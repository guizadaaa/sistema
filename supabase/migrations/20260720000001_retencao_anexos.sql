-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: retenção de anexos sensíveis (LGPD §12)
--
-- Regra confirmada com o cliente: um anexo é purgado 90 dias depois que o
-- caso entra em 'resolvido' — cobre com folga uma eventual reabertura via
-- Ouvidoria sem reter atestado de saúde/certidão de óbito (dado sensível,
-- LGPD art. 5º, II) além do necessário. Se o caso for reaberto e resolvido
-- de novo, a contagem reinicia a partir da resolução mais recente (usa a
-- última linha de status_historico com status='resolvido', não a primeira).
--
-- auditoria NUNCA é purgada por esta rotina — só os arquivos em anexos.
--
-- IMPORTANTE — esta migration só cria a infraestrutura (coluna + função).
-- NÃO agenda o pg_cron: a extensão precisa ser habilitada e a service_role
-- key precisa estar no Vault antes de qualquer agendamento — ver
-- instruções separadas (não é seguro commitar a secret num arquivo de
-- migration). Até lá, a função existe mas só roda se alguém chamá-la
-- manualmente.
-- ============================================================================

-- Deletar o arquivo real do Storage exige a Storage API (via pg_net) — um
-- DELETE direto em storage.objects só apaga a linha de metadado no Postgres,
-- não o objeto no backend (S3/disco) por trás dela, o que não cumpriria a
-- obrigação de exclusão de verdade.
alter table public.anexos alter column storage_path drop not null;
alter table public.anexos alter column nome_arquivo drop not null;
alter table public.anexos add column excluido_em timestamptz;

comment on column public.anexos.excluido_em is
  'Preenchido quando o arquivo é purgado por retenção (LGPD §12) — storage_path e nome_arquivo viram NULL nesse momento; tipo_documento, caso_id, enviado_por/em ficam preservados como registro de que o documento existiu.';

create or replace function public.purgar_anexos_retencao_vencida()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_paths text[];
  v_service_role_key text;
  -- URL do projeto não é segredo (já é público em NEXT_PUBLIC_SUPABASE_URL);
  -- só a service_role key precisa ficar fora deste arquivo, no Vault.
  v_supabase_url text := 'https://csquqrcmctcyxfxlmdwk.supabase.co';
  v_request_id bigint;
  v_status_code integer;
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
    return 0;
  end if;

  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_service_role_key is null then
    raise exception 'Secret "service_role_key" não encontrado no Vault — configure antes de agendar esta função no pg_cron (ver instruções de ativação).';
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

  -- Espera a resposta antes de marcar qualquer linha como excluída — se o
  -- Storage falhar, nada aqui é considerado purgado (a próxima execução
  -- tenta de novo).
  select (net.http_collect_response(v_request_id)).status_code into v_status_code;

  if v_status_code is null or v_status_code >= 300 then
    raise exception 'Falha ao excluir anexos no Storage (status %) — nenhuma linha foi marcada como excluída nesta execução.', v_status_code;
  end if;

  update public.anexos
  set storage_path = null, nome_arquivo = null, excluido_em = now()
  where id = any(v_ids);

  return array_length(v_ids, 1);
end;
$$;

comment on function public.purgar_anexos_retencao_vencida() is
  'LGPD §12 — purga (Storage + colunas sensíveis) anexos de casos resolvidos há mais de 90 dias. Chamar manualmente para testar antes de agendar via pg_cron (ver instruções de ativação — não incluídas nesta migration por envolverem a service_role key).';
