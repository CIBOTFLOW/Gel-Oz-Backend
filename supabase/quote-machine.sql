create table if not exists public.go_quote_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  quote_number text not null unique,
  idempotency_key text not null,
  state text not null default 'ESTIMATE_REQUESTED' check (state in ('ESTIMATE_REQUESTED','SOURCING_RATES','READY_FOR_REVIEW','FIRM_QUOTE_SENT','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  company_name text,
  contact_name text not null,
  contact_email text not null,
  contact_phone text,
  cargo_description text not null,
  origin_country text not null check (origin_country in ('TR','IT')),
  origin_city text not null,
  destination_country text not null default 'US' check (destination_country = 'US'),
  destination_city text not null,
  destination_state text not null,
  destination_postal_code text not null,
  incoterm text not null default 'EXW' check (incoterm = 'EXW'),
  mode_preference text not null check (mode_preference in ('AUTO','OCEAN_LCL','OCEAN_FCL_20','AIR')),
  pieces integer not null check (pieces between 1 and 10000),
  length_cm numeric(12,3) not null check (length_cm > 0),
  width_cm numeric(12,3) not null check (width_cm > 0),
  height_cm numeric(12,3) not null check (height_cm > 0),
  total_weight_kg numeric(14,3) not null check (total_weight_kg > 0),
  cargo_value_usd numeric(16,2) not null check (cargo_value_usd > 0),
  cubic_meters numeric(14,3) not null check (cubic_meters > 0),
  ocean_chargeable_cbm numeric(14,3) not null check (ocean_chargeable_cbm > 0),
  air_chargeable_kg numeric(14,3) not null check (air_chargeable_kg > 0),
  residential boolean not null default false,
  fragile boolean not null default false,
  stackable boolean not null default true,
  rate_card_version text not null,
  estimate_snapshot jsonb not null,
  assigned_to uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, idempotency_key)
);

create table if not exists public.go_quote_options (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  quote_request_id uuid not null references public.go_quote_requests(id) on delete cascade,
  option_code text not null,
  mode text not null check (mode in ('OCEAN_LCL','OCEAN_FCL_20','AIR')),
  arrival_port text not null,
  transit_days_min integer not null check (transit_days_min > 0),
  transit_days_max integer not null check (transit_days_max >= transit_days_min),
  currency text not null default 'USD' check (currency = 'USD'),
  provider_cost_minor bigint not null check (provider_cost_minor >= 0),
  market_contingency_minor bigint not null check (market_contingency_minor >= 0),
  gel_oz_fee_minor bigint not null check (gel_oz_fee_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  margin_rate numeric(6,5) not null check (margin_rate between 0 and 1),
  is_recommended boolean not null default false,
  estimate_breakdown jsonb not null,
  provider_plan jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique(quote_request_id, option_code)
);

create table if not exists public.go_provider_rate_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  quote_request_id uuid not null references public.go_quote_requests(id) on delete cascade,
  provider_code text not null check (provider_code in ('EASYSHIP','RXO_CONNECT','FLEXPORT','VANGUARD','MATRAŞ','CUSTOMS_BROKER','ORIGIN_FORWARDER','OTHER')),
  segment text not null check (segment in ('ORIGIN_PICKUP','EXPORT','OCEAN','AIR','IMPORT_CUSTOMS','DESTINATION_HANDLING','LAST_MILE','INSURANCE')),
  integration_method text not null check (integration_method in ('API','EDI','PORTAL','EMAIL','MANUAL')),
  state text not null default 'TO_REQUEST' check (state in ('TO_REQUEST','REQUESTED','RECEIVED','DECLINED','EXPIRED','CANCELLED')),
  external_reference text,
  request_summary jsonb not null default '{}'::jsonb,
  response_summary jsonb not null default '{}'::jsonb,
  quoted_amount_minor bigint check (quoted_amount_minor >= 0),
  currency text check (currency is null or currency in ('USD','EUR','TRY')),
  valid_until timestamptz,
  requested_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.go_quote_offers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  quote_request_id uuid not null references public.go_quote_requests(id) on delete cascade,
  version integer not null check (version > 0),
  state text not null default 'DRAFT' check (state in ('DRAFT','SENT','ACCEPTED','DECLINED','EXPIRED','VOID')),
  currency text not null default 'USD' check (currency = 'USD'),
  supplier_cost_minor bigint not null check (supplier_cost_minor >= 0),
  gel_oz_fee_minor bigint not null check (gel_oz_fee_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  line_items jsonb not null,
  terms jsonb not null default '{}'::jsonb,
  valid_until timestamptz not null,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(quote_request_id, version)
);

create table if not exists public.go_quote_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  quote_request_id uuid not null references public.go_quote_requests(id) on delete cascade,
  event_type text not null,
  actor_type text not null check (actor_type in ('CUSTOMER','OPERATOR','SYSTEM','PROVIDER')),
  actor_user_id uuid references auth.users(id) on delete set null,
  public_message text,
  internal_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists go_quote_requests_tenant_state_idx on public.go_quote_requests(tenant_id, state, requested_at desc);
create index if not exists go_quote_requests_email_idx on public.go_quote_requests(tenant_id, lower(contact_email), requested_at desc);
create index if not exists go_quote_requests_assigned_idx on public.go_quote_requests(assigned_to) where assigned_to is not null;
create index if not exists go_quote_options_request_idx on public.go_quote_options(quote_request_id, total_minor);
create index if not exists go_quote_options_tenant_idx on public.go_quote_options(tenant_id);
create index if not exists go_provider_rate_requests_quote_idx on public.go_provider_rate_requests(quote_request_id, state);
create index if not exists go_provider_rate_requests_tenant_idx on public.go_provider_rate_requests(tenant_id);
create index if not exists go_quote_offers_request_idx on public.go_quote_offers(quote_request_id, version desc);
create index if not exists go_quote_offers_tenant_idx on public.go_quote_offers(tenant_id);
create index if not exists go_quote_offers_creator_idx on public.go_quote_offers(created_by) where created_by is not null;
create index if not exists go_quote_events_request_idx on public.go_quote_events(quote_request_id, created_at desc);
create index if not exists go_quote_events_tenant_idx on public.go_quote_events(tenant_id);
create index if not exists go_quote_events_actor_idx on public.go_quote_events(actor_user_id) where actor_user_id is not null;

drop trigger if exists go_quote_requests_updated on public.go_quote_requests;
create trigger go_quote_requests_updated before update on public.go_quote_requests for each row execute function public.go_set_updated_at();
drop trigger if exists go_provider_rate_requests_updated on public.go_provider_rate_requests;
create trigger go_provider_rate_requests_updated before update on public.go_provider_rate_requests for each row execute function public.go_set_updated_at();

alter table public.go_quote_requests enable row level security;
alter table public.go_quote_options enable row level security;
alter table public.go_provider_rate_requests enable row level security;
alter table public.go_quote_offers enable row level security;
alter table public.go_quote_events enable row level security;

revoke all on public.go_quote_requests,public.go_quote_options,public.go_provider_rate_requests,public.go_quote_offers,public.go_quote_events from anon;
grant select,insert,update on public.go_quote_requests,public.go_quote_options,public.go_provider_rate_requests,public.go_quote_offers,public.go_quote_events to authenticated;
grant usage,select on sequence public.go_quote_events_id_seq to authenticated,service_role;
grant select,insert,update,delete on public.go_quote_requests,public.go_quote_options,public.go_provider_rate_requests,public.go_quote_offers,public.go_quote_events to service_role;

drop policy if exists go_quote_requests_select on public.go_quote_requests;
create policy go_quote_requests_select on public.go_quote_requests for select to authenticated using (public.go_is_member(tenant_id,null));
drop policy if exists go_quote_requests_insert on public.go_quote_requests;
create policy go_quote_requests_insert on public.go_quote_requests for insert to authenticated with check (public.go_is_member(tenant_id,array['OWNER','ADMIN','OPERATOR','CUSTOMER_SERVICE']));
drop policy if exists go_quote_requests_update on public.go_quote_requests;
create policy go_quote_requests_update on public.go_quote_requests for update to authenticated using (public.go_is_member(tenant_id,array['OWNER','ADMIN','OPERATOR','CUSTOMER_SERVICE'])) with check (public.go_is_member(tenant_id,array['OWNER','ADMIN','OPERATOR','CUSTOMER_SERVICE']));

do $$ declare r record; begin
  for r in select tablename from pg_tables where schemaname='public' and tablename in ('go_quote_options','go_provider_rate_requests','go_quote_offers','go_quote_events') loop
    execute format('drop policy if exists %I on public.%I',r.tablename||'_select',r.tablename);
    execute format('create policy %I on public.%I for select to authenticated using (public.go_is_member(tenant_id,null))',r.tablename||'_select',r.tablename);
    execute format('drop policy if exists %I on public.%I',r.tablename||'_insert',r.tablename);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.go_is_member(tenant_id,array[''OWNER'',''ADMIN'',''OPERATOR'',''CUSTOMER_SERVICE'']))',r.tablename||'_insert',r.tablename);
    execute format('drop policy if exists %I on public.%I',r.tablename||'_update',r.tablename);
    execute format('create policy %I on public.%I for update to authenticated using (public.go_is_member(tenant_id,array[''OWNER'',''ADMIN'',''OPERATOR'',''CUSTOMER_SERVICE''])) with check (public.go_is_member(tenant_id,array[''OWNER'',''ADMIN'',''OPERATOR'',''CUSTOMER_SERVICE'']))',r.tablename||'_update',r.tablename);
  end loop;
end $$;

create or replace function public.go_submit_quote_request(p_payload jsonb, p_estimate jsonb, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_tenant_id uuid;
  v_request_id uuid;
  v_quote_number text;
  v_option jsonb;
  v_existing public.go_quote_requests;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 100 then raise exception 'invalid idempotency key'; end if;
  if coalesce(p_payload->>'contact_email','') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'valid contact email required'; end if;
  if length(coalesce(p_payload->>'contact_name','')) not between 1 and 120 then raise exception 'contact name required'; end if;
  if length(coalesce(p_payload->>'cargo_description','')) not between 2 and 500 then raise exception 'cargo description required'; end if;
  if p_payload->>'origin_country' not in ('TR','IT') or p_payload->>'destination_country' <> 'US' then raise exception 'unsupported lane'; end if;
  if p_payload->>'mode' not in ('AUTO','OCEAN_LCL','OCEAN_FCL_20','AIR') then raise exception 'unsupported mode'; end if;
  if jsonb_typeof(p_estimate->'options') <> 'array' or jsonb_array_length(p_estimate->'options') not between 1 and 8 then raise exception 'invalid estimate options'; end if;

  select id into v_tenant_id from public.go_tenants where slug='gel-oz-logistics';
  if v_tenant_id is null then raise exception 'Gel Oz tenant is not initialized'; end if;
  select * into v_existing from public.go_quote_requests where tenant_id=v_tenant_id and idempotency_key=p_idempotency_key;
  if found then return jsonb_build_object('quote_number',v_existing.quote_number,'state',v_existing.state,'requested_at',v_existing.requested_at,'duplicate',true); end if;

  v_request_id := gen_random_uuid();
  v_quote_number := 'GOQ-' || to_char(now(),'YY') || '-' || upper(substr(replace(v_request_id::text,'-',''),1,8));
  insert into public.go_quote_requests(
    id,tenant_id,quote_number,idempotency_key,company_name,contact_name,contact_email,contact_phone,cargo_description,
    origin_country,origin_city,destination_country,destination_city,destination_state,destination_postal_code,mode_preference,
    pieces,length_cm,width_cm,height_cm,total_weight_kg,cargo_value_usd,cubic_meters,ocean_chargeable_cbm,air_chargeable_kg,
    residential,fragile,stackable,rate_card_version,estimate_snapshot
  ) values (
    v_request_id,v_tenant_id,v_quote_number,p_idempotency_key,left(nullif(trim(p_payload->>'company_name'),''),160),left(trim(p_payload->>'contact_name'),120),lower(left(trim(p_payload->>'contact_email'),254)),left(nullif(trim(p_payload->>'contact_phone'),''),40),left(trim(p_payload->>'cargo_description'),500),
    p_payload->>'origin_country',left(trim(p_payload->>'origin_city'),80),'US',left(trim(p_payload->>'destination_city'),80),left(upper(trim(p_payload->>'destination_state')),40),left(trim(p_payload->>'destination_postal_code'),16),p_payload->>'mode',
    (p_payload->>'pieces')::integer,(p_payload->>'length_cm')::numeric,(p_payload->>'width_cm')::numeric,(p_payload->>'height_cm')::numeric,(p_payload->>'total_weight_kg')::numeric,(p_payload->>'cargo_value_usd')::numeric,
    (p_estimate->>'cubicMeters')::numeric,(p_estimate->>'oceanChargeableCbm')::numeric,(p_estimate->>'airChargeableKg')::numeric,
    coalesce((p_payload->>'residential')::boolean,false),coalesce((p_payload->>'fragile')::boolean,false),coalesce((p_payload->>'stackable')::boolean,true),left(p_estimate->>'rateCardVersion',80),p_estimate
  );

  for v_option in select value from jsonb_array_elements(p_estimate->'options') loop
    insert into public.go_quote_options(tenant_id,quote_request_id,option_code,mode,arrival_port,transit_days_min,transit_days_max,provider_cost_minor,market_contingency_minor,gel_oz_fee_minor,total_minor,margin_rate,is_recommended,estimate_breakdown,provider_plan)
    values(v_tenant_id,v_request_id,left(v_option->>'optionCode',80),v_option->>'mode',left(v_option->>'arrivalPort',120),(v_option->>'transitDaysMin')::integer,(v_option->>'transitDaysMax')::integer,
      round((v_option->>'providerCost')::numeric*100),round((v_option->>'marketContingency')::numeric*100),round((v_option->>'gelOzCoordination')::numeric*100),round((v_option->>'estimatedTotal')::numeric*100),(v_option->>'marginRate')::numeric,coalesce((v_option->>'recommended')::boolean,false),coalesce(v_option->'breakdown','{}'::jsonb),coalesce(v_option->'providerPlan','[]'::jsonb));
  end loop;
  insert into public.go_quote_events(tenant_id,quote_request_id,event_type,actor_type,public_message,internal_detail)
  values(v_tenant_id,v_request_id,'QUOTE_REQUESTED','CUSTOMER','Your quote request was received.',jsonb_build_object('rate_card_version',p_estimate->>'rateCardVersion'));
  return jsonb_build_object('quote_number',v_quote_number,'state','ESTIMATE_REQUESTED','requested_at',now(),'duplicate',false);
end $$;

create or replace function public.go_quote_inbox(p_tenant_id uuid) returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(to_jsonb(q) || jsonb_build_object('options',coalesce(o.options,'[]'::jsonb),'provider_requests',coalesce(r.provider_requests,'[]'::jsonb)) order by q.requested_at desc),'[]'::jsonb)
  from (
    select id,tenant_id,quote_number,state,company_name,contact_name,contact_email,cargo_description,origin_country,origin_city,destination_city,destination_state,destination_postal_code,mode_preference,pieces,total_weight_kg,cubic_meters,ocean_chargeable_cbm,air_chargeable_kg,rate_card_version,requested_at
    from public.go_quote_requests where tenant_id=p_tenant_id and public.go_is_member(tenant_id,null) order by requested_at desc limit 100
  ) q
  left join lateral (select jsonb_agg(jsonb_build_object('id',id,'option_code',option_code,'mode',mode,'arrival_port',arrival_port,'transit_days_min',transit_days_min,'transit_days_max',transit_days_max,'provider_cost_minor',provider_cost_minor,'market_contingency_minor',market_contingency_minor,'gel_oz_fee_minor',gel_oz_fee_minor,'total_minor',total_minor,'is_recommended',is_recommended) order by total_minor) options from public.go_quote_options where quote_request_id=q.id) o on true
  left join lateral (select jsonb_agg(jsonb_build_object('id',id,'provider_code',provider_code,'segment',segment,'integration_method',integration_method,'state',state,'external_reference',external_reference,'quoted_amount_minor',quoted_amount_minor,'currency',currency,'valid_until',valid_until) order by created_at) provider_requests from public.go_provider_rate_requests where quote_request_id=q.id) r on true;
$$;

revoke all on function public.go_submit_quote_request(jsonb,jsonb,text) from public;
grant execute on function public.go_submit_quote_request(jsonb,jsonb,text) to anon,authenticated,service_role;
revoke all on function public.go_quote_inbox(uuid) from public,anon;
grant execute on function public.go_quote_inbox(uuid) to authenticated,service_role;

notify pgrst, 'reload schema';
