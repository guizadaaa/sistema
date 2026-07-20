-- Espelha, no banco, a validação de contrato_numero já aplicada no client e
-- no server action (defesa em profundidade, mesmo padrão de casos_cpf_formato).
alter table public.casos
  add constraint casos_contrato_numero_formato check (contrato_numero ~ '^\d{14}$');
