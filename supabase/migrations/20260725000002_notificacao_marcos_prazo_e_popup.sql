-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: notificação de prazo por marcos (30/15/7/3/1 dias) + audiência
-- ampliada, base pro pop-up (item novo, 25/07)
--
-- Substitui notificar_prazos_vencendo(p_dias_antecedencia) — que notificava
-- só o vendedor dono, uma vez por caso, dentro de uma janela configurável —
-- por uma versão com 5 marcos fixos (cada um dispara uma vez por caso por
-- destinatário) e audiência maior: vendedor dono, gerentes ativos da filial
-- do caso, e todo adm/adm_master ativo. Continua nunca considerando um
-- caso marcado como teste (caso_teste, ver 20260725000001).
--
-- marco_dias (novo, em notificacoes) guarda qual marco disparou aquela
-- notificação — é o que permite deduplicar por marco em vez de por caso
-- (o comportamento antigo bloqueava qualquer notificação nova pro mesmo
-- caso depois da primeira, mesmo que fosse um marco diferente e mais
-- urgente).
-- ============================================================================

alter table public.notificacoes add column marco_dias integer;

comment on column public.notificacoes.marco_dias is
  'Só usado quando tipo=prazo_vencendo — qual marco (30/15/7/3/1 dias) disparou esta notificação. Base da deduplicação por (caso_id, marco_dias, destinatario_id) em notificar_prazos_vencendo().';

-- enforce_notificacoes_update_permissions precisa proteger a coluna nova
-- também — senão o destinatário poderia reescrever marco_dias na própria
-- notificação (a mesma lacuna que a versão original já evitava pras outras
-- colunas).
create or replace function public.enforce_notificacoes_update_permissions()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (
    old.destinatario_id, old.tipo, old.mensagem, old.caso_id, old.marco_dias, old.criado_em
  ) is distinct from (
    new.destinatario_id, new.tipo, new.mensagem, new.caso_id, new.marco_dias, new.criado_em
  ) then
    raise exception 'Só o campo lida_em pode ser alterado em notificacoes.';
  end if;
  return new;
end;
$$;

drop function if exists public.notificar_prazos_vencendo(integer);

create function public.notificar_prazos_vencendo()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.notificacoes (destinatario_id, tipo, mensagem, caso_id, marco_dias)
  select candidatos.destinatario_id, 'prazo_vencendo', candidatos.mensagem, candidatos.caso_id, candidatos.marco_dias
  from (
    select
      u.id as destinatario_id,
      c.id as caso_id,
      m.marco as marco_dias,
      format('Caso #%s vence em %s dia(s) (%s)', c.protocolo, m.marco, to_char(c.prazo_vigencia, 'DD/MM/YYYY')) as mensagem
    from public.casos c
    cross join (select unnest(array[30, 15, 7, 3, 1]) as marco) m
    join public.usuarios u on (
      u.ativo
      and (
        u.id = c.vendedor_dono
        or (u.perfil = 'gerente' and u.filial = c.filial)
        or u.perfil in ('adm', 'adm_master')
      )
    )
    where not c.caso_teste
      and c.prazo_vigencia - current_date = m.marco
  ) candidatos
  where not exists (
    select 1 from public.notificacoes n
    where n.caso_id = candidatos.caso_id
      and n.tipo = 'prazo_vencendo'
      and n.marco_dias = candidatos.marco_dias
      and n.destinatario_id = candidatos.destinatario_id
  );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.notificar_prazos_vencendo() is
  'Chamar diariamente (via pg_cron, ainda não agendado — mesma ressalva operacional dos outros gatilhos periódicos) para notificar, a 30/15/7/3/1 dias do vencimento, o vendedor dono, os gerentes ativos da filial do caso e todo adm/adm_master ativo — uma vez por (caso, marco, destinatário).';
