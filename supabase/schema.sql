create extension if not exists pgcrypto;

create table public.go_tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null check (length(name) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.go_memberships (
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('OWNER','ADMIN','OPERATOR','WAREHOUSE','CUSTOMER_SERVICE','VIEWER')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index go_memberships_user_idx on public.go_memberships(user_id, tenant_id);

create table public.go_facilities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  code text not null,
  name text not null,
  country_code char(2) not null,
  city text not null,
  timezone text not null,
  facility_type text not null check (facility_type in ('WAREHOUSE','CFS','CROSS_DOCK','PARTNER')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.go_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete restrict,
  source text not null check (source in ('LUZIONE','SHOPIFY','FEP','API','MANUAL','OTHER')),
  source_order_id text,
  customer_reference text,
  tracking_number text not null unique,
  state text not null default 'ORDER_RECEIVED',
  service_level text not null check (service_level in ('PARCEL','THRESHOLD','ROOM_OF_CHOICE','WHITE_GLOVE','LTL','FTL')),
  incoterm text check (incoterm is null or incoterm in ('EXW','FCA','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP')),
  currency char(3) not null default 'USD',
  origin jsonb not null default '{}'::jsonb,
  destination jsonb not null default '{}'::jsonb,
  ship_to jsonb not null default '{}'::jsonb,
  customer_contact jsonb not null default '{}'::jsonb,
  requested_delivery_at timestamptz,
  promised_delivery_at timestamptz,
  delivered_at timestamptz,
  hold_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (tenant_id, source, source_order_id)
);
create index go_orders_tenant_state_idx on public.go_orders(tenant_id, state, created_at desc);
create index go_orders_tenant_source_idx on public.go_orders(tenant_id, source, created_at desc);

create table public.go_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  order_id uuid not null references public.go_orders(id) on delete cascade,
  sku text,
  title text not null,
  quantity integer not null check (quantity > 0),
  hs_code text,
  country_of_origin char(2),
  unit_value_minor bigint not null default 0 check (unit_value_minor >= 0),
  currency char(3) not null default 'USD',
  length_cm numeric(10,2) not null check (length_cm > 0),
  width_cm numeric(10,2) not null check (width_cm > 0),
  height_cm numeric(10,2) not null check (height_cm > 0),
  weight_kg numeric(10,3) not null check (weight_kg > 0),
  fragile boolean not null default false,
  stackable boolean not null default true,
  hazardous boolean not null default false,
  created_at timestamptz not null default now()
);
create index go_order_items_order_idx on public.go_order_items(tenant_id, order_id);

create table public.go_packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  order_id uuid not null references public.go_orders(id) on delete cascade,
  order_item_id uuid references public.go_order_items(id) on delete set null,
  package_ref text not null,
  piece_count integer not null default 1 check (piece_count > 0),
  package_type text not null default 'CARTON',
  length_cm numeric(10,2) not null check (length_cm > 0),
  width_cm numeric(10,2) not null check (width_cm > 0),
  height_cm numeric(10,2) not null check (height_cm > 0),
  weight_kg numeric(10,3) not null check (weight_kg > 0),
  stackable boolean not null default true,
  fragile boolean not null default false,
  status text not null default 'EXPECTED' check (status in ('EXPECTED','RECEIVED','INSPECTED','REPACK_REQUIRED','READY','ALLOCATED','LOADED','DISPATCHED','DELIVERED','DAMAGED','MISSING')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, package_ref)
);
create index go_packages_order_status_idx on public.go_packages(tenant_id, order_id, status);

create table public.go_handling_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  facility_id uuid references public.go_facilities(id) on delete restrict,
  unit_ref text not null,
  unit_type text not null check (unit_type in ('PALLET_EUR','PALLET_US','CRATE','CARTON','LOOSE')),
  status text not null default 'OPEN' check (status in ('OPEN','BUILDING','SEALED','STAGED','LOADED','DISPATCHED','RECEIVED','BROKEN_DOWN','CANCELLED')),
  length_cm numeric(10,2) not null,
  width_cm numeric(10,2) not null,
  max_height_cm numeric(10,2) not null,
  max_weight_kg numeric(10,3) not null,
  current_volume_cbm numeric(12,4) not null default 0,
  current_weight_kg numeric(12,3) not null default 0,
  utilization_pct numeric(6,2) not null default 0 check (utilization_pct between 0 and 100),
  sscc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, unit_ref)
);
create index go_handling_units_tenant_status_idx on public.go_handling_units(tenant_id, status, created_at desc);

create table public.go_handling_unit_packages (
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  handling_unit_id uuid not null references public.go_handling_units(id) on delete cascade,
  package_id uuid not null references public.go_packages(id) on delete restrict,
  x_cm numeric(10,2),
  y_cm numeric(10,2),
  z_cm numeric(10,2),
  rotation_degrees smallint check (rotation_degrees is null or rotation_degrees in (0,90,180,270)),
  placed_at timestamptz not null default now(),
  primary key (handling_unit_id, package_id)
);

create table public.go_consolidation_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  version integer not null default 1,
  status text not null default 'PROPOSED' check (status in ('PROPOSED','ACCEPTED','SUPERSEDED','EXECUTING','COMPLETED','CANCELLED')),
  origin_country char(2) not null,
  destination_country char(2) not null,
  destination_port text,
  freight_mode text not null check (freight_mode in ('LCL','FCL_20','FCL_40','FCL_40_HC')),
  total_volume_cbm numeric(12,4) not null,
  total_weight_kg numeric(12,3) not null,
  pallet_count integer not null,
  utilization_pct numeric(6,2) not null,
  rate_card_version text,
  estimated_cost_minor bigint,
  currency char(3),
  assumptions jsonb not null default '[]'::jsonb,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.go_plan_handling_units (
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  plan_id uuid not null references public.go_consolidation_plans(id) on delete cascade,
  handling_unit_id uuid not null references public.go_handling_units(id) on delete restrict,
  sequence_no integer not null,
  container_x_cm numeric(10,2),
  container_y_cm numeric(10,2),
  container_z_cm numeric(10,2),
  primary key (plan_id, handling_unit_id)
);

create table public.go_shipments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  plan_id uuid references public.go_consolidation_plans(id) on delete set null,
  shipment_ref text not null,
  mode text not null check (mode in ('OCEAN_LCL','OCEAN_FCL','AIR','TRUCKLOAD','LTL','PARCEL','LOCAL_DELIVERY')),
  provider text not null check (provider in ('EASYSHIP','SHOPIFY','RXO','VANGUARD','MATRAS','FEDEX','UPS','DHL','MANUAL','OTHER')),
  provider_reference text,
  master_tracking_number text,
  state text not null default 'DRAFT',
  origin_port text,
  destination_port text,
  estimated_departure_at timestamptz,
  actual_departure_at timestamptz,
  estimated_arrival_at timestamptz,
  actual_arrival_at timestamptz,
  customs_status text not null default 'NOT_STARTED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, shipment_ref)
);
create index go_shipments_tenant_state_idx on public.go_shipments(tenant_id, state, created_at desc);

create table public.go_shipment_orders (
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  shipment_id uuid not null references public.go_shipments(id) on delete cascade,
  order_id uuid not null references public.go_orders(id) on delete restrict,
  primary key (shipment_id, order_id)
);

create table public.go_tracking_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  order_id uuid not null references public.go_orders(id) on delete cascade,
  shipment_id uuid references public.go_shipments(id) on delete set null,
  normalized_state text not null,
  provider text,
  provider_event_id text,
  provider_state text,
  event_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  city text,
  country_code char(2),
  customer_message text not null,
  internal_detail text,
  source_payload_hash text,
  unique nulls not distinct (tenant_id, provider, provider_event_id)
);
create index go_tracking_events_public_idx on public.go_tracking_events(order_id, event_at desc, id desc);

create table public.go_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  order_id uuid references public.go_orders(id) on delete cascade,
  shipment_id uuid references public.go_shipments(id) on delete cascade,
  document_type text not null check (document_type in ('COMMERCIAL_INVOICE','PACKING_LIST','CERTIFICATE_OF_ORIGIN','EXPORT_DECLARATION','BILL_OF_LADING','ISF_10_PLUS_2','CUSTOMS_ENTRY','POWER_OF_ATTORNEY','DELIVERY_ORDER','PROOF_OF_DELIVERY','DAMAGE_REPORT','OTHER')),
  status text not null default 'MISSING' check (status in ('MISSING','REQUESTED','UPLOADED','VERIFIED','REJECTED','EXPIRED','NOT_REQUIRED')),
  version integer not null default 1,
  storage_path text,
  checksum_sha256 text,
  is_required boolean not null default true,
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index go_documents_gate_idx on public.go_documents(tenant_id, status, document_type);

create table public.go_provider_handoffs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  order_id uuid references public.go_orders(id) on delete cascade,
  shipment_id uuid references public.go_shipments(id) on delete cascade,
  provider text not null,
  operation text not null check (operation in ('RATE','BOOK','LABEL','PICKUP','TENDER','TRACK','DOCUMENT','CANCEL')),
  state text not null default 'PLANNED' check (state in ('PLANNED','AWAITING_APPROVAL','SUBMITTED','ACCEPTED','REJECTED','FAILED','MANUAL_FALLBACK','COMPLETED')),
  provider_reference text,
  idempotency_key text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  last_error text,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, idempotency_key)
);
create index go_provider_handoffs_retry_idx on public.go_provider_handoffs(tenant_id, state, next_attempt_at) where state in ('PLANNED','FAILED');

create table public.go_work_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  facility_id uuid references public.go_facilities(id) on delete restrict,
  order_id uuid references public.go_orders(id) on delete cascade,
  package_id uuid references public.go_packages(id) on delete set null,
  work_type text not null check (work_type in ('RECEIVE','INSPECT','PHOTO','REPACK','CRATE','PALLETIZE','PICK','LOAD','CUSTOMS_HOLD','DELIVERY_SUPPORT')),
  state text not null default 'OPEN' check (state in ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','DONE','CANCELLED')),
  priority smallint not null default 3 check (priority between 1 and 5),
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  instructions text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index go_work_orders_queue_idx on public.go_work_orders(tenant_id, facility_id, state, priority, due_at);

create table public.go_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  order_id uuid references public.go_orders(id) on delete cascade,
  shipment_id uuid references public.go_shipments(id) on delete cascade,
  code text not null,
  severity text not null check (severity in ('INFO','WARNING','HIGH','CRITICAL')),
  state text not null default 'OPEN' check (state in ('OPEN','INVESTIGATING','WAITING_EXTERNAL','RESOLVED','CANCELLED')),
  summary text not null,
  owner_id uuid references auth.users(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index go_exceptions_open_idx on public.go_exceptions(tenant_id, severity, created_at desc) where state not in ('RESOLVED','CANCELLED');

create table public.go_customer_inquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  order_id uuid references public.go_orders(id) on delete set null,
  channel text not null check (channel in ('EMAIL','PHONE','CHAT','SHOPIFY','FEP','OTHER')),
  category text not null check (category in ('WISMO','CHANGE_DELIVERY','DAMAGE','MISSING','CUSTOMS','BILLING','OTHER')),
  state text not null default 'OPEN' check (state in ('OPEN','IN_PROGRESS','WAITING_CUSTOMER','WAITING_PROVIDER','RESOLVED')),
  subject text not null,
  summary text not null,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.go_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  order_id uuid references public.go_orders(id) on delete cascade,
  recommendation_type text not null,
  input_snapshot_hash text not null,
  model_version text not null,
  recommendation jsonb not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  state text not null default 'PROPOSED' check (state in ('PROPOSED','ACCEPTED','REJECTED','EXPIRED','SUPERSEDED')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  outcome jsonb,
  human_feedback text,
  created_at timestamptz not null default now()
);
create index go_ai_recommendations_order_idx on public.go_ai_recommendations(tenant_id, order_id, created_at desc);

create table public.go_operation_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.go_tenants(id) on delete restrict,
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'USER' check (actor_type in ('USER','SYSTEM','PROVIDER','SULTAN')),
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index go_operation_events_aggregate_idx on public.go_operation_events(tenant_id, aggregate_type, aggregate_id, occurred_at desc);

create table public.go_idempotency_records (
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  operation text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_payload jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  primary key (tenant_id, operation, idempotency_key)
);

create table public.go_status_transitions (
  from_state text not null,
  to_state text not null,
  customer_message text not null,
  primary key (from_state, to_state)
);

insert into public.go_status_transitions(from_state, to_state, customer_message) values
  ('ORDER_RECEIVED','AWAITING_SUPPLIER','Your order is confirmed and awaiting supplier readiness.'),
  ('ORDER_RECEIVED','INBOUND_TO_ORIGIN_HUB','Your items are moving to our origin facility.'),
  ('AWAITING_SUPPLIER','INBOUND_TO_ORIGIN_HUB','Your items are moving to our origin facility.'),
  ('INBOUND_TO_ORIGIN_HUB','RECEIVED_ORIGIN_HUB','Your items arrived at our origin facility.'),
  ('RECEIVED_ORIGIN_HUB','QUALITY_CONTROL','Your items are being inspected.'),
  ('QUALITY_CONTROL','REPACKAGING','Your items are being prepared for international transit.'),
  ('QUALITY_CONTROL','CONSOLIDATION_PLANNING','Your items are ready for consolidation planning.'),
  ('REPACKAGING','CONSOLIDATION_PLANNING','Your items are ready for consolidation planning.'),
  ('CONSOLIDATION_PLANNING','PALLETIZED','Your items have been secured for consolidated transport.'),
  ('PALLETIZED','BOOKED','International transport has been booked.'),
  ('BOOKED','EXPORT_CUSTOMS','Your shipment is completing export formalities.'),
  ('EXPORT_CUSTOMS','ORIGIN_DEPARTED','Your shipment departed the origin country.'),
  ('ORIGIN_DEPARTED','IN_TRANSIT','Your shipment is in international transit.'),
  ('IN_TRANSIT','IMPORT_CUSTOMS','Your shipment is completing U.S. import clearance.'),
  ('IMPORT_CUSTOMS','DESTINATION_HUB','Your shipment arrived at the destination facility.'),
  ('DESTINATION_HUB','OUT_FOR_DELIVERY','Your order is out for delivery.'),
  ('OUT_FOR_DELIVERY','DELIVERED','Your order was delivered.'),
  ('OUT_FOR_DELIVERY','DELIVERY_ATTEMPTED','A delivery attempt was made. We are coordinating the next step.'),
  ('DELIVERY_ATTEMPTED','OUT_FOR_DELIVERY','Your order is out for delivery again.');

create function public.go_set_updated_at() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin new.updated_at = now(); return new; end $$;

create trigger go_tenants_updated before update on public.go_tenants for each row execute function public.go_set_updated_at();
create trigger go_facilities_updated before update on public.go_facilities for each row execute function public.go_set_updated_at();
create trigger go_orders_updated before update on public.go_orders for each row execute function public.go_set_updated_at();
create trigger go_packages_updated before update on public.go_packages for each row execute function public.go_set_updated_at();
create trigger go_handling_units_updated before update on public.go_handling_units for each row execute function public.go_set_updated_at();
create trigger go_plans_updated before update on public.go_consolidation_plans for each row execute function public.go_set_updated_at();
create trigger go_shipments_updated before update on public.go_shipments for each row execute function public.go_set_updated_at();
create trigger go_documents_updated before update on public.go_documents for each row execute function public.go_set_updated_at();
create trigger go_handoffs_updated before update on public.go_provider_handoffs for each row execute function public.go_set_updated_at();
create trigger go_work_orders_updated before update on public.go_work_orders for each row execute function public.go_set_updated_at();

create function public.go_is_member(p_tenant_id uuid, p_roles text[] default null) returns boolean
language sql stable security invoker set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.go_memberships m
    where m.tenant_id = p_tenant_id
      and m.user_id = (select auth.uid())
      and (p_roles is null or m.role = any(p_roles))
  );
$$;

create function public.go_bootstrap_workspace(p_name text, p_slug text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_tenant public.go_tenants;
begin
  if v_user is null then raise exception 'authentication required'; end if;
  if exists(select 1 from public.go_memberships where user_id = v_user) then raise exception 'user already belongs to a workspace'; end if;
  select * into v_tenant from public.go_tenants where slug = p_slug for update;
  if found and exists(select 1 from public.go_memberships where tenant_id = v_tenant.id) then raise exception 'workspace slug is already claimed'; end if;
  if not found then insert into public.go_tenants(name, slug) values(p_name, p_slug) returning * into v_tenant; end if;
  insert into public.go_memberships(tenant_id,user_id,role) values(v_tenant.id,v_user,'OWNER');
  insert into public.go_facilities(tenant_id,code,name,country_code,city,timezone,facility_type) values
    (v_tenant.id,'IST-01','Istanbul Origin Hub','TR','Istanbul','Europe/Istanbul','WAREHOUSE'),
    (v_tenant.id,'MIL-01','Milan / Matras Partner Hub','IT','Milan','Europe/Rome','PARTNER'),
    (v_tenant.id,'NYC-01','New York Destination Hub','US','New York','America/New_York','CFS');
  return jsonb_build_object('tenant_id',v_tenant.id,'slug',v_tenant.slug,'role','OWNER');
end $$;

create function public.go_intake_order(p_payload jsonb, p_idempotency_key text) returns jsonb
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
  if auth.uid() is null or not public.go_is_member(v_tenant, array['OWNER','ADMIN','OPERATOR']) then raise exception 'operator access required'; end if;
  if length(coalesce(p_idempotency_key,'')) < 8 then raise exception 'idempotency key must be at least 8 characters'; end if;
  select * into v_existing from public.go_idempotency_records where tenant_id=v_tenant and operation='ORDER_INTAKE' and idempotency_key=p_idempotency_key for update;
  if found then
    if v_existing.request_hash <> v_hash then raise exception 'idempotency key reused with different payload'; end if;
    return v_existing.response_payload;
  end if;
  if jsonb_array_length(coalesce(p_payload->'items','[]'::jsonb)) = 0 then raise exception 'at least one item is required'; end if;
  insert into public.go_orders(tenant_id,source,source_order_id,customer_reference,tracking_number,state,service_level,incoterm,currency,origin,destination,ship_to,customer_contact,requested_delivery_at,created_by)
  values(v_tenant,coalesce(p_payload->>'source','MANUAL'),nullif(p_payload->>'source_order_id',''),nullif(p_payload->>'customer_reference',''),
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
  insert into public.go_operation_events(tenant_id,aggregate_type,aggregate_id,event_type,actor_id,idempotency_key,payload)
  values(v_tenant,'ORDER',v_order.id,'ORDER_INTAKE_ACCEPTED',auth.uid(),p_idempotency_key,jsonb_build_object('source',v_order.source,'tracking_number',v_order.tracking_number));
  v_existing.response_payload := jsonb_build_object('order_id',v_order.id,'tracking_number',v_order.tracking_number,'state',v_order.state,'created_at',v_order.created_at);
  insert into public.go_idempotency_records(tenant_id,operation,idempotency_key,request_hash,response_payload) values(v_tenant,'ORDER_INTAKE',p_idempotency_key,v_hash,v_existing.response_payload);
  return v_existing.response_payload;
end $$;

create function public.go_advance_order(p_order_id uuid,p_to_state text,p_customer_message text default null,p_internal_detail text default null) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_order public.go_orders; v_default_message text;
begin
  select * into v_order from public.go_orders where id=p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if not public.go_is_member(v_order.tenant_id,array['OWNER','ADMIN','OPERATOR','WAREHOUSE','CUSTOMER_SERVICE']) then raise exception 'operator access required'; end if;
  select customer_message into v_default_message from public.go_status_transitions where from_state=v_order.state and to_state=p_to_state;
  if v_default_message is null and p_to_state <> 'EXCEPTION' then raise exception 'invalid order transition: % -> %',v_order.state,p_to_state; end if;
  update public.go_orders set state=p_to_state,delivered_at=case when p_to_state='DELIVERED' then now() else delivered_at end where id=p_order_id;
  insert into public.go_tracking_events(tenant_id,order_id,normalized_state,event_at,customer_message,internal_detail)
  values(v_order.tenant_id,p_order_id,p_to_state,now(),coalesce(nullif(p_customer_message,''),v_default_message,'We are reviewing an exception affecting this order.'),p_internal_detail);
  insert into public.go_operation_events(tenant_id,aggregate_type,aggregate_id,event_type,actor_id,payload)
  values(v_order.tenant_id,'ORDER',p_order_id,'ORDER_STATE_CHANGED',auth.uid(),jsonb_build_object('from',v_order.state,'to',p_to_state));
  return jsonb_build_object('order_id',p_order_id,'from_state',v_order.state,'to_state',p_to_state,'recorded_at',now());
end $$;

create function public.go_dashboard_snapshot(p_tenant_id uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tenant_id',p_tenant_id,
    'orders_total',(select count(*) from public.go_orders where tenant_id=p_tenant_id),
    'orders_open',(select count(*) from public.go_orders where tenant_id=p_tenant_id and state not in ('DELIVERED','CANCELLED')),
    'exceptions_open',(select count(*) from public.go_exceptions where tenant_id=p_tenant_id and state not in ('RESOLVED','CANCELLED')),
    'work_open',(select count(*) from public.go_work_orders where tenant_id=p_tenant_id and state not in ('DONE','CANCELLED')),
    'documents_missing',(select count(*) from public.go_documents where tenant_id=p_tenant_id and is_required and status in ('MISSING','REQUESTED','REJECTED','EXPIRED')),
    'pallets_open',(select count(*) from public.go_handling_units where tenant_id=p_tenant_id and unit_type like 'PALLET%' and status in ('OPEN','BUILDING')),
    'recent_orders',coalesce((select jsonb_agg(x order by x.created_at desc) from (select id,tracking_number,source,source_order_id,state,service_level,destination->>'city' as destination_city,created_at from public.go_orders where tenant_id=p_tenant_id order by created_at desc limit 25) x),'[]'::jsonb)
  ) where public.go_is_member(p_tenant_id,null);
$$;

create function public.go_public_tracking(p_tracking_number text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tracking_number',o.tracking_number,'state',o.state,'service_level',o.service_level,
    'destination',jsonb_build_object('city',o.destination->>'city','country_code',o.destination->>'country_code'),
    'promised_delivery_at',o.promised_delivery_at,'delivered_at',o.delivered_at,
    'events',coalesce((select jsonb_agg(jsonb_build_object('state',e.normalized_state,'message',e.customer_message,'event_at',e.event_at,'city',e.city,'country_code',e.country_code,'provider',e.provider) order by e.event_at desc,e.id desc) from public.go_tracking_events e where e.order_id=o.id),'[]'::jsonb)
  ) from public.go_orders o where o.tracking_number=upper(trim(p_tracking_number));
$$;

do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' and tablename like 'go_%' loop
    execute format('alter table public.%I enable row level security',r.tablename);
    execute format('revoke all on table public.%I from anon, authenticated',r.tablename);
    execute format('grant select, insert, update, delete on table public.%I to service_role',r.tablename);
  end loop;
end $$;

grant usage, select on all sequences in schema public to service_role;
grant select,insert,update,delete on public.go_tenants,public.go_memberships,public.go_facilities,public.go_orders,public.go_order_items,public.go_packages,public.go_handling_units,public.go_handling_unit_packages,public.go_consolidation_plans,public.go_plan_handling_units,public.go_shipments,public.go_shipment_orders,public.go_tracking_events,public.go_documents,public.go_provider_handoffs,public.go_work_orders,public.go_exceptions,public.go_customer_inquiries,public.go_ai_recommendations,public.go_operation_events,public.go_idempotency_records to authenticated;
grant select on public.go_status_transitions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy go_tenants_select on public.go_tenants for select to authenticated using (public.go_is_member(id,null));
create policy go_memberships_select on public.go_memberships for select to authenticated using (user_id=(select auth.uid()) or public.go_is_member(tenant_id,array['OWNER','ADMIN']));
create policy go_memberships_manage on public.go_memberships for all to authenticated using (public.go_is_member(tenant_id,array['OWNER','ADMIN'])) with check (public.go_is_member(tenant_id,array['OWNER','ADMIN']));

do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' and tablename in ('go_facilities','go_orders','go_order_items','go_packages','go_handling_units','go_handling_unit_packages','go_consolidation_plans','go_plan_handling_units','go_shipments','go_shipment_orders','go_tracking_events','go_documents','go_provider_handoffs','go_work_orders','go_exceptions','go_customer_inquiries','go_ai_recommendations','go_operation_events','go_idempotency_records') loop
    execute format('create policy %I on public.%I for select to authenticated using (public.go_is_member(tenant_id,null))',r.tablename||'_select',r.tablename);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.go_is_member(tenant_id,array[''OWNER'',''ADMIN'',''OPERATOR'',''WAREHOUSE'',''CUSTOMER_SERVICE'']))',r.tablename||'_insert',r.tablename);
    execute format('create policy %I on public.%I for update to authenticated using (public.go_is_member(tenant_id,array[''OWNER'',''ADMIN'',''OPERATOR'',''WAREHOUSE'',''CUSTOMER_SERVICE''])) with check (public.go_is_member(tenant_id,array[''OWNER'',''ADMIN'',''OPERATOR'',''WAREHOUSE'',''CUSTOMER_SERVICE'']))',r.tablename||'_update',r.tablename);
  end loop;
end $$;

create policy go_status_transitions_select on public.go_status_transitions for select to authenticated using (true);
drop policy if exists go_tracking_events_update on public.go_tracking_events;
drop policy if exists go_operation_events_update on public.go_operation_events;
drop policy if exists go_idempotency_records_update on public.go_idempotency_records;
revoke update on public.go_tracking_events,public.go_operation_events,public.go_idempotency_records from authenticated;

revoke all on function public.go_set_updated_at() from public,anon,authenticated;
revoke all on function public.go_is_member(uuid,text[]) from public,anon;
revoke all on function public.go_bootstrap_workspace(text,text) from public,anon;
revoke all on function public.go_intake_order(jsonb,text) from public,anon;
revoke all on function public.go_advance_order(uuid,text,text,text) from public,anon;
revoke all on function public.go_dashboard_snapshot(uuid) from public,anon;
revoke all on function public.go_public_tracking(text) from public;
grant execute on function public.go_is_member(uuid,text[]) to authenticated,service_role;
grant execute on function public.go_bootstrap_workspace(text,text),public.go_intake_order(jsonb,text),public.go_advance_order(uuid,text,text,text),public.go_dashboard_snapshot(uuid) to authenticated,service_role;
grant execute on function public.go_public_tracking(text) to anon,authenticated,service_role;

notify pgrst, 'reload schema';
