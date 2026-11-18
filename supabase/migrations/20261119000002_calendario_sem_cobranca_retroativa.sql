-- ============================================================================
-- Calendário de importações sem cobrança retroativa.
--
-- vendas_importacoes (registro diário) só existe desde o PR #62 (12/11/2026):
-- antes disso todo dia útil aparecia em vermelho. Por loja:
--
--   primeira_importacao  dia (São Paulo) da primeira importação da loja: o
--                        menor importado_em de vendas_importadas (o upsert
--                        preserva importado_em — trigger de 20260727000005)
--                        ou de vendas_importacoes. Antes dele: cinza.
--   inicio_registro      dia da primeira linha de vendas_importacoes (único
--                        para todas as lojas: é quando o registro começou).
--                        Entre os dois: verde "presumido"; a partir dele, a
--                        regra de sempre.
--   dias_reconstruidos   dias do período (até inicio_registro, inclusive)
--                        em que a loja gravou venda nova — importações reais
--                        reconstruídas por vendas_importadas.importado_em.
--
-- Visibilidade igual à de vendas_importacoes_calendario: adm/adm_master
-- todas as lojas; gerente a própria; demais nada.
--
-- Idempotente.
-- ============================================================================

create index if not exists vendas_importadas_filial_importado_em_idx
  on public.vendas_importadas (filial, importado_em);

drop function if exists public.vendas_calendario_historico(date, date);

create function public.vendas_calendario_historico(p_de date, p_ate date)
returns table (
  filial filial_cvc,
  primeira_importacao date,
  inicio_registro date,
  dias_reconstruidos date[]
)
language sql
stable
security definer
set search_path = public
as $$
  with inicio as (
    select (min(i.importado_em) at time zone 'America/Sao_Paulo')::date as dia
    from public.vendas_importacoes i
  ),
  lojas as (
    select l as filial
    from unnest(enum_range(null::filial_cvc)) l
    where public.auth_is_admin()
       or (public.auth_perfil() = 'gerente' and l = public.auth_filial())
  )
  select
    l.filial,
    (least(
      (select min(v.importado_em) from public.vendas_importadas v where v.filial = l.filial),
      (select min(i.importado_em) from public.vendas_importacoes i where i.filial = l.filial)
    ) at time zone 'America/Sao_Paulo')::date,
    ini.dia,
    coalesce((
      select array_agg(distinct (v.importado_em at time zone 'America/Sao_Paulo')::date)
      from public.vendas_importadas v
      where v.filial = l.filial
        and v.importado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
        and v.importado_em < ((least(p_ate, coalesce(ini.dia, p_ate)) + 1)::timestamp at time zone 'America/Sao_Paulo')
    ), '{}')
  from lojas l
  cross join inicio ini
  order by l.filial;
$$;

revoke all on function public.vendas_calendario_historico(date, date) from public, anon;
grant execute on function public.vendas_calendario_historico(date, date) to authenticated, service_role;
