-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Restringe a criação de casos do tipo "cancelamento" a gerente/adm/adm_master.
-- Vendedor não pode abrir esse tipo de caso, nem mesmo para si mesmo — a UI
-- já esconde a opção no formulário, mas a policy é a fonte de verdade: sem
-- este check, uma chamada direta à API (fora do formulário) ainda permitiria.
-- Quem cria o caso é sempre auth.uid() (constraint criado_por = auth.uid()
-- já existente abaixo), então auth_perfil() aqui reflete o perfil de quem
-- está preenchendo o formulário, não o do dono do caso.
-- ============================================================================

alter policy casos_insert
  on public.casos
  with check (
    criado_por = auth.uid()
    and public.auth_ativo()
    and (
      public.auth_is_admin()
      or vendedor_dono = auth.uid()
      or (public.auth_perfil() = 'gerente' and public.usuario_filial(vendedor_dono) = public.auth_filial())
    )
    and (
      tipo_caso <> 'cancelamento'
      or public.auth_perfil() in ('gerente', 'adm', 'adm_master')
    )
  );
