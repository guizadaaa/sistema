-- Incluído por 40_assertions_clientes_desempenho.sql (:u = usuário).
set request.jwt.claim.sub = :'u';
set role authenticated;
insert into _visto
  select :'u'::uuid, 'cliente_compras', id::text from public.cliente_compras
  union all select :'u'::uuid, 'cliente_excursoes', reserva from public.cliente_excursoes
  union all select :'u'::uuid, 'recibos', recibo from public.recibos
  union all select :'u'::uuid, 'cliente_voo_eventos', id::text from public.cliente_voo_eventos
  union all select :'u'::uuid, 'clientes', id::text from public.clientes
  union all select :'u'::uuid, 'storage', name from storage.objects where bucket_id = 'recibos';
reset role;
reset request.jwt.claim.sub;
