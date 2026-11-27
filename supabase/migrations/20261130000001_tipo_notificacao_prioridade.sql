-- Novo tipo de notificação: "Caso #123 marcado como Urgente por Fulano"
-- (grau de prioridade 3 ou 4). Fica sozinho nesta migration: um valor novo
-- de enum não pode ser usado na mesma transação em que foi criado (a função
-- que o usa vem na próxima).
alter type public.tipo_notificacao add value if not exists 'prioridade_alta';
