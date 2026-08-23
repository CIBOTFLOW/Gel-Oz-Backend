# Gel Öz Operations

Gel Öz Operations is the logistics backend and operator surface for consolidating Turkey and Italy orders, planning warehouse handling, comparing LCL/FCL options, and routing US last-mile delivery.

The production-shaped operations slice deliberately separates logistics truth from both Luzione UI and Sultan OS. It includes:

- a deterministic consolidation and freight estimate engine;
- pallet and container utilization estimates;
- Easyship, Shopify Shipping, and RXO routing recommendations;
- authenticated operator accounts and tenant-scoped workspaces;
- transactional order intake with idempotency, tracking number, document gates, package records, and receiving work;
- a live operations dashboard backed by the FEP Supabase project;
- customer-safe tracking history and validated operator status transitions;
- a versioned API route at `POST /api/v1/operations/plans`;
- a deployed Postgres schema with RLS, explicit grants, audit events, facilities, work, consolidation, shipments, handoffs, exceptions, inquiries, documents, and AI recommendations;
- invariant tests for LCL/FCL selection, deterministic plans, and last-mile routing.

## Run locally

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Open `http://localhost:3000/operations`.

## Database setup

The migration sequence in `supabase/` is already applied to FEP and remains source-controlled for replay. Set the public project URL and publishable key shown in `.env.example`; never expose a service-role key to the browser.

## Current evidence level

The operator UI and API use the FEP Supabase database for real order, package, document, work, status-event, and tracking records. The calculator rebuilds its proposal from unallocated database packages. Live Easyship, Shopify, RXO, Vanguard, Matras, customs-broker, and warehouse-device effects remain intentionally disconnected until credentials, contracts, sandbox replay, webhook verification, authorization, and provider readback are complete. Each unsupported effect keeps a manual operator path.

## Integration rule

- Luzione sends versioned fulfillment requests and receives status events.
- Gel Öz owns execution, warehouse, shipment, and delivery truth.
- Sultan reads evidence and returns recommendations or governed action intents.
- Provider adapters translate Gel Öz commands to external APIs and always persist request/response receipts plus manual fallback instructions.

See `docs/ARCHITECTURE.md` and `docs/OPERATIONS_CONTRACT.md`.
