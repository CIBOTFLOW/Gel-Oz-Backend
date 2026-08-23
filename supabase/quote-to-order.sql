begin;

alter table public.go_provider_rate_requests
  add column if not exists idempotency_key text;

alter table public.go_orders
  add column if not exists quote_request_id uuid references public.go_quote_requests(id) on delete set null,
  add column if not exists accepted_offer_id uuid references public.go_quote_offers(id) on delete set null;

create unique index if not exists go_provider_rate_requests_idempotency_idx
  on public.go_provider_rate_requests(tenant_id,idempotency_key)
  where idempotency_key is not null;
create unique index if not exists go_orders_quote_request_idx
  on public.go_orders(quote_request_id)
  where quote_request_id is not null;
create unique index if not exists go_orders_accepted_offer_idx
  on public.go_orders(accepted_offer_id)
  where accepted_offer_id is not null;

create or replace function public.go_record_provider_rate(
  p_quote_request_id uuid,
  p_rate jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.go_quote_requests;
  v_rate public.go_provider_rate_requests;
  v_provider text := upper(trim(coalesce(p_rate->>'provider_code','')));
  v_segment text := upper(trim(coalesce(p_rate->>'segment','')));
  v_method text := upper(trim(coalesce(p_rate->>'integration_method','MANUAL')));
  v_amount bigint := coalesce((p_rate->>'quoted_amount_minor')::bigint,0);
  v_currency text := upper(trim(coalesce(p_rate->>'currency','USD')));
  v_valid_until timestamptz := coalesce(nullif(p_rate->>'valid_until','')::timestamptz,now()+interval '14 days');
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then raise exception 'invalid idempotency key'; end if;
  select * into v_quote from public.go_quote_requests where id=p_quote_request_id for update;
  if not found then raise exception 'quote request not found'; end if;
  if not public.go_is_member(v_quote.tenant_id,array['OWNER','ADMIN','OPERATOR']) then raise exception 'pricing access required'; end if;

  select * into v_rate from public.go_provider_rate_requests
  where tenant_id=v_quote.tenant_id and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('rate_id',v_rate.id,'state',v_rate.state,'duplicate',true);
  end if;

  if v_provider not in ('EASYSHIP','RXO_CONNECT','FLEXPORT','VANGUARD','MATRAŞ','CUSTOMS_BROKER','ORIGIN_FORWARDER','OTHER') then raise exception 'unsupported provider'; end if;
  if v_segment not in ('ORIGIN_PICKUP','EXPORT','OCEAN','AIR','IMPORT_CUSTOMS','DESTINATION_HANDLING','LAST_MILE','INSURANCE') then raise exception 'unsupported segment'; end if;
  if v_method not in ('API','EDI','PORTAL','EMAIL','MANUAL') then raise exception 'unsupported integration method'; end if;
  if v_currency <> 'USD' then raise exception 'firm quote workflow currently requires USD provider rates'; end if;
  if v_amount <= 0 then raise exception 'provider amount must be greater than zero'; end if;
  if v_valid_until <= now() then raise exception 'provider rate must still be valid'; end if;

  insert into public.go_provider_rate_requests(
    tenant_id,quote_request_id,provider_code,segment,integration_method,state,external_reference,
    request_summary,response_summary,quoted_amount_minor,currency,valid_until,requested_at,received_at,idempotency_key
  ) values(
    v_quote.tenant_id,v_quote.id,v_provider,v_segment,v_method,'RECEIVED',left(nullif(trim(p_rate->>'external_reference'),''),160),
    jsonb_build_object('recorded_by','GEL_OZ_OPERATOR'),
    jsonb_build_object('notes',left(coalesce(p_rate->>'notes',''),1000)),
    v_amount,v_currency,v_valid_until,now(),now(),p_idempotency_key
  ) returning * into v_rate;

  update public.go_quote_requests set state='SOURCING_RATES',assigned_to=v_user_id,updated_at=now() where id=v_quote.id;
  insert into public.go_quote_events(tenant_id,quote_request_id,event_type,actor_type,actor_user_id,public_message,internal_detail)
  values(v_quote.tenant_id,v_quote.id,'PROVIDER_RATE_RECEIVED','OPERATOR',v_user_id,
    'Taşıma ortaklarımızdan doğrulanmış maliyet alındı.',
    jsonb_build_object('rate_id',v_rate.id,'provider_code',v_provider,'segment',v_segment,'amount_minor',v_amount,'currency',v_currency));

  return jsonb_build_object('rate_id',v_rate.id,'state',v_rate.state,'provider_code',v_provider,'segment',v_segment,
    'quoted_amount_minor',v_amount,'currency',v_currency,'valid_until',v_valid_until,'duplicate',false);
end $$;

create or replace function public.go_publish_firm_offer(
  p_quote_request_id uuid,
  p_rate_ids uuid[],
  p_terms jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_quote public.go_quote_requests;
  v_offer public.go_quote_offers;
  v_existing public.go_idempotency_records;
  v_hash text;
  v_rate_count integer;
  v_supplier_cost bigint;
  v_fee bigint;
  v_total bigint;
  v_margin numeric;
  v_minimum_fee bigint;
  v_version integer;
  v_valid_days integer := greatest(1,least(coalesce((p_terms->>'valid_days')::integer,7),30));
  v_line_items jsonb;
  v_required_segments text[] := array['ORIGIN_PICKUP','EXPORT','IMPORT_CUSTOMS','DESTINATION_HANDLING','LAST_MILE'];
  v_segment text;
  v_response jsonb;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then raise exception 'invalid idempotency key'; end if;
  if cardinality(p_rate_ids) < 6 then raise exception 'at least six provider cost lines are required'; end if;

  select * into v_quote from public.go_quote_requests where id=p_quote_request_id for update;
  if not found then raise exception 'quote request not found'; end if;
  if not public.go_is_member(v_quote.tenant_id,array['OWNER','ADMIN','OPERATOR']) then raise exception 'pricing access required'; end if;
  if v_quote.state in ('ACCEPTED','DECLINED','EXPIRED','CANCELLED') then raise exception 'quote request is not open'; end if;

  v_hash := md5(p_quote_request_id::text||p_rate_ids::text||coalesce(p_terms,'{}'::jsonb)::text);
  select * into v_existing from public.go_idempotency_records
  where tenant_id=v_quote.tenant_id and operation='PUBLISH_FIRM_OFFER' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_hash<>v_hash then raise exception 'idempotency key reused with different payload'; end if;
    return v_existing.response_payload;
  end if;

  select count(*),coalesce(sum(r.quoted_amount_minor),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'rate_id',r.id,'provider_code',r.provider_code,'segment',r.segment,'description',replace(initcap(r.segment),'_',' '),
      'amount_minor',r.quoted_amount_minor,'currency',r.currency,'external_reference',r.external_reference,'valid_until',r.valid_until
    ) order by r.segment,r.created_at),'[]'::jsonb)
  into v_rate_count,v_supplier_cost,v_line_items
  from public.go_provider_rate_requests r
  where r.id=any(p_rate_ids) and r.quote_request_id=v_quote.id and r.tenant_id=v_quote.tenant_id
    and r.state='RECEIVED' and r.currency='USD' and r.quoted_amount_minor>0 and r.valid_until>now();

  if v_rate_count<>cardinality(p_rate_ids) then raise exception 'all selected rates must be valid, received USD rates for this quote'; end if;
  foreach v_segment in array v_required_segments loop
    if not exists(select 1 from public.go_provider_rate_requests r where r.id=any(p_rate_ids) and r.segment=v_segment) then
      raise exception 'missing required provider segment: %',v_segment;
    end if;
  end loop;
  if not exists(select 1 from public.go_provider_rate_requests r where r.id=any(p_rate_ids) and r.segment in ('OCEAN','AIR')) then
    raise exception 'missing required linehaul segment: OCEAN or AIR';
  end if;

  if v_quote.cubic_meters<2 then v_margin:=0.18; v_minimum_fee:=37500;
  elsif v_quote.cubic_meters<8 then v_margin:=0.15; v_minimum_fee:=45000;
  elsif v_quote.cubic_meters<20 then v_margin:=0.12; v_minimum_fee:=65000;
  else v_margin:=0.09; v_minimum_fee:=90000;
  end if;
  v_fee:=greatest(round(v_supplier_cost*v_margin)::bigint,v_minimum_fee);
  v_total:=v_supplier_cost+v_fee;
  select coalesce(max(version),0)+1 into v_version from public.go_quote_offers where quote_request_id=v_quote.id;

  update public.go_quote_offers set state='VOID' where quote_request_id=v_quote.id and state in ('DRAFT','SENT');
  insert into public.go_quote_offers(
    tenant_id,quote_request_id,version,state,currency,supplier_cost_minor,gel_oz_fee_minor,total_minor,line_items,terms,
    valid_until,sent_at,created_by
  ) values(
    v_quote.tenant_id,v_quote.id,v_version,'SENT','USD',v_supplier_cost,v_fee,v_total,v_line_items,
    jsonb_build_object(
      'incoterm','EXW','margin_rate',v_margin,'margin_model','VOLUME_TIER_WITH_MINIMUM',
      'deposit_percent',greatest(0,least(coalesce((p_terms->>'deposit_percent')::integer,50),100)),
      'duties_and_taxes','EXCLUDED_UNLESS_LISTED','provider_booking','SUBJECT_TO_HUMAN_CONFIRMATION',
      'notes',left(coalesce(p_terms->>'notes',''),1500)
    ),now()+(v_valid_days||' days')::interval,now(),v_user_id
  ) returning * into v_offer;

  update public.go_quote_requests set state='FIRM_QUOTE_SENT',assigned_to=v_user_id,updated_at=now() where id=v_quote.id;
  insert into public.go_quote_events(tenant_id,quote_request_id,event_type,actor_type,actor_user_id,public_message,internal_detail)
  values(v_quote.tenant_id,v_quote.id,'FIRM_QUOTE_SENT','OPERATOR',v_user_id,
    'Kesin Gel Öz teklifiniz müşteri panelinde hazır.',
    jsonb_build_object('offer_id',v_offer.id,'version',v_version,'supplier_cost_minor',v_supplier_cost,'gel_oz_fee_minor',v_fee,'total_minor',v_total));

  v_response:=jsonb_build_object('offer_id',v_offer.id,'version',v_version,'state',v_offer.state,'currency','USD',
    'supplier_cost_minor',v_supplier_cost,'gel_oz_fee_minor',v_fee,'total_minor',v_total,'margin_rate',v_margin,'valid_until',v_offer.valid_until);
  insert into public.go_idempotency_records(tenant_id,operation,idempotency_key,request_hash,response_payload)
  values(v_quote.tenant_id,'PUBLISH_FIRM_OFFER',p_idempotency_key,v_hash,v_response);
  return v_response;
end $$;

create or replace function public.go_customer_accept_offer(
  p_offer_id uuid,
  p_delivery jsonb,
  p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_offer public.go_quote_offers;
  v_quote public.go_quote_requests;
  v_order public.go_orders;
  v_item_id uuid;
  v_existing public.go_idempotency_records;
  v_hash text;
  v_response jsonb;
  v_service text := upper(coalesce(nullif(p_delivery->>'service_level',''),'WHITE_GLOVE'));
  v_address text := trim(coalesce(p_delivery->>'address_line_1',''));
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then raise exception 'confirmed email required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then raise exception 'invalid idempotency key'; end if;
  if v_service not in ('PARCEL','THRESHOLD','ROOM_OF_CHOICE','WHITE_GLOVE','LTL','FTL') then raise exception 'unsupported service level'; end if;
  if length(v_address) not between 5 and 240 then raise exception 'delivery street address is required'; end if;

  select * into v_offer from public.go_quote_offers where id=p_offer_id for update;
  if not found then raise exception 'offer not found'; end if;
  select * into v_quote from public.go_quote_requests where id=v_offer.quote_request_id and customer_user_id=v_user_id for update;
  if not found then raise exception 'offer not found'; end if;

  select * into v_order from public.go_orders where accepted_offer_id=v_offer.id;
  if found then return jsonb_build_object('order_id',v_order.id,'tracking_number',v_order.tracking_number,'state',v_order.state,'duplicate',true); end if;
  if v_offer.state<>'SENT' then raise exception 'offer is not available for acceptance'; end if;
  if v_offer.valid_until<=now() then
    update public.go_quote_offers set state='EXPIRED' where id=v_offer.id;
    update public.go_quote_requests set state='EXPIRED',updated_at=now() where id=v_quote.id;
    raise exception 'offer has expired';
  end if;
  if exists(select 1 from public.go_quote_offers o where o.quote_request_id=v_quote.id and o.state='SENT' and o.version>v_offer.version) then raise exception 'a newer offer version is available'; end if;

  v_hash:=md5(p_offer_id::text||coalesce(p_delivery,'{}'::jsonb)::text);
  select * into v_existing from public.go_idempotency_records
  where tenant_id=v_quote.tenant_id and operation='CUSTOMER_ACCEPT_OFFER' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_hash<>v_hash then raise exception 'idempotency key reused with different payload'; end if;
    return v_existing.response_payload;
  end if;

  insert into public.go_orders(
    tenant_id,source,source_order_id,customer_reference,tracking_number,state,service_level,incoterm,currency,
    origin,destination,ship_to,customer_contact,customer_user_id,created_by,quote_request_id,accepted_offer_id
  ) values(
    v_quote.tenant_id,'FEP',v_quote.quote_number,v_quote.quote_number,
    'GOZ-'||to_char(now(),'YY')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
    'ORDER_RECEIVED',v_service,'EXW','USD',
    jsonb_build_object('country_code',v_quote.origin_country,'city',v_quote.origin_city),
    jsonb_build_object('country_code','US','city',v_quote.destination_city,'state',v_quote.destination_state,'postal_code',v_quote.destination_postal_code),
    jsonb_build_object('name',coalesce(nullif(p_delivery->>'name',''),v_quote.contact_name),'address_line_1',v_address,
      'address_line_2',left(coalesce(p_delivery->>'address_line_2',''),120),'city',v_quote.destination_city,'state',v_quote.destination_state,
      'postal_code',v_quote.destination_postal_code,'country_code','US','phone',coalesce(nullif(p_delivery->>'phone',''),v_quote.contact_phone)),
    jsonb_build_object('name',v_quote.contact_name,'email',v_quote.contact_email,'phone',coalesce(nullif(p_delivery->>'phone',''),v_quote.contact_phone)),
    v_user_id,v_user_id,v_quote.id,v_offer.id
  ) returning * into v_order;

  insert into public.go_order_items(tenant_id,order_id,title,quantity,country_of_origin,unit_value_minor,currency,length_cm,width_cm,height_cm,weight_kg,fragile,stackable,hazardous)
  values(v_quote.tenant_id,v_order.id,v_quote.cargo_description,v_quote.pieces,v_quote.origin_country,
    greatest(0,round(v_quote.cargo_value_usd*100/v_quote.pieces)::bigint),'USD',v_quote.length_cm,v_quote.width_cm,v_quote.height_cm,
    v_quote.total_weight_kg/v_quote.pieces,v_quote.fragile,v_quote.stackable,false) returning id into v_item_id;
  insert into public.go_packages(tenant_id,order_id,order_item_id,package_ref,piece_count,length_cm,width_cm,height_cm,weight_kg,fragile,stackable)
  values(v_quote.tenant_id,v_order.id,v_item_id,v_order.tracking_number||'-P01',v_quote.pieces,v_quote.length_cm,v_quote.width_cm,v_quote.height_cm,
    v_quote.total_weight_kg,v_quote.fragile,v_quote.stackable);
  insert into public.go_tracking_events(tenant_id,order_id,normalized_state,event_at,customer_message,internal_detail)
  values(v_quote.tenant_id,v_order.id,'ORDER_RECEIVED',now(),'Teklifiniz onaylandı. Gel Öz çıkış operasyonunu hazırlıyor.','Firm quote accepted in customer portal');
  insert into public.go_documents(tenant_id,order_id,document_type,status,is_required) values
    (v_quote.tenant_id,v_order.id,'COMMERCIAL_INVOICE','MISSING',true),(v_quote.tenant_id,v_order.id,'PACKING_LIST','MISSING',true),
    (v_quote.tenant_id,v_order.id,'CERTIFICATE_OF_ORIGIN','MISSING',true),(v_quote.tenant_id,v_order.id,'EXPORT_DECLARATION','MISSING',true),
    (v_quote.tenant_id,v_order.id,'BILL_OF_LADING','MISSING',true),(v_quote.tenant_id,v_order.id,'ISF_10_PLUS_2','MISSING',true),
    (v_quote.tenant_id,v_order.id,'CUSTOMS_ENTRY','MISSING',true),(v_quote.tenant_id,v_order.id,'PROOF_OF_DELIVERY','MISSING',true);
  insert into public.go_work_orders(tenant_id,order_id,work_type,state,priority,instructions)
  values(v_quote.tenant_id,v_order.id,'RECEIVE','OPEN',3,'Confirm supplier pickup, receiving plan, dimensions, condition, and export documents.');

  update public.go_quote_offers set state=case when id=v_offer.id then 'ACCEPTED' else 'VOID' end,
    accepted_at=case when id=v_offer.id then now() else accepted_at end
  where quote_request_id=v_quote.id and state in ('SENT','DRAFT');
  update public.go_quote_requests set state='ACCEPTED',updated_at=now() where id=v_quote.id;
  insert into public.go_quote_events(tenant_id,quote_request_id,event_type,actor_type,actor_user_id,public_message,internal_detail)
  values(v_quote.tenant_id,v_quote.id,'FIRM_QUOTE_ACCEPTED','CUSTOMER',v_user_id,
    'Teklifiniz kabul edildi ve Gel Öz takip numaranız oluşturuldu.',jsonb_build_object('offer_id',v_offer.id,'order_id',v_order.id,'tracking_number',v_order.tracking_number));
  insert into public.go_operation_events(tenant_id,aggregate_type,aggregate_id,event_type,actor_id,actor_type,idempotency_key,payload)
  values(v_quote.tenant_id,'ORDER',v_order.id,'ORDER_CREATED_FROM_ACCEPTED_QUOTE',v_user_id,'USER',p_idempotency_key,
    jsonb_build_object('quote_request_id',v_quote.id,'offer_id',v_offer.id,'tracking_number',v_order.tracking_number,'total_minor',v_offer.total_minor));
  insert into public.go_customer_events(tenant_id,customer_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  values(v_quote.tenant_id,v_user_id,'FIRM_QUOTE_ACCEPTED','ORDER',v_order.id,'accept-'||p_idempotency_key,
    jsonb_build_object('quote_request_id',v_quote.id,'offer_id',v_offer.id,'tracking_number',v_order.tracking_number));

  v_response:=jsonb_build_object('order_id',v_order.id,'tracking_number',v_order.tracking_number,'state',v_order.state,'quote_number',v_quote.quote_number,'duplicate',false);
  insert into public.go_idempotency_records(tenant_id,operation,idempotency_key,request_hash,response_payload)
  values(v_quote.tenant_id,'CUSTOMER_ACCEPT_OFFER',p_idempotency_key,v_hash,v_response);
  return v_response;
end $$;

create or replace function public.go_quote_inbox(p_tenant_id uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object(
    'options',coalesce(o.options,'[]'::jsonb),'provider_requests',coalesce(r.provider_requests,'[]'::jsonb),'offers',coalesce(f.offers,'[]'::jsonb)
  ) order by q.requested_at desc),'[]'::jsonb)
  from (
    select id,tenant_id,quote_number,state,company_name,contact_name,contact_email,contact_phone,cargo_description,origin_country,origin_city,
      destination_city,destination_state,destination_postal_code,mode_preference,pieces,total_weight_kg,cubic_meters,ocean_chargeable_cbm,
      air_chargeable_kg,rate_card_version,requested_at
    from public.go_quote_requests where tenant_id=p_tenant_id and public.go_is_member(tenant_id,null) order by requested_at desc limit 100
  ) q
  left join lateral (select jsonb_agg(jsonb_build_object('id',id,'option_code',option_code,'mode',mode,'arrival_port',arrival_port,
    'transit_days_min',transit_days_min,'transit_days_max',transit_days_max,'provider_cost_minor',provider_cost_minor,
    'market_contingency_minor',market_contingency_minor,'gel_oz_fee_minor',gel_oz_fee_minor,'total_minor',total_minor,'is_recommended',is_recommended) order by total_minor) options
    from public.go_quote_options where quote_request_id=q.id) o on true
  left join lateral (select jsonb_agg(jsonb_build_object('id',id,'provider_code',provider_code,'segment',segment,'integration_method',integration_method,
    'state',state,'external_reference',external_reference,'quoted_amount_minor',quoted_amount_minor,'currency',currency,'valid_until',valid_until,'received_at',received_at) order by created_at) provider_requests
    from public.go_provider_rate_requests where quote_request_id=q.id) r on true
  left join lateral (select jsonb_agg(jsonb_build_object('id',id,'version',version,'state',state,'currency',currency,'supplier_cost_minor',supplier_cost_minor,
    'gel_oz_fee_minor',gel_oz_fee_minor,'total_minor',total_minor,'line_items',line_items,'terms',terms,'valid_until',valid_until,'sent_at',sent_at,'accepted_at',accepted_at) order by version desc) offers
    from public.go_quote_offers where quote_request_id=q.id) f on true;
$$;

create or replace function public.go_customer_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid(); v_profile jsonb; v_quotes jsonb; v_orders jsonb; v_documents jsonb; v_inquiries jsonb;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if not exists(select 1 from auth.users where id=v_user_id and email_confirmed_at is not null) then raise exception 'confirmed email required'; end if;
  select jsonb_build_object('email',u.email,'full_name',p.full_name,'company_name',p.company_name,'phone',p.phone,'locale',p.locale,'notification_preferences',p.notification_preferences)
  into v_profile from auth.users u left join public.go_customer_profiles p on p.user_id=u.id where u.id=v_user_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'quote_number',q.quote_number,'state',q.state,'cargo_description',q.cargo_description,
    'origin',jsonb_build_object('country_code',q.origin_country,'city',q.origin_city),
    'destination',jsonb_build_object('country_code',q.destination_country,'city',q.destination_city,'state',q.destination_state,'postal_code',q.destination_postal_code),
    'pieces',q.pieces,'weight_kg',q.total_weight_kg,'cubic_meters',q.cubic_meters,'requested_at',q.requested_at,
    'options',coalesce((select jsonb_agg(jsonb_build_object('mode',o.mode,'arrival_port',o.arrival_port,'transit_days_min',o.transit_days_min,'transit_days_max',o.transit_days_max,'total_minor',o.total_minor,'currency','USD','is_recommended',o.is_recommended) order by o.total_minor) from public.go_quote_options o where o.quote_request_id=q.id),'[]'::jsonb),
    'offers',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'version',f.version,'state',f.state,'currency',f.currency,
      'supplier_cost_minor',f.supplier_cost_minor,'gel_oz_fee_minor',f.gel_oz_fee_minor,'total_minor',f.total_minor,'line_items',f.line_items,
      'terms',f.terms,'valid_until',f.valid_until,'sent_at',f.sent_at,'accepted_at',f.accepted_at) order by f.version desc)
      from public.go_quote_offers f where f.quote_request_id=q.id and f.state in ('SENT','ACCEPTED','EXPIRED')),'[]'::jsonb)
  ) order by q.requested_at desc),'[]'::jsonb) into v_quotes from public.go_quote_requests q where q.customer_user_id=v_user_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'tracking_number',o.tracking_number,'customer_reference',o.customer_reference,'state',o.state,'service_level',o.service_level,
    'origin',o.origin,'destination',o.destination,'promised_delivery_at',o.promised_delivery_at,'created_at',o.created_at,'quote_request_id',o.quote_request_id,'accepted_offer_id',o.accepted_offer_id,
    'events',coalesce((select jsonb_agg(jsonb_build_object('state',e.normalized_state,'message',e.customer_message,'event_at',e.event_at,'city',e.city,'country_code',e.country_code) order by e.event_at desc) from public.go_tracking_events e where e.order_id=o.id),'[]'::jsonb)
  ) order by o.created_at desc),'[]'::jsonb) into v_orders from public.go_orders o where o.customer_user_id=v_user_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'order_id',d.order_id,'document_type',d.document_type,'status',d.status,'version',d.version,'is_required',d.is_required,'updated_at',d.updated_at) order by d.updated_at desc),'[]'::jsonb)
  into v_documents from public.go_documents d join public.go_orders o on o.id=d.order_id where o.customer_user_id=v_user_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,'category',i.category,'state',i.state,'subject',i.subject,'summary',i.summary,'created_at',i.created_at,'resolved_at',i.resolved_at) order by i.created_at desc),'[]'::jsonb)
  into v_inquiries from public.go_customer_inquiries i where i.customer_user_id=v_user_id or exists(select 1 from public.go_orders o where o.id=i.order_id and o.customer_user_id=v_user_id);
  return jsonb_build_object('profile',coalesce(v_profile,'{}'::jsonb),'summary',jsonb_build_object(
    'active_orders',(select count(*) from public.go_orders where customer_user_id=v_user_id and state not in ('DELIVERED','CANCELLED')),
    'open_quotes',(select count(*) from public.go_quote_requests where customer_user_id=v_user_id and state not in ('ACCEPTED','EXPIRED','DECLINED','CANCELLED')),
    'documents_needed',(select count(*) from public.go_documents d join public.go_orders o on o.id=d.order_id where o.customer_user_id=v_user_id and d.is_required and d.status not in ('VERIFIED','WAIVED')),
    'open_inquiries',(select count(*) from public.go_customer_inquiries where customer_user_id=v_user_id and state not in ('RESOLVED','CLOSED'))),
    'quotes',v_quotes,'orders',v_orders,'documents',v_documents,'inquiries',v_inquiries);
end $$;

revoke all on function public.go_record_provider_rate(uuid,jsonb,text) from public,anon;
revoke all on function public.go_publish_firm_offer(uuid,uuid[],jsonb,text) from public,anon;
revoke all on function public.go_customer_accept_offer(uuid,jsonb,text) from public,anon;
grant execute on function public.go_record_provider_rate(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.go_publish_firm_offer(uuid,uuid[],jsonb,text) to authenticated,service_role;
grant execute on function public.go_customer_accept_offer(uuid,jsonb,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
