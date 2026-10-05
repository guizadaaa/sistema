-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: vendedor também avança o status dos PRÓPRIOS casos
--
-- Muda um princípio do projeto. Antes: só admin (qualquer caso) ou gerente
-- com delegação ativa (própria filial) inseriam em status_historico. Agora o
-- vendedor também avança, mas só nos casos dos quais é dono e que já
-- enxerga (auth_pode_ver_caso — o que também exclui caso de teste). Nunca
-- caso de colega nem de outra filial.
--
-- Mesmas regras do gerente com delegação: qualquer status ≠ inicial, exceto
-- Ouvidoria (continua só admin); "Resolvido exige comentário"
-- (impede_resolvido_sem_comentario) vale igual. Escopo é SÓ status: registrar
-- /corrigir desfecho e lançar implicações financeiras continuam admin ou
-- gerente com delegação (policies desfechos_* / implicacoes_* intocadas).
--
-- Imposição no banco, em três pontos:
--   1. auth_pode_avancar_status(caso): fonte única de "quem avança status".
--   2. status_historico_insert passa a usar essa função.
--   3. enforce_casos_update_permissions: a mudança de status_atual feita
--      pelo vendedor só passa quando vem do trigger sync_caso_status
--      (pg_trigger_depth() > 1). A policy casos_update já deixa o vendedor
--      dono dar UPDATE no caso (para o prazo_vigencia) — sem essa checagem
--      ele poderia trocar status_atual direto, sem linha no histórico.
-- E o histórico deixa de marcar "via delegação" para quem não tem
-- delegação (antes: todo não-admin era marcado, o que só era verdade
-- porque só gerente delegado chegava lá).
-- ============================================================================

create function public.auth_pode_avancar_status(p_caso_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.casos c
    where c.id = p_caso_id
      and (
        public.auth_is_admin()
        or (c.filial = public.auth_filial() and public.auth_has_delegacao_ativa())
        or (
          public.auth_perfil() = 'vendedor'
          and c.vendedor_dono = auth.uid()
          and public.auth_pode_ver_caso(c.id)
        )
      )
  );
$$;

comment on function public.auth_pode_avancar_status(uuid) is
  'Quem pode inserir em status_historico (avançar status): admin; gerente com delegação ativa na própria filial; vendedor dono do caso (desde 20261006000002). Ouvidoria segue exclusiva do admin na policy.';

-- ----------------------------------------------------------------------------
-- status_historico_insert
-- ----------------------------------------------------------------------------

drop policy status_historico_insert on public.status_historico;

create policy status_historico_insert
  on public.status_historico for insert to authenticated
  with check (
    status <> 'inicial'
    and public.auth_pode_avancar_status(status_historico.caso_id)
    and (status <> 'ouvidoria' or public.auth_is_admin())
  );

-- ----------------------------------------------------------------------------
-- Autoria no histórico: alterado_por já era sempre auth.uid(); via_delegacao
-- agora só é verdadeiro para quem de fato tem delegação ativa.
-- ----------------------------------------------------------------------------

create or replace function public.set_status_historico_audit()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status <> 'inicial' then
    new.alterado_por := auth.uid();
    new.via_delegacao := (not public.auth_is_admin() and public.auth_has_delegacao_ativa());
  end if;
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- enforce_casos_update_permissions — mesma função de 20260725000001, só o
-- caminho de mudança de status_atual muda (ver cabeçalho, item 3).
-- ----------------------------------------------------------------------------

create or replace function public.enforce_casos_update_permissions()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_outros_campos_iguais boolean;
begin
  if new.caso_teste is distinct from old.caso_teste and not public.auth_is_adm_master() then
    raise exception 'Alteração não permitida para este perfil neste caso.';
  end if;

  if public.auth_is_admin() then
    return new;
  end if;

  v_outros_campos_iguais := (
    new.tipo_caso is not distinct from old.tipo_caso
    and new.motivo is not distinct from old.motivo
    and new.descricao is not distinct from old.descricao
    and new.filial is not distinct from old.filial
    and new.vendedor_dono is not distinct from old.vendedor_dono
    and new.vendedor_original_nome is not distinct from old.vendedor_original_nome
    and new.criado_por is not distinct from old.criado_por
    and new.contrato_numero is not distinct from old.contrato_numero
    and new.cliente_nome is not distinct from old.cliente_nome
    and new.cliente_cpf is not distinct from old.cliente_cpf
    and new.parcelas_em_aberto is not distinct from old.parcelas_em_aberto
    and new.data_cancelamento is not distinct from old.data_cancelamento
  );

  if v_outros_campos_iguais
    and new.status_atual is distinct from old.status_atual
    and new.prazo_vigencia is not distinct from old.prazo_vigencia
    and (
      public.auth_can_drive_flow()
      -- Vendedor: só como efeito do insert em status_historico (sync_caso_status).
      or (pg_trigger_depth() > 1 and public.auth_pode_avancar_status(new.id))
    )
  then
    return new;
  end if;

  if v_outros_campos_iguais
    and new.prazo_vigencia is distinct from old.prazo_vigencia
    and new.status_atual is not distinct from old.status_atual
  then
    return new; -- RLS já restringe este caminho a vendedor_dono = auth.uid()
  end if;

  raise exception 'Alteração não permitida para este perfil neste caso.';
end;
$$;
