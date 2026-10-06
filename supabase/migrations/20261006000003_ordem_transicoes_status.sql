-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: ordem das transições de status imposta no banco
--
-- Até aqui a ordem só existia na tela (src/lib/casos/status.ts): quem podia
-- avançar status (admin, gerente delegado, vendedor dono) conseguia, pela
-- API, pular etapas ou reabrir um caso Resolvido. Esta trigger BEFORE
-- INSERT em status_historico valida a transição a partir do status vigente
-- do caso (casos.status_atual, espelho do último item — sync_caso_status):
--
--   Inicial → Recepcionado → Em andamento interno
--   Em andamento interno → Reavaliação | Ouvidoria | Resolvido
--   Reavaliação → Resolvido
--   Ouvidoria → Resolvido (Ouvidoria em si: só admin)
--   Resolvido → (ninguém), EXCETO admin: Em andamento interno | Reavaliação
--   Mesmo status repetido: sempre recusado.
--
-- Inicial: só pode ser o PRIMEIRO item do caso (trigger insert_status_inicial
-- na criação) — único outro ponto que insere em status_historico além da
-- server action avancarStatus. Transferência de casos, casos de teste,
-- rotinas (pg_cron/pg_net) e Edge Functions não inserem status.
--
-- Quem não pode avançar status neste caso (auth_pode_avancar_status falso)
-- passa direto pela trigger e é barrado pela RLS (status_historico_insert),
-- com a mensagem genérica de sempre — a trigger não revela o status atual
-- de um caso a quem nem o enxerga.
--
-- Não reescreve histórico existente: vale só para inserts novos. Para
-- conferir se há histórico antigo fora da ordem, ver a consulta no final
-- deste arquivo (comentada — é diagnóstico, não correção).
-- ============================================================================

create function public.rotulo_status_caso(p_status status_caso)
returns text
language sql immutable
as $$
  select case p_status
    when 'inicial' then 'Inicial'
    when 'recepcionado' then 'Recepcionado'
    when 'em_andamento_interno' then 'Em andamento interno'
    when 'reavaliacao' then 'Reavaliação'
    when 'ouvidoria' then 'Ouvidoria'
    when 'resolvido' then 'Resolvido'
  end;
$$;

create function public.validar_transicao_status()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_atual status_caso;
  v_permitidos status_caso[];
begin
  if new.status = 'inicial' then
    if exists (select 1 from public.status_historico where caso_id = new.caso_id) then
      raise exception 'O status Inicial só é registrado na criação do caso.';
    end if;
    return new;
  end if;

  -- Sem permissão neste caso: a RLS recusa logo em seguida, sem detalhes.
  if not public.auth_pode_avancar_status(new.caso_id) then
    return new;
  end if;

  -- Trava a linha do caso: duas transições simultâneas não partem do mesmo status.
  select status_atual into v_atual from public.casos where id = new.caso_id for update;

  if new.status = v_atual then
    raise exception 'O caso já está em %.', public.rotulo_status_caso(v_atual);
  end if;

  if new.status = 'ouvidoria' and not public.auth_is_admin() then
    raise exception 'Somente o adm pode mover um caso para Ouvidoria.';
  end if;

  v_permitidos := case v_atual
    when 'inicial' then array['recepcionado']::status_caso[]
    when 'recepcionado' then array['em_andamento_interno']::status_caso[]
    when 'em_andamento_interno' then array['reavaliacao', 'ouvidoria', 'resolvido']::status_caso[]
    when 'reavaliacao' then array['resolvido']::status_caso[]
    when 'ouvidoria' then array['resolvido']::status_caso[]
    when 'resolvido' then
      case when public.auth_is_admin()
        then array['em_andamento_interno', 'reavaliacao']::status_caso[]
        else array[]::status_caso[]
      end
  end;

  if not (new.status = any (v_permitidos)) then
    if v_atual = 'resolvido' then
      raise exception 'Caso Resolvido não pode mudar de status. Somente o adm pode reabri-lo, para Em andamento interno ou Reavaliação.';
    end if;
    raise exception 'Transição de status inválida: de % não é possível ir para %.',
      public.rotulo_status_caso(v_atual), public.rotulo_status_caso(new.status);
  end if;

  return new;
end;
$$;

comment on function public.validar_transicao_status() is
  'BEFORE INSERT em status_historico: impõe a ordem das transições (ver cabeçalho de 20261006000003). Reabrir Resolvido só admin.';

-- Nome começa com "a_" para rodar antes das demais BEFORE INSERT (Postgres
-- dispara em ordem alfabética): a ordem é checada antes de
-- impede_resolvido_sem_comentario e de set_status_historico_audit.
create trigger a_status_historico_valida_transicao
  before insert on public.status_historico
  for each row execute function public.validar_transicao_status();

-- ----------------------------------------------------------------------------
-- Diagnóstico (não executado): histórico existente fora da ordem.
--
-- with h as (
--   select caso_id, status, entrou_em,
--          lag(status) over (partition by caso_id order by entrou_em, id) as anterior
--   from public.status_historico
-- )
-- select h.* from h
-- where (anterior is null and status <> 'inicial')
--    or (anterior is not null and not (
--         (anterior = 'inicial' and status = 'recepcionado')
--      or (anterior = 'recepcionado' and status = 'em_andamento_interno')
--      or (anterior = 'em_andamento_interno' and status in ('reavaliacao', 'ouvidoria', 'resolvido'))
--      or (anterior in ('reavaliacao', 'ouvidoria') and status = 'resolvido')
--      or (anterior = 'resolvido' and status in ('em_andamento_interno', 'reavaliacao'))
--    ))
-- order by caso_id, entrou_em;
-- ----------------------------------------------------------------------------
