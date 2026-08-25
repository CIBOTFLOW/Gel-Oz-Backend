-- Gel Oz public RPC BFF hardening
--
-- APPLY ONLY AFTER FEP_SUPABASE_SECRET_KEY IS CONFIGURED IN THE GEL OZ SERVER
-- RUNTIME AND THE SERVER-SIDE QUOTE + TRACKING ROUTES HAVE BEEN DEPLOYED AND
-- SMOKE-TESTED. This migration intentionally removes direct browser access to
-- two RPCs that are now meant to sit behind the Gel Oz BFF.
--
-- Rollback grants are documented in docs/PUBLIC_RPC_BFF_HARDENING.md.

begin;

-- These authenticated/public helpers do not need an ambient public search path.
-- Fully qualified references inside their definitions continue to resolve.
alter function public.go_bootstrap_workspace(text, text) set search_path = '';
alter function public.go_public_tracking(text) set search_path = '';

-- Public quote intake is now normalized and priced by the Gel Oz server route.
-- Prevent direct callers from supplying their own p_estimate to the privileged
-- function and bypassing that deterministic server-side calculation.
revoke all on function public.go_submit_quote_request(jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.go_submit_quote_request(jsonb, jsonb, text) to service_role;

-- Public tracking remains a public product feature, but callers reach it through
-- the rate-limitable/cacheable Gel Oz server route rather than the privileged RPC.
revoke all on function public.go_public_tracking(text) from public, anon, authenticated;
grant execute on function public.go_public_tracking(text) to service_role;

notify pgrst, 'reload schema';

commit;
