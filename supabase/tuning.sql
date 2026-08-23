create index go_orders_created_by_idx on public.go_orders(created_by) where created_by is not null;
create index go_order_items_order_fk_idx on public.go_order_items(order_id);
create index go_packages_order_fk_idx on public.go_packages(order_id);
create index go_packages_item_fk_idx on public.go_packages(order_item_id) where order_item_id is not null;
create index go_handling_units_facility_fk_idx on public.go_handling_units(facility_id) where facility_id is not null;
create index go_handling_unit_packages_tenant_idx on public.go_handling_unit_packages(tenant_id);
create index go_handling_unit_packages_package_idx on public.go_handling_unit_packages(package_id);
create index go_plans_tenant_idx on public.go_consolidation_plans(tenant_id, created_at desc);
create index go_plans_accepted_by_idx on public.go_consolidation_plans(accepted_by) where accepted_by is not null;
create index go_plans_created_by_idx on public.go_consolidation_plans(created_by) where created_by is not null;
create index go_plan_units_tenant_idx on public.go_plan_handling_units(tenant_id);
create index go_plan_units_unit_idx on public.go_plan_handling_units(handling_unit_id);
create index go_shipments_plan_idx on public.go_shipments(plan_id) where plan_id is not null;
create index go_shipment_orders_tenant_idx on public.go_shipment_orders(tenant_id);
create index go_shipment_orders_order_idx on public.go_shipment_orders(order_id);
create index go_tracking_events_shipment_idx on public.go_tracking_events(shipment_id,event_at desc) where shipment_id is not null;
create index go_documents_order_idx on public.go_documents(order_id,document_type) where order_id is not null;
create index go_documents_shipment_idx on public.go_documents(shipment_id,document_type) where shipment_id is not null;
create index go_documents_verified_by_idx on public.go_documents(verified_by) where verified_by is not null;
create index go_handoffs_order_idx on public.go_provider_handoffs(order_id,created_at desc) where order_id is not null;
create index go_handoffs_shipment_idx on public.go_provider_handoffs(shipment_id,created_at desc) where shipment_id is not null;
create index go_work_orders_order_idx on public.go_work_orders(order_id,state) where order_id is not null;
create index go_work_orders_package_idx on public.go_work_orders(package_id) where package_id is not null;
create index go_work_orders_assigned_idx on public.go_work_orders(assigned_to,state) where assigned_to is not null;
create index go_inquiries_tenant_idx on public.go_customer_inquiries(tenant_id,state,created_at desc);
create index go_inquiries_order_idx on public.go_customer_inquiries(order_id,created_at desc) where order_id is not null;
create index go_inquiries_assigned_idx on public.go_customer_inquiries(assigned_to,state) where assigned_to is not null;
create index go_exceptions_order_idx on public.go_exceptions(order_id,created_at desc) where order_id is not null;
create index go_exceptions_shipment_idx on public.go_exceptions(shipment_id,created_at desc) where shipment_id is not null;
create index go_exceptions_owner_idx on public.go_exceptions(owner_id,state) where owner_id is not null;
create index go_ai_order_fk_idx on public.go_ai_recommendations(order_id,created_at desc) where order_id is not null;
create index go_ai_decided_by_idx on public.go_ai_recommendations(decided_by) where decided_by is not null;
create index go_operation_events_actor_idx on public.go_operation_events(actor_id,occurred_at desc) where actor_id is not null;

drop policy if exists go_memberships_manage on public.go_memberships;
create policy go_memberships_insert on public.go_memberships for insert to authenticated
  with check (public.go_is_member(tenant_id,array['OWNER','ADMIN']));
create policy go_memberships_update on public.go_memberships for update to authenticated
  using (public.go_is_member(tenant_id,array['OWNER','ADMIN']))
  with check (public.go_is_member(tenant_id,array['OWNER','ADMIN']));
create policy go_memberships_delete on public.go_memberships for delete to authenticated
  using (public.go_is_member(tenant_id,array['OWNER','ADMIN']));
