-- ============================================================================
-- Migration 20261116000001: janelas da cobertura por data de SAÍDA.
-- ============================================================================

set role postgres;

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

-- Janelas antigas (por confirmação, antes do corte) e uma nova: só a antiga sai.
insert into public.base_coleta_janelas (loja, de, ate, reservas, coletado_em) values
  ('1730', '2025-01-01', '2025-01-31', 99, '2026-11-16 16:59:59+00'),
  ('1730', '2025-02-01', '2025-02-28', 98, '2026-11-10 12:00:00+00'),
  ('1730', '2025-03-01', '2025-03-31', 97, '2026-11-16 17:00:00+00');

\ir ../migrations/20261116000001_base_janelas_por_saida.sql

select public._test_assert('janelas gravadas antes de 16/11/2026 17:00 UTC apagadas; a partir do corte ficam',
  (select array_agg(de order by de) from public.base_coleta_janelas where loja = '1730') = '{2025-03-01}'::date[]);

-- Confirmação e saída em meses diferentes: a janela conta pela saída.
select public.conferencia_base('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1730", "janela": { "de": "2026-07-01", "ate": "2026-07-31" }, "fim_da_janela": true,
  "reservas": [
    { "reserva": "R38-1", "data_confirmacao": "2026-03-10", "data_viagem": "2026-07-05",
      "contratantes": [ { "pessoa_id": "38001", "nome": "Saída Julho", "valor": 100 } ] },
    { "reserva": "R38-2", "data_confirmacao": "2026-07-10", "data_viagem": "2026-12-20",
      "contratantes": [ { "pessoa_id": "38002", "nome": "Confirmou Julho", "valor": 200 } ] },
    { "reserva": "R38-3", "data_confirmacao": "2026-01-02", "data_viagem": "2026-07-31",
      "contratantes": [ { "pessoa_id": "38003", "nome": "Saída Fim Julho", "valor": 300 } ] }
  ]
}$json$::jsonb);

select public._test_assert('reservas da janela contadas por data_viagem (2 saídas em julho, não a confirmada em julho)',
  (select reservas = 2 from public.base_coleta_janelas where loja = '1730' and de = '2026-07-01' and ate = '2026-07-31'));

-- Reserva só do sync (sem coletado_em) com saída na janela não conta.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1730", "excursoes": [ { "reserva": "R38-SYNC", "data_viagem": "2026-07-15",
    "contratantes": [ { "pessoa_id": "38004", "nome": "Só Sync" } ] } ]
}$json$::jsonb);
select public.conferencia_base('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1730", "janela": { "de": "2026-07-01", "ate": "2026-07-31" }, "fim_da_janela": true, "reservas": []
}$json$::jsonb);
select public._test_assert('reenvio da janela recalcula; reserva só do sync não conta',
  (select reservas = 2 from public.base_coleta_janelas where loja = '1730' and de = '2026-07-01'));

-- ----------------------------------------------------------------------------
-- 20261116000002: valor não coletado (compra só do sync, sem valor).
-- ----------------------------------------------------------------------------

\ir ../migrations/20261116000002_base_valor_nao_coletado.sql

-- Cliente com uma compra do bot (valor) e outra só do sync (sem valor).
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1730", "excursoes": [ { "reserva": "R38-SYNC2", "data_viagem": "2027-01-15",
    "contratantes": [ { "pessoa_id": "38001", "nome": "Saída Julho" } ] } ]
}$json$::jsonb);

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
create temp table _b38 as select * from public.base_clientes_buscar('{"loja":"1730"}', 50, 0);
create temp table _b38f as select * from public.base_clientes_buscar('{"loja":"1730","embarque_de":"2027-01-01"}', 50, 0);
reset role;
reset request.jwt.claim.sub;

select public._test_assert('total soma só os valores conhecidos e marca as compras sem valor (parcial)',
  (select total_comprado = 100 and compras_sem_valor = 1 and qtd_viagens = 2 from _b38 where nome = 'Saída Julho'));
select public._test_assert('cliente só com compra sem valor: total null (não coletado)',
  (select total_comprado is null and compras_sem_valor = 1 from _b38 where nome = 'Só Sync'));
select public._test_assert('cliente com todos os valores: não é parcial',
  (select total_comprado = 200 and compras_sem_valor = 0 from _b38 where nome = 'Confirmou Julho'));
select public._test_assert('soma do filtro marca parcial quando falta valor numa compra que casou',
  (select bool_and(soma_parcial) from _b38)
  and (select bool_and(soma_parcial and soma_valores = 0) and count(*) = 1 from _b38f));
select public._test_assert('filtro total de/até trata total desconhecido como 0',
  not exists (select 1 from public.base_clientes_buscar('{"loja":"1730","total_de":"1"}', 50, 0) where nome = 'Só Sync'));

drop function public._test_assert(text, boolean);
