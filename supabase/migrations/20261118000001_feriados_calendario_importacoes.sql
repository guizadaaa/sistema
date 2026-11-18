-- ============================================================================
-- Feriados + calendário de importações de vendas (Vendas → Importar).
--
--   feriados   data, nome, abrangência (nacional | estadual_PR | municipal),
--              filial (null = todas) e facultativo (ponto facultativo:
--              esmaecido e sem cobrança, como feriado). Leitura: todos os
--              usuários; escrita: adm/adm_master.
--   vendas_importacoes_calendario(de, ate)
--              importações do período com o dia (São Paulo), loja, hora,
--              quem importou e "vendas até". Mesma visibilidade de
--              vendas_importacoes: adm/adm_master todas as lojas; gerente a
--              própria.
--
-- A regra de dia útil (seg–sex que não é feriado nem facultativo da filial)
-- fica em src/lib/feriados/dia-util.ts.
--
-- Idempotente.
-- ============================================================================

create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  nome text not null check (length(trim(nome)) between 1 and 120),
  abrangencia text not null check (abrangencia in ('nacional', 'estadual_PR', 'municipal')),
  filial filial_cvc,
  facultativo boolean not null default false,
  criado_em timestamptz not null default now(),

  -- Um feriado por dia e filial (null = todas conta como um valor).
  constraint feriados_data_filial_key unique nulls not distinct (data, filial)
);

comment on table public.feriados is
  'Feriados e pontos facultativos (filial null = todas as lojas). Dia útil = seg–sex sem feriado nem facultativo da filial (src/lib/feriados/dia-util.ts).';

alter table public.feriados enable row level security;

drop policy if exists feriados_select on public.feriados;
create policy feriados_select on public.feriados for select to authenticated using (true);

drop policy if exists feriados_insert on public.feriados;
create policy feriados_insert on public.feriados for insert to authenticated with check (public.auth_is_admin());

drop policy if exists feriados_update on public.feriados;
create policy feriados_update on public.feriados for update to authenticated
  using (public.auth_is_admin()) with check (public.auth_is_admin());

drop policy if exists feriados_delete on public.feriados;
create policy feriados_delete on public.feriados for delete to authenticated using (public.auth_is_admin());

revoke all on public.feriados from anon, authenticated;
grant select, insert, update, delete on public.feriados to authenticated;
grant select, insert, update, delete on public.feriados to service_role;

-- 2026 e 2027: nacionais, estadual do PR, Curitiba (1710, 1714) e São José
-- dos Pinhais (1730). Carnaval e Corpus Christi: ponto facultativo.
insert into public.feriados (data, nome, abrangencia, filial, facultativo)
select v.data::date, v.nome, v.abrangencia, v.filial::filial_cvc, v.facultativo
from (values
  ('2026-01-01', 'Confraternização Universal', 'nacional', null, false),
  ('2026-02-16', 'Carnaval', 'nacional', null, true),
  ('2026-02-17', 'Carnaval', 'nacional', null, true),
  ('2026-04-03', 'Sexta-feira Santa', 'nacional', null, false),
  ('2026-04-21', 'Tiradentes', 'nacional', null, false),
  ('2026-05-01', 'Dia do Trabalho', 'nacional', null, false),
  ('2026-06-04', 'Corpus Christi', 'nacional', null, true),
  ('2026-09-07', 'Independência do Brasil', 'nacional', null, false),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional', null, false),
  ('2026-11-02', 'Finados', 'nacional', null, false),
  ('2026-11-15', 'Proclamação da República', 'nacional', null, false),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional', null, false),
  ('2026-12-25', 'Natal', 'nacional', null, false),
  ('2026-12-19', 'Emancipação Política do Paraná', 'estadual_PR', null, false),
  ('2026-09-08', 'Nossa Senhora da Luz (Curitiba)', 'municipal', '1710', false),
  ('2026-09-08', 'Nossa Senhora da Luz (Curitiba)', 'municipal', '1714', false),
  ('2026-03-19', 'São José (São José dos Pinhais)', 'municipal', '1730', false),
  ('2027-01-01', 'Confraternização Universal', 'nacional', null, false),
  ('2027-02-08', 'Carnaval', 'nacional', null, true),
  ('2027-02-09', 'Carnaval', 'nacional', null, true),
  ('2027-03-26', 'Sexta-feira Santa', 'nacional', null, false),
  ('2027-04-21', 'Tiradentes', 'nacional', null, false),
  ('2027-05-01', 'Dia do Trabalho', 'nacional', null, false),
  ('2027-05-27', 'Corpus Christi', 'nacional', null, true),
  ('2027-09-07', 'Independência do Brasil', 'nacional', null, false),
  ('2027-10-12', 'Nossa Senhora Aparecida', 'nacional', null, false),
  ('2027-11-02', 'Finados', 'nacional', null, false),
  ('2027-11-15', 'Proclamação da República', 'nacional', null, false),
  ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional', null, false),
  ('2027-12-25', 'Natal', 'nacional', null, false),
  ('2027-12-19', 'Emancipação Política do Paraná', 'estadual_PR', null, false),
  ('2027-09-08', 'Nossa Senhora da Luz (Curitiba)', 'municipal', '1710', false),
  ('2027-09-08', 'Nossa Senhora da Luz (Curitiba)', 'municipal', '1714', false),
  ('2027-03-19', 'São José (São José dos Pinhais)', 'municipal', '1730', false)
) as v (data, nome, abrangencia, filial, facultativo)
where not exists (
  select 1 from public.feriados f
  where f.data = v.data::date and coalesce(f.filial::text, '*') = coalesce(v.filial, '*')
);

-- ----------------------------------------------------------------------------
-- Calendário de importações
-- ----------------------------------------------------------------------------

create index if not exists vendas_importacoes_importado_em_idx on public.vendas_importacoes (importado_em);

drop function if exists public.vendas_importacoes_calendario(date, date);

create function public.vendas_importacoes_calendario(p_de date, p_ate date)
returns table (
  id uuid,
  filial filial_cvc,
  dia date,
  importado_em timestamptz,
  ate date,
  importado_por_nome text
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.filial, (i.importado_em at time zone 'America/Sao_Paulo')::date, i.importado_em, i.ate, u.nome_completo
  from public.vendas_importacoes i
  join public.usuarios u on u.id = i.importado_por
  where i.importado_em >= (p_de::timestamp at time zone 'America/Sao_Paulo')
    and i.importado_em < ((p_ate + 1)::timestamp at time zone 'America/Sao_Paulo')
    and (
      public.auth_is_admin()
      or (public.auth_perfil() = 'gerente' and i.filial = public.auth_filial())
    )
  order by i.importado_em;
$$;

revoke all on function public.vendas_importacoes_calendario(date, date) from public, anon;
grant execute on function public.vendas_importacoes_calendario(date, date) to authenticated, service_role;
