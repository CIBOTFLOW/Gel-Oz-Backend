# Phase 1 operations contract

## Outcome

An operator can see receiving and warehouse pressure, submit a set of packages, receive a deterministic consolidation proposal, understand why LCL or FCL was selected, and see a suggested US delivery channel without creating a live booking.

## Actors and end states

- Operations planner: reviews a proposed plan and its assumptions.
- Warehouse lead: sees inbound work, repack work, shift coverage, and blockers.
- Delivery coordinator: sees last-mile channel and manual fallback.
- API client: receives a versioned, idempotent proposal response.

## Truth and authority

- Phase 1 calculation: deterministic domain service; response is `PROPOSED` and has no external effect.
- Production persistence target: Postgres schema in `db/migrations/001_operations_core.sql`.
- Carrier price/availability truth: timestamped provider quote receipt.
- Booking truth: provider acknowledgement plus readback, not the outbound request alone.
- Sultan output: recommendation only until a human or policy grants action authority.

## Explicit non-scope

- live bookings, labels, payments, customs filings, employee scheduling changes, payroll, or customer messages;
- claims that the heuristic is a certified load plan or carrier quote;
- hazardous materials, reefer, vehicle, oversized, or regulated cargo optimization.

## Acceptance proof

- identical normalized input produces the same plan ID and result;
- small compatible cargo selects LCL;
- cargo near a container threshold selects the smallest feasible FCL;
- parcel-eligible Shopify orders prefer Shopify Shipping;
- bulky or white-glove delivery routes to RXO;
- API rejects malformed bodies and identifies calculation assumptions;
- production build and TypeScript checks pass.

