-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: seção "Documentos/Materiais de apoio"
--
-- Reaproveita o mesmo padrão de anexos (tabela + bucket privado de Storage +
-- signed URL de download), adaptado para um contexto sem caso: aqui não há
-- caso_id nenhum — os documentos (manuais, políticas, scripts de
-- atendimento) valem pra operação inteira, não pra um caso específico. Por
-- isso a policy de Storage não pode reaproveitar a convenção de path
-- "<caso_id>/..." do bucket "anexos" (o primeiro segmento vira um cast pra
-- uuid nas policies de lá — quebraria com um path sem caso_id) e usa um
-- bucket novo, "materiais-apoio", com policies mais simples (sem depender
-- de nenhuma tabela além de usuarios).
--
-- Upload: só adm/adm_master (auth_is_admin() cobre os dois — mesma função
-- usada em todo o resto do sistema para essa distinção). Leitura/download:
-- qualquer perfil ativo, sem recorte de filial — os documentos aqui
-- descritos são materiais corporativos, não dado de um caso ou vendedor.
-- ============================================================================

create table public.materiais_apoio (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  storage_path text not null unique,
  nome_arquivo text not null,
  enviado_por uuid not null references public.usuarios (id),
  enviado_em timestamptz not null default now(),

  constraint materiais_apoio_titulo_nao_vazio check (length(trim(titulo)) > 0)
);

alter table public.materiais_apoio enable row level security;

create policy materiais_apoio_select
  on public.materiais_apoio for select to authenticated
  using (public.auth_ativo());

create function public.set_materiais_apoio_enviado_por()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.enviado_por := auth.uid();
  return new;
end;
$$;

create trigger materiais_apoio_set_enviado_por
  before insert on public.materiais_apoio
  for each row execute function public.set_materiais_apoio_enviado_por();

create policy materiais_apoio_insert
  on public.materiais_apoio for insert to authenticated
  with check (public.auth_is_admin());

-- Sem UPDATE/DELETE por ora — mesma decisão inicial da tabela anexos
-- (substituir um material desatualizado é subir um novo, por enquanto).

grant select, insert on public.materiais_apoio to authenticated;
grant select, insert, update, delete on public.materiais_apoio to service_role;

-- ----------------------------------------------------------------------------
-- Storage: bucket privado, só PDF, mesmo limite de tamanho do bucket "anexos".
-- Convenção de path: "<uuid>-<nome_arquivo>" direto na raiz do bucket — sem
-- caso_id pra derivar, as policies abaixo não precisam olhar o path.
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materiais-apoio', 'materiais-apoio', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_materiais_apoio_select
  on storage.objects for select to authenticated
  using (bucket_id = 'materiais-apoio' and public.auth_ativo());

create policy storage_materiais_apoio_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'materiais-apoio' and public.auth_is_admin());
