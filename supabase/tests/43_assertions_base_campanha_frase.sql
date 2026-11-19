-- ============================================================================
-- Migration 20261120000001: a frase da campanha é o filtro principal.
-- ============================================================================

set role postgres;

\ir ../migrations/20261120000001_base_campanha_frase.sql

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

-- Clientes da 1714 com nome "... 43".
select public.conferencia_base('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1714", "janela": { "de": "2025-01-01", "ate": "2027-12-31" },
  "reservas": [
    { "reserva": "R43-A1", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2026-10-01", "data_viagem": "2027-02-10", "data_retorno": "2027-02-20",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["aereo"], "contratantes": [ { "pessoa_id": "43001", "nome": "Ana Sem Ingresso 43", "valor": 3000 } ] },
    { "reserva": "R43-B1", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2026-10-02", "data_viagem": "2027-03-01", "data_retorno": "2027-03-10",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["aereo"], "contratantes": [ { "pessoa_id": "43002", "nome": "Beto Com Ingresso 43", "valor": 3000 } ] },
    { "reserva": "R43-B2", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2026-10-03", "data_viagem": "2027-03-02", "data_retorno": "2027-03-02",
      "destino": { "cidade": "DISNEY - ORLANDO" }, "tipos_servico": ["ingresso"], "contratantes": [ { "pessoa_id": "43002", "nome": "Beto Com Ingresso 43", "valor": 900 } ] },
    { "reserva": "R43-C1", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2026-10-04", "data_viagem": "2027-04-01", "data_retorno": "2027-04-05",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["aereo"], "contratantes": [ { "pessoa_id": "43003", "nome": "Caio Ingresso Outra Viagem 43", "valor": 3000 } ] },
    { "reserva": "R43-C2", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2026-01-10", "data_viagem": "2026-06-01", "data_retorno": "2026-06-01",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["ingresso"], "contratantes": [ { "pessoa_id": "43003", "nome": "Caio Ingresso Outra Viagem 43", "valor": 800 } ] },
    { "reserva": "R43-D1", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2026-10-05", "data_viagem": "2027-02-01", "data_retorno": "2027-02-08",
      "destino": { "cidade": "NATAL" }, "tipos_servico": ["aereo"], "contratantes": [ { "pessoa_id": "43004", "nome": "Dani Natal 43", "valor": 2000 } ] },
    { "reserva": "R43-E1", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2025-03-01", "data_viagem": "2025-07-01", "data_retorno": "2025-07-10",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["aereo"], "contratantes": [ { "pessoa_id": "43005", "nome": "Eva Foi Ao Nordeste 43", "valor": 5000 } ] },
    { "reserva": "R43-E2", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2026-05-01", "data_viagem": "2026-12-20", "data_retorno": "2026-12-27",
      "destino": { "cidade": "MACEIO" }, "tipos_servico": ["hotel"], "contratantes": [ { "pessoa_id": "43005", "nome": "Eva Foi Ao Nordeste 43", "valor": 1500 } ] },
    { "reserva": "R43-F1", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2025-04-01", "data_viagem": "2025-08-01", "data_retorno": "2025-08-10",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["aereo"], "contratantes": [ { "pessoa_id": "43006", "nome": "Fabi Voltou A Orlando 43", "valor": 5000 } ] },
    { "reserva": "R43-F2", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2026-02-01", "data_viagem": "2026-09-01", "data_retorno": "2026-09-10",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["aereo"], "contratantes": [ { "pessoa_id": "43006", "nome": "Fabi Voltou A Orlando 43", "valor": 5000 } ] },
    { "reserva": "R43-G1", "vendedor_systur": "Vendedor 43", "data_confirmacao": "2025-05-01", "data_viagem": "2025-09-01", "data_retorno": "2025-09-10",
      "destino": { "cidade": "ORLANDO" }, "tipos_servico": ["aereo"], "contratantes": [ { "pessoa_id": "43007", "nome": "Gil Parado 43", "valor": 5000 } ] }
  ]
}$json$::jsonb);

-- Nomes "... 43" que a busca devolve (adm_master, loja 1714).
create or replace function pg_temp.nomes(p_filtros jsonb)
returns text[]
language sql
as $$
  select coalesce(array_agg(nome order by nome) filter (where nome like '% 43'), '{}')
  from public.base_clientes_buscar(p_filtros || '{"loja":"1714"}', 1000, 0)
$$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

create temp table _r43 (caso text, nomes text[]);
insert into _r43 values
  ('adicional vazia', pg_temp.nomes('{"camp":"adicional"}')),
  ('adicional orlando sem ingresso', pg_temp.nomes('{"camp":"adicional","ca_tipo":"aereo","ca_destino":"orlando","ca_de":"2026-11-19","ca_ate":"2027-05-19","ca_sem_tipo":"ingresso"}')),
  ('recompra vazia', pg_temp.nomes('{"camp":"recompra"}')),
  ('recompra qualquer destino', pg_temp.nomes('{"camp":"recompra","cr_destino":"orlando","cr_a_de":"2025-01-01","cr_a_ate":"2025-12-31","cr_sem":"nada","cr_b_de":"2026-01-01","cr_b_ate":"2026-11-19"}')),
  ('recompra mesmo destino', pg_temp.nomes('{"camp":"recompra","cr_destino":"orlando","cr_a_de":"2025-01-01","cr_a_ate":"2025-12-31","cr_sem":"nada","cr_mesmo_destino":"1","cr_b_de":"2026-01-01","cr_b_ate":"2026-11-19"}')),
  ('recompra sem aereo', pg_temp.nomes('{"camp":"recompra","cr_a_de":"2025-01-01","cr_a_ate":"2025-12-31","cr_sem":"aereo","cr_b_de":"2026-01-01","cr_b_ate":"2026-11-19"}')),
  ('recompra sem hotel', pg_temp.nomes('{"camp":"recompra","cr_a_de":"2025-01-01","cr_a_ate":"2025-12-31","cr_sem":"hotel","cr_b_de":"2026-01-01","cr_b_ate":"2026-11-19"}')),
  ('antigos ignorados', pg_temp.nomes('{"camp":"adicional","destino":"natal","tipo":"hotel","embarque_de":"2030-01-01","compra_ate":"2020-01-01"}')),
  ('antigo cr_escopo ignorado', pg_temp.nomes('{"camp":"recompra","cr_a_de":"2025-01-01","cr_a_ate":"2025-12-31","cr_escopo":"mesmo","cr_b_de":"2026-01-01","cr_b_ate":"2026-11-19"}')),
  ('camp vazio (antiga Nenhuma)', pg_temp.nomes('{"camp":""}')),
  ('valor da compra do Comprou', pg_temp.nomes('{"camp":"adicional","ca_tipo":"aereo","ca_sem_tipo":"ingresso","valor_de":"2500"}'));
reset role;

create or replace function pg_temp.r(p_caso text) returns text[] language sql as $$ select nomes from _r43 where caso = p_caso $$;

select public._test_assert('Venda adicional com a frase vazia: base geral (todos os 7)',
  cardinality(pg_temp.r('adicional vazia')) = 7);
select public._test_assert('"Aéreo para Orlando, embarque nos próx. 6 meses, não comprou Ingresso": só quem não tem ingresso na mesma viagem',
  pg_temp.r('adicional orlando sem ingresso') = '{"Ana Sem Ingresso 43","Caio Ingresso Outra Viagem 43"}');
select public._test_assert('Recompra com a frase vazia: base geral (antes excluía todo mundo)',
  cardinality(pg_temp.r('recompra vazia')) = 7);
select public._test_assert('Recompra para qualquer destino: quem comprou outro destino no 2º período NÃO aparece',
  pg_temp.r('recompra qualquer destino') = '{"Gil Parado 43"}');
select public._test_assert('Recompra para o mesmo destino: quem foi a outro destino aparece; quem voltou ao mesmo, não',
  pg_temp.r('recompra mesmo destino') = '{"Eva Foi Ao Nordeste 43","Gil Parado 43"}');
select public._test_assert('Recompra "não comprou [tipo]": só sai quem comprou aquele tipo no 2º período',
  pg_temp.r('recompra sem aereo') @> '{"Eva Foi Ao Nordeste 43","Gil Parado 43"}'
  and not pg_temp.r('recompra sem aereo') @> '{"Fabi Voltou A Orlando 43"}'
  and pg_temp.r('recompra sem hotel') @> '{"Fabi Voltou A Orlando 43","Gil Parado 43"}'
  and not pg_temp.r('recompra sem hotel') @> '{"Eva Foi Ao Nordeste 43"}');
select public._test_assert('parâmetros antigos (destino, tipo, embarque, data da compra) aceitos e ignorados',
  cardinality(pg_temp.r('antigos ignorados')) = 7);
select public._test_assert('cr_escopo antigo ignorado ("não comprou" padrão = nada, qualquer destino)',
  pg_temp.r('antigo cr_escopo ignorado') = '{"Gil Parado 43"}');
select public._test_assert('camp vazio (antiga "Nenhuma") segue aceito: base geral',
  cardinality(pg_temp.r('camp vazio (antiga Nenhuma)')) = 7);
select public._test_assert('valor da compra vale para a compra do "Comprou"',
  pg_temp.r('valor da compra do Comprou') @> '{"Ana Sem Ingresso 43","Caio Ingresso Outra Viagem 43","Gil Parado 43"}'
  and not pg_temp.r('valor da compra do Comprou') && '{"Dani Natal 43","Beto Com Ingresso 43"}');

reset request.jwt.claim.sub;

\ir ../migrations/20261120000001_base_campanha_frase.sql
select public._test_assert('reaplicar a migration é idempotente',
  to_regprocedure('public.base_clientes_buscar(jsonb, integer, integer)') is not null);

drop function public._test_assert(text, boolean);

select 'todos os asserts da frase da campanha passaram' as status;
