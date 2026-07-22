-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: backup criptografado de dados sensíveis (item 6, 22/07)
--
-- Desenho aprovado pelo cliente: Edge Function exporta casos, implicacoes,
-- desfechos, usuarios e status_historico como JSON, criptografa (AES-256-GCM,
-- chave no Vault) e sobe pra um bucket de Storage PRIVADO dedicado
-- ("backups", separado do bucket "anexos" — nenhuma policy pra
-- authenticated/anon nele, só service_role acessa). Agendamento via
-- pg_cron + pg_net, mesmo mecanismo já usado em
-- purgar_anexos_retencao_vencida (20260720000001) — a função aqui só chama
-- a Edge Function via net.http_post; a Edge Function em si mora fora do
-- Postgres (supabase/functions/backup-dados-sensiveis/index.ts).
--
-- IMPORTANTE — mesma ressalva da migration de retenção de anexos: esta
-- migration só cria a infraestrutura (bucket + funções). NÃO agenda o
-- pg_cron nem cria a secret 'backup_encryption_key' no Vault — isso exige
-- acesso ao dashboard do Supabase e não é seguro commitar. Ver
-- supabase/backups/RESTAURACAO.md para o passo a passo de ativação e de
-- restauração.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'backups',
  'backups',
  false, -- privado — sem NENHUMA policy pra authenticated/anon (ver abaixo), só service_role
  52428800, -- 50 MB — folga generosa pro volume desta operação (uma franquia, 3 filiais)
  array['application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Nenhuma policy de storage.objects "to authenticated"/"to anon" pro bucket
-- "backups" — RLS habilitada em storage.objects (20260716000003) sem
-- policy nenhuma pra um role = deny total pra esse role. Só service_role
-- (que bypassa RLS) lê/escreve — nem admin do app enxerga isso pela UI,
-- só quem tem acesso ao dashboard do Supabase.

-- ----------------------------------------------------------------------------
-- Chave de criptografia — mesmo padrão de service_role_key (Vault). Função
-- própria em vez de expor vault.decrypted_secrets direto: schema vault não
-- é exposto ao PostgREST, e mesmo se fosse, a leitura crua da secret nunca
-- deveria ter uma rota alcançável por authenticated/anon.
-- ----------------------------------------------------------------------------

create function public.obter_backup_encryption_key()
returns text
language sql stable security definer set search_path = public
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'backup_encryption_key';
$$;

comment on function public.obter_backup_encryption_key() is
  'Só a Edge Function de backup (via service_role) deve chamar isto — nunca exposta a authenticated/anon.';

revoke execute on function public.obter_backup_encryption_key() from public;
grant execute on function public.obter_backup_encryption_key() to service_role;

-- ----------------------------------------------------------------------------
-- Disparo do backup — chamado pelo pg_cron (agendamento fora desta
-- migration, ver nota no topo). Mesma estrutura de
-- purgar_anexos_retencao_vencida: lê a service_role_key do Vault, chama a
-- Storage/Edge Function API via net.http_post, espera a resposta antes de
-- considerar sucesso.
-- ----------------------------------------------------------------------------

create function public.disparar_backup_dados_sensiveis()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_service_role_key text;
  v_supabase_url text := 'https://csquqrcmctcyxfxlmdwk.supabase.co';
  v_request_id bigint;
  v_status_code integer;
begin
  select decrypted_secret into v_service_role_key
  from vault.decrypted_secrets
  where name = 'service_role_key';

  if v_service_role_key is null then
    raise exception 'Secret "service_role_key" não encontrado no Vault — configure antes de agendar esta função no pg_cron.';
  end if;

  select net.http_post(
    url := v_supabase_url || '/functions/v1/backup-dados-sensiveis',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_role_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  select (net.http_collect_response(v_request_id)).status_code into v_status_code;

  if v_status_code is null or v_status_code >= 300 then
    raise exception 'Falha ao disparar backup de dados sensíveis (status %).', v_status_code;
  end if;

  return v_status_code;
end;
$$;

comment on function public.disparar_backup_dados_sensiveis() is
  'Chamar via pg_cron (semanal — ver supabase/backups/RESTAURACAO.md) para exportar+criptografar+subir o backup e limpar retenção antiga. Não agendado nesta migration.';
