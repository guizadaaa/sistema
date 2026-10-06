-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: gerente da filial avança status SEM exigir delegação
--
-- Antes (20261006000002): admin; gerente COM delegação ativa na própria
-- filial; vendedor dono. Agora o gerente avança o status de qualquer caso
-- da própria filial que já enxerga (auth_pode_ver_caso — também exclui caso
-- de teste), com ou sem delegação. A cláusula de delegação fica coberta por
-- esta (delegação é sempre de um gerente, sobre a filial dele).
--
-- Só muda auth_pode_avancar_status, a fonte única usada por:
--   - policy status_historico_insert;
--   - trigger validar_transicao_status (ordem, 20261006000003);
--   - enforce_casos_update_permissions (troca de status_atual vinda do
--     histórico, pg_trigger_depth() > 1).
-- Continua igual: Ouvidoria só admin; ordem das transições; Resolvido
-- exige comentário; via_delegacao só verdadeiro para quem TEM delegação;
-- desfecho e implicações seguem exigindo admin ou gerente COM delegação.
-- ============================================================================

create or replace function public.auth_pode_avancar_status(p_caso_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.casos c
    where c.id = p_caso_id
      and (
        public.auth_is_admin()
        or (
          public.auth_perfil() = 'gerente'
          and c.filial = public.auth_filial()
          and public.auth_pode_ver_caso(c.id)
        )
        or (
          public.auth_perfil() = 'vendedor'
          and c.vendedor_dono = auth.uid()
          and public.auth_pode_ver_caso(c.id)
        )
      )
  );
$$;

comment on function public.auth_pode_avancar_status(uuid) is
  'Quem pode inserir em status_historico (avançar status): admin; gerente da própria filial (com ou sem delegação, desde 20261006000004); vendedor dono do caso. Ouvidoria segue exclusiva do admin.';
