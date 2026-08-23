insert into public.go_status_transitions(from_state,to_state,customer_message)
select 'EXCEPTION', target, 'The exception was resolved and your order returned to the logistics pipeline.'
from unnest(array[
  'AWAITING_SUPPLIER','INBOUND_TO_ORIGIN_HUB','RECEIVED_ORIGIN_HUB','QUALITY_CONTROL',
  'REPACKAGING','CONSOLIDATION_PLANNING','PALLETIZED','BOOKED','EXPORT_CUSTOMS',
  'ORIGIN_DEPARTED','IN_TRANSIT','IMPORT_CUSTOMS','DESTINATION_HUB','OUT_FOR_DELIVERY'
]) as target
on conflict (from_state,to_state) do update set customer_message=excluded.customer_message;

notify pgrst, 'reload schema';
