# Public RPC BFF hardening

## Why

Gel Oz intentionally exposes a public quote form and public tracking lookup. The product-facing browser should call Gel Oz application routes, not privileged Supabase RPCs directly.

The quote API calculates and normalizes the estimate server-side. If `go_submit_quote_request` remains directly executable by `anon`, a caller can bypass that server-side calculation and provide an arbitrary `p_estimate` to the database function. Public tracking has less economic risk, but keeping its privileged RPC behind the BFF gives one place for input limits, abuse controls, caching and audit correlation.

## Required activation order

Do not apply `supabase/public-rpc-bff-hardening.sql` until all of these steps pass in order:

1. Configure the server-only `FEP_SUPABASE_SECRET_KEY` in the Gel Oz preview and production runtimes. Never expose it through a `NEXT_PUBLIC_` variable.
2. Deploy the application version in which public quote intake and public tracking use `fepServiceRequest` on the server.
3. Smoke-test one quote request and one known tracking lookup through the public Gel Oz HTTP routes.
4. Confirm no browser code or third-party integration calls `go_submit_quote_request` or `go_public_tracking` directly.
5. Apply `supabase/public-rpc-bff-hardening.sql` to the FEP Supabase project.
6. Repeat the public HTTP smoke tests.
7. Confirm direct `anon` and `authenticated` execution of both RPCs is denied while `service_role` remains allowed.
8. Re-run Supabase security advisors and record the remaining findings.

## Rollback

If the application BFF fails after the migration, prefer fixing or rolling back the application. If direct RPC access must be temporarily restored to recover the public product, use the narrowest grant required and record the incident.

Emergency rollback to the previous grants:

```sql
grant execute on function public.go_submit_quote_request(jsonb, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.go_public_tracking(text) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
```

Remove those broad grants again after the application path is healthy.

## What this does not change

- It does not make a quote an order, payment, booking or carrier tender.
- It does not enable automated provider effects.
- It does not change FEP ledger or Rewards authority.
- It does not resolve leaked-password protection or privileged-user MFA; those remain separate Supabase security gates.
- It does not require exposing the Supabase service credential to the browser.
