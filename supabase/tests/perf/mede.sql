-- ============================================================================
-- Mede cada consulta da página /clientes como `authenticated` (com RLS), para
-- três usuários: vendedor da 1710, gerente da 1710 e adm_master.
-- EXPLAIN (ANALYZE, BUFFERS) de cada chamada; imprime uma tabela com o tempo
-- de execução (ms) e os buffers lidos. Rodar depois de carga.sql.
-- ============================================================================

set role postgres;
create schema if not exists perf;
grant usage on schema perf to authenticated;

create table if not exists perf.resultados (
  usuario text,
  consulta text,
  ms numeric,
  buffers bigint,
  linhas bigint,
  erro text
);
truncate perf.resultados;
grant insert, select on perf.resultados to authenticated;

-- Roda como quem chama (security invoker): o EXPLAIN vale para o papel atual.
create or replace function perf.medir(p_usuario text, p_consulta text, p_sql text)
returns void
language plpgsql
as $$
declare
  v_plano json;
begin
  execute 'explain (analyze, buffers, format json) ' || p_sql into v_plano;
  insert into perf.resultados values (
    p_usuario, p_consulta,
    round((v_plano -> 0 ->> 'Execution Time')::numeric, 1),
    coalesce((v_plano -> 0 -> 'Plan' ->> 'Shared Hit Blocks')::bigint, 0) + coalesce((v_plano -> 0 -> 'Plan' ->> 'Shared Read Blocks')::bigint, 0),
    (v_plano -> 0 -> 'Plan' ->> 'Actual Rows')::bigint,
    null
  );
exception when others then
  insert into perf.resultados values (p_usuario, p_consulta, null, null, null, sqlerrm);
end;
$$;
grant execute on function perf.medir(text, text, text) to authenticated;

-- O que a página chama (src/app/(app)/clientes/page.tsx e actions.ts).
create or replace function perf.medir_pagina(p_usuario text)
returns void
language plpgsql
as $$
declare
  v_cliente uuid;
begin
  perform perf.medir(p_usuario, 'buscar (sem filtro, página 1)', $q$select * from public.base_clientes_buscar('{}', 50, 0)$q$);
  perform perf.medir(p_usuario, 'buscar (página 50)', $q$select * from public.base_clientes_buscar('{}', 50, 2450)$q$);
  perform perf.medir(p_usuario, 'buscar (frase vazia + futura)', $q$select * from public.base_clientes_buscar('{"camp":"adicional","futura":"1"}', 50, 0)$q$);
  perform perf.medir(p_usuario, 'buscar (vendedor: ex todos)', $q$select * from public.base_clientes_buscar('{"vendedor":"grupo:ex"}', 50, 0)$q$);
  perform perf.medir(p_usuario, 'buscar (campanha aéreo s/ ingresso)', $q$select * from public.base_clientes_buscar('{"camp":"adicional","ca_tipo":"aereo","ca_destino":"orlando","ca_de":"2026-11-01","ca_sem_tipo":"ingresso"}', 50, 0)$q$);
  perform perf.medir(p_usuario, 'buscar (adicional: aéreo orlando 6 meses s/ ingresso)', format($q$select * from public.base_clientes_buscar(%L, 50, 0)$q$,
    jsonb_build_object('camp', 'adicional', 'ca_tipo', 'aereo', 'ca_destino', 'orlando', 'ca_de', current_date, 'ca_ate', current_date + interval '6 months', 'ca_sem_tipo', 'ingresso')));
  perform perf.medir(p_usuario, 'buscar (recompra: ano passado, nada, qualquer destino)', format($q$select * from public.base_clientes_buscar(%L, 50, 0)$q$,
    jsonb_build_object('camp', 'recompra', 'cr_a_de', make_date(extract(year from current_date)::int - 1, 1, 1), 'cr_a_ate', make_date(extract(year from current_date)::int - 1, 12, 31),
      'cr_sem', 'nada', 'cr_b_de', make_date(extract(year from current_date)::int, 1, 1), 'cr_b_ate', current_date)));
  perform perf.medir(p_usuario, 'buscar (recompra: ano passado, nada, mesmo destino)', format($q$select * from public.base_clientes_buscar(%L, 50, 0)$q$,
    jsonb_build_object('camp', 'recompra', 'cr_a_de', make_date(extract(year from current_date)::int - 1, 1, 1), 'cr_a_ate', make_date(extract(year from current_date)::int - 1, 12, 31),
      'cr_sem', 'nada', 'cr_mesmo_destino', '1', 'cr_b_de', make_date(extract(year from current_date)::int, 1, 1), 'cr_b_ate', current_date)));
  perform perf.medir(p_usuario, 'buscar (recompra: aéreo orlando, não comprou aéreo, mesmo destino)', format($q$select * from public.base_clientes_buscar(%L, 50, 0)$q$,
    jsonb_build_object('camp', 'recompra', 'cr_tipo', 'aereo', 'cr_destino', 'orlando', 'cr_a_de', current_date - 730, 'cr_a_ate', current_date - 366,
      'cr_sem', 'aereo', 'cr_mesmo_destino', '1', 'cr_b_de', current_date - 365, 'cr_b_ate', current_date)));
  select cliente_id into v_cliente from public.base_clientes_buscar('{}', 1, 0);
  perform perf.medir(p_usuario, 'compras do cliente (expandir)', format($q$select * from public.base_clientes_compras(%L)$q$, v_cliente));
  perform perf.medir(p_usuario, 'opções de vendedor', $q$select * from public.base_clientes_vendedores_opcoes()$q$);
  perform perf.medir(p_usuario, 'sugestões de destino', $q$select * from public.base_clientes_destinos('orl', 10)$q$);
  perform perf.medir(p_usuario, 'aviso de vínculo', $q$select * from public.systur_nomes_parecem_ativos()$q$);
  perform perf.medir(p_usuario, 'cobertura: meses', $q$select * from public.base_cobertura_meses()$q$);
  perform perf.medir(p_usuario, 'cobertura: resumo', $q$select * from public.base_cobertura_resumo()$q$);
  perform perf.medir(p_usuario, 'cobertura: janelas (tabela)', $q$select * from public.base_coleta_janelas order by loja, de$q$);
  perform perf.medir(p_usuario, 'modelos de mensagem (tabela)', $q$select id, chave, titulo, texto from public.mensagem_modelos where ativo order by titulo$q$);
  perform perf.medir(p_usuario, 'filtros salvos (tabela)', $q$select id, nome, filtros from public.cliente_filtros_salvos order by nome$q$);
  perform perf.medir(p_usuario, 'clientes (tabela, RLS)', $q$select count(*) from public.clientes$q$);
  perform perf.medir(p_usuario, 'compras (tabela, RLS)', $q$select count(*) from public.cliente_compras$q$);
  perform perf.medir(p_usuario, 'reservas (tabela, RLS)', $q$select count(*) from public.cliente_excursoes$q$);
  -- Vendas → Importar (calendário) e Vendas (mês de referência).
  perform perf.medir(p_usuario, 'calendário: importações do mês', format($q$select * from public.vendas_importacoes_calendario(%L, %L)$q$,
    date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date));
  perform perf.medir(p_usuario, 'calendário: feriados do mês (tabela)', format($q$select * from public.feriados where data between %L and %L$q$,
    date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date));
  perform perf.medir(p_usuario, 'vendas: referência por loja', $q$select * from public.vendas_referencia_lojas()$q$);
  perform perf.medir(p_usuario, 'vendas: resumo do mês (Todas)', format($q$select * from public.vendas_resumo_periodos(%L)$q$,
    (select jsonb_agg(jsonb_build_object('filial', loja, 'de', date_trunc('month', ate)::date, 'ate', ate)) from public.vendas_referencia_lojas())));
  perform perf.medir(p_usuario, 'vendas: resumo de 1 ano (período escolhido)', format($q$select * from public.vendas_resumo_periodos(%L)$q$,
    (select jsonb_agg(jsonb_build_object('filial', l, 'de', current_date - 365, 'ate', current_date)) from unnest(array['1710', '1714', '1730']) l)));
  perform perf.medir(p_usuario, 'vendas: lista do mês (tabela)', format($q$select id, filial, data_venda, pagante, produto, valor_total from public.vendas_com_vendedor where filial = '1710' and data_venda between %L and current_date order by data_venda desc$q$,
    date_trunc('month', current_date)::date));
  perform perf.medir(p_usuario, 'mapeamento: grupos (Vendedores Systur)', $q$select * from public.systur_mapeamento_grupos(null)$q$);
  perform perf.medir(p_usuario, 'mapeamento: sugestões (Vendedores Systur)', $q$select * from public.systur_sugestoes_usuarios(null)$q$);
  perform perf.medir(p_usuario, 'calendário: histórico do mês (sem cobrança retroativa)', format($q$select * from public.vendas_calendario_historico(%L, %L)$q$,
    date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date));
  perform perf.medir(p_usuario, 'exportar CSV (até 20 mil)', $q$select * from public.base_clientes_buscar('{}', 20000, 0)$q$);
end;
$$;
grant execute on function perf.medir_pagina(text) to authenticated;

-- Sem limite aqui: a medida mostra quanto passaria dos ~8 s do Supabase.
set statement_timeout = 0;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select perf.medir_pagina('vendedor 1710');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select perf.medir_pagina('gerente 1710');
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select perf.medir_pagina('adm_master');
reset role;

\pset format aligned
\pset border 2
select consulta,
  max(case when usuario = 'vendedor 1710' then coalesce(ms::text, 'erro') end) as "vendedor 1710 (ms)",
  max(case when usuario = 'gerente 1710' then coalesce(ms::text, 'erro') end) as "gerente 1710 (ms)",
  max(case when usuario = 'adm_master' then coalesce(ms::text, 'erro') end) as "adm_master (ms)",
  max(case when usuario = 'adm_master' then buffers end) as "buffers (adm_master)"
from perf.resultados
group by consulta
order by min(ctid);

select usuario, consulta, erro from perf.resultados where erro is not null;
