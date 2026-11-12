-- Novo tipo de notificação: "Vendas da loja X atualizadas até dd/mm."
-- Fica sozinho nesta migration: um valor novo de enum não pode ser usado na
-- mesma transação em que foi criado (a função que o usa vem na próxima).
alter type public.tipo_notificacao add value if not exists 'vendas_importadas';
