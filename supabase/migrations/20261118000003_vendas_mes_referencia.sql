-- ============================================================================
-- Vendas → Vendas: abrir no mês da última importação de cada filial.
--
--   vendas_referencia_lojas()   por loja visível: "vendas até" e a hora da
--       última importação (vendas_importacoes). Visibilidade: a mesma das
--       vendas (adm/adm_master as 3 lojas; gerente e vendedor a própria).
--   vendas_resumo_periodos(periodos)   resumo por vendedor somando cada
--       filial no próprio período [{filial, de, ate}]. security invoker: lê
--       vendas_com_vendedor, que já aplica o escopo por perfil — a regra de
--       acesso é a mesma de antes. Agrega no banco (sem trazer as vendas e sem
--       o limite de linhas da API).
--
-- O mês de referência (1º do mês da data "vendas até" até ela) e o rótulo
-- ficam em src/lib/vendas/mes-referencia.ts.
--
-- Idempotente.
-- ============================================================================

create index if not exists vendas_importadas_filial_data_idx on public.vendas_importadas (filial, data_venda);

create or replace function public.vendas_referencia_lojas()
returns table (loja filial_cvc, ate date, importado_em timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.loja, u.ate, u.importado_em
  from unnest(public._lojas_visiveis()) as l (loja)
  left join lateral (
    select i.ate, i.importado_em
    from public.vendas_importacoes i
    where i.filial = l.loja
    order by i.importado_em desc
    limit 1
  ) u on true
  order by l.loja;
$$;

revoke all on function public.vendas_referencia_lojas() from public, anon;
grant execute on function public.vendas_referencia_lojas() to authenticated, service_role;

drop function if exists public.vendas_resumo_periodos(jsonb);

create function public.vendas_resumo_periodos(p_periodos jsonb)
returns table (usuario_id uuid, filial filial_cvc, quantidade bigint, total numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select v.usuario_id, min(v.filial::text)::filial_cvc, count(*), sum(v.valor_total)
  from public.vendas_com_vendedor v
  join jsonb_to_recordset(coalesce(p_periodos, '[]'::jsonb)) as p (filial filial_cvc, de date, ate date)
    on p.filial = v.filial and v.data_venda between p.de and p.ate
  where v.usuario_id is not null
  group by v.usuario_id;
$$;

revoke all on function public.vendas_resumo_periodos(jsonb) from public, anon;
grant execute on function public.vendas_resumo_periodos(jsonb) to authenticated, service_role;
