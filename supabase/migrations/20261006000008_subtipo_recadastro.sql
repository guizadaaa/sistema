-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: subtipos do tipo de caso "Recadastro"
--
-- O valor do enum tipo_caso continua 'recadastro_sem_reserva' (só o rótulo
-- na tela vira "Recadastro"). Não confundir com tipo_desfecho 'recadastro'.
--
-- Novo enum subtipo_recadastro e coluna casos.subtipo_recadastro:
--   - obrigatório na CRIAÇÃO de um caso de Recadastro (trigger BEFORE
--     INSERT casos_exige_subtipo_recadastro);
--   - NULL em todos os outros tipos (constraint casos_subtipo_recadastro_por_tipo,
--     que aceita NULL, então não invalida nenhuma linha antiga);
--   - casos de Recadastro antigos ficam com NULL e seguem editáveis e
--     atualizáveis (status, prazo, admin): a trigger só olha INSERT e, no
--     UPDATE, só impede APAGAR um subtipo já preenchido.
--
-- Por que não em casos_campos_por_tipo: exigir subtipo ali (CHECK) invalida
-- os Recadastro antigos; e um CHECK NOT VALID ainda é verificado em todo
-- UPDATE da linha, quebrando a edição desses casos. A obrigatoriedade fica
-- na trigger de INSERT, alinhada ao zod (src/lib/validation/caso.ts:
-- subtipoRecadastro obrigatório só no schema de Recadastro).
--
-- Não-admin não altera o subtipo depois de criado
-- (enforce_casos_update_permissions). Idempotente.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subtipo_recadastro') then
    create type subtipo_recadastro as enum (
      'troca_passageiro',
      'inclusao_passageiro',
      'troca_fornecedor',
      'inclusao_servicos'
    );
  end if;
end
$$;

alter table public.casos add column if not exists subtipo_recadastro subtipo_recadastro;

comment on column public.casos.subtipo_recadastro is
  'Subtipo do Recadastro (tipo_caso = recadastro_sem_reserva). Obrigatório na criação desde 20261006000008; NULL nos casos antigos e nos demais tipos.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'casos_subtipo_recadastro_por_tipo') then
    alter table public.casos
      add constraint casos_subtipo_recadastro_por_tipo check (
        subtipo_recadastro is null or tipo_caso = 'recadastro_sem_reserva'
      );
  end if;
end
$$;

create or replace function public.exige_subtipo_recadastro()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.tipo_caso = 'recadastro_sem_reserva' and new.subtipo_recadastro is null then
      raise exception 'Selecione o subtipo do Recadastro.';
    end if;
  elsif old.subtipo_recadastro is not null and new.subtipo_recadastro is null
    and new.tipo_caso = 'recadastro_sem_reserva' then
    raise exception 'O subtipo do Recadastro não pode ser removido.';
  end if;
  return new;
end;
$$;

drop trigger if exists casos_exige_subtipo_recadastro on public.casos;
create trigger casos_exige_subtipo_recadastro
  before insert or update on public.casos
  for each row execute function public.exige_subtipo_recadastro();

-- ----------------------------------------------------------------------------
-- enforce_casos_update_permissions — mesma função de 20261006000007, só
-- acrescenta subtipo_recadastro à lista de campos que não-admin não altera.
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
    and new.subtipo_recadastro is not distinct from old.subtipo_recadastro
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

