-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration 3: bucket privado "anexos" + políticas de Storage
--
-- Convenção de caminho: <caso_id>/<uuid>-<nome_arquivo>
-- O primeiro segmento do path é o caso_id, o que permite às políticas de
-- Storage espelharem exatamente a mesma regra de visibilidade/escrita da
-- tabela public.anexos (seção 4 do documento: "Anexos seguem a RLS do caso
-- pai, inclusive nas políticas do Supabase Storage").
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anexos',
  'anexos',
  false, -- bucket privado; download só por signed URL de curta duração
  10485760, -- 10 MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_anexos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and exists (
      select 1 from public.casos c
      where c.id = ((storage.foldername(name))[1])::uuid
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

-- Upload liberado para quem já enxerga o caso (mesma regra de anexos_insert;
-- não exige delegação — anexar documento não é ação exclusiva do fluxo adm).
create policy storage_anexos_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and exists (
      select 1 from public.casos c
      where c.id = ((storage.foldername(name))[1])::uuid
        and (
          public.auth_is_admin()
          or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
        )
    )
  );

-- Sem UPDATE/DELETE por ora — mesma decisão da tabela anexos (ver nota LGPD
-- §12 sobre retenção mínima; item em aberto para decisão futura).
