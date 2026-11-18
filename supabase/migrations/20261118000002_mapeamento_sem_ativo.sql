-- ============================================================================
-- Vendedores do Systur: sem o "Ativo" do mapeamento.
--
-- Quem sai da equipe é inativado como usuário da Aura (usuarios.ativo), e
-- isso já move as vendas para ex-vendedor. O "ativo" do mapeamento não tinha
-- utilidade e confundia. Regra final (sem mudança para o usuário):
--   equipe atual = nome vinculado a usuário ativo;
--   ex-vendedor  = sem vínculo ou vinculado a usuário inativo;
--   site         = à parte (vendedor_eh_site).
--
-- * todas as linhas com ativo = true; a coluna fica (default true, sem
--   permissão de alteração) só para não quebrar nada — TODO: remover depois;
-- * m.ativo sai de conferencia_sync, conferencia_base, do gatilho que
--   propaga o vínculo, de base_clientes_vendedores_opcoes e de
--   systur_nomes_parecem_ativos (mesmas funções, só sem o m.ativo);
-- * systur_mapeamento_grupos(): cada nome com o grupo da tela (equipe
--   atual / sem vínculo / site) e se parece usuário ativo.
--
-- Idempotente.
-- ============================================================================

update public.systur_vendedor_mapeamento set ativo = true where not ativo;
alter table public.systur_vendedor_mapeamento alter column ativo set default true;
comment on column public.systur_vendedor_mapeamento.ativo is
  'SEM USO desde 20261118000002 (sempre true). Equipe atual/ex vem de usuarios.ativo. Remover numa próxima limpeza.';

revoke update (ativo) on public.systur_vendedor_mapeamento from authenticated;

create or replace function public.conferencia_sync(p_usuario uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loja filial_cvc;
  e jsonb;
  v_reserva text;
  v_existe public.cliente_excursoes%rowtype;
  v_tem boolean;
  v_vendedor_nome text;
  v_vendedor uuid;
  v_cliente uuid;
  v_principal jsonb;
  v_retrato jsonb;
  v_retrato_mudou boolean;
  v_avisar boolean;
  v_recibos text[];
  v_clientes uuid[] := '{}';
  v_recebidas int := 0;
  v_novas int := 0;
  v_atualizadas int := 0;
  v_eventos int := 0;
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
  if jsonb_typeof(p_payload -> 'excursoes') is distinct from 'array' then
    raise exception 'excursoes deve ser uma lista.' using errcode = '22023';
  end if;

  for e in select value from jsonb_array_elements(p_payload -> 'excursoes') loop
    v_reserva := nullif(trim(e ->> 'reserva'), '');
    if v_reserva is null then
      raise exception 'Excursão sem número de reserva.' using errcode = '22023';
    end if;
    v_recebidas := v_recebidas + 1;

    select * into v_existe from public.cliente_excursoes where reserva = v_reserva for update;
    v_tem := found;

    -- Vendedor: nome novo entra no mapeamento sem vínculo.
    v_vendedor := case when v_tem then v_existe.vendedor_usuario_id end;
    v_vendedor_nome := case when v_tem then v_existe.vendedor_nome_systur end;
    if e ? 'vendedor_systur' then
      v_vendedor_nome := nullif(trim(e ->> 'vendedor_systur'), '');
      v_vendedor := null;
      if v_vendedor_nome is not null then
        insert into public.systur_vendedor_mapeamento (nome_systur, loja)
        values (v_vendedor_nome, v_loja)
        on conflict (loja, nome_systur) do nothing;

        select m.usuario_id into v_vendedor
        from public.systur_vendedor_mapeamento m
        where m.loja = v_loja and m.nome_systur = v_vendedor_nome;

        if v_vendedor is null and not (v_vendedor_nome = any (v_sem_vinculo)) then
          v_sem_vinculo := v_sem_vinculo || v_vendedor_nome;
        end if;
      end if;
    end if;

    -- Cliente: contratante principal.
    v_cliente := case when v_tem then v_existe.cliente_id end;
    if e ? 'contratantes' then
      v_principal := case when jsonb_typeof(e -> 'contratantes') = 'array' then e -> 'contratantes' -> 0 end;
      if v_principal is not null then
        v_cliente := public._conferencia_upsert_cliente(
          v_principal,
          public._jcampo(e, 'telefones'),
          -- só reaproveita o cliente atual se ele ainda for o mesmo contratante
          case when v_tem and (v_existe.contratantes -> 0 ->> 'nome') is not distinct from (v_principal ->> 'nome')
               then v_existe.cliente_id end
        );
      end if;
    elsif e ? 'telefones' and v_cliente is not null then
      update public.clientes c set telefones = public._telefones_mesclar(c.telefones, public._jcampo(e, 'telefones'))
      where c.id = v_cliente;
    end if;

    -- Retrato dos voos: evento quando muda em relação ao salvo.
    v_retrato := case when e ? 'retrato_voos' then public._jcampo(e, 'retrato_voos')
                      when v_tem then v_existe.retrato_voos end;
    v_retrato_mudou := v_tem and e ? 'retrato_voos'
      and v_existe.retrato_voos is not null
      and v_existe.retrato_voos is distinct from v_retrato;

    if v_retrato_mudou then
      insert into public.cliente_voo_eventos (reserva, alteracoes, significativa, retrato_antes, retrato_depois, registrado_por)
      values (
        v_reserva,
        coalesce(public._jcampo(e, 'alteracoes'), '[]'::jsonb),
        coalesce((e ->> 'avisar_cliente')::boolean, false),
        v_existe.retrato_voos,
        v_retrato,
        p_usuario
      );
      v_eventos := v_eventos + 1;
    end if;

    -- avisar_cliente: depois de "cliente avisado", só volta a true com uma
    -- mudança nova no retrato.
    v_avisar := case
      when not (e ? 'avisar_cliente') then coalesce(v_existe.avisar_cliente, false)
      when not v_tem or v_retrato_mudou or v_existe.cliente_avisado_em is null
        then coalesce((e ->> 'avisar_cliente')::boolean, false)
      else v_existe.avisar_cliente
    end;

    v_recibos := case
      when jsonb_typeof(e -> 'recibos') = 'array'
        then array(select trim(x) from jsonb_array_elements_text(e -> 'recibos') x where trim(x) <> '')
    end;

    insert into public.cliente_excursoes as t (
      reserva, roteiro, excursao, categoria_codigo, loja, recibos, vendedor_nome_systur, vendedor_usuario_id,
      cliente_id, contratantes, destino, descricao, data_viagem, data_retorno, data_confirmacao, voucher_status,
      reserva_site, status_voos, alteracoes, avisos, pendencias, servicos, apolices, retrato_voos, avisar_cliente,
      aviso, conferido_em, atualizado_por, login_systur
    ) values (
      v_reserva,
      e ->> 'roteiro',
      e ->> 'excursao',
      nullif(left(regexp_replace(coalesce(e ->> 'excursao', ''), '\D', '', 'g'), 1), '')::smallint,
      v_loja,
      coalesce(v_recibos, '{}'),
      v_vendedor_nome,
      v_vendedor,
      v_cliente,
      coalesce(case when jsonb_typeof(e -> 'contratantes') = 'array' then e -> 'contratantes' end, '[]'::jsonb),
      e ->> 'destino',
      e ->> 'descricao',
      public._data_conferencia(e ->> 'data_viagem'),
      public._data_conferencia(e ->> 'data_retorno'),
      public._data_conferencia(e ->> 'data_confirmacao'),
      e ->> 'voucher_status',
      (e ->> 'reserva_site')::boolean,
      e ->> 'status_voos',
      public._jcampo(e, 'alteracoes'),
      public._jcampo(e, 'avisos'),
      public._jcampo(e, 'pendencias'),
      public._jcampo(e, 'servicos'),
      public._jcampo(e, 'apolices'),
      v_retrato,
      v_avisar,
      public._jcampo(e, 'aviso'),
      (e ->> 'conferido_em')::timestamptz,
      p_usuario,
      nullif(trim(p_payload ->> 'login_systur'), '')
    )
    on conflict (reserva) do update set
      roteiro = case when e ? 'roteiro' then excluded.roteiro else t.roteiro end,
      excursao = case when e ? 'excursao' then excluded.excursao else t.excursao end,
      categoria_codigo = case when e ? 'excursao' then excluded.categoria_codigo else t.categoria_codigo end,
      loja = excluded.loja,
      recibos = case when e ? 'recibos' then excluded.recibos else t.recibos end,
      vendedor_nome_systur = excluded.vendedor_nome_systur,
      vendedor_usuario_id = excluded.vendedor_usuario_id,
      cliente_id = excluded.cliente_id,
      contratantes = case when e ? 'contratantes' then excluded.contratantes else t.contratantes end,
      destino = case when e ? 'destino' then excluded.destino else t.destino end,
      descricao = case when e ? 'descricao' then excluded.descricao else t.descricao end,
      data_viagem = case when e ? 'data_viagem' then excluded.data_viagem else t.data_viagem end,
      data_retorno = case when e ? 'data_retorno' then excluded.data_retorno else t.data_retorno end,
      data_confirmacao = case when e ? 'data_confirmacao' then excluded.data_confirmacao else t.data_confirmacao end,
      voucher_status = case when e ? 'voucher_status' then excluded.voucher_status else t.voucher_status end,
      reserva_site = case when e ? 'reserva_site' then excluded.reserva_site else t.reserva_site end,
      status_voos = case when e ? 'status_voos' then excluded.status_voos else t.status_voos end,
      alteracoes = case when e ? 'alteracoes' then excluded.alteracoes else t.alteracoes end,
      avisos = case when e ? 'avisos' then excluded.avisos else t.avisos end,
      pendencias = case when e ? 'pendencias' then excluded.pendencias else t.pendencias end,
      servicos = case when e ? 'servicos' then excluded.servicos else t.servicos end,
      apolices = case when e ? 'apolices' then excluded.apolices else t.apolices end,
      retrato_voos = excluded.retrato_voos,
      avisar_cliente = excluded.avisar_cliente,
      aviso = case when e ? 'aviso' then excluded.aviso else t.aviso end,
      conferido_em = case when e ? 'conferido_em' then excluded.conferido_em else t.conferido_em end,
      atualizado_por = excluded.atualizado_por,
      login_systur = coalesce(excluded.login_systur, t.login_systur);

    if v_tem then
      v_atualizadas := v_atualizadas + 1;
      if v_existe.cliente_id is not null then
        v_clientes := v_clientes || v_existe.cliente_id;
      end if;
    else
      v_novas := v_novas + 1;
    end if;
    if v_cliente is not null then
      v_clientes := v_clientes || v_cliente;
    end if;

    for v_id in select * from public._conferencia_vincular_recibos(v_reserva, false) loop
      v_clientes := v_clientes || v_id;
    end loop;
  end loop;

  for v_id in select distinct x from unnest(v_clientes) x loop
    perform public._conferencia_recalcular_cliente(v_id);
  end loop;

  return jsonb_build_object(
    'recebidas', v_recebidas,
    'novas', v_novas,
    'atualizadas', v_atualizadas,
    'eventos_voo', v_eventos,
    'vendedores_sem_vinculo', to_jsonb(v_sem_vinculo)
  );
end;
$$;


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
      where m.loja = v_loja and m.nome_systur = v_vendedor_nome;

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


create or replace function public.systur_mapeamento_propagar_vinculo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserva text;
  v_clientes uuid[] := '{}';
  v_id uuid;
begin
  if new.usuario_id is not distinct from old.usuario_id then
    return new;
  end if;

  for v_reserva, v_id in
    update public.cliente_excursoes e
    set vendedor_usuario_id = new.usuario_id
    where e.loja = new.loja and e.vendedor_nome_systur = new.nome_systur
    returning e.reserva, e.cliente_id
  loop
    if v_id is not null then
      v_clientes := v_clientes || v_id;
    end if;
    for v_id in select * from public._conferencia_vincular_recibos(v_reserva, true) loop
      v_clientes := v_clientes || v_id;
    end loop;
  end loop;

  for v_id in select distinct x from unnest(v_clientes) x loop
    perform public._conferencia_recalcular_cliente(v_id);
  end loop;
  return new;
end;
$$;


create or replace function public.base_clientes_vendedores_opcoes()
returns table (categoria text, valor text, rotulo text, loja filial_cvc)
language sql
stable
security definer
set search_path = public
as $$
  with lojas as (select public._lojas_visiveis() as v)
  select distinct 'atual', 'usuario:' || u.id::text, u.nome_completo, u.filial
  from public.systur_vendedor_mapeamento m
  join public.usuarios u on u.id = m.usuario_id and u.ativo
  where not public.vendedor_eh_site(m.nome_systur)
    and m.loja = any ((select v from lojas)::filial_cvc[])
  union
  select distinct 'ex', m.nome_systur, m.nome_systur, m.loja
  from public.systur_vendedor_mapeamento m
  left join public.usuarios u on u.id = m.usuario_id
  where m.loja = any ((select v from lojas)::filial_cvc[])
    and not public.vendedor_eh_site(m.nome_systur)
    and not coalesce(u.ativo, false)
  order by 1, 3;
$$;


create or replace function public.systur_nomes_parecem_ativos()
returns table (mapeamento_id uuid, nome_systur text, loja filial_cvc, usuario_id uuid, usuario_nome text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome_systur, m.loja, u.id, u.nome_completo
  from public.systur_vendedor_mapeamento m
  join public.usuarios u on u.ativo and public.normalizar_nome(u.nome_completo) = public.normalizar_nome(m.nome_systur)
  where public.auth_is_admin()
    and m.usuario_id is null
  order by m.loja, m.nome_systur;
$$;


-- Nomes do mapeamento com o grupo da tela de vendedores (só adm/adm_master).
-- drop: 20261119000001 acrescenta colunas ao retorno (reaplicar esta migration nos testes).
drop function if exists public.systur_mapeamento_grupos(filial_cvc);

create function public.systur_mapeamento_grupos(p_loja filial_cvc default null)
returns table (
  id uuid,
  nome_systur text,
  loja filial_cvc,
  usuario_id uuid,
  login_systur text,
  usuario_nome text,
  grupo text,
  parece_ativo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome_systur, m.loja, m.usuario_id, m.login_systur, u.nome_completo,
    case
      when public.vendedor_eh_site(m.nome_systur) then 'site'
      when coalesce(u.ativo, false) then 'atual'
      else 'sem_vinculo'
    end,
    m.usuario_id is null and exists (
      select 1 from public.usuarios x
      where x.ativo and public.normalizar_nome(x.nome_completo) = public.normalizar_nome(m.nome_systur)
    )
  from public.systur_vendedor_mapeamento m
  left join public.usuarios u on u.id = m.usuario_id
  where public.auth_is_admin()
    and (p_loja is null or m.loja = p_loja)
  order by public.normalizar_nome(m.nome_systur), m.loja;
$$;

revoke all on function public.systur_mapeamento_grupos(filial_cvc) from public, anon;
grant execute on function public.systur_mapeamento_grupos(filial_cvc) to authenticated, service_role;
