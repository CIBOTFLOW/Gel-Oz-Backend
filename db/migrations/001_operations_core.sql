BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  country_code char(2) NOT NULL,
  time_zone text NOT NULL,
  facility_type text NOT NULL CHECK (facility_type IN ('WAREHOUSE','CROSS_DOCK','CONSOLIDATION_CENTER')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE customer_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  external_order_id text NOT NULL,
  source_system text NOT NULL CHECK (source_system IN ('SHOPIFY','API','MANUAL')),
  source_version text,
  customer_reference text,
  destination jsonb NOT NULL,
  requested_service text NOT NULL CHECK (requested_service IN ('PARCEL','THRESHOLD','ROOM_OF_CHOICE','WHITE_GLOVE')),
  status text NOT NULL CHECK (status IN ('DRAFT','CONFIRMED','RECEIVING','READY_TO_CONSOLIDATE','SHIPPED','DELIVERED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_system, external_order_id)
);

CREATE TABLE packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid NOT NULL REFERENCES customer_orders(id),
  external_package_id text NOT NULL,
  origin_country char(2) NOT NULL CHECK (origin_country IN ('TR','IT')),
  length_cm numeric(12,3) NOT NULL CHECK (length_cm > 0),
  width_cm numeric(12,3) NOT NULL CHECK (width_cm > 0),
  height_cm numeric(12,3) NOT NULL CHECK (height_cm > 0),
  weight_kg numeric(12,3) NOT NULL CHECK (weight_kg > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  stackable boolean NOT NULL DEFAULT false,
  fragile boolean NOT NULL DEFAULT false,
  custody_status text NOT NULL DEFAULT 'EXPECTED' CHECK (custody_status IN ('EXPECTED','RECEIVED','QUARANTINED','STORED','ALLOCATED','SHIPPED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_package_id)
);

CREATE TABLE handling_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  handling_unit_code text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('CARTON','CRATE','PALLET')),
  parent_handling_unit_id uuid REFERENCES handling_units(id),
  status text NOT NULL CHECK (status IN ('PLANNED','BUILDING','SEALED','LOADED','SHIPPED','BROKEN_DOWN')),
  measured_volume_cbm numeric(12,3),
  measured_weight_kg numeric(12,3),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, handling_unit_code)
);

CREATE TABLE handling_unit_packages (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  handling_unit_id uuid NOT NULL REFERENCES handling_units(id),
  package_id uuid NOT NULL REFERENCES packages(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (tenant_id, handling_unit_id, package_id)
);

CREATE TABLE consolidation_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  plan_key text NOT NULL,
  schema_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('PROPOSED','APPROVED','SUPERSEDED','CANCELLED')),
  effect_authority text NOT NULL CHECK (effect_authority IN ('NO_EFFECT','SANDBOX_ONLY','LIVE_EFFECT_AUTHORIZED')),
  destination_port text NOT NULL,
  freight_mode text NOT NULL CHECK (freight_mode IN ('LCL','FCL_20','FCL_40','FCL_40_HC')),
  rate_card_version text NOT NULL,
  currency char(3) NOT NULL,
  estimated_amount numeric(14,2) NOT NULL,
  input_snapshot jsonb NOT NULL,
  output_snapshot jsonb NOT NULL,
  created_by text NOT NULL,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plan_key)
);

CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  shipment_number text NOT NULL,
  consolidation_plan_id uuid REFERENCES consolidation_plans(id),
  status text NOT NULL CHECK (status IN ('DRAFT','VALIDATED','AUTHORIZED','BOOKED','IN_TRANSIT','CUSTOMS_HOLD','ARRIVED','DELIVERED','CANCELLED')),
  mode text NOT NULL CHECK (mode IN ('OCEAN_LCL','OCEAN_FCL','PARCEL','LTL','WHITE_GLOVE')),
  origin jsonb NOT NULL,
  destination jsonb NOT NULL,
  planned_departure timestamptz,
  planned_arrival timestamptz,
  actual_departure timestamptz,
  actual_arrival timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, shipment_number)
);

CREATE TABLE shipment_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  shipment_id uuid NOT NULL REFERENCES shipments(id),
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  mode text NOT NULL,
  provider_code text,
  provider_reference text,
  origin jsonb NOT NULL,
  destination jsonb NOT NULL,
  status text NOT NULL,
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  UNIQUE (tenant_id, shipment_id, sequence_number)
);

CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  work_order_number text NOT NULL,
  work_type text NOT NULL CHECK (work_type IN ('RECEIVE','INSPECT','PHOTO','REPACK','LABEL','PUT_AWAY','PICK','PALLETIZE','LOAD')),
  status text NOT NULL CHECK (status IN ('OPEN','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')),
  priority text NOT NULL CHECK (priority IN ('LOW','STANDARD','URGENT')),
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  assigned_shift_id uuid,
  assigned_actor_id text,
  due_at timestamptz,
  instructions jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, work_order_number)
);

CREATE TABLE shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  facility_id uuid NOT NULL REFERENCES facilities(id),
  shift_code text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  required_headcount integer NOT NULL CHECK (required_headcount >= 0),
  confirmed_headcount integer NOT NULL DEFAULT 0 CHECK (confirmed_headcount >= 0),
  status text NOT NULL CHECK (status IN ('DRAFT','PUBLISHED','ACTIVE','CLOSED','CANCELLED')),
  CHECK (ends_at > starts_at),
  UNIQUE (tenant_id, facility_id, shift_code, starts_at)
);

ALTER TABLE work_orders
  ADD CONSTRAINT work_orders_assigned_shift_fk
  FOREIGN KEY (assigned_shift_id) REFERENCES shifts(id);

CREATE TABLE provider_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider text NOT NULL CHECK (provider IN ('EASYSHIP','SHOPIFY_SHIPPING','RXO_CONNECT','FREIGHT_FORWARDER','CUSTOMS_BROKER')),
  effect_type text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT','VALIDATED','AUTHORIZED','SENT','ACKNOWLEDGED','VERIFIED','FAILED','CANCELLED')),
  request_payload jsonb NOT NULL,
  response_receipt jsonb,
  provider_reference text,
  correlation_id text NOT NULL,
  manual_fallback text NOT NULL,
  requested_by text NOT NULL,
  authorized_by text,
  sent_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, idempotency_key)
);

CREATE TABLE operation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  aggregate_version integer NOT NULL CHECK (aggregate_version > 0),
  actor_id text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('HUMAN','SYSTEM','INTEGRATION','SULTAN')),
  correlation_id text NOT NULL,
  causation_id uuid,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, aggregate_type, aggregate_id, aggregate_version),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX customer_orders_status_idx ON customer_orders (tenant_id, status, updated_at DESC);
CREATE INDEX packages_custody_idx ON packages (tenant_id, custody_status, origin_country);
CREATE INDEX work_orders_queue_idx ON work_orders (tenant_id, facility_id, status, priority, due_at);
CREATE INDEX shipments_status_idx ON shipments (tenant_id, status, planned_departure);
CREATE INDEX operation_events_aggregate_idx ON operation_events (tenant_id, aggregate_type, aggregate_id, occurred_at);

COMMIT;
