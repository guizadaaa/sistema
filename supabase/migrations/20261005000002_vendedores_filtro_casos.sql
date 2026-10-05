-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: opções do filtro "Vendedor" em Acompanhar Casos
--
-- Lista vendedores e gerentes ativos para o filtro por dono do caso. Mesmo
-- desenho de nomes_usuarios_casos (20261005000001): SECURITY DEFINER que
-- devolve SOMENTE (id, nome_completo), sem afrouxar a RLS de usuarios.
--
-- Escopo por perfil:
--   - vendedor/gerente: só usuários da PRÓPRIA filial (auth_filial()),
--     nunca de outra — mesmo que p_filial peça outra (vira lista vazia).
--   - adm/adm_master: todos; com p_filial, só os daquela filial.
--   - inativo/sem perfil: nada (auth_perfil() é nulo para inativo).
--
-- A lista de opções não revela caso nenhum: filtrar por um dono só refina
-- a consulta de casos, que continua sob a RLS de casos (auth_pode_ver_caso).
-- ============================================================================

create function public.vendedores_filtro_casos(p_filial filial_cvc default null)
returns table (id uuid, nome_completo text)
language sql stable security definer set search_path = public
as $$
  select u.id, u.nome_completo
  from public.usuarios u
  where u.ativo
    and u.perfil in ('vendedor', 'gerente')
    and (p_filial is null or u.filial = p_filial)
    and (
      public.auth_is_admin()
      or (public.auth_perfil() in ('vendedor', 'gerente') and u.filial = public.auth_filial())
    )
  order by u.nome_completo;
$$;

comment on function public.vendedores_filtro_casos(filial_cvc) is
  'Opções do filtro Vendedor (dono do caso): só (id, nome_completo) de vendedores/gerentes ativos — da própria filial para vendedor/gerente, de todas (ou da p_filial) para admin.';

revoke all on function public.vendedores_filtro_casos(filial_cvc) from public;
grant execute on function public.vendedores_filtro_casos(filial_cvc) to authenticated;
