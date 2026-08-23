# Gel Öz Operations

Gel Öz Operations is the logistics backend and operator surface for consolidating Turkey and Italy orders, planning warehouse handling, comparing LCL/FCL options, and routing US last-mile delivery.

This first slice deliberately separates logistics truth from both Luzione UI and Sultan OS. It includes:

- a deterministic consolidation and freight estimate engine;
- pallet and container utilization estimates;
- Easyship, Shopify Shipping, and RXO routing recommendations;
- an operations dashboard for receiving, warehouse work, shifts, and shipments;
- a versioned API route at `POST /api/v1/operations/plans`;
- a Postgres-first schema for durable production work;
- invariant tests for LCL/FCL selection, deterministic plans, and last-mile routing.

## Run locally

```bash
npm install
npm test
npm run typecheck
npm run dev
```

Open `http://localhost:3000/operations`.

## Current evidence level

The calculator and UI are locally executable. The dashboard uses representative seed data and the API returns deterministic proposed plans. The SQL migration defines the future authoritative store, but no production database or live Easyship, Shopify, RXO, freight-forwarder, customs, or warehouse effect is connected yet.

## Integration rule

- Luzione sends versioned fulfillment requests and receives status events.
- Gel Öz owns execution, warehouse, shipment, and delivery truth.
- Sultan reads evidence and returns recommendations or governed action intents.
- Provider adapters translate Gel Öz commands to external APIs and always persist request/response receipts plus manual fallback instructions.

See `docs/ARCHITECTURE.md` and `docs/OPERATIONS_CONTRACT.md`.

