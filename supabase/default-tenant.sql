insert into public.go_tenants (name, slug)
values ('Gel Oz Logistics', 'gel-oz-logistics')
on conflict (slug) do update
set name = excluded.name,
    updated_at = now();

notify pgrst, 'reload schema';
