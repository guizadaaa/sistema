-- ============================================================================
-- Migration 20261128000001: anexos de caso em HTML.
-- ============================================================================

set role postgres;

\ir ../migrations/20261128000001_anexos_html.sql

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condicao, false) then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

select public._test_assert('bucket anexos: text/html + os 4 tipos de antes',
  (select allowed_mime_types @> array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/html']
     and cardinality(allowed_mime_types) = 5
   from storage.buckets where id = 'anexos'));

\ir ../migrations/20261128000001_anexos_html.sql
select public._test_assert('reaplicar não duplica tipos',
  (select cardinality(allowed_mime_types) = 5 from storage.buckets where id = 'anexos'));

-- Anexo HTML no caso da semente (dono: vendedor A da 1710): mesmas regras dos outros anexos.
begin;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.anexos (id, caso_id, tipo_documento, storage_path, nome_arquivo)
values ('47000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'outro',
        '10000000-0000-0000-0000-000000000001/erro-systur.html', 'erro-systur.html');
insert into storage.objects (bucket_id, name, owner)
values ('anexos', '10000000-0000-0000-0000-000000000001/erro-systur.html', '00000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public._test_assert('dono do caso vê o anexo HTML e o objeto no Storage',
  exists (select 1 from public.anexos where id = '47000000-0000-0000-0000-000000000001')
  and exists (select 1 from storage.objects where bucket_id = 'anexos' and name like '%/erro-systur.html'));
select public.log_anexo_signed_url('47000000-0000-0000-0000-000000000001');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select public._test_assert('quem não vê o caso (gerente de outra filial) não vê o anexo HTML nem o objeto',
  not exists (select 1 from public.anexos where id = '47000000-0000-0000-0000-000000000001')
  and not exists (select 1 from storage.objects where bucket_id = 'anexos' and name like '%/erro-systur.html'));
reset role;
rollback;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000005', true);
  set local role authenticated;
  perform public.log_anexo_signed_url('10000000-0000-0000-0000-000000000001');
  raise exception 'FALHOU: log/abertura liberada para quem não vê o caso';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: quem não vê o caso não abre o anexo (log_anexo_signed_url recusa)';
end;
$$;

drop function public._test_assert(text, boolean);

select 'todos os asserts de anexo HTML passaram' as status;
