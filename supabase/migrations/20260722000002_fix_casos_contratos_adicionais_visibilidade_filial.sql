-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: corrige vendedor enxergando contratos adicionais da filial inteira
--
-- casos_contratos_adicionais foi criada em 20260721000002, um dia depois de
-- 20260720000002_fix_vendedor_visibilidade_filial corrigir exatamente este
-- bug em casos/status_historico/implicacoes/anexos/storage.objects — mas as
-- duas policies desta tabela nova foram escritas copiando o padrão antigo
-- (pré-fix), sem a checagem auth_perfil() = 'gerente' na metade "filial" do
-- OR. Resultado: qualquer vendedor ativo consegue ver e inserir números de
-- contrato adicionais em casos de outros vendedores da mesma filial, não só
-- nos próprios — mesma classe de vazamento (achado C2 da auditoria de
-- 22/07), reintroduzida numa tabela criada depois da correção original.
--
-- Fix: mesmo padrão já usado em anexos_select/anexos_insert — a metade
-- "filial" do OR passa a exigir também auth_perfil() = 'gerente'.
-- ============================================================================

drop policy if exists casos_contratos_adicionais_select on public.casos_contratos_adicionais;
create policy casos_contratos_adicionais_select
  on public.casos_contratos_adicionais for select to authenticated
  using (
    exists (
      select 1 from public.casos c
      where c.id = casos_contratos_adicionais.caso_id
        and (
          public.auth_is_admin()
          or (
            public.auth_ativo()
            and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
          )
        )
    )
  );

drop policy if exists casos_contratos_adicionais_insert on public.casos_contratos_adicionais;
create policy casos_contratos_adicionais_insert
  on public.casos_contratos_adicionais for insert to authenticated
  with check (
    exists (
      select 1 from public.casos c
      where c.id = casos_contratos_adicionais.caso_id
        and (
          public.auth_is_admin()
          or (
            public.auth_ativo()
            and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
          )
        )
    )
  );
