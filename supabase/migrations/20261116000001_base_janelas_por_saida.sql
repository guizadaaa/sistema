-- ============================================================================
-- Cobertura da base: janelas por data de SAÍDA.
--
-- O bot da extensão percorre as Excursões Confirmadas do Systur pela data de
-- saída da viagem (pela data de confirmação o Systur só trazia viagens
-- futuras). Em base_coleta_janelas, de/ate passam a ser datas de saída e
-- "reservas" conta as reservas coletadas da loja com data_viagem na janela.
--
-- Janelas gravadas antes de 16/11/2026 17:00 UTC eram por data de confirmação:
-- são apagadas (o bot já as ignora e recoleta pela saída).
--
-- Idempotente (delete com corte fixo / create or replace).
-- ============================================================================

delete from public.base_coleta_janelas where coletado_em < timestamptz '2026-11-16 17:00:00+00';

comment on table public.base_coleta_janelas is
  'Janelas (data de SAÍDA de/até) já coletadas pelo bot, por loja. reservas = reservas da loja coletadas pelo bot com data_viagem na janela.';
comment on column public.base_coleta_janelas.de is 'Data de saída (data_viagem) inicial da janela.';
comment on column public.base_coleta_janelas.ate is 'Data de saída (data_viagem) final da janela.';

-- Mesma função de 20261113000001; só a contagem da janela mudou
-- (data_confirmacao -> data_viagem).
create or replace function public.conferencia_base(p_usuario uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja filial_cvc;
  v_de date;
  v_ate date;
  e jsonb;
  v_reserva text;
  v_tem boolean;
  v_vendedor_nome text;
  v_vendedor uuid;
  v_contratantes jsonb;
  v_principal jsonb;
  v_cliente uuid;
  v_pessoas text[];
  v_recibos text[];
  v_valor_total numeric;
  v_tipos text[];
  v_clientes uuid[] := '{}';
  v_recebidas int := 0;
  v_novas int := 0;
  v_atualizadas int := 0;
  v_clientes_novos int := 0;
  v_sem_vinculo text[] := '{}';
  v_id uuid;
begin
  begin
    v_loja := (p_payload ->> 'loja')::filial_cvc;
  exception when invalid_text_representation then
    raise exception 'Loja inválida: %', p_payload ->> 'loja' using errcode = '22023';
  end;
  if v_loja is null then
    raise exception 'Loja obrigatória.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload -> 'reservas') is distinct from 'array' then
    raise exception 'reservas deve ser uma lista.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_payload -> 'reservas') > 200 then
    raise exception 'No máximo 200 reservas por chamada.' using errcode = '22023';
  end if;
  v_de := public._data_conferencia(p_payload #>> '{janela,de}');
  v_ate := public._data_conferencia(p_payload #>> '{janela,ate}');
  if coalesce((p_payload ->> 'fim_da_janela')::boolean, false) and (v_de is null or v_ate is null or v_de > v_ate) then
    raise exception 'fim_da_janela exige janela.de e janela.ate válidos.' using errcode = '22023';
  end if;

  -- Clientes novos = pessoas do lote que ainda não existem.
  select count(distinct p) into v_clientes_novos
  from jsonb_array_elements(p_payload -> 'reservas') r,
       jsonb_array_elements(case when jsonb_typeof(r -> 'contratantes') = 'array' then r -> 'contratantes' else '[]' end) c,
       nullif(trim(c ->> 'pessoa_id'), '') p
  where p is not null and not exists (select 1 from public.clientes x where x.pessoa_id_systur = p);

  for e in select value from jsonb_array_elements(p_payload -> 'reservas') loop
    v_reserva := nullif(trim(e ->> 'reserva'), '');
    if v_reserva is null then
      raise exception 'Reserva sem número.' using errcode = '22023';
    end if;
    v_recebidas := v_recebidas + 1;

    perform 1 from public.cliente_excursoes where reserva = v_reserva for update;
    v_tem := found;

    -- Vendedor: nome novo entra no mapeamento sem vínculo (como no sync).
    v_vendedor_nome := nullif(trim(e ->> 'vendedor_systur'), '');
    v_vendedor := null;
    if v_vendedor_nome is not null then
      insert into public.systur_vendedor_mapeamento (nome_systur, loja)
      values (v_vendedor_nome, v_loja)
      on conflict (loja, nome_systur) do nothing;

      select m.usuario_id into v_vendedor
      from public.systur_vendedor_mapeamento m
      where m.loja = v_loja and m.nome_systur = v_vendedor_nome and m.ativo;

      if v_vendedor is null and not (v_vendedor_nome = any (v_sem_vinculo)) then
        v_sem_vinculo := v_sem_vinculo || v_vendedor_nome;
      end if;
    end if;

    v_contratantes := case when jsonb_typeof(e -> 'contratantes') = 'array' then e -> 'contratantes' else '[]'::jsonb end;
    v_principal := v_contratantes -> 0;
    v_cliente := case
      when v_principal is not null and nullif(trim(v_principal ->> 'pessoa_id'), '') is not null
        then public._conferencia_upsert_cliente(v_principal, public._jcampo(v_principal, 'telefones'), null)
    end;

    v_pessoas := array(
      select trim(c ->> 'pessoa_id') from jsonb_array_elements(v_contratantes) c
      where nullif(trim(c ->> 'pessoa_id'), '') is not null
    );
    v_recibos := array(
      select distinct trim(c ->> 'recibo') from jsonb_array_elements(v_contratantes) c
      where nullif(trim(c ->> 'recibo'), '') is not null
    );
    select sum(public._valor_conferencia(c -> 'valor')) into v_valor_total from jsonb_array_elements(v_contratantes) c;
    v_tipos := case when jsonb_typeof(e -> 'tipos_servico') = 'array'
      then array(select x from jsonb_array_elements_text(e -> 'tipos_servico') x) end;

    insert into public.cliente_excursoes as t (
      reserva, roteiro, excursao, categoria_codigo, loja, recibos, vendedor_nome_systur, vendedor_usuario_id,
      cliente_id, contratantes, destino, descricao, data_viagem, data_retorno, data_confirmacao, voucher_status,
      reserva_site, tipo_produto, descricao_roteiro, destino_pais, destino_estado, destino_cidade, origem_cidade,
      tem_voo, fornecedores, tipos_servico, valor_total, coletado_em, atualizado_por
    ) values (
      v_reserva,
      e ->> 'roteiro',
      e ->> 'excursao',
      nullif(left(regexp_replace(coalesce(e ->> 'excursao', ''), '\D', '', 'g'), 1), '')::smallint,
      v_loja,
      v_recibos,
      v_vendedor_nome,
      v_vendedor,
      v_cliente,
      v_contratantes,
      nullif(trim(e #>> '{destino,cidade}'), ''),
      nullif(trim(e ->> 'descricao_roteiro'), ''),
      public._data_conferencia(e ->> 'data_viagem'),
      public._data_conferencia(e ->> 'data_retorno'),
      public._data_conferencia(e ->> 'data_confirmacao'),
      e ->> 'voucher_status',
      (e ->> 'reserva_site')::boolean,
      nullif(trim(e ->> 'tipo_produto'), ''),
      nullif(trim(e ->> 'descricao_roteiro'), ''),
      nullif(trim(e #>> '{destino,pais}'), ''),
      nullif(trim(e #>> '{destino,estado}'), ''),
      nullif(trim(e #>> '{destino,cidade}'), ''),
      nullif(trim(e #>> '{origem,cidade}'), ''),
      (e ->> 'tem_voo')::boolean,
      case when jsonb_typeof(e -> 'fornecedores') = 'array' then e -> 'fornecedores' end,
      v_tipos,
      v_valor_total,
      now(),
      p_usuario
    )
    on conflict (reserva) do update set
      roteiro = coalesce(excluded.roteiro, t.roteiro),
      excursao = coalesce(excluded.excursao, t.excursao),
      categoria_codigo = coalesce(excluded.categoria_codigo, t.categoria_codigo),
      loja = excluded.loja,
      recibos = case when cardinality(excluded.recibos) > 0 then excluded.recibos else t.recibos end,
      vendedor_nome_systur = coalesce(excluded.vendedor_nome_systur, t.vendedor_nome_systur),
      vendedor_usuario_id = case when excluded.vendedor_nome_systur is not null then excluded.vendedor_usuario_id
                                 else t.vendedor_usuario_id end,
      cliente_id = coalesce(excluded.cliente_id, t.cliente_id),
      contratantes = case when jsonb_array_length(excluded.contratantes) > 0 then excluded.contratantes else t.contratantes end,
      destino = coalesce(t.destino, excluded.destino),
      descricao = coalesce(t.descricao, excluded.descricao),
      data_viagem = coalesce(excluded.data_viagem, t.data_viagem),
      data_retorno = coalesce(excluded.data_retorno, t.data_retorno),
      data_confirmacao = coalesce(excluded.data_confirmacao, t.data_confirmacao),
      voucher_status = coalesce(excluded.voucher_status, t.voucher_status),
      reserva_site = coalesce(excluded.reserva_site, t.reserva_site),
      tipo_produto = coalesce(excluded.tipo_produto, t.tipo_produto),
      descricao_roteiro = coalesce(excluded.descricao_roteiro, t.descricao_roteiro),
      destino_pais = coalesce(excluded.destino_pais, t.destino_pais),
      destino_estado = coalesce(excluded.destino_estado, t.destino_estado),
      destino_cidade = coalesce(excluded.destino_cidade, t.destino_cidade),
      origem_cidade = coalesce(excluded.origem_cidade, t.origem_cidade),
      tem_voo = coalesce(excluded.tem_voo, t.tem_voo),
      fornecedores = coalesce(excluded.fornecedores, t.fornecedores),
      tipos_servico = coalesce(excluded.tipos_servico, t.tipos_servico),
      valor_total = coalesce(excluded.valor_total, t.valor_total),
      coletado_em = excluded.coletado_em,
      atualizado_por = excluded.atualizado_por;

    if v_tem then
      v_atualizadas := v_atualizadas + 1;
    else
      v_novas := v_novas + 1;
    end if;

    -- O bot manda todos os contratantes da reserva: quem saiu deixa de ser compra.
    if cardinality(v_pessoas) > 0 then
      for v_id in
        delete from public.cliente_compras t
        where t.reserva = v_reserva and t.pessoa_id_systur <> all (v_pessoas)
        returning t.cliente_id
      loop
        v_clientes := v_clientes || v_id;
      end loop;
    end if;

    for v_id in select * from public._conferencia_vincular_recibos(v_reserva, false) loop
      v_clientes := v_clientes || v_id;
    end loop;
  end loop;

  for v_id in select distinct x from unnest(v_clientes) x where x is not null loop
    perform public._conferencia_recalcular_cliente(v_id);
  end loop;

  if coalesce((p_payload ->> 'fim_da_janela')::boolean, false) then
    insert into public.base_coleta_janelas as j (loja, de, ate, reservas, coletado_por, coletado_em)
    values (
      v_loja, v_de, v_ate,
      (select count(*) from public.cliente_excursoes x
       where x.loja = v_loja and x.coletado_em is not null and x.data_viagem between v_de and v_ate),
      p_usuario, now()
    )
    on conflict (loja, de, ate) do update set
      reservas = excluded.reservas, coletado_por = excluded.coletado_por, coletado_em = excluded.coletado_em;
  end if;

  return jsonb_build_object(
    'recebidas', v_recebidas,
    'novas', v_novas,
    'atualizadas', v_atualizadas,
    'clientes_novos', v_clientes_novos,
    'vendedores_sem_vinculo', to_jsonb(v_sem_vinculo)
  );
end;
$$;

revoke all on function public.conferencia_base(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.conferencia_base(uuid, jsonb) to service_role;
