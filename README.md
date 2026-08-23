# Gel Öz Logistics Platform

Gel Öz is a two-sided logistics platform for EXW shipments from Türkiye and Italy to the United States. `/` is the Turkish public site, quote calculator, and tracking entrypoint; `/musteri` is the authenticated customer account; `/operations` is the authenticated staff control tower.

The production-shaped operations slice deliberately separates logistics truth from both Luzione UI and Sultan OS. It includes:

- a deterministic consolidation and freight estimate engine;
- a public quote calculator that compares five U.S. arrival ports, ocean LCL/FCL, and air alternatives;
- a transparent tiered coordination margin (18% small-load to 9% FCL/high-volume, with a minimum fee);
- a persisted quote inbox, route options, supplier-rate requests, firm-offer versions, and quote-event history;
- customer accounts that securely claim matching quotes/orders by verified email, then expose only customer-safe quotes, milestones, document states, preferences, and support inquiries;
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

Open `http://localhost:3000` for the public site, `http://localhost:3000/musteri` for customers, or `http://localhost:3000/operations` for staff.

## Database setup

The migration sequence in `supabase/` is already applied to FEP and remains source-controlled for replay. Set the public project URL and publishable key shown in `.env.example`; never expose a service-role key to the browser.

## Current evidence level

The customer portal saves real quote requests and calculator snapshots in FEP Supabase; the operator UI uses the same database for quote, order, package, document, work, status-event, and tracking records. The calculator is an internal standard rate card, not a live carrier tariff. Live Easyship, Shopify, RXO, Vanguard, Matraş, Flexport, customs-broker, and warehouse-device effects remain intentionally disconnected until credentials, contracts, sandbox replay, webhook verification, authorization, and provider readback are complete. Each unsupported effect keeps a manual operator path.

## Integration rule

- Luzione sends versioned fulfillment requests and receives status events.
- Gel Öz owns execution, warehouse, shipment, and delivery truth.
- Sultan reads evidence and returns recommendations or governed action intents.
- Provider adapters translate Gel Öz commands to external APIs and always persist request/response receipts plus manual fallback instructions.

See `docs/ARCHITECTURE.md` and `docs/OPERATIONS_CONTRACT.md`.
