-- ============================================================================
-- Migrations 20261119000001..2: vínculo automático no mapeamento do Systur
-- (+ sugestões e vínculo em lote) e calendário sem cobrança retroativa.
-- ============================================================================

set role postgres;

\ir ../migrations/20261119000001_mapeamento_vinculo_automatico.sql
\ir ../migrations/20261119000002_calendario_sem_cobranca_retroativa.sql

create or replace function public._test_assert(p_rotulo text, p_condicao boolean)
returns void
language plpgsql
as $$
begin
  if not coalesce(p_condicao, false) then
    raise exception 'FALHOU: %', p_rotulo;
  end if;
  raise notice 'ok: %', p_rotulo;
end;
$$;

create or replace function pg_temp.mapa(p_loja text, p_nome text)
returns public.systur_vendedor_mapeamento
language sql
as $$ select * from public.systur_vendedor_mapeamento where loja = p_loja::filial_cvc and nome_systur = p_nome $$;

reset request.jwt.claim.sub;

insert into auth.users (id, email, raw_user_meta_data) values
  ('42000000-0000-0000-0000-000000000001', 'marcia42@teste.com', '{"nome_completo":"Márcia Acentuada Quarenta","perfil":"vendedor","filial":"1710"}'),
  ('42000000-0000-0000-0000-000000000002', 'otavio42@teste.com', '{"nome_completo":"Otávio Robô Quarenta","perfil":"vendedor","filial":"1714"}'),
  ('42000000-0000-0000-0000-000000000003', 'pedro42a@teste.com', '{"nome_completo":"Pedro Homonimo Quarenta","perfil":"vendedor","filial":"1710"}'),
  ('42000000-0000-0000-0000-000000000004', 'pedro42b@teste.com', '{"nome_completo":"Pedro Homônimo Quarenta","perfil":"vendedor","filial":"1714"}'),
  ('42000000-0000-0000-0000-000000000005', 'gui42@teste.com', '{"nome_completo":"Guilherme Luz","perfil":"vendedor","filial":"1714"}'),
  ('42000000-0000-0000-0000-000000000006', 'talita42@teste.com', '{"nome_completo":"Talita Moraes Quarenta","perfil":"vendedor","filial":"1714"}'),
  ('00000000-0000-0000-0000-000000000006', 'adm@teste.com', '{"nome_completo":"Adm","perfil":"adm"}')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 1. Nome igual ao de um único usuário ativo: vínculo automático
-- ----------------------------------------------------------------------------

-- Sync da extensão (nome sem acento e em outra caixa).
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "versao_extensao": "0.12.0", "login_systur": "SPBG0007", "loja": "1710",
  "consulta": { "tipo": "saida", "de": "2030-01-01", "ate": "2030-01-31" },
  "excursoes": [
    { "reserva": "R42-SYNC-1", "excursao": "42.1.1", "vendedor_systur": "MARCIA ACENTUADA QUARENTA",
      "contratantes": [{ "pessoa_id": "42001", "nome": "Cliente Da Marcia" }], "data_confirmacao": "2030-01-02" },
    { "reserva": "R42-SYNC-2", "excursao": "42.1.2", "vendedor_systur": "Pedro Homonimo Quarenta",
      "contratantes": [{ "pessoa_id": "42002", "nome": "Cliente Do Pedro" }], "data_confirmacao": "2030-01-03" }
  ]
}$json$::jsonb) as sync42 \gset

select public._test_assert('sync: nome igual (sem acento/caixa) vincula automaticamente',
  (select usuario_id = '42000000-0000-0000-0000-000000000001' and vinculo_origem = 'automatico'
   from pg_temp.mapa('1710', 'MARCIA ACENTUADA QUARENTA')));
select public._test_assert('sync: a reserva já sai com o vendedor e o nome não fica em "sem vínculo"',
  (select vendedor_usuario_id = '42000000-0000-0000-0000-000000000001' from public.cliente_excursoes where reserva = 'R42-SYNC-1')
  and not (:'sync42'::jsonb -> 'vendedores_sem_vinculo') ? 'MARCIA ACENTUADA QUARENTA');
select public._test_assert('auditoria: "vínculo automático: <nome Systur> → <usuário>"',
  exists (select 1 from public.auditoria a
          where a.tabela = 'systur_vendedor_mapeamento'
            and a.registro_id = (pg_temp.mapa('1710', 'MARCIA ACENTUADA QUARENTA')).id
            and a.dados_novos ->> 'descricao' = 'vínculo automático: MARCIA ACENTUADA QUARENTA → Márcia Acentuada Quarenta'));

-- Bot (conferencia_base).
select public.conferencia_base('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1714", "janela": { "de": "2030-02-01", "ate": "2030-02-28" },
  "reservas": [
    { "reserva": "R42-BOT-1", "vendedor_systur": "Otavio Robo Quarenta", "data_confirmacao": "2030-01-10", "data_viagem": "2030-02-10",
      "contratantes": [ { "pessoa_id": "42010", "nome": "Cliente Do Otavio", "valor": 100 } ] },
    { "reserva": "R42-BOT-2", "vendedor_systur": "Pedro Homonimo Quarenta", "data_confirmacao": "2030-01-11", "data_viagem": "2030-02-11",
      "contratantes": [ { "pessoa_id": "42011", "nome": "Cliente Do Pedro 2", "valor": 100 } ] },
    { "reserva": "R42-BOT-3", "vendedor_systur": "Guilherme A De Macedo Luz", "data_confirmacao": "2030-01-12", "data_viagem": "2030-02-12",
      "contratantes": [ { "pessoa_id": "42012", "nome": "Cliente Do Gui", "valor": 100 } ] },
    { "reserva": "R42-BOT-4", "vendedor_systur": "Thalita Moraes Quarenta", "data_confirmacao": "2030-01-13", "data_viagem": "2030-02-13",
      "contratantes": [ { "pessoa_id": "42013", "nome": "Cliente Da Thalita", "valor": 100 } ] }
  ]
}$json$::jsonb);

select public._test_assert('bot: nome igual vincula automaticamente',
  (select usuario_id = '42000000-0000-0000-0000-000000000002' and vinculo_origem = 'automatico'
   from pg_temp.mapa('1714', 'Otavio Robo Quarenta')));

-- ----------------------------------------------------------------------------
-- 2. Nome igual a dois usuários: não vincula, vira sugestão
-- ----------------------------------------------------------------------------

select public._test_assert('homônimos: não vincula (sync e bot)',
  (select usuario_id is null and vinculo_origem is null from pg_temp.mapa('1710', 'Pedro Homonimo Quarenta'))
  and (select usuario_id is null from pg_temp.mapa('1714', 'Pedro Homonimo Quarenta')));

create temp table _sug42 (nome text, loja text, usuario_id uuid, criterio text, posicao int, forte boolean);
grant insert on _sug42 to authenticated;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
insert into _sug42
select m.nome_systur, m.loja, s.usuario_id, s.criterio, s.posicao, s.forte
from public.systur_sugestoes_usuarios(null) s
join public.systur_vendedor_mapeamento m on m.id = s.mapeamento_id;
reset role;

select public._test_assert('homônimos: os dois aparecem como sugestão (nome igual), nenhuma forte',
  (select count(*) = 2 and bool_and(criterio = 'nome_igual') and not bool_or(forte)
   from _sug42 where nome = 'Pedro Homonimo Quarenta' and loja = '1714'));
select public._test_assert('homônimos: o da mesma loja vem primeiro',
  (select usuario_id = '42000000-0000-0000-0000-000000000004' from _sug42
   where nome = 'Pedro Homonimo Quarenta' and loja = '1714' and posicao = 1));
select public._test_assert('sugestão forte: mesmo primeiro nome + sobrenome em comum ("Guilherme A De Macedo Luz" × "Guilherme Luz")',
  (select usuario_id = '42000000-0000-0000-0000-000000000005' and criterio = 'nome_sobrenome' and forte
   from _sug42 where nome = 'Guilherme A De Macedo Luz' and posicao = 1));
select public._test_assert('sugestão por similaridade (pg_trgm): "Thalita" × "Talita", não forte',
  (select usuario_id = '42000000-0000-0000-0000-000000000006' and criterio = 'parecido' and not forte
   from _sug42 where nome = 'Thalita Moraes Quarenta' and posicao = 1));
select public._test_assert('sugestões: no máximo 3 por nome e só para nome sem vínculo',
  (select max(c) <= 3 from (select count(*) c from _sug42 group by nome, loja) x)
  and not exists (select 1 from _sug42 where nome in ('MARCIA ACENTUADA QUARENTA', 'Otavio Robo Quarenta')));

-- ----------------------------------------------------------------------------
-- 3. Desvínculo manual impede a volta do vínculo automático
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
update public.systur_vendedor_mapeamento set usuario_id = null
where loja = '1710' and nome_systur = 'MARCIA ACENTUADA QUARENTA';
reset role;
reset request.jwt.claim.sub;

select public._test_assert('desvincular: origem limpa e nome bloqueado',
  (select usuario_id is null and vinculo_origem is null and vinculo_automatico_bloqueado
   from pg_temp.mapa('1710', 'MARCIA ACENTUADA QUARENTA')));
select public.systur_vincular_automatico(null);
-- (usuarios_log_auditoria exige quem fez: claim do adm_master)
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
update public.usuarios set nome_completo = 'Marcia Acentuada Quarenta' where id = '42000000-0000-0000-0000-000000000001';
reset request.jwt.claim.sub;
select public._test_assert('desvinculado: nem o reprocessamento nem a edição do usuário vinculam de novo',
  (select usuario_id is null from pg_temp.mapa('1710', 'MARCIA ACENTUADA QUARENTA')));

-- Vínculo pela tela vira "manual".
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
update public.systur_vendedor_mapeamento set usuario_id = '42000000-0000-0000-0000-000000000001'
where loja = '1710' and nome_systur = 'MARCIA ACENTUADA QUARENTA';
reset role;
reset request.jwt.claim.sub;
select public._test_assert('vínculo pela tela: origem manual',
  (select vinculo_origem = 'manual' from pg_temp.mapa('1710', 'MARCIA ACENTUADA QUARENTA')));

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  set local role authenticated;
  update public.systur_vendedor_mapeamento set vinculo_origem = 'automatico' where nome_systur = 'MARCIA ACENTUADA QUARENTA';
  raise exception 'FALHOU: vinculo_origem editável pelo cliente';
exception when insufficient_privilege then
  raise notice 'ok: vinculo_origem e bloqueio só mudam pelos triggers';
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. Usuário criado ou reativado vincula os nomes que estavam sem vínculo
-- ----------------------------------------------------------------------------

insert into public.systur_vendedor_mapeamento (nome_systur, loja) values
  ('Nina Futura Quarenta', '1714'), ('Rafa Volta Quarenta', '1730')
on conflict do nothing;
select public._test_assert('sem usuário: entra sem vínculo',
  (select usuario_id is null from pg_temp.mapa('1714', 'Nina Futura Quarenta')));

insert into auth.users (id, email, raw_user_meta_data) values
  ('42000000-0000-0000-0000-000000000007', 'nina42@teste.com', '{"nome_completo":"Nina Futura Quarenta","perfil":"vendedor","filial":"1714"}');
select public._test_assert('usuário criado: vincula o nome igual que estava sem vínculo',
  (select usuario_id = '42000000-0000-0000-0000-000000000007' and vinculo_origem = 'automatico'
   from pg_temp.mapa('1714', 'Nina Futura Quarenta')));
select public._test_assert('auditoria sem usuário logado: realizado_por = o próprio vinculado',
  (select realizado_por = '42000000-0000-0000-0000-000000000007' from public.auditoria
   where registro_id = (pg_temp.mapa('1714', 'Nina Futura Quarenta')).id));

-- Rafa: gerente (inativar vendedor exige gerente na loja — regra de casos).
alter table public.usuarios disable trigger usuarios_vincular_systur;
insert into auth.users (id, email, raw_user_meta_data) values
  ('42000000-0000-0000-0000-000000000008', 'rafa42@teste.com', '{"nome_completo":"Rafa Volta Quarenta","perfil":"gerente","filial":"1730"}');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
update public.usuarios set ativo = false where id = '42000000-0000-0000-0000-000000000008';
reset request.jwt.claim.sub;
alter table public.usuarios enable trigger usuarios_vincular_systur;
select public._test_assert('usuário inativo: não vincula',
  (select usuario_id is null from pg_temp.mapa('1730', 'Rafa Volta Quarenta')));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
update public.usuarios set ativo = true where id = '42000000-0000-0000-0000-000000000008';
reset request.jwt.claim.sub;
select public._test_assert('usuário reativado: vincula o nome igual sem vínculo (auditoria com quem reativou)',
  (select usuario_id = '42000000-0000-0000-0000-000000000008' and vinculo_origem = 'automatico'
   from pg_temp.mapa('1730', 'Rafa Volta Quarenta'))
  and (select realizado_por = '00000000-0000-0000-0000-000000000004' from public.auditoria
       where registro_id = (pg_temp.mapa('1730', 'Rafa Volta Quarenta')).id));

-- ----------------------------------------------------------------------------
-- 5. Migration: vincula uma vez os nomes que já existem
-- ----------------------------------------------------------------------------

insert into public.systur_vendedor_mapeamento (nome_systur, loja) values ('Bruno Migracao Quarenta', '1710')
on conflict do nothing;
alter table public.usuarios disable trigger usuarios_vincular_systur;
insert into auth.users (id, email, raw_user_meta_data) values
  ('42000000-0000-0000-0000-000000000009', 'bruno42@teste.com', '{"nome_completo":"Bruno Migração Quarenta","perfil":"vendedor","filial":"1710"}');
alter table public.usuarios enable trigger usuarios_vincular_systur;
select public._test_assert('antes da migration: nome existente sem vínculo',
  (select usuario_id is null from pg_temp.mapa('1710', 'Bruno Migracao Quarenta')));

select count(*) as auditoria_antes from public.auditoria where tabela = 'systur_vendedor_mapeamento' \gset
\ir ../migrations/20261119000001_mapeamento_vinculo_automatico.sql
select public._test_assert('migration: vincula o nome existente igual a um único usuário ativo',
  (select usuario_id = '42000000-0000-0000-0000-000000000009' and vinculo_origem = 'automatico'
   from pg_temp.mapa('1710', 'Bruno Migracao Quarenta')));
select public._test_assert('migration: não mexe em homônimos, desvinculados nem vínculos existentes (só +1 auditoria)',
  (select usuario_id is null from pg_temp.mapa('1710', 'Pedro Homonimo Quarenta'))
  and (select vinculo_origem = 'manual' from pg_temp.mapa('1710', 'MARCIA ACENTUADA QUARENTA'))
  and (select count(*) = :auditoria_antes + 1 from public.auditoria where tabela = 'systur_vendedor_mapeamento'));

-- ----------------------------------------------------------------------------
-- 6. Vincular todas as sugestões fortes (só adm/adm_master)
-- ----------------------------------------------------------------------------

select array[(pg_temp.mapa('1714', 'Guilherme A De Macedo Luz')).id, (pg_temp.mapa('1714', 'Pedro Homonimo Quarenta')).id]::text as ids42 \gset

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  perform public.systur_vincular_sugestoes_fortes(array[gen_random_uuid()]);
  raise exception 'FALHOU: gerente vinculou sugestões';
exception when insufficient_privilege then
  raise notice 'ok: gerente não vincula sugestões';
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  perform * from public.systur_sugestoes_usuarios(null);
  raise exception 'FALHOU: gerente viu sugestões';
exception when insufficient_privilege then
  raise notice 'ok: gerente não vê sugestões';
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
  set local role authenticated;
  perform public.systur_vincular_automatico(null);
  raise exception 'FALHOU: authenticated executou o vínculo automático direto';
exception when insufficient_privilege then
  raise notice 'ok: vínculo automático só pelos triggers/migration';
end;
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000006';
set role authenticated;
select public.systur_vincular_sugestoes_fortes(:'ids42'::uuid[]) as vinculados42 \gset
reset role;
reset request.jwt.claim.sub;

select public._test_assert('lote: vincula só as fortes confirmadas (Guilherme), origem manual; homônimo continua sem vínculo',
  :vinculados42 = 1
  and (select usuario_id = '42000000-0000-0000-0000-000000000005' and vinculo_origem = 'manual'
       from pg_temp.mapa('1714', 'Guilherme A De Macedo Luz'))
  and (select usuario_id is null from pg_temp.mapa('1714', 'Pedro Homonimo Quarenta')));
select public._test_assert('propagação: a reserva do bot passa para o usuário vinculado em lote',
  (select vendedor_usuario_id = '42000000-0000-0000-0000-000000000005' from public.cliente_excursoes where reserva = 'R42-BOT-3'));

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('tela: grupos trazem a origem do vínculo',
  (select vinculo_origem = 'automatico' from public.systur_mapeamento_grupos('1714') where nome_systur = 'Otavio Robo Quarenta')
  and (select vinculo_origem is null and not vinculo_automatico_bloqueado from public.systur_mapeamento_grupos('1714') where nome_systur = 'Pedro Homonimo Quarenta'));
reset role;

-- ----------------------------------------------------------------------------
-- 7. Calendário: marcos por loja (sem cobrança retroativa)
-- ----------------------------------------------------------------------------

begin;

delete from public.vendas_importadas;
delete from public.vendas_importacoes;

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
-- 1710 importa desde 2025; em 05/11 (inclusive 22:30 de SP = 01:30 UTC do dia
-- 06) e no próprio 12/11 antes do registro gravou venda nova. Registro diário
-- começa em 12/11. 1730 só importou em 16/11. 1714 nunca importou.
insert into public.vendas_importadas (filial, venda_numero, vendedor_nome_planilha, data_venda, pagante, produto, valor_total, importado_em) values
  ('1710', 4200001, 'X', '2025-06-01', 'P', 'Prod', 10, '2025-06-02 10:00-03'),
  ('1710', 4200002, 'X', '2026-11-04', 'P', 'Prod', 10, '2026-11-05 15:00-03'),
  ('1710', 4200003, 'X', '2026-11-05', 'P', 'Prod', 10, '2026-11-06 01:30+00'),
  ('1710', 4200004, 'X', '2026-11-11', 'P', 'Prod', 10, '2026-11-12 09:00-03'),
  ('1710', 4200005, 'X', '2026-11-12', 'P', 'Prod', 10, '2026-11-13 09:00-03'),
  ('1730', 4200006, 'X', '2026-11-13', 'P', 'Prod', 10, '2026-11-16 10:00-03');
insert into public.vendas_importacoes (filial, ate, importado_por, importado_em) values
  ('1710', '2026-11-11', '00000000-0000-0000-0000-000000000004', '2026-11-12 14:00-03'),
  ('1710', '2026-11-12', '00000000-0000-0000-0000-000000000004', '2026-11-13 09:05-03'),
  ('1730', '2026-11-13', '00000000-0000-0000-0000-000000000004', '2026-11-16 10:05-03');

create temp table _hist42 (usuario text, filial text, primeira date, inicio date, dias date[]) on commit drop;
grant insert on _hist42 to authenticated;

set local role authenticated;
insert into _hist42 select 'adm_master', * from public.vendas_calendario_historico('2026-11-01', '2026-11-30');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
insert into _hist42 select 'gerente 1710', * from public.vendas_calendario_historico('2026-11-01', '2026-11-30');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into _hist42 select 'vendedor', * from public.vendas_calendario_historico('2026-11-01', '2026-11-30');
reset role;

select public._test_assert('calendário: primeira importação = menor importado_em (vendas ou registro) da loja',
  (select primeira = '2025-06-02' from _hist42 where usuario = 'adm_master' and filial = '1710')
  and (select primeira = '2026-11-16' from _hist42 where usuario = 'adm_master' and filial = '1730')
  and (select primeira is null from _hist42 where usuario = 'adm_master' and filial = '1714'));
select public._test_assert('calendário: início do registro diário = primeira linha de vendas_importacoes',
  (select bool_and(inicio = '2026-11-12') from _hist42 where usuario = 'adm_master'));
select public._test_assert('calendário: dias reconstruídos (São Paulo) só até o início do registro',
  (select dias = '{2026-11-05,2026-11-12}' from _hist42 where usuario = 'adm_master' and filial = '1710')
  and (select dias = '{}' from _hist42 where usuario = 'adm_master' and filial = '1730'));
select public._test_assert('calendário: adm vê as 3 lojas; gerente só a própria; vendedor nada',
  (select count(*) = 3 from _hist42 where usuario = 'adm_master')
  and (select array_agg(filial) = '{1710}' from _hist42 where usuario = 'gerente 1710')
  and not exists (select 1 from _hist42 where usuario = 'vendedor'));

rollback;

\ir ../migrations/20261119000002_calendario_sem_cobranca_retroativa.sql
select public._test_assert('reaplicar a migration do calendário é idempotente',
  to_regprocedure('public.vendas_calendario_historico(date, date)') is not null);

drop function public._test_assert(text, boolean);

select 'todos os asserts do vínculo automático e do calendário passaram' as status;
