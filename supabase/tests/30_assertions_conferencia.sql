-- ============================================================================
-- Aura Conferência — Etapa 1 (migrations 20261023000001 e 20261023000002).
--
-- Cobre:
--   1. Sync: nome de vendedor novo cria mapeamento sem vínculo e aparece em
--      vendedores_sem_vinculo; reenviar o mesmo corpo não duplica nada.
--   2. Evento de voo só quando o retrato muda; campos de conferência
--      ausentes não apagam o que existe; avisar_cliente depois de "cliente
--      avisado" só volta com mudança nova.
--   3. Casamento de cliente: pessoa_id; nome + telefone; homônimo ambíguo
--      vira cliente novo com revisar = true.
--   4. Recibos: vendedor/cliente via cliente_excursoes.recibos; total.
--   5. Vincular o mapeamento (admin) propaga para reservas/recibos/clientes;
--      sugestão de vínculo por nome sem acento/caixa.
--   6. RLS: vendedor A não lê dados do B; gerente lê a loja inteira; gerente
--      de outra loja não lê; admin lê tudo; authenticated não escreve nem
--      executa as funções de gravação; mapeamento/config só admin altera.
--   7. Idempotência das migrations.
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

-- Usuárias que batem com nomes do Systur (sugestão de vínculo).
insert into auth.users (id, email, raw_user_meta_data) values
  ('30000000-0000-0000-0000-0000000000a1', 'rosane@teste.com', '{"nome_completo":"Rosane Karina dos Santos","perfil":"vendedor","filial":"1710"}'),
  ('30000000-0000-0000-0000-0000000000a2', 'talita@teste.com', '{"nome_completo":"TALITA Marcela Gomes Damas","perfil":"vendedor","filial":"1710"}')
on conflict (id) do nothing;

-- Mapeamentos de teste: Vendedor A e B na 1710, gerente da 1714 vende na 1714.
update public.systur_vendedor_mapeamento set usuario_id = '00000000-0000-0000-0000-000000000001'
where loja = '1710' and nome_systur = 'Adriana Magalhaes De Oliveira';
update public.systur_vendedor_mapeamento set usuario_id = '00000000-0000-0000-0000-000000000002'
where loja = '1710' and nome_systur = 'Bryan Luis Santos Da Rocha';

select public._test_assert('semente: 9 nomes da 1710', (select count(*) = 9 from public.systur_vendedor_mapeamento where loja = '1710'));
select public._test_assert('semente: Dayane com login CWBG0109',
  (select login_systur = 'CWBG0109' from public.systur_vendedor_mapeamento where nome_systur = 'Dayane Peres Kawaguchi'));
select public._test_assert('config: logins de gravação padrão',
  (select logins_gravacao = '{SPBG0007,CWBG0109}' from public.conferencia_config));
select public._test_assert('modelos: recompra e venda_adicional',
  (select count(*) = 2 from public.mensagem_modelos where chave in ('recompra', 'venda_adicional')));

-- ----------------------------------------------------------------------------
-- 1. Sync
-- ----------------------------------------------------------------------------

select $json${
  "versao_extensao": "0.11.0", "login_systur": "SPBG0007", "loja": "1710",
  "consulta": { "tipo": "saida", "de": "2026-10-20", "ate": "2026-10-27" },
  "excursoes": [
    { "reserva": "303999143", "roteiro": "289029041", "excursao": "2.18550.121701",
      "recibos": ["1710-0000158835"], "vendedor_systur": "Adriana Magalhaes De Oliveira",
      "contratantes": [{ "pessoa_id": "21287851", "nome": "Christian Matheus Gonçalves" }],
      "telefones": [{ "numero": "41 9651-7241", "tipo": "Celular", "contato": "" }],
      "destino": "PORTO DE GALINHAS", "descricao": "PORTO DE GALINHAS - 1 Dias 0 Noites",
      "data_viagem": "2026-12-17", "data_retorno": "2026-12-17", "data_confirmacao": "2026-02-14",
      "voucher_status": "Falta Emitir", "reserva_site": false,
      "status_voos": "sem_aereo", "alteracoes": [], "avisos": [],
      "pendencias": [{ "tipo": "76", "nome": "Assinatura Eletrônica Contrato", "status": "aguardando" }],
      "servicos": [], "apolices": [], "retrato_voos": [{"voo": "G3 1234", "saida": "10:00"}],
      "avisar_cliente": false, "aviso": null, "conferido_em": "2026-10-23T13:00:00Z" },
    { "reserva": "303999200", "excursao": "9.1.1", "recibos": ["1710-0000158900"],
      "vendedor_systur": "Bryan Luis Santos Da Rocha",
      "contratantes": [{ "pessoa_id": "555", "nome": "Cliente Do B" }],
      "data_confirmacao": "2026-03-01" },
    { "reserva": "303999300", "excursao": "5.1.1",
      "vendedor_systur": "Fulano Novo Da Silva",
      "contratantes": [{ "pessoa_id": "777", "nome": "Cliente Sem Vendedor" }],
      "data_confirmacao": "2026-04-01" }
  ]
}$json$::jsonb as corpo
\gset

select public.conferencia_sync('00000000-0000-0000-0000-000000000004', :'corpo') as r1 \gset

select public._test_assert('sync 1: 3 recebidas, 3 novas', (:'r1'::jsonb ->> 'recebidas')::int = 3 and (:'r1'::jsonb ->> 'novas')::int = 3);
select public._test_assert('sync 1: sem evento de voo na primeira gravação', (:'r1'::jsonb ->> 'eventos_voo')::int = 0);
select public._test_assert('sync 1: vendedor novo em vendedores_sem_vinculo',
  :'r1'::jsonb -> 'vendedores_sem_vinculo' = '["Fulano Novo Da Silva"]'::jsonb);
select public._test_assert('sync 1: nome novo vira mapeamento sem vínculo',
  (select usuario_id is null from public.systur_vendedor_mapeamento where loja = '1710' and nome_systur = 'Fulano Novo Da Silva'));
select public._test_assert('sync 1: vendedor resolvido pelo mapeamento',
  (select vendedor_usuario_id = '00000000-0000-0000-0000-000000000001' from public.cliente_excursoes where reserva = '303999143'));
select public._test_assert('sync 1: categoria = 1º dígito da excursão',
  (select categoria_codigo = 2 from public.cliente_excursoes where reserva = '303999143'));
select public._test_assert('sync 1: cliente por pessoa_id, com telefone e vendedor',
  (select count(*) = 1 from public.clientes where pessoa_id_systur = '21287851'
     and telefones -> 0 ->> 'numero' = '41 9651-7241'
     and vendedor_usuario_id = '00000000-0000-0000-0000-000000000001'
     and primeira_compra = '2026-02-14' and loja_principal = '1710'));
select public._test_assert('sync 1: atualizado_por carimbado',
  (select atualizado_por = '00000000-0000-0000-0000-000000000004' from public.cliente_excursoes where reserva = '303999143'));

select count(*) as clientes_antes from public.clientes \gset
select count(*) as mapeamentos_antes from public.systur_vendedor_mapeamento \gset

select public.conferencia_sync('00000000-0000-0000-0000-000000000004', :'corpo') as r2 \gset

select public._test_assert('sync 2 (mesmo corpo): 0 novas, 3 atualizadas, 0 eventos',
  (:'r2'::jsonb ->> 'novas')::int = 0 and (:'r2'::jsonb ->> 'atualizadas')::int = 3 and (:'r2'::jsonb ->> 'eventos_voo')::int = 0);
select public._test_assert('sync 2: não duplica reservas', (select count(*) = 3 from public.cliente_excursoes));
select public._test_assert('sync 2: não duplica clientes', (select count(*) = :clientes_antes from public.clientes));
select public._test_assert('sync 2: não duplica mapeamento', (select count(*) = :mapeamentos_antes from public.systur_vendedor_mapeamento));
select public._test_assert('sync 2: não duplica telefones',
  (select jsonb_array_length(telefones) = 1 from public.clientes where pessoa_id_systur = '21287851'));

-- ----------------------------------------------------------------------------
-- 2. Retrato dos voos, campos ausentes e aviso ao cliente
-- ----------------------------------------------------------------------------

-- Consulta só por data de confirmação (histórico): sem campos de conferência.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "303999143", "excursao": "2.18550.121701", "vendedor_systur": "Adriana Magalhaes De Oliveira",
      "contratantes": [{ "pessoa_id": "21287851", "nome": "Christian Matheus Gonçalves" }],
      "data_confirmacao": "2026-02-14" } ]
}$json$::jsonb) as r3 \gset

select public._test_assert('histórico: sem evento de voo', (:'r3'::jsonb ->> 'eventos_voo')::int = 0);
select public._test_assert('histórico: não apaga pendências, retrato, voucher nem conferido_em',
  (select pendencias -> 0 ->> 'tipo' = '76' and retrato_voos is not null and voucher_status = 'Falta Emitir'
          and conferido_em = '2026-10-23T13:00:00Z' and destino = 'PORTO DE GALINHAS'
   from public.cliente_excursoes where reserva = '303999143'));

-- Retrato muda (atraso > 15 min) -> 1 evento significativo e avisar_cliente.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "303999143", "retrato_voos": [{"voo": "G3 1234", "saida": "10:40"}],
      "alteracoes": [{"voo": "G3 1234", "minutos": 40}], "avisar_cliente": true,
      "aviso": {"texto": "Voo alterado em 40 min"} } ]
}$json$::jsonb) as r4 \gset

select public._test_assert('retrato mudou: 1 evento', (:'r4'::jsonb ->> 'eventos_voo')::int = 1);
select public._test_assert('evento guarda antes/depois e é significativo',
  (select count(*) = 1 from public.cliente_voo_eventos
   where reserva = '303999143' and significativa
     and retrato_antes -> 0 ->> 'saida' = '10:00' and retrato_depois -> 0 ->> 'saida' = '10:40'));
select public._test_assert('avisar_cliente ligado', (select avisar_cliente from public.cliente_excursoes where reserva = '303999143'));

-- Mesmo retrato de novo -> nenhum evento novo.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "303999143", "retrato_voos": [{"voo": "G3 1234", "saida": "10:40"}], "avisar_cliente": true } ]
}$json$::jsonb) as r5 \gset
select public._test_assert('retrato igual: 0 eventos', (:'r5'::jsonb ->> 'eventos_voo')::int = 0
  and (select count(*) = 1 from public.cliente_voo_eventos where reserva = '303999143'));

-- Cliente avisado: vendedor B não pode marcar reserva da A; a própria A pode.
select public._test_assert('cliente avisado: vendedor de fora não marca',
  not public.conferencia_marcar_cliente_avisado('00000000-0000-0000-0000-000000000002', '303999143'));
select public._test_assert('cliente avisado: reserva inexistente = false',
  not public.conferencia_marcar_cliente_avisado('00000000-0000-0000-0000-000000000001', 'nao-existe'));
select public._test_assert('cliente avisado: dona marca',
  public.conferencia_marcar_cliente_avisado('00000000-0000-0000-0000-000000000001', '303999143'));
select public._test_assert('cliente avisado: avisar_cliente = false e carimbo',
  (select not avisar_cliente and cliente_avisado_em is not null
          and cliente_avisado_por = '00000000-0000-0000-0000-000000000001'
   from public.cliente_excursoes where reserva = '303999143'));

-- A extensão ainda manda avisar_cliente = true com o mesmo retrato: continua false.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "303999143", "retrato_voos": [{"voo": "G3 1234", "saida": "10:40"}], "avisar_cliente": true } ]
}$json$::jsonb);
select public._test_assert('já avisado + mesmo retrato: não religa',
  (select not avisar_cliente from public.cliente_excursoes where reserva = '303999143'));

-- Mudança nova depois do aviso: religa.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "303999143", "retrato_voos": [{"voo": "G3 1234", "saida": "11:30"}], "avisar_cliente": true } ]
}$json$::jsonb);
select public._test_assert('mudança nova depois do aviso: religa e grava 2º evento',
  (select avisar_cliente from public.cliente_excursoes where reserva = '303999143')
  and (select count(*) = 2 from public.cliente_voo_eventos where reserva = '303999143'));

-- ----------------------------------------------------------------------------
-- 3. Casamento de cliente sem pessoa_id
-- ----------------------------------------------------------------------------

select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "R-SEMID-1", "vendedor_systur": "Adriana Magalhaes De Oliveira",
      "contratantes": [{ "nome": "Maria José Souza" }],
      "telefones": [{ "numero": "(41) 99999-0001" }], "data_confirmacao": "2026-05-01" } ]
}$json$::jsonb);
-- Mesmo nome (com acento/caixa diferentes) e mesmo telefone em outro formato: mesmo cliente.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "R-SEMID-2", "vendedor_systur": "Adriana Magalhaes De Oliveira",
      "contratantes": [{ "nome": "MARIA JOSE  souza" }],
      "telefones": [{ "numero": "41 9999-0001" }], "data_confirmacao": "2026-06-01" } ]
}$json$::jsonb);
select public._test_assert('nome + telefone: mesmo cliente',
  (select count(distinct cliente_id) = 1 from public.cliente_excursoes where reserva in ('R-SEMID-1', 'R-SEMID-2'))
  and (select count(*) = 1 from public.clientes where nome_normalizado = 'maria jose souza'));
select public._test_assert('compra mais recente define ultima_compra',
  (select primeira_compra = '2026-05-01' and ultima_compra = '2026-06-01' from public.clientes where nome_normalizado = 'maria jose souza'));
-- Mesmo nome, telefone diferente: ambíguo -> cliente novo para revisar.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "R-SEMID-3", "vendedor_systur": "Adriana Magalhaes De Oliveira",
      "contratantes": [{ "nome": "Maria José Souza" }],
      "telefones": [{ "numero": "41 98888-7777" }] } ]
}$json$::jsonb);
select public._test_assert('homônimo sem telefone em comum: novo com revisar',
  (select count(*) = 2 from public.clientes where nome_normalizado = 'maria jose souza')
  and (select revisar from public.clientes c join public.cliente_excursoes e on e.cliente_id = c.id where e.reserva = 'R-SEMID-3'));
-- Reenvio do mesmo corpo sem pessoa_id não cria outro cliente.
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "excursoes": [
    { "reserva": "R-SEMID-3", "vendedor_systur": "Adriana Magalhaes De Oliveira",
      "contratantes": [{ "nome": "Maria José Souza" }],
      "telefones": [{ "numero": "41 98888-7777" }] } ]
}$json$::jsonb);
select public._test_assert('reenvio sem pessoa_id: idempotente',
  (select count(*) = 2 from public.clientes where nome_normalizado = 'maria jose souza'));

-- ----------------------------------------------------------------------------
-- 4. Recibos
-- ----------------------------------------------------------------------------

select public.conferencia_recibos('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "data_venda": "2026-10-22",
  "recibos": [
    { "recibo": "17100000158835", "numero": "1710-0000158835", "cliente": "Christian Matheus Gonçalves", "valor": 1500.50 },
    { "recibo": "1710-0000158900", "cliente": "Cliente Do B", "valor": "2.000,00", "data": "21/10/2026" },
    { "recibo": "17100000161708", "cliente": "Ninguem Cadastrado", "valor": 10 }
  ]
}$json$::jsonb) as rr1 \gset

select public._test_assert('recibos: 3 novos', (:'rr1'::jsonb ->> 'novos')::int = 3);
select public._test_assert('recibo herda vendedor/cliente da reserva',
  (select vendedor_usuario_id = '00000000-0000-0000-0000-000000000001' and cliente_id is not null
   from public.recibos where recibo = '17100000158835'));
select public._test_assert('recibo: número derivado, valor pt-BR e data dd/mm/aaaa',
  (select numero = '1710-0000158900' and valor = 2000.00 and data_venda = '2026-10-21'
   from public.recibos where recibo = '17100000158900'));
select public._test_assert('recibo sem reserva nem cliente: sem vínculo',
  (select cliente_id is null and vendedor_usuario_id is null from public.recibos where recibo = '17100000161708'));
select public._test_assert('total_comprado soma os recibos do cliente',
  (select total_comprado = 1500.50 from public.clientes where pessoa_id_systur = '21287851'));
select public.conferencia_recibos('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1710", "data_venda": "2026-10-22",
  "recibos": [ { "recibo": "17100000158835", "cliente": "Christian Matheus Gonçalves", "valor": 1500.50 } ]
}$json$::jsonb) as rr2 \gset
select public._test_assert('recibos: reenvio idempotente',
  (:'rr2'::jsonb ->> 'novos')::int = 0 and (select count(*) = 3 from public.recibos)
  and (select total_comprado = 1500.50 from public.clientes where pessoa_id_systur = '21287851'));

-- ----------------------------------------------------------------------------
-- 5. Vínculo do mapeamento e sugestões
-- ----------------------------------------------------------------------------

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;

select public._test_assert('sugestão: Rosane (sem acento/caixa) -> usuária',
  exists (select 1 from public.systur_sugestoes_vinculo() s
          join public.systur_vendedor_mapeamento m on m.id = s.mapeamento_id
          where m.nome_systur = 'Rosane Karina Dos Santos' and s.usuario_id = '30000000-0000-0000-0000-0000000000a1'));
select public._test_assert('sugestão: Tálita -> TALITA',
  exists (select 1 from public.systur_sugestoes_vinculo() s
          join public.systur_vendedor_mapeamento m on m.id = s.mapeamento_id
          where m.nome_systur = 'Tálita Marcela Gomes Damas' and s.usuario_id = '30000000-0000-0000-0000-0000000000a2'));
select public._test_assert('sugestão: nome sem usuário não sugere',
  not exists (select 1 from public.systur_sugestoes_vinculo() s
              join public.systur_vendedor_mapeamento m on m.id = s.mapeamento_id
              where m.nome_systur = 'Fulano Novo Da Silva'));

-- Admin vincula "Fulano Novo" ao Vendedor B: reserva e cliente passam a ser dele.
update public.systur_vendedor_mapeamento set usuario_id = '00000000-0000-0000-0000-000000000002', login_systur = 'CWBG0200'
where loja = '1710' and nome_systur = 'Fulano Novo Da Silva';

reset role;
reset request.jwt.claim.sub;

select public._test_assert('vínculo propaga para a reserva',
  (select vendedor_usuario_id = '00000000-0000-0000-0000-000000000002' from public.cliente_excursoes where reserva = '303999300'));
select public._test_assert('vínculo propaga para o cliente',
  (select vendedor_usuario_id = '00000000-0000-0000-0000-000000000002' from public.clientes where pessoa_id_systur = '777'));

-- Vendedor/gerente não alteram mapeamento.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
update public.systur_vendedor_mapeamento set usuario_id = '00000000-0000-0000-0000-000000000003'
where nome_systur = 'Sophia De Souza';
select public._test_assert('gerente lê o mapeamento da loja',
  (select count(*) >= 9 from public.systur_vendedor_mapeamento));
reset role;
reset request.jwt.claim.sub;
select public._test_assert('gerente não altera mapeamento',
  (select usuario_id is null from public.systur_vendedor_mapeamento where nome_systur = 'Sophia De Souza'));

do $$
begin
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
  set local role authenticated;
  update public.systur_vendedor_mapeamento set nome_systur = 'Outro' where nome_systur = 'Sophia De Souza';
  raise exception 'FALHOU: admin não deveria alterar nome_systur';
exception when insufficient_privilege then
  raise notice 'ok: nome_systur não é editável';
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------

-- Dado da 1714 (vendedor = gerente 1714, para ter dono).
insert into public.systur_vendedor_mapeamento (nome_systur, loja, usuario_id)
values ('Gerente Batel', '1714', '00000000-0000-0000-0000-000000000005')
on conflict do nothing;
select public.conferencia_sync('00000000-0000-0000-0000-000000000004', $json${
  "loja": "1714", "excursoes": [
    { "reserva": "R-1714", "vendedor_systur": "Gerente Batel",
      "contratantes": [{ "pessoa_id": "1714001", "nome": "Cliente Batel" }] } ]
}$json$::jsonb);

-- Vendedor A
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('vendedor A vê a própria reserva', exists (select 1 from public.cliente_excursoes where reserva = '303999143'));
select public._test_assert('vendedor A não vê reserva do B',
  not exists (select 1 from public.cliente_excursoes where reserva in ('303999200', '303999300')));
select public._test_assert('vendedor A não vê cliente do B', not exists (select 1 from public.clientes where pessoa_id_systur in ('555', '777')));
select public._test_assert('vendedor A não vê recibo do B', not exists (select 1 from public.recibos where recibo = '17100000158900'));
select public._test_assert('vendedor A vê os eventos de voo da própria reserva', (select count(*) = 2 from public.cliente_voo_eventos));
select public._test_assert('vendedor A não vê recibo sem vendedor', not exists (select 1 from public.recibos where recibo = '17100000161708'));
select public._test_assert('vendedor A não vê a 1714', not exists (select 1 from public.cliente_excursoes where loja = '1714'));
select public._test_assert('vendedor A lê modelos e config',
  (select count(*) = 2 from public.mensagem_modelos) and (select count(*) = 1 from public.conferencia_config));
select public._test_assert('vendedor A não lê o mapeamento', not exists (select 1 from public.systur_vendedor_mapeamento));
update public.mensagem_modelos set texto = 'hack';
update public.conferencia_config set versao_atual = 'hack';
reset role;
reset request.jwt.claim.sub;
select public._test_assert('vendedor não altera modelos nem config',
  not exists (select 1 from public.mensagem_modelos where texto = 'hack')
  and not exists (select 1 from public.conferencia_config where versao_atual = 'hack'));

-- Vendedor B
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
select public._test_assert('vendedor B vê só as próprias reservas',
  (select array_agg(reserva order by reserva) = '{303999200,303999300}' from public.cliente_excursoes));
select public._test_assert('vendedor B não vê cliente da A', not exists (select 1 from public.clientes where pessoa_id_systur = '21287851'));
reset role;
reset request.jwt.claim.sub;

-- Gerente 1710: loja inteira (inclui reserva/recibo sem vendedor vinculado).
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
set role authenticated;
select public._test_assert('gerente 1710 vê todas as reservas da 1710',
  (select count(*) = (select count(*) from public.cliente_excursoes) from public.cliente_excursoes) and
  (select count(*) = 6 from public.cliente_excursoes) and not exists (select 1 from public.cliente_excursoes where loja = '1714'));
select public._test_assert('gerente 1710 vê todos os recibos da 1710', (select count(*) = 3 from public.recibos));
select public._test_assert('gerente 1710 não vê cliente da 1714', not exists (select 1 from public.clientes where pessoa_id_systur = '1714001'));
reset role;
reset request.jwt.claim.sub;

-- Gerente 1714: só a 1714.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
set role authenticated;
select public._test_assert('gerente 1714 vê só a 1714',
  (select array_agg(reserva) = '{R-1714}' from public.cliente_excursoes)
  and not exists (select 1 from public.recibos));
reset role;
reset request.jwt.claim.sub;

-- Admin: tudo.
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
set role authenticated;
select public._test_assert('admin vê todas as reservas', (select count(*) = 7 from public.cliente_excursoes));
update public.mensagem_modelos set texto = 'Olá {cliente}!' where chave = 'recompra';
update public.conferencia_config set versao_atual = '0.12.0';
reset role;
reset request.jwt.claim.sub;
select public._test_assert('admin altera modelos e config',
  (select texto = 'Olá {cliente}!' from public.mensagem_modelos where chave = 'recompra')
  and (select versao_atual = '0.12.0' from public.conferencia_config));

-- authenticated não escreve dados nem executa as funções de gravação.
do $$
declare
  v_casos text[] := array[
    $q$insert into public.clientes (nome) values ('x')$q$,
    $q$insert into public.cliente_excursoes (reserva, loja) values ('x', '1710')$q$,
    $q$update public.cliente_excursoes set avisar_cliente = false$q$,
    $q$insert into public.recibos (recibo, loja) values ('1', '1710')$q$,
    $q$insert into public.conferencia_reportes (usuario_id, texto) values ('00000000-0000-0000-0000-000000000004', 'x')$q$,
    $q$insert into public.systur_vendedor_mapeamento (nome_systur, loja) values ('x', '1710')$q$,
    $q$select public.conferencia_sync('00000000-0000-0000-0000-000000000004', '{}'::jsonb)$q$,
    $q$select public.conferencia_recibos('00000000-0000-0000-0000-000000000004', '{}'::jsonb)$q$,
    $q$select public.conferencia_marcar_cliente_avisado('00000000-0000-0000-0000-000000000004', '303999143')$q$,
    $q$select public.usuario_pode_ver_conferencia('00000000-0000-0000-0000-000000000004', '1710', null)$q$
  ];
  v_sql text;
begin
  foreach v_sql in array v_casos loop
    begin
      set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
      set local role authenticated;
      execute v_sql;
      raise exception 'FALHOU: authenticated executou: %', v_sql;
    exception when insufficient_privilege then
      raise notice 'ok: bloqueado para authenticated: %', left(v_sql, 60);
    end;
    reset role;
  end loop;
end;
$$;

-- Storage: PDF do recibo segue a visibilidade do recibo.
update public.recibos set pdf_path = '1710/2026/10/17100000158835.pdf' where recibo = '17100000158835';
insert into storage.objects (bucket_id, name) values ('recibos', '1710/2026/10/17100000158835.pdf');

set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
set role authenticated;
select public._test_assert('storage: dona vê o PDF', exists (select 1 from storage.objects where bucket_id = 'recibos'));
reset role;
set request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
set role authenticated;
select public._test_assert('storage: outro vendedor não vê o PDF', not exists (select 1 from storage.objects where bucket_id = 'recibos'));
reset role;
reset request.jwt.claim.sub;

-- ----------------------------------------------------------------------------
-- 7. Idempotência das migrations
-- ----------------------------------------------------------------------------

\ir ../migrations/20261023000001_systur_vendedor_mapeamento.sql
\ir ../migrations/20261023000002_clientes_conferencia.sql

select public._test_assert('reaplicar migrations não duplica semente nem perde dados',
  (select count(*) = 1 from public.systur_vendedor_mapeamento where nome_systur = 'Dayane Peres Kawaguchi')
  and (select count(*) = 2 from public.mensagem_modelos)
  and (select count(*) = 1 from public.conferencia_config)
  and (select versao_atual = '0.12.0' from public.conferencia_config)
  and (select count(*) = 7 from public.cliente_excursoes));

drop function public._test_assert(text, boolean);

select 'todos os asserts da conferência passaram' as status;
