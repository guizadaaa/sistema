-- ============================================================================
-- Carga de desempenho da base de clientes (volume real e um pouco além):
--   60 mil reservas (3 lojas, saídas 2019–2028), 70 mil compras, 25 mil
--   clientes, 80 nomes no mapeamento do Systur (ativos, inativos, sem
--   vínculo e site), fornecedores com textos de até 300 caracteres e janelas
--   de coleta por loja.
-- Roda como postgres depois das migrations e do 01_seed.sql (usuários de
-- teste). Uso: scripts/carga-clientes.sh (npm run carga-clientes).
-- Os gatilhos são desligados só durante a carga (session_replication_role)
-- para gerar o volume em segundos; os agregados de clientes são calculados
-- em lote no fim, como o gatilho faria.
-- ============================================================================

\set ON_ERROR_STOP 1
set role postgres;
select setseed(0.42);

-- 50 vendedores da carga (40 ativos, 10 inativos), distribuídos nas 3 lojas.
insert into auth.users (id, email, raw_user_meta_data)
select ('c0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'vendedor' || g || '@carga.test',
  jsonb_build_object('nome_completo', 'Vendedor Carga ' || g, 'perfil', 'vendedor',
                     'filial', (array['1710', '1714', '1730'])[1 + g % 3])
from generate_series(1, 50) g
on conflict (id) do nothing;

set session_replication_role = replica;

update public.usuarios set ativo = false
where id in (select ('c0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid from generate_series(41, 50) g);

-- 80 nomes no mapeamento: 50 vinculados (40 ativos + 10 inativos), 27 sem
-- vínculo (ex-vendedores) e 3 do site.
insert into public.systur_vendedor_mapeamento (nome_systur, loja, usuario_id)
select 'Vendedor Carga ' || g, (array['1710', '1714', '1730'])[1 + g % 3]::filial_cvc,
  ('c0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid
from generate_series(1, 50) g
union all
select 'Ex Vendedor Carga ' || g, (array['1710', '1714', '1730'])[1 + g % 3]::filial_cvc, null
from generate_series(1, 27) g
union all
select 'Agencia De Viagens Cvc Tur - Internet', l::filial_cvc, null
from unnest(array['1710', '1714', '1730']) l
on conflict do nothing;

create temp table _nomes as
select row_number() over (partition by loja order by nome_systur) - 1 as i, loja, nome_systur, usuario_id,
  count(*) over (partition by loja) as n
from public.systur_vendedor_mapeamento
where nome_systur like 'Vendedor Carga %' or nome_systur like 'Ex Vendedor Carga %' or nome_systur like 'Agencia De Viagens%';

-- 25 mil clientes.
insert into public.clientes (pessoa_id_systur, nome, telefones)
select 'P' || g, 'Cliente Carga ' || g,
  jsonb_build_array(jsonb_build_object('numero', '41 9' || lpad((g % 10000)::text, 4, '0') || '-' || lpad((g % 7919)::text, 4, '0'), 'tipo', 'Celular'))
from generate_series(1, 25000) g
on conflict (pessoa_id_systur) do nothing;

create temp table _clientes as
select row_number() over (order by pessoa_id_systur) as i, id, pessoa_id_systur, nome
from public.clientes where pessoa_id_systur like 'P%';

create temp table _destinos (i int, cidade text, pais text);
insert into _destinos
select row_number() over () - 1, cidade, pais from (values
  ('ORLANDO', 'ESTADOS UNIDOS'), ('DISNEY - ORLANDO', 'ESTADOS UNIDOS'), ('MIAMI', 'ESTADOS UNIDOS'), ('NOVA YORK', 'ESTADOS UNIDOS'),
  ('PARIS', 'FRANCA'), ('DISNEY - PARIS', 'FRANCA'), ('LISBOA', 'PORTUGAL'), ('PORTO', 'PORTUGAL'), ('ROMA', 'ITALIA'),
  ('MADRI', 'ESPANHA'), ('BUENOS AIRES', 'ARGENTINA'), ('BARILOCHE', 'ARGENTINA'), ('SANTIAGO', 'CHILE'), ('CANCUN', 'MEXICO'),
  ('PUNTA CANA', 'REPUBLICA DOMINICANA'), ('PORTO SEGURO', 'BRASIL'), ('MACEIO', 'BRASIL'), ('NATAL', 'BRASIL'),
  ('FORTALEZA', 'BRASIL'), ('SALVADOR', 'BRASIL'), ('GRAMADO', 'BRASIL'), ('FLORIANOPOLIS', 'BRASIL'), ('RIO DE JANEIRO', 'BRASIL'),
  ('FOZ DO IGUACU', 'BRASIL'), ('BONITO', 'BRASIL'), ('JERICOACOARA', 'BRASIL'), ('FERNANDO DE NORONHA', 'BRASIL'),
  ('SANTOS', 'BRASIL'), ('LONDRES', 'INGLATERRA'), ('DUBAI', 'EMIRADOS ARABES'), ('MONTEVIDEU', 'URUGUAI'), ('LIMA', 'PERU'),
  ('CUSCO', 'PERU'), ('ARUBA', 'ARUBA'), ('CURACAO', 'CURACAO'), ('LAS VEGAS', 'ESTADOS UNIDOS'), ('TOQUIO', 'JAPAO'),
  ('AMSTERDA', 'HOLANDA'), ('BERLIM', 'ALEMANHA'), ('ATENAS', 'GRECIA')
) d (cidade, pais);

-- 60 mil reservas.
insert into public.cliente_excursoes (
  reserva, roteiro, excursao, categoria_codigo, loja, recibos, vendedor_nome_systur, vendedor_usuario_id, cliente_id,
  contratantes, destino, descricao, data_viagem, data_retorno, data_confirmacao, voucher_status, reserva_site,
  tipo_produto, descricao_roteiro, destino_pais, destino_cidade, origem_cidade, tem_voo, fornecedores, tipos_servico,
  valor_total, coletado_em
)
select
  'C' || g, (290000000 + g)::text, x.cat || '.' || (6000000 + g) || '.26092201', x.cat::smallint, x.loja::filial_cvc,
  array[x.loja || '-' || lpad(g::text, 10, '0')],
  nm.nome_systur, case when nm.usuario_id is not null then nm.usuario_id end, c.id,
  jsonb_build_array(jsonb_build_object('pessoa_id', c.pessoa_id_systur, 'nome', c.nome)),
  d.cidade, d.cidade || ' - ' || x.dias || ' Dias ' || x.noites || ' Noites',
  x.viagem, x.viagem + x.dias, x.viagem - (10 + g % 300), 'Emitido', g % 17 = 0,
  (array['PACOTE', 'AÉREO', 'PRODUTO FÁCIL', 'HOTEL', 'INGRESSO'])[1 + g % 5],
  d.cidade || ' - ' || x.dias || ' Dias ' || x.noites || ' Noites', d.pais, d.cidade, 'CURITIBA', g % 3 <> 0,
  (select jsonb_agg(jsonb_build_object(
      'categoria', (array['ATIVIDADE', 'HOTEL', 'TRANSFER', 'AEREO', 'SEGURO'])[1 + (g + k) % 5],
      'receptivo', (9000000 + g) || ' - Receptivo ' || d.cidade,
      'cidade', d.cidade,
      'servico', left((70000000 + g + k) || ' - ' || repeat('Serviço ' || d.cidade || ' com traslado, ingresso e café · ', 8), 300),
      'data_inicial', x.viagem, 'data_final', x.viagem + x.dias, 'acordo', (59000000 + g)::text))
   from generate_series(1, 1 + g % 3) k),
  string_to_array((array['aereo', 'aereo,hotel', 'ingresso', 'hotel', 'aereo,hotel,transfer', 'passeio',
                         'aereo,hotel,ingresso,seguro', 'cruzeiro'])[1 + g % 8], ','),
  null, now() - ((g % 500) || ' minutes')::interval
from generate_series(1, 60000) g
cross join lateral (
  select (array['1710', '1714', '1730'])[1 + (g * 7) % 3] as loja,
    (date '2019-01-01' + ((g * 7919) % 3650))::date as viagem,
    1 + g % 14 as dias, (g % 14) as noites,
    (array[9, 1, 5, 2, 3, 8])[1 + g % 6] as cat
) x
join _nomes nm on nm.loja::text = x.loja and nm.i = (g * 13) % nm.n
join _destinos d on d.i = (g * 31) % 40
join _clientes c on c.i = 1 + (g * 7) % 25000;

-- 70 mil compras: uma por reserva + segundo contratante em 10 mil reservas.
insert into public.cliente_compras (
  reserva, cliente_id, pessoa_id_systur, nome, recibo, valor, taxa_embarque, taxa_iof, passageiros,
  loja, data_confirmacao, data_viagem, data_retorno, destino_cidade, tipos_servico
)
select e.reserva, c.id, c.pessoa_id_systur, c.nome, e.loja || '-' || substr(e.reserva, 2),
  case when substr(e.reserva, 2)::int % 20 = 0 then null else 500 + (substr(e.reserva, 2)::int * 37) % 15000 end,
  120, 33.59, array[c.nome], e.loja, e.data_confirmacao, e.data_viagem, e.data_retorno, e.destino_cidade, e.tipos_servico
from public.cliente_excursoes e
join _clientes c on c.id = e.cliente_id
where e.reserva like 'C%'
union all
select e.reserva, c2.id, c2.pessoa_id_systur, c2.nome, null, 300 + (substr(e.reserva, 2)::int * 13) % 5000, 0, 0, array[c2.nome],
  e.loja, e.data_confirmacao, e.data_viagem, e.data_retorno, e.destino_cidade, e.tipos_servico
from public.cliente_excursoes e
join _clientes c2 on c2.i = 1 + (substr(e.reserva, 2)::int * 11) % 25000
where e.reserva like 'C%' and substr(e.reserva, 2)::int % 6 = 0 and c2.id <> e.cliente_id;

update public.cliente_excursoes e set valor_total = s.total
from (select reserva, sum(valor) as total from public.cliente_compras where reserva like 'C%' group by reserva) s
where s.reserva = e.reserva;

-- Agregados dos clientes (o que _conferencia_recalcular_cliente faria, em lote).
update public.clientes cl set
  total_comprado = coalesce(a.total, 0), primeira_compra = a.primeira, ultima_compra = a.ultima,
  proxima_viagem = a.proxima, qtd_viagens = a.qtd, loja_principal = a.loja
from (
  select cliente_id, sum(valor) as total, min(data_confirmacao) as primeira, max(data_confirmacao) as ultima,
    min(data_viagem) filter (where data_viagem >= current_date) as proxima, count(distinct reserva) as qtd, min(loja) as loja
  from public.cliente_compras group by cliente_id
) a
where a.cliente_id = cl.id;

-- Janelas de coleta por semestre (com buracos).
insert into public.base_coleta_janelas (loja, de, ate, reservas, coletado_por, coletado_em)
select l::filial_cvc, d::date, (d + interval '6 month - 1 day')::date, 0, '00000000-0000-0000-0000-000000000004', now()
from unnest(array['1710', '1714', '1730']) l, generate_series(date '2019-01-01', date '2028-07-01', interval '6 month') d
where not (l = '1714' and d between '2022-01-01' and '2022-12-31')
on conflict (loja, de, ate) do nothing;

update public.base_coleta_janelas j set reservas = (
  select count(*) from public.cliente_excursoes e
  where e.loja = j.loja and e.coletado_em is not null and e.data_viagem between j.de and j.ate);

-- Vendas (planilhas) de ~1 ano nas 3 lojas e importações diárias (dias úteis).
insert into public.vendedores_mapeamento (nome_planilha, filial, usuario_id, criado_por)
select 'VENDEDOR CARGA ' || g, (array['1710', '1714', '1730'])[1 + g % 3]::filial_cvc,
  ('c0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, '00000000-0000-0000-0000-000000000004'
from generate_series(1, 50) g;

insert into public.vendas_importadas (filial, venda_numero, vendedor_nome_planilha, data_venda, pagante, produto, valor_total, importado_por)
select (array['1710', '1714', '1730'])[1 + g % 3]::filial_cvc, 9000000 + g,
  'VENDEDOR CARGA ' || (1 + (g * 7) % 50), current_date - (g % 365), 'Pagante ' || g, 'Produto ' || (g % 40),
  200 + (g * 37) % 9000, '00000000-0000-0000-0000-000000000004'
from generate_series(1, 36000) g;

insert into public.vendas_importacoes (filial, ate, importado_por, importado_em)
select l::filial_cvc, d::date - 1, '00000000-0000-0000-0000-000000000004', d + interval '12 hours'
from unnest(array['1710', '1714', '1730']) l, generate_series(current_date - 365, current_date, interval '1 day') d
where extract(isodow from d) < 6 and random() > 0.05;

-- 20 mil casos (Acompanhar Casos): donos entre os vendedores de carga (e o
-- vendedor 1710 da semente), status e prazos variados, 2% de teste.
insert into public.casos (tipo_caso, motivo, descricao, vendedor_dono, vendedor_original_nome, criado_por, prazo_vigencia,
  contrato_numero, cliente_nome, cliente_cpf, filial, status_atual, caso_teste, criado_em)
select 'alteracao_data', 'pedido_cliente', 'carga',
  d.id, 'Carga', d.id, current_date + (g % 120) - 40, '17' || lpad(g::text, 12, '0'), 'Cliente Caso ' || g, '11144477735',
  d.filial, (enum_range(null::status_caso))[1 + g % 6], g % 50 = 0, now() - (g % 700) * interval '1 day'
from generate_series(1, 20000) g
cross join lateral (
  select u.id, u.filial from public.usuarios u
  where u.filial is not null and u.perfil = 'vendedor'
  order by u.id offset (g % 20) limit 1
) d;

set session_replication_role = origin;

-- Filtros salvos e modelos com texto (a página lê os dois).
update public.mensagem_modelos set texto = 'Olá, {nome}! Aqui é {vendedor}. Sua viagem para {destino} em {data_embarque}...' where texto = '';

vacuum analyze;

select
  (select count(*) from public.cliente_excursoes) as reservas,
  (select count(*) from public.cliente_compras) as compras,
  (select count(*) from public.clientes) as clientes,
  (select count(*) from public.systur_vendedor_mapeamento) as nomes_mapeamento,
  (select count(*) from public.vendas_importadas) as vendas,
  (select count(*) from public.vendas_importacoes) as importacoes,
  (select max(length(f ->> 'servico')) from public.cliente_excursoes, jsonb_array_elements(fornecedores) f where reserva like 'C%') as maior_servico;
