-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration 4: tabela de auditoria (LGPD §12) + log de signed URLs de anexos
--
-- Decisão confirmada com o cliente: tabela de auditoria com triggers em
-- implicacoes, desfechos e usuarios, e registro de toda geração de signed
-- URL de anexos.
--
-- auditoria é somente-leitura para o cliente (nenhuma policy de INSERT para
-- authenticated): escrita só acontece via trigger (implicacoes/desfechos/
-- usuarios) ou via a função log_anexo_signed_url, ambas SECURITY DEFINER.
-- Um log de auditoria gravável pelo próprio usuário não seria confiável.
-- ============================================================================

create type acao_auditoria as enum ('insert', 'update', 'delete', 'download_signed_url');

create table public.auditoria (
  id uuid primary key default gen_random_uuid(),
  tabela text not null,
  registro_id uuid not null,
  acao acao_auditoria not null,
  dados_antigos jsonb,
  dados_novos jsonb,
  realizado_por uuid not null references public.usuarios (id),
  realizado_em timestamptz not null default now()
);

create index auditoria_tabela_registro_idx on public.auditoria (tabela, registro_id);
create index auditoria_realizado_em_idx on public.auditoria (realizado_em);

alter table public.auditoria enable row level security;

-- Leitura restrita ao adm_master (única visão de auditoria prevista até
-- agora; se o time quiser expandir para adm comum depois, é só ajustar
-- esta policy — não requer mudança nos triggers/RPC que gravam os dados).
create policy auditoria_select_adm_master
  on public.auditoria for select to authenticated
  using (public.auth_is_adm_master());

-- Sem INSERT/UPDATE/DELETE policy para authenticated: a tabela só é escrita
-- pelos triggers abaixo e pela função log_anexo_signed_url (SECURITY
-- DEFINER, dona pelo owner da migration, que dispensa policy de INSERT).

create function public.log_auditoria()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.auditoria (tabela, registro_id, acao, dados_antigos, dados_novos, realizado_por)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op)::acao_auditoria,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

-- implicacoes: financeiro — auditar criação e toda correção de valores.
create trigger implicacoes_log_auditoria
  after insert or update on public.implicacoes
  for each row execute function public.log_auditoria();

-- desfechos: imutável após criação (sem UPDATE previsto), só INSERT audita.
create trigger desfechos_log_auditoria
  after insert on public.desfechos
  for each row execute function public.log_auditoria();

-- usuarios: só UPDATE é auditado — o INSERT é 100% automático via
-- on_auth_user_created (sem contexto de auth.uid(), nada de humano para
-- rastrear ali). As ações que importam auditar são as do adm_master:
-- trocar perfil/filial, ativar/desativar.
create trigger usuarios_log_auditoria
  after update on public.usuarios
  for each row execute function public.log_auditoria();

-- ----------------------------------------------------------------------------
-- Log de geração de signed URL de anexos (download de documento sensível)
-- ----------------------------------------------------------------------------

-- SECURITY DEFINER: reimplementa a mesma checagem de visibilidade de
-- anexos_select para não depender de RLS (a função já roda com privilégios
-- do owner), e só grava o log se o chamador realmente pode ver o anexo —
-- evita que a própria RPC vire um oráculo para descobrir se um anexo_id
-- existe.
create function public.log_anexo_signed_url(p_anexo_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_visivel boolean;
begin
  select exists (
    select 1 from public.anexos a
    join public.casos c on c.id = a.caso_id
    where a.id = p_anexo_id
      and (
        public.auth_is_admin()
        or (public.auth_ativo() and (c.vendedor_dono = auth.uid() or c.filial = public.auth_filial()))
      )
  ) into v_visivel;

  if not v_visivel then
    raise exception 'Anexo não encontrado ou sem permissão de acesso';
  end if;

  insert into public.auditoria (tabela, registro_id, acao, realizado_por)
  values ('anexos', p_anexo_id, 'download_signed_url', auth.uid());
end;
$$;

grant execute on function public.log_anexo_signed_url(uuid) to authenticated;
