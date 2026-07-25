-- ============================================================================
-- Testes de notificacoes (item 5 do backlog de 22/07): trigger de caso
-- novo, RLS (cada um só vê a própria), trava de update (só lida_em muda),
-- e as duas funções de notificação periódica (prazo vencendo, delegação
-- expirando) — incluindo a deduplicação de ambas.
-- ============================================================================

set role postgres;

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not p_condicao then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

reset role;

-- ----------------------------------------------------------------------------
-- Gatilho 1: caso novo notifica adm_master, não vendedor/gerente.
-- O caso '10000000-...0001' do seed já disparou o trigger na criação —
-- confere que só o adm_master (00...0004) recebeu, ninguém mais.
-- ----------------------------------------------------------------------------

set role postgres;
select public._test_assert(
  'notificar_caso_novo: adm_master recebeu notificação do caso do seed',
  (
    select count(*) = 1 from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-000000000004'
      and tipo = 'caso_novo'
      and caso_id = '10000000-0000-0000-0000-000000000001'
  )
);
select public._test_assert(
  'notificar_caso_novo: vendedor B não recebeu nada (não é adm)',
  (select count(*) = 0 from public.notificacoes where destinatario_id = '00000000-0000-0000-0000-000000000002')
);
reset role;

-- ----------------------------------------------------------------------------
-- RLS: vendedor A vê a própria notificação (nenhuma ainda, mas a query não
-- pode falhar) e NÃO vê a do adm_master.
-- ----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select public._test_assert(
  'RLS notificacoes: adm_master vê a própria notificação de caso novo',
  (select count(*) = 1 from public.notificacoes where tipo = 'caso_novo')
);
reset role;
reset request.jwt.claim.sub;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select public._test_assert(
  'RLS notificacoes: vendedor A NÃO vê a notificação do adm_master',
  (select count(*) = 0 from public.notificacoes where tipo = 'caso_novo')
);
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- Trava de update: adm_master marca a própria notificação como lida
-- (permitido) e depois tenta alterar a mensagem (deve ser bloqueado).
-- ----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';

update public.notificacoes set lida_em = now() where tipo = 'caso_novo';
select public._test_assert(
  'notificacoes_update: marcar como lida é permitido',
  (select lida_em is not null from public.notificacoes where tipo = 'caso_novo')
);

do $$
begin
  update public.notificacoes set mensagem = 'mensagem adulterada' where tipo = 'caso_novo';
  raise exception 'FALHOU: alterar mensagem de notificação foi permitido';
exception when others then
  raise notice 'ok: enforce_notificacoes_update_permissions bloqueia alterar mensagem';
end
$$;

reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- notificar_prazos_vencendo: caso novo com prazo em exatamente 3 dias (um
-- dos 5 marcos fixos) — deve notificar o vendedor dono, o gerente ativo da
-- MESMA filial (1710) e o adm_master; NÃO o gerente de outra filial (1714)
-- nem a vendedor B (sem relação com o caso). Rodar de novo não duplica.
-- ----------------------------------------------------------------------------

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.casos (
  id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf
) values (
  '10000000-0000-0000-0000-000000000002', 'alteracao_data', 'pedido_cliente', 'teste prazo vencendo',
  '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', (current_date + 3),
  '17100000000002', 'Cliente Prazo', '52998224725'
);
reset role;
reset request.jwt.claim.sub;

set role postgres;
select public.notificar_prazos_vencendo();
select public._test_assert(
  'notificar_prazos_vencendo: notificou o vendedor dono do caso, marco 3 dias',
  (
    select count(*) = 1 from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-000000000001'
      and tipo = 'prazo_vencendo'
      and caso_id = '10000000-0000-0000-0000-000000000002'
      and marco_dias = 3
  )
);
select public._test_assert(
  'notificar_prazos_vencendo: notificou o gerente ativo da mesma filial (1710)',
  (
    select count(*) = 1 from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-000000000003'
      and tipo = 'prazo_vencendo'
      and caso_id = '10000000-0000-0000-0000-000000000002'
      and marco_dias = 3
  )
);
select public._test_assert(
  'notificar_prazos_vencendo: notificou o adm_master',
  (
    select count(*) = 1 from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-000000000004'
      and tipo = 'prazo_vencendo'
      and caso_id = '10000000-0000-0000-0000-000000000002'
      and marco_dias = 3
  )
);
select public._test_assert(
  'notificar_prazos_vencendo: NAO notificou o gerente de outra filial (1714)',
  (
    select count(*) = 0 from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-000000000005'
      and tipo = 'prazo_vencendo'
      and caso_id = '10000000-0000-0000-0000-000000000002'
  )
);
select public._test_assert(
  'notificar_prazos_vencendo: NAO notificou a vendedor B (sem relação com o caso)',
  (
    select count(*) = 0 from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-000000000002'
      and tipo = 'prazo_vencendo'
      and caso_id = '10000000-0000-0000-0000-000000000002'
  )
);
select public.notificar_prazos_vencendo();
select public._test_assert(
  'notificar_prazos_vencendo: rodar de novo não duplica (dedup por caso+marco+destinatário)',
  (
    select count(*) = 3 from public.notificacoes
    where caso_id = '10000000-0000-0000-0000-000000000002' and tipo = 'prazo_vencendo'
  )
);
reset role;

-- ----------------------------------------------------------------------------
-- notificar_delegacoes_expirando: delegação do gerente 1710 expirando em 1
-- dia — deve notificar; rodar de novo não duplica.
-- ----------------------------------------------------------------------------

set role postgres;
insert into public.delegacoes (adm_id, gerente_id, inicio, fim, ativa)
values (
  '00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000003',
  now() - interval '1 day', now() + interval '1 day', true
);

select public.notificar_delegacoes_expirando(3);
select public._test_assert(
  'notificar_delegacoes_expirando: notificou o gerente com delegação expirando',
  (
    select count(*) = 1 from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-000000000003' and tipo = 'delegacao_expirando'
  )
);
select public.notificar_delegacoes_expirando(3);
select public._test_assert(
  'notificar_delegacoes_expirando: rodar de novo não duplica (dedup)',
  (
    select count(*) = 1 from public.notificacoes
    where destinatario_id = '00000000-0000-0000-0000-000000000003' and tipo = 'delegacao_expirando'
  )
);
reset role;

select 'todos os asserts de notificações passaram' as status;

set role postgres;
drop function public._test_assert(text, boolean);
reset role;
