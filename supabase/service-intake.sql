create or replace function public.go_intake_order(p_payload jsonb, p_idempotency_key text) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_tenant uuid := (p_payload->>'tenant_id')::uuid;
  v_hash text := encode(digest(p_payload::text,'sha256'),'hex');
  v_existing public.go_idempotency_records;
  v_order public.go_orders;
  v_item jsonb;
  v_item_id uuid;
  v_index integer := 0;
begin
  if current_user <> 'service_role' and (auth.uid() is null or not public.go_is_member(v_tenant, array['OWNER','ADMIN','OPERATOR'])) then raise exception 'operator access required'; end if;
  if length(coalesce(p_idempotency_key,'')) < 8 then raise exception 'idempotency key must be at least 8 characters'; end if;
  select * into v_existing from public.go_idempotency_records where tenant_id=v_tenant and operation='ORDER_INTAKE' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'idempotency key reused with different payload'; end if;
    return v_existing.response_payload;
  end if;
  if jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb)) = 0 then raise exception 'at least one item is required'; end if;
  if current_user='service_role' and coalesce(nullif(p_payload->>'source_order_id',''),'')='' then raise exception 'source_order_id is required for service intake'; end if;
  insert into public.go_orders(tenant_id,source,source_order_id,customer_reference,tracking_number,state,service_level,incoterm,currency,origin,destination,ship_to,customer_contact,requested_delivery_at,created_by)
  values(v_tenant,coalesce(p_payload->>'source','API'),nullif(p_payload->>'source_order_id',''),nullif(p_payload->>'customer_reference',''),
    'GOZ-'||to_char(now(),'YY')||'-'||upper(substr(encode(gen_random_bytes(8),'hex'),1,12)),'ORDER_RECEIVED',coalesce(p_payload->>'service_level','WHITE_GLOVE'),
    nullif(p_payload->>'incoterm',''),upper(coalesce(p_payload->>'currency','USD')),coalesce(p_payload->'origin','{}'::jsonb),coalesce(p_payload->'destination','{}'::jsonb),
    coalesce(p_payload->'ship_to','{}'::jsonb),coalesce(p_payload->'customer_contact','{}'::jsonb),nullif(p_payload->>'requested_delivery_at','')::timestamptz,auth.uid()) returning * into v_order;
  for v_item in select value from jsonb_array_elements(p_payload->'items') loop
    v_index := v_index + 1;
    insert into public.go_order_items(tenant_id,order_id,sku,title,quantity,hs_code,country_of_origin,unit_value_minor,currency,length_cm,width_cm,height_cm,weight_kg,fragile,stackable,hazardous)
    values(v_tenant,v_order.id,nullif(v_item->>'sku',''),v_item->>'title',coalesce((v_item->>'quantity')::integer,1),nullif(v_item->>'hs_code',''),nullif(upper(v_item->>'country_of_origin'),''),
      coalesce((v_item->>'unit_value_minor')::bigint,0),upper(coalesce(v_item->>'currency',v_order.currency)),(v_item->>'length_cm')::numeric,(v_item->>'width_cm')::numeric,
      (v_item->>'height_cm')::numeric,(v_item->>'weight_kg')::numeric,coalesce((v_item->>'fragile')::boolean,false),coalesce((v_item->>'stackable')::boolean,true),coalesce((v_item->>'hazardous')::boolean,false)) returning id into v_item_id;
    insert into public.go_packages(tenant_id,order_id,order_item_id,package_ref,piece_count,length_cm,width_cm,height_cm,weight_kg,fragile,stackable)
    values(v_tenant,v_order.id,v_item_id,coalesce(nullif(v_item->>'package_ref',''),v_order.tracking_number||'-P'||lpad(v_index::text,2,'0')),coalesce((v_item->>'quantity')::integer,1),
      (v_item->>'length_cm')::numeric,(v_item->>'width_cm')::numeric,(v_item->>'height_cm')::numeric,(v_item->>'weight_kg')::numeric,
      coalesce((v_item->>'fragile')::boolean,false),coalesce((v_item->>'stackable')::boolean,true));
  end loop;
  insert into public.go_tracking_events(tenant_id,order_id,normalized_state,event_at,customer_message,internal_detail)
  values(v_tenant,v_order.id,'ORDER_RECEIVED',now(),'We received your order and are preparing the origin workflow.','Order intake accepted');
  insert into public.go_documents(tenant_id,order_id,document_type,status,is_required) values
    (v_tenant,v_order.id,'COMMERCIAL_INVOICE','MISSING',true),(v_tenant,v_order.id,'PACKING_LIST','MISSING',true),
    (v_tenant,v_order.id,'CERTIFICATE_OF_ORIGIN','MISSING',true),(v_tenant,v_order.id,'EXPORT_DECLARATION','MISSING',true),
    (v_tenant,v_order.id,'BILL_OF_LADING','MISSING',true),(v_tenant,v_order.id,'ISF_10_PLUS_2','MISSING',true),
    (v_tenant,v_order.id,'CUSTOMS_ENTRY','MISSING',true),(v_tenant,v_order.id,'PROOF_OF_DELIVERY','MISSING',true);
  insert into public.go_work_orders(tenant_id,order_id,work_type,state,priority,instructions) values
    (v_tenant,v_order.id,'RECEIVE','OPEN',3,'Verify piece count, dimensions, weight, condition, and supplier documents on arrival.');
  insert into public.go_operation_events(tenant_id,aggregate_type,aggregate_id,event_type,actor_id,actor_type,idempotency_key,payload)
  values(v_tenant,'ORDER',v_order.id,'ORDER_INTAKE_ACCEPTED',auth.uid(),case when current_user='service_role' then 'SYSTEM' else 'USER' end,p_idempotency_key,jsonb_build_object('source',v_order.source,'tracking_number',v_order.tracking_number));
  v_existing.response_payload := jsonb_build_object('order_id',v_order.id,'tracking_number',v_order.tracking_number,'state',v_order.state,'created_at',v_order.created_at);
  insert into public.go_idempotency_records(tenant_id,operation,idempotency_key,request_hash,response_payload) values(v_tenant,'ORDER_INTAKE',p_idempotency_key,v_hash,v_existing.response_payload);
  return v_existing.response_payload;
end $$;

revoke all on function public.go_intake_order(jsonb,text) from public,anon;
grant execute on function public.go_intake_order(jsonb,text) to authenticated,service_role;
notify pgrst, 'reload schema';
