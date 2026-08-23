# Gel Öz architecture

## Recommended sequence

Build Operations now. Add Growth, Sales, Marketing, and Finance only after their shared identity, tenant, event, authorization, and audit contracts are stable in Luzione UI/Sultan OS. Operations does not need to wait because it can be isolated behind logistics-owned objects and APIs.

```text
Luzione / customer channels
        |
        | fulfillment request + product/package facts
        v
Gel Öz operations API ----> Postgres operational truth
        |                         |
        |                         +--> immutable operation events
        |
        +--> freight forwarder / customs broker
        +--> Easyship / Shopify Shipping / RXO
        +--> warehouse operator work queues
        |
        +--> evidence projection --> Sultan recommendation adapter
```

## Bounded reuse from Luzione UI

Reuse contracts and presentation patterns, not tables or business-specific mutations:

- tenant/actor identity envelope;
- idempotency, audit receipt, readback, and failure patterns;
- role/capability checks;
- human-centered operator shell and progressive disclosure;
- provider adapter conventions and observability correlation IDs.

Do not reuse Luzione CRM, proposal, product-margin, designer, or marketing objects as logistics objects. Map them at the boundary.

## Backend modules

1. Intake: customer order and package facts, incoterms, origin, destination, service requirements.
2. Receiving: ASN, dock appointment, inspection, discrepancy, quarantine, and put-away.
3. Warehouse: locations, inventory custody, repack/kitting, work orders, shifts, safety and productivity signals.
4. Consolidation: compatibility constraints, palletization, LCL/FCL comparison, container placement, cutoffs, and plan approval.
5. Shipment: legs, bookings, customs documents, milestones, exceptions, and costs.
6. Delivery: parcel/LTL/white-glove routing, provider labels/bookings, appointments, proof of delivery, and claims.
7. Intelligence: operational signals and Sultan recommendations kept separate from evidence and authority.

## Manual-first integration pattern

Every external effect moves through `DRAFT → VALIDATED → AUTHORIZED → SENT → ACKNOWLEDGED → VERIFIED`, with `FAILED` and `CANCELLED` terminal paths where applicable. Until an adapter is live, an operator can export the same normalized booking packet, transmit it manually, record the provider reference, and verify readback.

This prevents automation from erasing the manual operation and lets Gel Öz productionize provider-by-provider.

## Later business modules

Growth, Sales, Marketing, and Finance should subscribe to logistics events instead of writing operations tables. Examples:

- Sales reads lane capacity, quote confidence, and delivery performance.
- Growth reads receiving volume, repeat shipper activity, fill-rate opportunity, and service-region demand.
- Marketing reads only consented customer/segment projections.
- Finance reads rated costs, approvals, invoices, accruals, and variances; it never reconstructs shipment truth from invoices.

