begin;

create table if not exists public.go_customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  full_name text,
  company_name text,
  phone text,
  locale text not null default 'tr-TR' check (locale in ('tr-TR','en-US')),
  notification_preferences jsonb not null default '{"email":true,"milestones":true,"exceptions":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.go_customer_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.go_tenants(id) on delete cascade,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

alter table public.go_quote_requests add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
alter table public.go_orders add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
alter table public.go_customer_inquiries add column if not exists customer_user_id uuid references auth.users(id) on delete set null;
alter table public.go_customer_inquiries add column if not exists idempotency_key text;

create index if not exists go_quote_requests_customer_idx on public.go_quote_requests(customer_user_id,requested_at desc) where customer_user_id is not null;
create index if not exists go_orders_customer_idx on public.go_orders(customer_user_id,created_at desc) where customer_user_id is not null;
create index if not exists go_customer_inquiries_customer_idx on public.go_customer_inquiries(customer_user_id,created_at desc) where customer_user_id is not null;
create unique index if not exists go_customer_inquiries_idempotency_idx on public.go_customer_inquiries(tenant_id,idempotency_key) where idempotency_key is not null;
create index if not exists go_customer_events_user_idx on public.go_customer_events(customer_user_id,occurred_at desc);

alter table public.go_customer_profiles enable row level security;
alter table public.go_customer_events enable row level security;
revoke all on public.go_customer_profiles,public.go_customer_events from public,anon;
revoke all on public.go_customer_profiles,public.go_customer_events from authenticated;
grant select,insert,update,delete on public.go_customer_profiles,public.go_customer_events to service_role;
grant usage,select on sequence public.go_customer_events_id_seq to service_role;

drop policy if exists go_customer_events_no_direct_access on public.go_customer_events;
create policy go_customer_events_no_direct_access on public.go_customer_events for all to authenticated using (false) with check (false);

drop policy if exists go_customer_profiles_own_select on public.go_customer_profiles;
create policy go_customer_profiles_own_select on public.go_customer_profiles for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists go_customer_profiles_own_update on public.go_customer_profiles;
create policy go_customer_profiles_own_update on public.go_customer_profiles for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);

create or replace function public.go_claim_customer_records() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_tenant_id uuid;
  v_quotes integer := 0;
  v_orders integer := 0;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  select lower(email) into v_email from auth.users where id=v_user_id and email_confirmed_at is not null;
  if v_email is null then raise exception 'confirmed email required'; end if;
  select id into v_tenant_id from public.go_tenants where slug='gel-oz-logistics';
  if v_tenant_id is null then raise exception 'Gel Oz tenant is not initialized'; end if;

  insert into public.go_customer_profiles(user_id,tenant_id,full_name)
  select v_user_id,v_tenant_id,nullif(raw_user_meta_data->>'full_name','') from auth.users where id=v_user_id
  on conflict (user_id) do nothing;

  update public.go_quote_requests set customer_user_id=v_user_id
  where tenant_id=v_tenant_id and customer_user_id is null and lower(contact_email)=v_email;
  get diagnostics v_quotes = row_count;

  update public.go_orders set customer_user_id=v_user_id
  where tenant_id=v_tenant_id and customer_user_id is null and lower(customer_contact->>'email')=v_email;
  get diagnostics v_orders = row_count;

  if v_quotes+v_orders > 0 then
    insert into public.go_customer_events(tenant_id,customer_user_id,event_type,aggregate_type,payload)
    values(v_tenant_id,v_user_id,'CUSTOMER_RECORDS_CLAIMED','CUSTOMER',jsonb_build_object('quotes',v_quotes,'orders',v_orders));
  end if;
  return jsonb_build_object('quotes_claimed',v_quotes,'orders_claimed',v_orders);
end $$;

create or replace function public.go_customer_dashboard() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_profile jsonb;
  v_quotes jsonb;
  v_orders jsonb;
  v_documents jsonb;
  v_inquiries jsonb;
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
    'options',coalesce((select jsonb_agg(jsonb_build_object('mode',o.mode,'arrival_port',o.arrival_port,'transit_days_min',o.transit_days_min,'transit_days_max',o.transit_days_max,'total_minor',o.total_minor,'currency','USD','is_recommended',o.is_recommended) order by o.total_minor) from public.go_quote_options o where o.quote_request_id=q.id),'[]'::jsonb)
  ) order by q.requested_at desc),'[]'::jsonb) into v_quotes
  from public.go_quote_requests q where q.customer_user_id=v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'tracking_number',o.tracking_number,'customer_reference',o.customer_reference,'state',o.state,'service_level',o.service_level,
    'origin',o.origin,'destination',o.destination,'promised_delivery_at',o.promised_delivery_at,'created_at',o.created_at,
    'events',coalesce((select jsonb_agg(jsonb_build_object('state',e.normalized_state,'message',e.customer_message,'event_at',e.event_at,'city',e.city,'country_code',e.country_code) order by e.event_at desc) from public.go_tracking_events e where e.order_id=o.id),'[]'::jsonb)
  ) order by o.created_at desc),'[]'::jsonb) into v_orders
  from public.go_orders o where o.customer_user_id=v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'order_id',d.order_id,'document_type',d.document_type,'status',d.status,'version',d.version,'is_required',d.is_required,'updated_at',d.updated_at) order by d.updated_at desc),'[]'::jsonb) into v_documents
  from public.go_documents d join public.go_orders o on o.id=d.order_id where o.customer_user_id=v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'order_id',i.order_id,'category',i.category,'state',i.state,'subject',i.subject,'summary',i.summary,'created_at',i.created_at,'resolved_at',i.resolved_at) order by i.created_at desc),'[]'::jsonb) into v_inquiries
  from public.go_customer_inquiries i where i.customer_user_id=v_user_id or exists(select 1 from public.go_orders o where o.id=i.order_id and o.customer_user_id=v_user_id);

  return jsonb_build_object(
    'profile',coalesce(v_profile,'{}'::jsonb),
    'summary',jsonb_build_object('active_orders',(select count(*) from public.go_orders where customer_user_id=v_user_id and state not in ('DELIVERED','CANCELLED')),'open_quotes',(select count(*) from public.go_quote_requests where customer_user_id=v_user_id and state not in ('EXPIRED','DECLINED')),'documents_needed',(select count(*) from public.go_documents d join public.go_orders o on o.id=d.order_id where o.customer_user_id=v_user_id and d.is_required and d.status not in ('VERIFIED','WAIVED')),'open_inquiries',(select count(*) from public.go_customer_inquiries where customer_user_id=v_user_id and state not in ('RESOLVED','CLOSED'))),
    'quotes',v_quotes,'orders',v_orders,'documents',v_documents,'inquiries',v_inquiries
  );
end $$;

create or replace function public.go_customer_save_profile(p_profile jsonb, p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user_id uuid := auth.uid(); v_tenant_id uuid; v_row public.go_customer_profiles;
begin
  if v_user_id is null then raise exception 'authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then raise exception 'invalid idempotency key'; end if;
  select id into v_tenant_id from public.go_tenants where slug='gel-oz-logistics';
  insert into public.go_customer_profiles(user_id,tenant_id,full_name,company_name,phone,locale,notification_preferences)
  values(v_user_id,v_tenant_id,left(nullif(trim(p_profile->>'full_name'),''),120),left(nullif(trim(p_profile->>'company_name'),''),160),left(nullif(trim(p_profile->>'phone'),''),40),case when p_profile->>'locale'='en-US' then 'en-US' else 'tr-TR' end,jsonb_build_object('email',coalesce((p_profile#>>'{notifications,email}')::boolean,true),'milestones',coalesce((p_profile#>>'{notifications,milestones}')::boolean,true),'exceptions',coalesce((p_profile#>>'{notifications,exceptions}')::boolean,true)))
  on conflict (user_id) do update set full_name=excluded.full_name,company_name=excluded.company_name,phone=excluded.phone,locale=excluded.locale,notification_preferences=excluded.notification_preferences,updated_at=now()
  returning * into v_row;
  insert into public.go_customer_events(tenant_id,customer_user_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload)
  values(v_tenant_id,v_user_id,'CUSTOMER_PROFILE_UPDATED','CUSTOMER',v_user_id,p_idempotency_key,jsonb_build_object('locale',v_row.locale));
  return jsonb_build_object('full_name',v_row.full_name,'company_name',v_row.company_name,'phone',v_row.phone,'locale',v_row.locale,'notification_preferences',v_row.notification_preferences);
exception when unique_violation then
  select * into v_row from public.go_customer_profiles where user_id=v_user_id;
  return jsonb_build_object('full_name',v_row.full_name,'company_name',v_row.company_name,'phone',v_row.phone,'locale',v_row.locale,'notification_preferences',v_row.notification_preferences,'duplicate',true);
end $$;

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

revoke all on function public.go_claim_customer_records() from public,anon;
revoke all on function public.go_customer_dashboard() from public,anon;
revoke all on function public.go_customer_save_profile(jsonb,text) from public,anon;
revoke all on function public.go_customer_open_inquiry(uuid,text,text,text,text) from public,anon;
grant execute on function public.go_claim_customer_records() to authenticated,service_role;
grant execute on function public.go_customer_dashboard() to authenticated,service_role;
grant execute on function public.go_customer_save_profile(jsonb,text) to authenticated,service_role;
grant execute on function public.go_customer_open_inquiry(uuid,text,text,text,text) to authenticated,service_role;

notify pgrst,'reload schema';
commit;
