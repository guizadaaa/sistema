-- ============================================================================
-- Migrations 20261130000001/2: grau de prioridade do caso (histórico,
-- notificação, quem altera), comentário nos anexos e "Casos em aberto" por
-- grau na página inicial.
-- ============================================================================

set role postgres;

\ir ../migrations/20261130000001_tipo_notificacao_prioridade.sql
\ir ../migrations/20261130000002_casos_prioridade_anexo_comentario.sql

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

begin;

-- Resultados das tentativas feitas como authenticated (a tabela é lida depois, como postgres).
create temp table _r50 (chave text primary key, valor text) on commit drop;
grant insert, update, select on _r50 to authenticated;

create or replace function pg_temp.tentar(p_chave text, p_sql text) returns void language plpgsql as $$
declare
  v_linhas integer;
begin
  execute p_sql;
  get diagnostics v_linhas = row_count;
  insert into _r50 values (p_chave, 'ok:' || v_linhas);
exception when others then
  insert into _r50 values (p_chave, 'erro:' || sqlstate || ':' || sqlerrm);
end;
$$;
grant execute on function pg_temp.tentar(text, text) to authenticated;

create or replace function pg_temp.r(p_chave text) returns text language sql as $$ select valor from _r50 where chave = p_chave $$;

-- Vendedor A (1710) cria um caso Urgente e um Baixa, e anexa com comentário.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, prioridade)
values
  ('50000000-0000-0000-0000-000000000001', 'alteracao_data', 'pedido_cliente', 'teste 50', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', current_date + 30, '17105000000001', 'Cliente Urgente 50', '11144477735', 4),
  ('50000000-0000-0000-0000-000000000002', 'alteracao_data', 'pedido_cliente', 'teste 50', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001', current_date + 30, '17105000000002', 'Cliente Baixa 50', '11144477735', 1);

insert into public.anexos (id, caso_id, tipo_documento, storage_path, nome_arquivo, comentario) values
  ('50000000-0000-0000-0000-0000000000a1', '50000000-0000-0000-0000-000000000001', 'orbium', '50000000-0000-0000-0000-000000000001/a1.png', 'a1.png', 'Print do Orbium com a multa da Azul'),
  ('50000000-0000-0000-0000-0000000000a2', '50000000-0000-0000-0000-000000000001', 'outro', '50000000-0000-0000-0000-000000000001/a2.pdf', 'a2.pdf', null);

select pg_temp.tentar('A: comentário com 301 caracteres',
  $q$insert into public.anexos (caso_id, tipo_documento, storage_path, nome_arquivo, comentario)
     values ('50000000-0000-0000-0000-000000000001', 'outro', '50000000-0000-0000-0000-000000000001/x.pdf', 'x.pdf', repeat('a', 301))$q$);
select pg_temp.tentar('A: altera a prioridade direto', $q$update public.casos set prioridade = 2 where id = '50000000-0000-0000-0000-000000000002'$q$);
select pg_temp.tentar('A: prazo + prioridade juntos', $q$update public.casos set prioridade = 2, prazo_vigencia = prazo_vigencia + 1 where id = '50000000-0000-0000-0000-000000000002'$q$);
select pg_temp.tentar('A: rpc alterar_prioridade_caso', $q$select public.alterar_prioridade_caso('50000000-0000-0000-0000-000000000002', 2::smallint)$q$);
select pg_temp.tentar('A: prazo sozinho segue liberado', $q$update public.casos set prazo_vigencia = prazo_vigencia + 1 where id = '50000000-0000-0000-0000-000000000002'$q$);
select pg_temp.tentar('A: edita o próprio comentário', $q$update public.anexos set comentario = 'Print do Orbium (multa Azul)' where id = '50000000-0000-0000-0000-0000000000a1'$q$);
select pg_temp.tentar('A: comentário com 301 no update', $q$update public.anexos set comentario = repeat('b', 301) where id = '50000000-0000-0000-0000-0000000000a1'$q$);
select pg_temp.tentar('A: outra coluna do anexo', $q$update public.anexos set nome_arquivo = 'outro.png' where id = '50000000-0000-0000-0000-0000000000a1'$q$);

-- Gerente 1714 (outra filial) e Vendedor B (não enxerga o caso).
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
insert into public.casos (id, tipo_caso, motivo, descricao, vendedor_dono, criado_por, prazo_vigencia, contrato_numero, cliente_nome, cliente_cpf, prioridade)
values ('50000000-0000-0000-0000-000000000003', 'alteracao_data', 'pedido_cliente', 'teste 50', '00000000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000005', current_date + 30, '17145000000003', 'Cliente 1714 50', '11144477735', 3);
select pg_temp.tentar('G1714: rpc em caso da 1710', $q$select public.alterar_prioridade_caso('50000000-0000-0000-0000-000000000002', 3::smallint)$q$);
select pg_temp.tentar('G1714: comentário de anexo da 1710', $q$update public.anexos set comentario = 'x' where id = '50000000-0000-0000-0000-0000000000a1'$q$);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select pg_temp.tentar('B: comentário de anexo alheio', $q$update public.anexos set comentario = 'x' where id = '50000000-0000-0000-0000-0000000000a1'$q$);

-- Gerente 1710: altera a prioridade (Baixa → Alta) e o comentário de anexo da vendedora; anexa um arquivo.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select pg_temp.tentar('G1710: rpc Baixa → Alta', $q$select public.alterar_prioridade_caso('50000000-0000-0000-0000-000000000002', 3::smallint)$q$);
select pg_temp.tentar('G1710: grau 5', $q$select public.alterar_prioridade_caso('50000000-0000-0000-0000-000000000002', 5::smallint)$q$);
select pg_temp.tentar('G1710: update direto (sem policy de UPDATE em casos)', $q$update public.casos set prioridade = 4 where id = '50000000-0000-0000-0000-000000000002'$q$);
select pg_temp.tentar('G1710: comentário de anexo da vendedora', $q$update public.anexos set comentario = null where id = '50000000-0000-0000-0000-0000000000a2'$q$);
insert into public.anexos (id, caso_id, tipo_documento, storage_path, nome_arquivo, comentario) values
  ('50000000-0000-0000-0000-0000000000a3', '50000000-0000-0000-0000-000000000001', 'systur', '50000000-0000-0000-0000-000000000001/a3.pdf', 'a3.pdf', 'Do gerente');

-- Vendedora dona do caso não edita comentário de anexo enviado pelo gerente.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select pg_temp.tentar('A: comentário de anexo do gerente', $q$update public.anexos set comentario = 'x' where id = '50000000-0000-0000-0000-0000000000a3'$q$);

-- adm_master altera qualquer caso (inclusive o antigo do seed, sem grau).
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select pg_temp.tentar('adm: Alta → Média', $q$select public.alterar_prioridade_caso('50000000-0000-0000-0000-000000000002', 2::smallint)$q$);
select pg_temp.tentar('adm: comentário de anexo alheio', $q$update public.anexos set comentario = 'Revisado' where id = '50000000-0000-0000-0000-0000000000a3'$q$);

-- Leituras como cada perfil.
create temp table _c50 (quem text, prioridade smallint, total bigint) on commit drop;
create temp table _i50 (quem text, n bigint, lista text, protocolo bigint, prioridade smallint, entrou_em timestamptz, total_grau bigint, filial filial_cvc) on commit drop;
grant insert on _c50, _i50 to authenticated;
insert into _c50 select 'adm sem grau', 0, sum(total) from public.casos_contagem_barra(p_prioridade => 0::smallint);
insert into _c50 select 'adm urgente', 4, sum(total) from public.casos_contagem_barra(p_prioridade => 4::smallint);
insert into _c50 select 'adm todas', null, sum(total) from public.casos_contagem_barra();
insert into _i50 select 'adm', n, lista, protocolo, prioridade, entrou_em, total_grau, filial from public.casos_em_aberto_inicio(1000) with ordinality t(lista, id, protocolo, cliente_nome, status_atual, filial, prioridade, entrou_em, total_grau, n);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
insert into _i50 select 'g1714', n, lista, protocolo, prioridade, entrou_em, total_grau, filial from public.casos_em_aberto_inicio(1000) with ordinality t(lista, id, protocolo, cliente_nome, status_atual, filial, prioridade, entrou_em, total_grau, n);
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into _c50 select 'A urgente', 4, sum(total) from public.casos_contagem_barra(p_prioridade => 4::smallint);
insert into _i50 select 'A', n, lista, protocolo, prioridade, entrou_em, total_grau, filial from public.casos_em_aberto_inicio(1000) with ordinality t(lista, id, protocolo, cliente_nome, status_atual, filial, prioridade, entrou_em, total_grau, n);
reset role;

-- ---------------------------------------------------------------------------

select public._test_assert('criação grava a prioridade; caso antigo segue sem grau',
  (select prioridade = 4 from public.casos where id = '50000000-0000-0000-0000-000000000001')
  and (select prioridade is null from public.casos where id = '10000000-0000-0000-0000-000000000001'));
select public._test_assert('histórico da criação: de NULL para o grau, por quem criou',
  (select count(*) = 1 and bool_and(de is null and para = 4 and alterado_por = '00000000-0000-0000-0000-000000000001')
   from public.casos_prioridade_historico where caso_id = '50000000-0000-0000-0000-000000000001'));
select public._test_assert('vendedor não altera a prioridade (update direto, junto com o prazo, rpc)',
  pg_temp.r('A: altera a prioridade direto') like 'erro:P0001:%prioridade%'
  and pg_temp.r('A: prazo + prioridade juntos') like 'erro:P0001:%'
  and pg_temp.r('A: rpc alterar_prioridade_caso') like 'erro:42501:%');
select public._test_assert('vendedor segue alterando só o prazo', pg_temp.r('A: prazo sozinho segue liberado') = 'ok:1');
select public._test_assert('gerente de outra filial não altera; gerente da filial altera; grau fora de 1..4 recusado',
  pg_temp.r('G1714: rpc em caso da 1710') like 'erro:42501:%'
  and pg_temp.r('G1710: rpc Baixa → Alta') = 'ok:1'
  and pg_temp.r('G1710: grau 5') like 'erro:22023:%'
  and pg_temp.r('G1710: update direto (sem policy de UPDATE em casos)') = 'ok:0');
select public._test_assert('adm altera qualquer caso; histórico completo de → para',
  pg_temp.r('adm: Alta → Média') = 'ok:1'
  and (select array_agg(coalesce(de::text, '-') || '>' || para order by coalesce(de, 0))
       from public.casos_prioridade_historico where caso_id = '50000000-0000-0000-0000-000000000002') = '{->1,1>3,3>2}'
  and (select alterado_por = '00000000-0000-0000-0000-000000000003' from public.casos_prioridade_historico
       where caso_id = '50000000-0000-0000-0000-000000000002' and para = 3));
select public._test_assert('auditoria registra a mudança de prioridade (casos_log_auditoria)',
  exists (select 1 from public.auditoria where tabela = 'casos' and registro_id = '50000000-0000-0000-0000-000000000002'
          and acao = 'update' and dados_antigos ->> 'prioridade' = '1' and dados_novos ->> 'prioridade' = '3'
          and realizado_por = '00000000-0000-0000-0000-000000000003'));

select public._test_assert('Urgente na criação: notifica gerente 1710 e adm_master; não quem criou nem gerente 1714',
  (select array_agg(destinatario_id order by destinatario_id) from public.notificacoes
   where caso_id = '50000000-0000-0000-0000-000000000001' and tipo = 'prioridade_alta')
  = (select array_agg(u.id order by u.id) from public.usuarios u
     where u.ativo and u.id <> '00000000-0000-0000-0000-000000000001'
       and (u.perfil in ('adm', 'adm_master') or (u.perfil = 'gerente' and u.filial = '1710')))
  and exists (select 1 from public.notificacoes where caso_id = '50000000-0000-0000-0000-000000000001'
              and tipo = 'prioridade_alta' and destinatario_id = '00000000-0000-0000-0000-000000000003')
  and not exists (select 1 from public.notificacoes where caso_id = '50000000-0000-0000-0000-000000000001'
              and destinatario_id in ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000005'))
  and (select bool_and(mensagem = format('Caso #%s marcado como Urgente por Vendedor A', c.protocolo))
       from public.notificacoes n join public.casos c on c.id = n.caso_id
       where n.caso_id = '50000000-0000-0000-0000-000000000001' and n.tipo = 'prioridade_alta'));
select public._test_assert('Baixa/Média não notificam; Alta pelo gerente notifica só o adm (não quem mudou)',
  (select array_agg(destinatario_id order by destinatario_id) from public.notificacoes
   where caso_id = '50000000-0000-0000-0000-000000000002' and tipo = 'prioridade_alta')
  = (select array_agg(u.id order by u.id) from public.usuarios u
     where u.ativo and u.id <> '00000000-0000-0000-0000-000000000003'
       and (u.perfil in ('adm', 'adm_master') or (u.perfil = 'gerente' and u.filial = '1710')))
  and (select bool_and(mensagem like '%marcado como Alta por Gerente 1710') from public.notificacoes
       where caso_id = '50000000-0000-0000-0000-000000000002' and tipo = 'prioridade_alta'));

select public._test_assert('anexo com e sem comentário; acima de 300 recusado (insert e update)',
  (select comentario from public.anexos where id = '50000000-0000-0000-0000-0000000000a1') = 'Print do Orbium (multa Azul)'
  and (select comentario is null from public.anexos where id = '50000000-0000-0000-0000-0000000000a2')
  and pg_temp.r('A: comentário com 301 caracteres') like 'erro:23514:%'
  and pg_temp.r('A: comentário com 301 no update') like 'erro:23514:%');
select public._test_assert('editar comentário: quem enviou, gerente da filial e adm sim',
  pg_temp.r('A: edita o próprio comentário') = 'ok:1'
  and pg_temp.r('G1710: comentário de anexo da vendedora') = 'ok:1'
  and pg_temp.r('adm: comentário de anexo alheio') = 'ok:1'
  and (select comentario from public.anexos where id = '50000000-0000-0000-0000-0000000000a3') = 'Revisado');
select public._test_assert('editar comentário: dono do caso em anexo de outro, outra filial e quem não vê o caso não',
  pg_temp.r('A: comentário de anexo do gerente') = 'ok:0'
  and pg_temp.r('G1714: comentário de anexo da 1710') = 'ok:0'
  and pg_temp.r('B: comentário de anexo alheio') = 'ok:0');
select public._test_assert('só a coluna comentário é editável', pg_temp.r('A: outra coluna do anexo') like 'erro:42501:%');
select public._test_assert('auditoria registra a edição do comentário',
  exists (select 1 from public.auditoria where tabela = 'anexos' and registro_id = '50000000-0000-0000-0000-0000000000a1'
          and acao = 'update' and dados_novos ->> 'comentario' = 'Print do Orbium (multa Azul)'
          and realizado_por = '00000000-0000-0000-0000-000000000001'));

select public._test_assert('barra: filtro de prioridade (sem grau encontra os antigos; Urgente)',
  (select total from _c50 where quem = 'adm sem grau') = (select count(*) from public.casos where not caso_teste and prioridade is null)
  and (select total from _c50 where quem = 'adm sem grau') > 0
  and (select total from _c50 where quem = 'adm urgente') = (select count(*) from public.casos where not caso_teste and prioridade = 4)
  and (select total from _c50 where quem = 'adm todas') = (select count(*) from public.casos where not caso_teste)
  and (select total from _c50 where quem = 'A urgente') = 1);

select public._test_assert('em aberto por grau: Urgente → Alta → Média → Baixa → Sem grau, mais parado primeiro no mesmo grau',
  (select array_agg(protocolo order by n) = array_agg(protocolo order by coalesce(prioridade, 0) desc, entrou_em, protocolo)
   from _i50 where quem = 'adm' and lista = 'grau')
  and (select array_agg(protocolo order by n) = array_agg(protocolo order by entrou_em, protocolo)
   from _i50 where quem = 'adm' and lista = 'parado')
  and (select count(distinct coalesce(prioridade, 0)) >= 3 from _i50 where quem = 'adm' and lista = 'grau'));
select public._test_assert('em aberto: total_grau = casos em aberto do grau; parado = mais parado primeiro',
  (select bool_and(total_grau = (select count(*) from public.casos c where not c.caso_teste and c.status_atual <> 'resolvido'
                                  and c.prioridade is not distinct from i.prioridade))
   from _i50 i where quem = 'adm')
  and (select count(*) from _i50 where quem = 'adm' and lista = 'parado') = (select count(*) from _i50 where quem = 'adm' and lista = 'grau'));
select public._test_assert('em aberto: mesma visibilidade (gerente 1714 só a 1714; vendedor só os dele)',
  (select array_agg(protocolo order by protocolo) from _i50 where quem = 'g1714' and lista = 'grau')
    = (select array_agg(protocolo order by protocolo) from public.casos where not caso_teste and status_atual <> 'resolvido' and filial = '1714')
  and exists (select 1 from _i50 i join public.casos c on c.protocolo = i.protocolo
              where i.quem = 'g1714' and c.id = '50000000-0000-0000-0000-000000000003')
  and (select count(*) from _i50 where quem = 'A' and lista = 'grau')
      = (select count(*) from public.casos where vendedor_dono = '00000000-0000-0000-0000-000000000001' and not caso_teste and status_atual <> 'resolvido'));

rollback;

\ir ../migrations/20261130000002_casos_prioridade_anexo_comentario.sql
select public._test_assert('reaplicar a migration é idempotente',
  to_regprocedure('public.alterar_prioridade_caso(uuid, smallint)') is not null
  and (select count(*) = 1 from pg_trigger where tgname = 'casos_registrar_prioridade'));

drop function public._test_assert(text, boolean);

select 'todos os asserts de prioridade e comentário de anexo passaram' as status;
