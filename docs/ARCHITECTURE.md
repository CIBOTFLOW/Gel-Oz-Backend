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

1. Quote: customer cargo facts, EXW lane estimates, supplier-rate requests, transparent Gel Öz fee, firm versions, and win/loss/variance evidence.
2. Intake: accepted quote/customer order and package facts, incoterms, origin, destination, service requirements.
3. Receiving: ASN, dock appointment, inspection, discrepancy, quarantine, and put-away.
4. Warehouse: locations, inventory custody, repack/kitting, work orders, shifts, safety and productivity signals.
5. Consolidation: compatibility constraints, palletization, LCL/FCL comparison, container placement, cutoffs, and plan approval.
6. Shipment: legs, bookings, customs documents, milestones, exceptions, and costs.
7. Delivery: parcel/LTL/white-glove routing, provider labels/bookings, appointments, proof of delivery, and claims.
8. Intelligence: forecast-versus-actual quote and fulfillment evidence plus Sultan recommendations, kept separate from authority.

## Provider boundary

- Easyship: live parcel/final-mile rate, shipment, label, and tracking adapter after API activation.
- RXO: U.S. LTL/FTL/white-glove pricing and booking after partner API/EDI onboarding; portal/manual remains the fallback.
- Flexport: booking, shipment, customs-entry, commercial-invoice, and document connectivity. Quote pricing remains a portal/account workflow, so Gel Öz stores it as a supplier quote rather than fabricating an API response.
- Vanguard/Matraş/other forwarders: normalized manual/email/portal supplier quotes until a contracted interface is available.
- Licensed customs broker: importer-of-record, POA, bond, entry, classification, duty, exam, and release evidence. The calculator only includes a broker allowance; it never represents duty as final without HS-code and importer review.

## Manual-first integration pattern

Every external effect moves through `DRAFT → VALIDATED → AUTHORIZED → SENT → ACKNOWLEDGED → VERIFIED`, with `FAILED` and `CANCELLED` terminal paths where applicable. Until an adapter is live, an operator can export the same normalized booking packet, transmit it manually, record the provider reference, and verify readback.

This prevents automation from erasing the manual operation and lets Gel Öz productionize provider-by-provider.

## Later business modules

Growth, Sales, Marketing, and Finance should subscribe to logistics events instead of writing operations tables. Examples:

- Sales reads lane capacity, quote confidence, and delivery performance.
- Growth reads receiving volume, repeat shipper activity, fill-rate opportunity, and service-region demand.
- Marketing reads only consented customer/segment projections.
- Finance reads rated costs, approvals, invoices, accruals, and variances; it never reconstructs shipment truth from invoices.
