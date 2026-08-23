create or replace function public.go_dashboard_snapshot(p_tenant_id uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tenant_id',p_tenant_id,
    'orders_total',(select count(*) from public.go_orders where tenant_id=p_tenant_id),
    'orders_open',(select count(*) from public.go_orders where tenant_id=p_tenant_id and state not in ('DELIVERED','CANCELLED')),
    'exceptions_open',(select count(*) from public.go_exceptions where tenant_id=p_tenant_id and state not in ('RESOLVED','CANCELLED')),
    'work_open',(select count(*) from public.go_work_orders where tenant_id=p_tenant_id and state not in ('DONE','CANCELLED')),
    'documents_missing',(select count(*) from public.go_documents where tenant_id=p_tenant_id and is_required and status in ('MISSING','REQUESTED','REJECTED','EXPIRED')),
    'pallets_open',(select count(*) from public.go_handling_units where tenant_id=p_tenant_id and unit_type like 'PALLET%' and status in ('OPEN','BUILDING')),
    'recent_orders',coalesce((
      select jsonb_agg(x order by x.created_at desc)
      from (
        select id,tracking_number,source,source_order_id,state,service_level,
          destination->>'city' as destination_city,created_at
        from public.go_orders
        where tenant_id=p_tenant_id
        order by created_at desc
        limit 25
      ) x
    ),'[]'::jsonb),
    'planning_packages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'package_id',p.id,
        'package_reference',p.package_ref,
        'order_id',o.id,
        'tracking_number',o.tracking_number,
        'source',o.source,
        'service_level',o.service_level,
        'origin_country',coalesce(o.origin->>'country_code','TR'),
        'length_cm',p.length_cm,
        'width_cm',p.width_cm,
        'height_cm',p.height_cm,
        'weight_kg',p.weight_kg,
        'piece_count',p.piece_count,
        'stackable',p.stackable,
        'fragile',p.fragile
      ) order by o.created_at,p.created_at)
      from public.go_packages p
      join public.go_orders o on o.id=p.order_id
      where p.tenant_id=p_tenant_id
        and p.status in ('EXPECTED','RECEIVED','READY')
        and not exists (
          select 1 from public.go_handling_unit_packages hup
          where hup.package_id=p.id
        )
    ),'[]'::jsonb)
  ) where public.go_is_member(p_tenant_id,null);
$$;

notify pgrst, 'reload schema';
