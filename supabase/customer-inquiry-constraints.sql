create or replace function public.go_customer_open_inquiry(p_order_id uuid,p_category text,p_subject text,p_message text,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_tenant_id uuid; v_id uuid; v_existing public.go_customer_inquiries;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then raise exception 'invalid idempotency key'; end if;
  if length(trim(p_subject)) not between 2 and 140 or length(trim(p_message)) not between 2 and 2000 then raise exception 'subject and message are required'; end if;
  if p_category not in ('WISMO','CHANGE_DELIVERY','DAMAGE','MISSING','CUSTOMS','BILLING','OTHER') then raise exception 'unsupported category'; end if;
  select tenant_id into v_tenant_id from public.go_orders where id=p_order_id and customer_user_id=v_user_id;
  if v_tenant_id is null then raise exception 'order not found'; end if;
  select * into v_existing from public.go_customer_inquiries where tenant_id=v_tenant_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('id',v_existing.id,'state',v_existing.state,'duplicate',true); end if;
  v_id:=gen_random_uuid();
  insert into public.go_customer_inquiries(id,tenant_id,order_id,channel,category,state,subject,summary,customer_user_id,idempotency_key)
  values(v_id,v_tenant_id,p_order_id,'FEP',p_category,'OPEN',left(trim(p_subject),140),left(trim(p_message),2000),v_user_id,p_idempotency_key);
  insert into public.go_customer_events(tenant_id,customer_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  values(v_tenant_id,v_user_id,'CUSTOMER_INQUIRY_OPENED','INQUIRY',v_id,'event-'||p_idempotency_key,jsonb_build_object('order_id',p_order_id,'category',p_category));
  return jsonb_build_object('id',v_id,'state','OPEN','duplicate',false);
end $$;
revoke all on function public.go_customer_open_inquiry(uuid,text,text,text,text) from public,anon;
grant execute on function public.go_customer_open_inquiry(uuid,text,text,text,text) to authenticated,service_role;
notify pgrst,'reload schema';
