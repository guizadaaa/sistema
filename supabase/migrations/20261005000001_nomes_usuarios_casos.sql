-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: nomes de quem fez algo num caso, visíveis a quem vê o caso
--
-- Bug: na tela do caso, vendedor e gerente viam "—" em "Registrado por", no
-- ator de cada etapa da Linha do tempo e no autor dos comentários. Causa
-- raiz: o app resolve os nomes com SELECT direto em public.usuarios, e a RLS
-- dessa tabela (20260716000002_rls.sql) só libera ao vendedor a PRÓPRIA
-- linha (usuarios_select_self) e ao gerente as linhas da PRÓPRIA filial
-- (usuarios_select_filial_gerente) — adm/adm_master têm filial nula, então
-- nunca aparecem para o gerente, e para o vendedor ninguém além dele mesmo
-- aparece. Admin vê tudo (usuarios_select_admin), por isso só eles viam os
-- nomes. A RLS dos casos e do histórico estava certa; o bloqueio era só na
-- leitura do nome.
--
-- Correção sem afrouxar a RLS de usuarios: função SECURITY DEFINER que
-- devolve SOMENTE (id, nome_completo), e só de quem participou de um caso
-- que o chamador já enxerga (auth_pode_ver_caso — mesma regra única de
-- visibilidade de casos): criou o caso, é o dono, avançou um status ou
-- escreveu um comentário (casos_complementos). Caso invisível → nenhuma
-- linha; nenhum outro campo de usuarios (e-mail, perfil, filial, ativo...)
-- sai por aqui.
-- ============================================================================

create function public.nomes_usuarios_casos(p_caso_ids uuid[])
returns table (id uuid, nome_completo text)
language sql stable security definer set search_path = public
as $$
  with casos_visiveis as (
    select c.id, c.criado_por, c.vendedor_dono
    from public.casos c
    where c.id = any (p_caso_ids)
      and public.auth_pode_ver_caso(c.id)
  ),
  participantes as (
    select cv.criado_por as usuario_id from casos_visiveis cv
    union
    select cv.vendedor_dono from casos_visiveis cv
    union
    select sh.alterado_por
    from public.status_historico sh
    join casos_visiveis cv on cv.id = sh.caso_id
    union
    select cc.criado_por
    from public.casos_complementos cc
    join casos_visiveis cv on cv.id = cc.caso_id
  )
  select u.id, u.nome_completo
  from public.usuarios u
  join participantes p on p.usuario_id = u.id;
$$;

comment on function public.nomes_usuarios_casos(uuid[]) is
  'Só (id, nome_completo) de quem criou, é dono, avançou status ou comentou em casos que o chamador enxerga (auth_pode_ver_caso). Não afrouxa a RLS de usuarios.';

revoke all on function public.nomes_usuarios_casos(uuid[]) from public;
grant execute on function public.nomes_usuarios_casos(uuid[]) to authenticated;
