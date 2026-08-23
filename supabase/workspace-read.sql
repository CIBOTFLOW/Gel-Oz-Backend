create function public.go_my_workspaces() returns jsonb
language sql stable security invoker set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('tenant_id',t.id,'name',t.name,'slug',t.slug,'role',m.role) order by t.created_at), '[]'::jsonb)
  from public.go_memberships m
  join public.go_tenants t on t.id=m.tenant_id
  where m.user_id=(select auth.uid());
$$;
revoke all on function public.go_my_workspaces() from public,anon;
grant execute on function public.go_my_workspaces() to authenticated,service_role;
notify pgrst, 'reload schema';
