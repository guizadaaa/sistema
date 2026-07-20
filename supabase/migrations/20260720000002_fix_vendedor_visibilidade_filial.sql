-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: corrige vendedor enxergando toda a filial (não só os próprios casos)
--
-- Bug presente desde a migration inicial: toda policy/função que decide
-- visibilidade por filial usava a condição
--   auth_ativo() and (vendedor_dono = auth.uid() or filial = auth_filial())
-- sem checar o perfil de quem consulta. Como auth_filial() retorna a filial
-- de QUALQUER usuário ativo (vendedor incluso, não só gerente), um vendedor
-- comum também batia na segunda metade do OR e enxergava — e em
-- casos/anexos/status_historico também escrevia — casos de outros
-- vendedores da mesma filial: nome e CPF de cliente, valores financeiros,
-- documentos anexados. Contraria a seção 2/4 da spec ("Vendedor: SELECT/
-- UPDATE em casos onde vendedor_dono = usuário logado"; só gerente tem
-- SELECT por filial).
--
-- Confirmado empiricamente antes desta correção: dois vendedores na mesma
-- filial (1710), um consultando public.casos/status_historico/implicacoes/
-- anexos/desfechos_visivel via RLS via bater no caso do outro sem ser dono.
--
-- Fix: a metade "filial" do OR passa a exigir também
-- auth_perfil() = 'gerente' (admin já é tratado por auth_is_admin() em cada
-- policy, então só falta excluir vendedor dessa metade). Os ramos que já
-- exigem auth_has_delegacao_ativa() (só gerente pode ter uma delegação como
-- gerente_id) não são afetados por este bug e ficam como estão.
-- ============================================================================

drop policy if exists casos_select on public.casos;
create policy casos_select
  on public.casos for select to authenticated
  using (
    public.auth_is_admin()
    or (
      public.auth_ativo()
      and (vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and filial = public.auth_filial()))
    )
  );

drop policy if exists status_historico_select on public.status_historico;
create policy status_historico_select
  on public.status_historico for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = status_historico.caso_id
        and (
          public.auth_is_admin()
          or (
            public.auth_ativo()
            and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
          )
        )
    )
  );

drop policy if exists implicacoes_select on public.implicacoes;
create policy implicacoes_select
  on public.implicacoes for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = implicacoes.caso_id
        and (
          public.auth_is_admin()
          or (
            public.auth_ativo()
            and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
          )
        )
    )
  );

drop policy if exists anexos_select on public.anexos;
create policy anexos_select
  on public.anexos for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = anexos.caso_id
        and (
          public.auth_is_admin()
          or (
            public.auth_ativo()
            and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
          )
        )
    )
  );

drop policy if exists anexos_insert on public.anexos;
create policy anexos_insert
  on public.anexos for insert to authenticated
  with check (
    exists (
      select 1 from public.casos c
      where c.id = anexos.caso_id
        and (
          public.auth_is_admin()
          or (
            public.auth_ativo()
            and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
          )
        )
    )
  );

drop policy if exists storage_anexos_select on storage.objects;
create policy storage_anexos_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and exists (
      select 1 from public.casos c
      where c.id = ((storage.foldername(name))[1])::uuid
        and (
          public.auth_is_admin()
          or (
            public.auth_ativo()
            and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
          )
        )
    )
  );

drop policy if exists storage_anexos_insert on storage.objects;
create policy storage_anexos_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and exists (
      select 1 from public.casos c
      where c.id = ((storage.foldername(name))[1])::uuid
        and (
          public.auth_is_admin()
          or (
            public.auth_ativo()
            and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
          )
        )
    )
  );

create or replace function public.log_anexo_signed_url(p_anexo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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
        or (
          public.auth_ativo()
          and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
        )
      )
  ) into v_visivel;

  if not v_visivel then
    raise exception 'Anexo não encontrado ou sem permissão de acesso';
  end if;

  insert into public.auditoria (tabela, registro_id, acao, realizado_por)
  values ('anexos', p_anexo_id, 'download_signed_url', auth.uid());
end;
$$;

create or replace view public.desfechos_visivel as
select
  d.id,
  d.caso_id,
  d.tipo,
  d.subtipo_reembolso,
  d.origem_reembolso_integral,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_nome_completo else null end as banco_nome_completo,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_agencia else null end as banco_agencia,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_conta else null end as banco_conta,
  case when public.auth_is_admin() or c.vendedor_dono = auth.uid()
    then d.banco_cpf else null end as banco_cpf,
  d.valor,
  d.subtipo_remarcacao,
  d.valor_taxas,
  d.valor_diferenca_tarifaria,
  d.criado_por,
  d.criado_em
from public.desfechos d
join public.casos c on c.id = d.caso_id
where
  public.auth_is_admin()
  or (
    public.auth_ativo()
    and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
  );
