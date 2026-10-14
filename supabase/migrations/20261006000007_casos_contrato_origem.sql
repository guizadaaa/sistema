-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: "Contrato de origem" nos casos de cancelamento
--
-- Campo opcional, só nos tipos de cancelamento do enum tipo_caso:
-- 'cancelamento' e 'inadimplencia' (rótulo "Cancelamento por
-- inadimplência"). Mesmo formato de casos.contrato_numero (14 dígitos).
--
-- Por que coluna em casos e não uma linha em casos_contratos_adicionais:
-- contrato adicional é "outro contrato que também faz parte deste caso"
-- (N por caso, para qualquer tipo); contrato de origem é UM atributo com
-- significado próprio ("de qual contrato veio o cancelamento"), opcional e
-- exclusivo de cancelamento. Misturar os dois numa tabela exigiria uma
-- coluna de "papel" e perderia o "no máximo um". Na busca, os dois entram
-- no mesmo filtro de contrato, então ninguém precisa saber onde está.
--
-- RLS: é coluna de casos, então vale exatamente a RLS do caso. Não-admin
-- não altera depois de criado: enforce_casos_update_permissions passa a
-- comparar contrato_origem junto dos demais campos imutáveis (sem isso, o
-- vendedor dono, que tem UPDATE em casos para o prazo, poderia trocá-lo).
--
-- Constraints novas aceitam NULL, então não invalidam nenhum caso antigo.
-- Idempotente.
-- ============================================================================

alter table public.casos add column if not exists contrato_origem text;

comment on column public.casos.contrato_origem is
  'Contrato de origem do cancelamento (opcional, só tipos cancelamento/inadimplencia, 14 dígitos).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'casos_contrato_origem_formato') then
    alter table public.casos
      add constraint casos_contrato_origem_formato check (contrato_origem is null or contrato_origem ~ '^\d{14}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'casos_contrato_origem_por_tipo') then
    alter table public.casos
      add constraint casos_contrato_origem_por_tipo check (
        contrato_origem is null or tipo_caso in ('cancelamento', 'inadimplencia')
      );
  end if;
end
$$;

create index if not exists casos_contrato_origem_idx on public.casos (contrato_origem);

-- ----------------------------------------------------------------------------
-- enforce_casos_update_permissions — mesma função de 20261006000002, só
-- acrescenta contrato_origem à lista de campos que não-admin não altera.
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
    and new.contrato_origem is not distinct from old.contrato_origem
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

