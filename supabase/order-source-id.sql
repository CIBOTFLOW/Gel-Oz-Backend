alter table public.go_orders
  drop constraint if exists go_orders_tenant_id_source_source_order_id_key;

create unique index if not exists go_orders_source_order_unique_idx
  on public.go_orders (tenant_id, source, source_order_id)
  where source_order_id is not null;

notify pgrst, 'reload schema';
