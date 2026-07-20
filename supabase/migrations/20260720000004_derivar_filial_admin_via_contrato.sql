-- Fecha a lacuna aberta em 20260717000006: quando o dono de um caso novo
-- não tem filial própria (adm/adm_master), deriva a filial dos 4 primeiros
-- dígitos do contrato_numero — convenção CVC confirmada pelo cliente: o
-- contrato sempre começa com o código da própria filial (1710, 1714 ou
-- 1730), seguido de 10 dígitos. Reatribuições (UPDATE) continuam
-- preservando a filial existente, sem uso do contrato.
create or replace function public.set_caso_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filial filial_cvc;
  v_nome text;
  v_prefixo text;
begin
  select filial, nome_completo into v_filial, v_nome
  from public.usuarios where id = new.vendedor_dono;

  if v_filial is not null then
    new.filial := v_filial;
  elsif tg_op = 'UPDATE' then
    new.filial := old.filial;
  else
    v_prefixo := left(coalesce(new.contrato_numero, ''), 4);

    if v_prefixo not in ('1710', '1714', '1730') then
      raise exception
        'Não foi possível determinar a filial do caso: o dono (%) não tem filial definida e o contrato "%" não começa com um código de filial válido (1710, 1714 ou 1730).',
        new.vendedor_dono, new.contrato_numero;
    end if;

    new.filial := v_prefixo::filial_cvc;
  end if;

  -- vendedor_original_nome só é definido na criação; reatribuições preservam o nome original.
  if tg_op = 'INSERT' then
    new.vendedor_original_nome := v_nome;
  end if;

  return new;
end;
$$;
