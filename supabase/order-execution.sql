create or replace function public.go_order_operations(p_order_id uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'order',to_jsonb(o) - 'ship_to' - 'customer_contact',
    'packages',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at) from public.go_packages p where p.order_id=o.id),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.document_type,d.version desc) from public.go_documents d where d.order_id=o.id),'[]'::jsonb),
    'work_orders',coalesce((select jsonb_agg(to_jsonb(w) order by w.priority,w.created_at) from public.go_work_orders w where w.order_id=o.id),'[]'::jsonb),
    'exceptions',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from public.go_exceptions e where e.order_id=o.id),'[]'::jsonb),
    'handoffs',coalesce((select jsonb_agg(to_jsonb(h) - 'request_payload' - 'response_payload' order by h.created_at desc) from public.go_provider_handoffs h where h.order_id=o.id),'[]'::jsonb),
    'inquiries',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc) from public.go_customer_inquiries i where i.order_id=o.id),'[]'::jsonb),
    'recommendations',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'type',a.recommendation_type,'state',a.state,'confidence',a.confidence,'recommendation',a.recommendation,'created_at',a.created_at) order by a.created_at desc) from public.go_ai_recommendations a where a.order_id=o.id),'[]'::jsonb)
  )
  from public.go_orders o
  where o.id=p_order_id and public.go_is_member(o.tenant_id,null);
$$;

create or replace function public.go_set_document_status(
  p_document_id uuid,
  p_to_status text,
  p_checksum_sha256 text default null
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_document public.go_documents; v_allowed boolean;
begin
  select * into v_document from public.go_documents where id=p_document_id for update;
  if not found then raise exception 'document not found'; end if;
  if not public.go_is_member(v_document.tenant_id,array['OWNER','ADMIN','OPERATOR','WAREHOUSE','CUSTOMER_SERVICE']) then raise exception 'operator access required'; end if;
  select exists(
    select 1 from (values
      ('MISSING','REQUESTED'),('MISSING','UPLOADED'),('MISSING','NOT_REQUIRED'),
      ('REQUESTED','UPLOADED'),('REQUESTED','NOT_REQUIRED'),
      ('UPLOADED','VERIFIED'),('UPLOADED','REJECTED'),
      ('REJECTED','UPLOADED'),('VERIFIED','EXPIRED'),('EXPIRED','UPLOADED'),
      ('NOT_REQUIRED','REQUESTED')
    ) as t(from_status,to_status)
    where t.from_status=v_document.status and t.to_status=p_to_status
  ) into v_allowed;
  if not v_allowed then raise exception 'invalid document transition: % -> %',v_document.status,p_to_status; end if;
  if p_to_status='VERIFIED' and v_document.status <> 'UPLOADED' then raise exception 'only uploaded documents can be verified'; end if;
  update public.go_documents set
    status=p_to_status,
    checksum_sha256=coalesce(nullif(p_checksum_sha256,''),checksum_sha256),
    verified_by=case when p_to_status='VERIFIED' then auth.uid() else null end,
    verified_at=case when p_to_status='VERIFIED' then now() else null end
  where id=p_document_id;
  insert into public.go_operation_events(tenant_id,aggregate_type,aggregate_id,event_type,actor_id,payload)
  values(v_document.tenant_id,'ORDER',v_document.order_id,'DOCUMENT_STATUS_CHANGED',auth.uid(),jsonb_build_object('document_id',p_document_id,'document_type',v_document.document_type,'from',v_document.status,'to',p_to_status));
  return jsonb_build_object('document_id',p_document_id,'from_status',v_document.status,'to_status',p_to_status,'recorded_at',now());
end $$;

create or replace function public.go_set_work_order_state(
  p_work_order_id uuid,
  p_to_state text
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_work public.go_work_orders; v_allowed boolean;
begin
  select * into v_work from public.go_work_orders where id=p_work_order_id for update;
  if not found then raise exception 'work order not found'; end if;
  if not public.go_is_member(v_work.tenant_id,array['OWNER','ADMIN','OPERATOR','WAREHOUSE']) then raise exception 'warehouse access required'; end if;
  select exists(
    select 1 from (values
      ('OPEN','ASSIGNED'),('OPEN','IN_PROGRESS'),('OPEN','CANCELLED'),
      ('ASSIGNED','IN_PROGRESS'),('ASSIGNED','BLOCKED'),('ASSIGNED','CANCELLED'),
      ('IN_PROGRESS','BLOCKED'),('IN_PROGRESS','DONE'),
      ('BLOCKED','IN_PROGRESS'),('BLOCKED','CANCELLED')
    ) as t(from_state,to_state)
    where t.from_state=v_work.state and t.to_state=p_to_state
  ) into v_allowed;
  if not v_allowed then raise exception 'invalid work transition: % -> %',v_work.state,p_to_state; end if;
  update public.go_work_orders set
    state=p_to_state,
    assigned_to=case when p_to_state in ('ASSIGNED','IN_PROGRESS') and assigned_to is null then auth.uid() else assigned_to end,
    completed_at=case when p_to_state='DONE' then now() else null end
  where id=p_work_order_id;
  insert into public.go_operation_events(tenant_id,aggregate_type,aggregate_id,event_type,actor_id,payload)
  values(v_work.tenant_id,'ORDER',v_work.order_id,'WORK_ORDER_STATE_CHANGED',auth.uid(),jsonb_build_object('work_order_id',p_work_order_id,'work_type',v_work.work_type,'from',v_work.state,'to',p_to_state));
  return jsonb_build_object('work_order_id',p_work_order_id,'from_state',v_work.state,'to_state',p_to_state,'recorded_at',now());
end $$;

create or replace function public.go_create_customer_inquiry(
  p_order_id uuid,
  p_channel text,
  p_category text,
  p_subject text,
  p_summary text
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_order public.go_orders; v_inquiry public.go_customer_inquiries;
begin
  select * into v_order from public.go_orders where id=p_order_id;
  if not found then raise exception 'order not found'; end if;
  if not public.go_is_member(v_order.tenant_id,array['OWNER','ADMIN','OPERATOR','CUSTOMER_SERVICE']) then raise exception 'customer service access required'; end if;
  if length(trim(coalesce(p_subject,''))) < 3 or length(trim(coalesce(p_summary,''))) < 3 then raise exception 'subject and summary are required'; end if;
  insert into public.go_customer_inquiries(tenant_id,order_id,channel,category,subject,summary,assigned_to)
  values(v_order.tenant_id,p_order_id,p_channel,p_category,trim(p_subject),trim(p_summary),auth.uid()) returning * into v_inquiry;
  insert into public.go_operation_events(tenant_id,aggregate_type,aggregate_id,event_type,actor_id,payload)
  values(v_order.tenant_id,'ORDER',p_order_id,'CUSTOMER_INQUIRY_RECORDED',auth.uid(),jsonb_build_object('inquiry_id',v_inquiry.id,'channel',p_channel,'category',p_category));
  return jsonb_build_object('inquiry_id',v_inquiry.id,'state',v_inquiry.state,'created_at',v_inquiry.created_at);
end $$;

create or replace function public.go_plan_manual_handoff(
  p_order_id uuid,
  p_provider text,
  p_operation text,
  p_idempotency_key text
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_order public.go_orders; v_handoff public.go_provider_handoffs;
begin
  select * into v_order from public.go_orders where id=p_order_id;
  if not found then raise exception 'order not found'; end if;
  if not public.go_is_member(v_order.tenant_id,array['OWNER','ADMIN','OPERATOR']) then raise exception 'operator access required'; end if;
  if length(trim(coalesce(p_provider,''))) < 2 then raise exception 'provider is required'; end if;
  if length(coalesce(p_idempotency_key,'')) < 8 then raise exception 'idempotency key must be at least 8 characters'; end if;
  select * into v_handoff from public.go_provider_handoffs where tenant_id=v_order.tenant_id and provider=upper(trim(p_provider)) and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('handoff_id',v_handoff.id,'state',v_handoff.state,'replayed',true); end if;
  insert into public.go_provider_handoffs(tenant_id,order_id,provider,operation,state,idempotency_key,request_payload)
  values(v_order.tenant_id,p_order_id,upper(trim(p_provider)),p_operation,'AWAITING_APPROVAL',p_idempotency_key,jsonb_build_object('order_tracking_number',v_order.tracking_number,'manual_packet_required',true)) returning * into v_handoff;
  insert into public.go_operation_events(tenant_id,aggregate_type,aggregate_id,event_type,actor_id,payload)
  values(v_order.tenant_id,'ORDER',p_order_id,'MANUAL_PROVIDER_HANDOFF_PLANNED',auth.uid(),jsonb_build_object('handoff_id',v_handoff.id,'provider',v_handoff.provider,'operation',v_handoff.operation));
  return jsonb_build_object('handoff_id',v_handoff.id,'state',v_handoff.state,'provider',v_handoff.provider,'operation',v_handoff.operation,'booking_effect',false,'created_at',v_handoff.created_at);
end $$;

revoke all on function public.go_order_operations(uuid),public.go_set_document_status(uuid,text,text),public.go_set_work_order_state(uuid,text),public.go_create_customer_inquiry(uuid,text,text,text,text),public.go_plan_manual_handoff(uuid,text,text,text) from public,anon;
grant execute on function public.go_order_operations(uuid),public.go_set_document_status(uuid,text,text),public.go_set_work_order_state(uuid,text),public.go_create_customer_inquiry(uuid,text,text,text,text),public.go_plan_manual_handoff(uuid,text,text,text) to authenticated,service_role;

notify pgrst, 'reload schema';
