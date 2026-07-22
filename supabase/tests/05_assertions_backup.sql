-- ============================================================================
-- Testes de infraestrutura de backup (item 6 do backlog de 22/07): bucket
-- "backups" inacessível para authenticated/anon (só service_role), e
-- obter_backup_encryption_key() só executável por service_role.
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

-- Simula um objeto já existente no bucket de backups (via service_role,
-- que bypassa RLS — é assim que a Edge Function grava de verdade).
set role service_role;
insert into storage.objects (bucket_id, name) values ('backups', 'backup-2026-07-20T0300.json');
reset role;

-- ----------------------------------------------------------------------------
-- Bucket "backups": nenhum papel de app (authenticated, mesmo adm_master)
-- enxerga nada nele — RLS habilitada em storage.objects sem NENHUMA policy
-- "to authenticated" pra este bucket é deny total.
-- ----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004'; -- adm_master
select public._test_assert(
  'bucket backups: adm_master (authenticated) NÃO enxerga nenhum objeto',
  (select count(*) = 0 from storage.objects where bucket_id = 'backups')
);
reset role;
reset request.jwt.claim.sub;

do $$
begin
  set role authenticated;
  set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
  insert into storage.objects (bucket_id, name) values ('backups', 'tentativa-authenticated.json');
  raise exception 'FALHOU: authenticated conseguiu inserir no bucket de backups';
exception when insufficient_privilege then
  raise notice 'ok: bucket backups: authenticated NÃO consegue inserir (sem policy = deny)';
end
$$;
reset role;
reset request.jwt.claim.sub;

set role anon;
select public._test_assert(
  'bucket backups: anon também não enxerga nada',
  (select count(*) = 0 from storage.objects where bucket_id = 'backups')
);
reset role;

set role service_role;
select public._test_assert(
  'bucket backups: service_role enxerga o objeto (bypassa RLS)',
  (select count(*) = 1 from storage.objects where bucket_id = 'backups')
);
reset role;

-- ----------------------------------------------------------------------------
-- obter_backup_encryption_key(): revogada de authenticated/anon, liberada
-- só pra service_role.
-- ----------------------------------------------------------------------------

set role postgres;
insert into vault.decrypted_secrets (name, decrypted_secret) values ('backup_encryption_key', 'chave-de-teste-nao-usar-em-producao');
reset role;

do $$
begin
  set role authenticated;
  set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
  perform public.obter_backup_encryption_key();
  raise exception 'FALHOU: authenticated conseguiu chamar obter_backup_encryption_key()';
exception when insufficient_privilege then
  raise notice 'ok: obter_backup_encryption_key() bloqueada para authenticated';
end
$$;
reset role;
reset request.jwt.claim.sub;

set role service_role;
select public._test_assert(
  'obter_backup_encryption_key(): service_role consegue ler a secret',
  (select public.obter_backup_encryption_key() = 'chave-de-teste-nao-usar-em-producao')
);
reset role;

select 'todos os asserts de backup passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
