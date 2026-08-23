# Gel Öz Operations Engineering Rules

Gel Öz owns logistics operational truth. Build the smallest verified vertical capability and keep human work executable when integrations or automation are unavailable.

## Non-negotiable invariants

- Every mutable record is tenant-scoped and attributable to an actor.
- Postgres or an explicitly named carrier/commerce source owns truth; UI state and model output do not.
- A rendered success or HTTP 200 is not an operational outcome without authoritative readback.
- Mutations require an idempotency key and create an immutable operation event.
- Shipment, handling-unit, work-order, and shift status changes follow explicit transitions.
- A plan is a versioned proposal until an authorized operator accepts it.
- Sultan may observe, explain, simulate, and recommend. It may not silently create carrier, labor, customs, or financial effects.
- Manual fallback and recovery instructions remain available for every provider-dependent step.
- Quantities retain units; money retains currency and rate-card version.
- Customer, supplier, employee, and customs data are minimized and access-controlled.

## Domain boundary

Gel Öz owns orders, packages, handling units, facilities, receipts, warehouse work, staffing shifts, consolidation plans, shipments, carrier quotes, bookings, exceptions, delivery outcomes, and their event history.

Luzione and future customers integrate through versioned APIs/events. Sultan consumes evidence and returns recommendations/action intents through a governed adapter. Do not copy Luzione tables or place Gel Öz operational records inside Sultan.

## Delivery proof

For each operations capability prove:

```text
operator/API entrypoint
→ tenant + validation boundary
→ canonical domain service
→ durable write and event receipt
→ authoritative readback
→ operator-visible result
→ failure/retry/manual fallback
```

