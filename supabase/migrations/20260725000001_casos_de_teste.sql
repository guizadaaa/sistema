-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: categoria "Caso de teste", exclusiva do Adm Master
--
-- Objetivo: permitir que o Adm Master marque um caso como "teste" (dado
-- fabricado pra QA/demonstração, nunca um caso real de cliente) e que esse
-- caso fique estruturalmente invisível pra todo o resto do sistema — outros
-- perfis, métricas do Painel, notificações de prazo e o backup semanal —
-- sem depender de cada consumidor lembrar de filtrar.
--
-- Duas camadas, propositalmente diferentes:
--   1. RLS (auth_pode_ver_caso) — fronteira de segurança de verdade: um
--      caso com caso_teste=true nunca é visível via SELECT pra quem não é
--      adm_master, ponto final. Não é uma preferência de UI, é estrutural.
--   2. Filtro de aplicação (mostrarTeste, ver lib/casos/listar.ts) — mesmo
--      pra adm_master, casos de teste ficam ocultos por padrão nas listas;
--      só aparecem se ele ligar o toggle "Mostrar casos de teste" na tela.
--      Isso é preferência de exibição, não segurança — por isso vive na
--      query da aplicação, não na RLS (RLS não tem como saber se o toggle
--      da UI está ligado, e não deveria: um adm_master que sabe o ID de um
--      caso de teste sempre pode abri-lo direto, com ou sem o toggle).
-- ============================================================================

alter table public.casos add column caso_teste boolean not null default false;

comment on column public.casos.caso_teste is
  'Marca um caso como dado de teste/QA, nunca um caso real. Só adm_master marca/desmarca (ver enforce_casos_update_permissions). Estruturalmente invisível pra quem não é adm_master (ver auth_pode_ver_caso) e excluído de métricas, notificações de prazo e backup semanal.';

-- ----------------------------------------------------------------------------
-- auth_pode_ver_caso — estende a única fonte de verdade de visibilidade
-- (M1, 22/07) para também negar casos de teste a quem não é adm_master.
-- ----------------------------------------------------------------------------

create or replace function public.auth_pode_ver_caso(p_caso_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.casos c
    where c.id = p_caso_id
      and (not c.caso_teste or public.auth_is_adm_master())
      and (
        public.auth_is_admin()
        or (
          public.auth_ativo()
          and (c.vendedor_dono = auth.uid() or (public.auth_perfil() = 'gerente' and c.filial = public.auth_filial()))
        )
      )
  );
$$;

-- ----------------------------------------------------------------------------
-- enforce_casos_update_permissions — a coluna caso_teste só pode mudar de
-- valor se quem está atualizando for adm_master, mesmo dentro do bypass de
-- "auth_is_admin()" (que também cobre "adm", perfil que não deve poder
-- marcar/desmarcar teste).
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
    and public.auth_can_drive_flow()
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

-- ----------------------------------------------------------------------------
-- notificar_prazos_vencendo — nunca notifica sobre um caso de teste.
-- ----------------------------------------------------------------------------

create or replace function public.notificar_prazos_vencendo(p_dias_antecedencia integer default 3)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.notificacoes (destinatario_id, tipo, mensagem, caso_id)
  select c.vendedor_dono, 'prazo_vencendo',
    format('Caso #%s vence em %s dia(s) (%s)', c.protocolo, (c.prazo_vigencia - current_date), to_char(c.prazo_vigencia, 'DD/MM/YYYY')),
    c.id
  from public.casos c
  where not c.caso_teste
    and c.prazo_vigencia >= current_date
    and c.prazo_vigencia - current_date <= p_dias_antecedencia
    and not exists (
      select 1 from public.notificacoes n
      where n.caso_id = c.id and n.tipo = 'prazo_vencendo'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
