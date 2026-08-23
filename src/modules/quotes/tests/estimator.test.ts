import assert from "node:assert/strict";
import test from "node:test";
import { estimateQuote } from "../estimator";

const base = {
  originCountry: "TR" as const,
  originCity: "Istanbul",
  destinationCity: "New York",
  destinationState: "NY",
  destinationPostalCode: "10001",
  pieces: 2,
  lengthCm: 80,
  widthCm: 60,
  heightCm: 50,
  totalWeightKg: 120,
  cargoValueUsd: 5000,
  mode: "AUTO" as const,
  residential: true,
  fragile: false,
  stackable: true,
};

test("compares U.S. ports and includes an air alternative", () => {
  const estimate = estimateQuote(base, new Date("2026-08-23T00:00:00Z"));
  assert.equal(estimate.options.length, 6);
  assert.ok(estimate.options.some(option => option.mode === "AIR"));
  assert.equal(estimate.options.filter(option => option.recommended).length, 1);
});

test("uses weight or measure for LCL chargeable volume", () => {
  const estimate = estimateQuote({ ...base, totalWeightKg: 2_000, mode: "OCEAN_LCL" });
  assert.equal(estimate.oceanChargeableCbm, 2);
});

test("selects FCL for a container-sized load and lowers the margin tier", () => {
  const estimate = estimateQuote({ ...base, pieces: 60, lengthCm: 100, widthCm: 60, heightCm: 50, totalWeightKg: 8_000 });
  assert.equal(estimate.suggestedMode, "OCEAN_FCL_20");
  assert.ok(estimate.options.every(option => option.marginRate === 0.09));
});

test("rejects invalid cargo dimensions", () => {
  assert.throws(() => estimateQuote({ ...base, lengthCm: 0 }), /Length/);
});
