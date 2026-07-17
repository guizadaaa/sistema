-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: transferência de casos ao desativar vendedor/gerente (seção 7)
--
-- Desativar (ativo = false) é a única forma de "excluir" um usuário (seção 3
-- — exclusão é sempre lógica). Sem reatribuir vendedor_dono, os casos de
-- quem foi desativado ficam com um dono que nunca mais será auth.uid() de
-- uma sessão válida — ninguém mais consegue editar prazo_vigencia (RLS exige
-- vendedor_dono = auth.uid()) e o caso some do dashboard de qualquer pessoa.
--
-- Regras (seção 7, decisões confirmadas com o cliente):
--   - Vendedor desativado: casos vão para o gerente da própria filial.
--     Exige exatamente 1 gerente ativo na filial — 0 ou mais de 1 bloqueia
--     a desativação com erro claro (ambiguidade que só um humano resolve).
--   - Gerente desativado: casos vão para quem está executando a
--     desativação (sempre um adm_master, único perfil com UPDATE em
--     usuarios — ver usuarios_update_adm_master).
-- ============================================================================

create function public.reatribuir_casos_ao_desativar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gerente_id uuid;
  v_gerente_count integer;
begin
  if old.ativo and not new.ativo then
    if old.perfil = 'vendedor' then
      select count(*) into v_gerente_count
      from public.usuarios
      where filial = old.filial and perfil = 'gerente' and ativo;

      if v_gerente_count <> 1 then
        raise exception
          'Não é possível desativar: a filial % tem % gerente(s) ativo(s) — precisa haver exatamente 1 para receber os casos deste vendedor.',
          old.filial, v_gerente_count;
      end if;

      select id into v_gerente_id
      from public.usuarios
      where filial = old.filial and perfil = 'gerente' and ativo
      limit 1;

      update public.casos set vendedor_dono = v_gerente_id where vendedor_dono = old.id;

    elsif old.perfil = 'gerente' then
      update public.casos set vendedor_dono = auth.uid() where vendedor_dono = old.id;
    end if;
  end if;

  return new;
end;
$$;

create trigger usuarios_reatribuir_casos_ao_desativar
  before update on public.usuarios
  for each row execute function public.reatribuir_casos_ao_desativar_usuario();

-- ----------------------------------------------------------------------------
-- set_caso_defaults: preserva a filial existente quando o novo vendedor_dono
-- não tem uma própria (adm/adm_master "pegando" temporariamente os casos de
-- um gerente desativado, acima) — sem isso, aquele UPDATE violaria a
-- constraint NOT NULL de casos.filial. Numa criação nova (INSERT) sem filial
-- determinável (ex.: adm tentando ser dono do próprio caso), continua
-- bloqueado, mas agora com mensagem legível em vez de estourar a constraint
-- crua — qual filial usar nesse caso é uma decisão em aberto, não coberta
-- por esta migration.
-- ----------------------------------------------------------------------------

create or replace function public.set_caso_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_filial filial_cvc;
  v_nome text;
begin
  select filial, nome_completo into v_filial, v_nome
  from public.usuarios where id = new.vendedor_dono;

  if v_filial is not null then
    new.filial := v_filial;
  elsif tg_op = 'UPDATE' then
    new.filial := old.filial;
  else
    raise exception 'Não é possível determinar a filial do caso: o dono (%) não tem filial definida.', new.vendedor_dono;
  end if;

  -- vendedor_original_nome só é definido na criação; reatribuições preservam o nome original.
  if tg_op = 'INSERT' then
    new.vendedor_original_nome := v_nome;
  end if;

  return new;
end;
$$;
