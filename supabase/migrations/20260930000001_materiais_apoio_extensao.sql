-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: extensão de "Materiais de apoio"
--
-- 1. Tipos além de PDF: imagem (jpeg/png), docx, xlsx e link externo.
--    Link não tem arquivo no Storage (só url); os demais não têm url.
-- 2. Categorias (materiais_apoio_categorias) para filtrar a lista. Todos
--    enxergam (o filtro é de todos); só adm_master cria/renomeia/exclui.
-- 3. Edição: renomear, trocar categoria, substituir arquivo, editar url e
--    excluir — só admin (adm/adm_master), mesma regra do insert. Substituir
--    e excluir apagam o objeto antigo do bucket, por isso a policy nova de
--    DELETE em storage.objects.
-- ============================================================================

create type public.tipo_material_apoio as enum ('pdf', 'imagem', 'docx', 'xlsx', 'link');

-- ----------------------------------------------------------------------------
-- Categorias
-- ----------------------------------------------------------------------------

create table public.materiais_apoio_categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now(),

  constraint materiais_apoio_categorias_nome_nao_vazio check (length(trim(nome)) > 0)
);

-- Dedup case-insensitive: "Manuais" e "manuais" são a mesma categoria.
create unique index materiais_apoio_categorias_nome_unico
  on public.materiais_apoio_categorias (lower(nome));

alter table public.materiais_apoio_categorias enable row level security;

create policy materiais_apoio_categorias_select
  on public.materiais_apoio_categorias for select to authenticated
  using (public.auth_ativo());

create policy materiais_apoio_categorias_insert
  on public.materiais_apoio_categorias for insert to authenticated
  with check (public.auth_is_adm_master());

create policy materiais_apoio_categorias_update
  on public.materiais_apoio_categorias for update to authenticated
  using (public.auth_is_adm_master())
  with check (public.auth_is_adm_master());

create policy materiais_apoio_categorias_delete
  on public.materiais_apoio_categorias for delete to authenticated
  using (public.auth_is_adm_master());

grant select, insert, update, delete on public.materiais_apoio_categorias to authenticated;
grant select, insert, update, delete on public.materiais_apoio_categorias to service_role;

-- ----------------------------------------------------------------------------
-- materiais_apoio: tipo, url, categoria, auditoria de edição
-- ----------------------------------------------------------------------------

alter table public.materiais_apoio
  -- Tudo que já existe é PDF (único formato aceito até aqui); o default só
  -- serve pra preencher as linhas antigas e sai logo abaixo.
  add column tipo public.tipo_material_apoio not null default 'pdf',
  add column url text,
  add column categoria_id uuid references public.materiais_apoio_categorias (id) on delete restrict,
  add column atualizado_por uuid references public.usuarios (id),
  add column atualizado_em timestamptz;

alter table public.materiais_apoio alter column tipo drop default;

alter table public.materiais_apoio
  alter column storage_path drop not null,
  alter column nome_arquivo drop not null;

alter table public.materiais_apoio
  add constraint materiais_apoio_tipo_coerente check (
    case
      when tipo = 'link' then url is not null and storage_path is null and nome_arquivo is null
      else url is null and storage_path is not null and nome_arquivo is not null
    end
  ),
  -- A url vira href na tela — só http(s), nunca javascript:/data:.
  add constraint materiais_apoio_url_http check (url is null or url ~* '^https?://');

create index materiais_apoio_categoria_id_idx on public.materiais_apoio (categoria_id);

-- atualizado_por/_em nunca vêm do client, e enviado_por/_em não mudam numa
-- edição — mesmo padrão de set_materiais_apoio_enviado_por no insert.
create function public.set_materiais_apoio_atualizado()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.enviado_por := old.enviado_por;
  new.enviado_em := old.enviado_em;
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger materiais_apoio_set_atualizado
  before update on public.materiais_apoio
  for each row execute function public.set_materiais_apoio_atualizado();

create policy materiais_apoio_update
  on public.materiais_apoio for update to authenticated
  using (public.auth_is_admin())
  with check (public.auth_is_admin());

create policy materiais_apoio_delete
  on public.materiais_apoio for delete to authenticated
  using (public.auth_is_admin());

grant update, delete on public.materiais_apoio to authenticated;

-- ----------------------------------------------------------------------------
-- Storage: novos formatos + DELETE (substituir/excluir arquivo)
-- ----------------------------------------------------------------------------

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]
where id = 'materiais-apoio';

create policy storage_materiais_apoio_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'materiais-apoio' and public.auth_is_admin());
