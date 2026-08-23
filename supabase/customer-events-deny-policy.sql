drop policy if exists go_customer_events_no_direct_access on public.go_customer_events;
create policy go_customer_events_no_direct_access on public.go_customer_events for all to authenticated using (false) with check (false);
