import assert from "node:assert/strict";
import test from "node:test";
import type { PlanningRequest } from "../contracts";
import { createFreightPlan } from "../planning";
import { samplePlanningRequest } from "../sample-data";

const smallRequest = (): PlanningRequest => ({
  ...structuredClone(samplePlanningRequest),
  idempotencyKey: "small",
  orders: [structuredClone(samplePlanningRequest.orders[2])],
});

test("creates the same plan for equivalent input", () => {
  const first = createFreightPlan(samplePlanningRequest);
  const second = createFreightPlan(structuredClone(samplePlanningRequest));
  assert.deepEqual(second, first);
  assert.equal(first.effectAuthority, "NO_EFFECT");
});

test("selects LCL for a small consolidation", () => {
  const plan = createFreightPlan(smallRequest());
  assert.equal(plan.freightMode, "LCL");
  assert.equal(plan.deliveryRecommendations[0].provider, "SHOPIFY_SHIPPING");
});

test("selects FCL when the limiting capacity exceeds 70 percent", () => {
  const request = smallRequest();
  request.idempotencyKey = "fcl";
  request.orders[0].packages[0] = {
    ...request.orders[0].packages[0],
    lengthCm: 200,
    widthCm: 100,
    heightCm: 100,
    weightKg: 500,
    quantity: 10,
  };
  const plan = createFreightPlan(request);
  assert.equal(plan.freightMode, "FCL_20");
  assert.equal(plan.containers[0].estimatedContainers, 1);
});

test("routes white-glove delivery to RXO", () => {
  const plan = createFreightPlan(samplePlanningRequest);
  assert.equal(plan.deliveryRecommendations.find((item) => item.orderId === "GO-1048")?.provider, "RXO_CONNECT");
});

test("rejects duplicate package IDs", () => {
  const request = smallRequest();
  request.orders.push({
    ...structuredClone(request.orders[0]),
    orderId: "duplicate-order",
  });
  assert.throws(() => createFreightPlan(request), /Duplicate packageId/);
});

