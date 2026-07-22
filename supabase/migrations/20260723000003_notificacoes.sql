-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: notificações in-app (item 5 do backlog de 22/07)
--
-- Decisão confirmada com o cliente: nada de canal externo pago (e-mail/
-- WhatsApp) por ora — notificação fica dentro do próprio sistema. Sino no
-- header consulta esta tabela por polling (30s), sem Supabase Realtime: os
-- 3 gatilhos abaixo não têm nenhuma exigência de latência de segundos (dois
-- são avaliados uma vez por dia, o terceiro no momento da criação do caso),
-- então o custo de manter uma conexão websocket viva no client (reconexão,
-- expiração de token) não se paga aqui.
--
-- RLS: cada um só vê a própria notificação — mesmo padrão do resto do
-- schema. Sem policy de INSERT/DELETE para authenticated: notificação só
-- nasce via trigger/função SECURITY DEFINER, e nunca é apagada fisicamente
-- (mesma filosofia de casos/desfechos) — "lida" é um campo, não uma
-- exclusão.
-- ============================================================================

create type tipo_notificacao as enum ('prazo_vencendo', 'caso_novo', 'delegacao_expirando');

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.usuarios (id),
  tipo tipo_notificacao not null,
  mensagem text not null,
  caso_id uuid references public.casos (id) on delete set null,
  lida_em timestamptz,
  criado_em timestamptz not null default now()
);

create index notificacoes_destinatario_idx on public.notificacoes (destinatario_id, criado_em desc);

comment on table public.notificacoes is
  'Notificação in-app (item 5, 22/07) — sino no header, sem canal externo. caso_id é opcional (delegação expirando não referencia um caso).';

alter table public.notificacoes enable row level security;

create policy notificacoes_select
  on public.notificacoes for select to authenticated
  using (destinatario_id = auth.uid() and public.auth_ativo());

create policy notificacoes_update
  on public.notificacoes for update to authenticated
  using (destinatario_id = auth.uid() and public.auth_ativo())
  with check (destinatario_id = auth.uid() and public.auth_ativo());

-- Mesmo racional de enforce_casos_update_permissions: RLS garante que só o
-- destinatário mexe na própria notificação, mas sem essa trava ele também
-- poderia reescrever mensagem/tipo/caso_id da própria linha — só lida_em
-- deveria mudar.
create function public.enforce_notificacoes_update_permissions()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (
    old.destinatario_id, old.tipo, old.mensagem, old.caso_id, old.criado_em
  ) is distinct from (
    new.destinatario_id, new.tipo, new.mensagem, new.caso_id, new.criado_em
  ) then
    raise exception 'Só o campo lida_em pode ser alterado em notificacoes.';
  end if;
  return new;
end;
$$;

create trigger notificacoes_enforce_update_permissions
  before update on public.notificacoes
  for each row execute function public.enforce_notificacoes_update_permissions();

grant select, update on public.notificacoes to authenticated;
grant select, insert, update, delete on public.notificacoes to service_role;

-- ----------------------------------------------------------------------------
-- Gatilho 1 — caso novo criado: notifica adm/adm_master (evento real de
-- INSERT, não precisa de agendamento).
-- ----------------------------------------------------------------------------

create function public.notificar_caso_novo()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notificacoes (destinatario_id, tipo, mensagem, caso_id)
  select u.id, 'caso_novo',
    format('Novo caso #%s aberto por %s', new.protocolo, new.vendedor_original_nome),
    new.id
  from public.usuarios u
  where u.perfil in ('adm', 'adm_master') and u.ativo;
  return new;
end;
$$;

create trigger casos_notificar_novo
  after insert on public.casos
  for each row execute function public.notificar_caso_novo();

-- ----------------------------------------------------------------------------
-- Gatilho 2 — prazo de vigência a N dias de vencer: notifica o vendedor
-- dono do caso. "N dias" é parâmetro (default 3, fácil de ajustar sem nova
-- migration) — chamar de novo. Não é um trigger de INSERT/UPDATE (a
-- passagem do tempo não dispara nada sozinha): precisa ser CHAMADA
-- periodicamente. IMPORTANTE — esta migration só cria a função; agendá-la
-- via pg_cron não está incluído aqui (mesma decisão e mesmo motivo de
-- 20260720000001_retencao_anexos: extensão precisa ser habilitada e isso
-- envolve o dashboard do Supabase, não é seguro/possível só com uma
-- migration). Até lá, roda só se alguém chamar manualmente.
--
-- Deduplicação: uma vez que uma notificação de um tipo já existe para
-- aquele caso, não notifica de novo — evita notificar todo dia enquanto o
-- caso continuar dentro da janela de N dias. Limitação conhecida e aceita:
-- se o vendedor adiar prazo_vigencia depois de já ter sido notificado, e o
-- caso voltar a entrar na janela de N dias mais tarde, não há uma segunda
-- notificação (o Painel/"Casos que precisam de atenção" continua mostrando
-- isso de qualquer forma — a notificação é um alerta pontual, não a única
-- fonte de verdade).
-- ----------------------------------------------------------------------------

create function public.notificar_prazos_vencendo(p_dias_antecedencia integer default 3)
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
  where c.prazo_vigencia >= current_date
    and c.prazo_vigencia - current_date <= p_dias_antecedencia
    and not exists (
      select 1 from public.notificacoes n
      where n.caso_id = c.id and n.tipo = 'prazo_vencendo'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.notificar_prazos_vencendo(integer) is
  'Chamar periodicamente (via pg_cron, ainda não agendado — ver comentário acima) para notificar vendedores com prazo_vigencia a N dias de vencer.';

-- ----------------------------------------------------------------------------
-- Gatilho 3 — delegação prestes a expirar: notifica o gerente delegado.
-- Mesma natureza do gatilho 2 (precisa de chamada periódica, não agendada
-- nesta migration). Dedup por "já existe notificação criada depois do
-- início desta delegação" — cada linha de delegacoes tem seu próprio
-- `inicio`, então uma delegação nova pro mesmo gerente (inicio diferente)
-- não fica bloqueada pela notificação de uma delegação anterior já
-- encerrada.
-- ----------------------------------------------------------------------------

create function public.notificar_delegacoes_expirando(p_dias_antecedencia integer default 3)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.notificacoes (destinatario_id, tipo, mensagem)
  select d.gerente_id, 'delegacao_expirando',
    format('Sua delegação expira em %s', to_char(d.fim, 'DD/MM/YYYY "às" HH24:MI'))
  from public.delegacoes d
  where d.ativa
    and d.fim is not null
    and d.fim > now()
    and d.fim <= now() + make_interval(days => p_dias_antecedencia)
    and not exists (
      select 1 from public.notificacoes n
      where n.destinatario_id = d.gerente_id
        and n.tipo = 'delegacao_expirando'
        and n.criado_em >= d.inicio
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.notificar_delegacoes_expirando(integer) is
  'Chamar periodicamente (via pg_cron, ainda não agendado — ver comentário do gatilho 2) para notificar gerentes com delegação ativa a N dias de expirar.';
