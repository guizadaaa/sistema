-- ============================================================================
-- Acompanhar Casos: filtro Vendedor respeita a Filial escolhida.
--
-- vendedores_filtro_casos_lojas()  candidatos do filtro Vendedor, com a loja
--   de cada um e as filiais em que é dono de caso:
--     id, nome_completo, filial (usuarios.filial), ativo,
--     filiais_casos (filiais dos casos reais em que é vendedor_dono)
--   A tela (src/lib/casos/opcoes-vendedor.ts) monta os grupos: Filial =
--   Todas → ativos agrupados por loja; Filial = X → ativos da X + "Outros
--   com casos nesta filial" (dono de caso da X que hoje é de outra loja ou
--   está inativo).
--
-- Visibilidade (igual a vendedores_filtro_casos e à RLS de casos):
--   adm/adm_master  todas as filiais;
--   gerente         só a própria filial: ativos dela + donos de casos dela;
--   vendedor        como hoje — só os ativos da própria filial (sem
--                   filiais_casos: ele só vê os próprios casos).
--   inativo         nada.
-- Só id, nome, loja e situação — nada além do que o select já mostrava.
--
-- Idempotente.
-- ============================================================================

drop function if exists public.vendedores_filtro_casos_lojas();

create function public.vendedores_filtro_casos_lojas()
returns table (id uuid, nome_completo text, filial filial_cvc, ativo boolean, filiais_casos filial_cvc[])
language sql
stable
security definer
set search_path = public
as $$
  with eu as materialized (
    select public.auth_is_admin() as admin, public.auth_perfil() as perfil, public.auth_filial() as filial,
      public.auth_ativo() as ativo
  ),
  lojas as (
    -- Filiais cujo filtro quem chama pode usar.
    select l
    from unnest(enum_range(null::filial_cvc)) l, eu
    where eu.admin or (eu.ativo and eu.perfil in ('vendedor', 'gerente') and l = eu.filial)
  ),
  donos as (
    -- Donos de casos reais por filial (só para admin e gerente).
    select c.vendedor_dono, array_agg(distinct c.filial order by c.filial) as filiais
    from public.casos c, eu
    where not c.caso_teste
      and (eu.admin or eu.perfil = 'gerente')
      and c.filial in (select l from lojas)
    group by c.vendedor_dono
  )
  select u.id, u.nome_completo, u.filial, u.ativo, coalesce(d.filiais, '{}')
  from public.usuarios u
  left join donos d on d.vendedor_dono = u.id
  where (u.ativo and u.perfil in ('vendedor', 'gerente') and u.filial in (select l from lojas))
     or d.vendedor_dono is not null
  order by u.nome_completo;
$$;

comment on function public.vendedores_filtro_casos_lojas() is
  'Candidatos do filtro Vendedor de Acompanhar Casos: ativos das filiais visíveis + donos de casos dessas filiais (transferidos/inativos), com a loja, a situação e as filiais em que têm casos.';

revoke all on function public.vendedores_filtro_casos_lojas() from public, anon;
grant execute on function public.vendedores_filtro_casos_lojas() to authenticated, service_role;
