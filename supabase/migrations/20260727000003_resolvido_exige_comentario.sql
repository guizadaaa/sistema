-- ============================================================================
-- Sistema de Gestão de Casos Operacionais — CVC
-- Migration: caso não pode ir para "Resolvido" sem ao menos um comentário
--
-- Regra de negócio: quem conduz a resolução do caso precisa deixar um
-- registro do que foi feito (casos_complementos, reaproveitada da seção
-- "Informações complementares" — na tela agora rotulada "Comentários", ver
-- complementos-secao.tsx) antes de fechar o caso. Trigger em vez de CHECK
-- direto na tabela: a regra depende de outra tabela (casos_complementos),
-- o que um CHECK simples não expressa.
--
-- Roda como quem chama (sem security definer): a mesma linha de
-- casos_complementos que este SELECT precisa enxergar já é visível para
-- quem tem permissão de inserir em status_historico (RLS de ambas delega
-- para auth_pode_ver_caso do mesmo caso_id) — não há necessidade de bypass.
-- ============================================================================

create function public.impede_resolvido_sem_comentario()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'resolvido' and not exists (
    select 1 from public.casos_complementos where caso_id = new.caso_id
  ) then
    raise exception 'Não é possível marcar como Resolvido sem pelo menos um comentário registrado no caso.';
  end if;
  return new;
end;
$$;

create trigger status_historico_impede_resolvido_sem_comentario
  before insert on public.status_historico
  for each row execute function public.impede_resolvido_sem_comentario();
