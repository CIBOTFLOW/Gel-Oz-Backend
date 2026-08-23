"use client";

import { useState } from "react";
import type { FreightPlan } from "@/modules/operations/contracts";
import { samplePlanningRequest } from "@/modules/operations/sample-data";

export default function PlanningWorkbench({ initialPlan }: { initialPlan: FreightPlan }) {
  const [plan, setPlan] = useState(initialPlan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function calculate() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/operations/plans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(samplePlanningRequest),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "Calculation failed");
      setPlan(result.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Calculation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel workbench" aria-labelledby="planner-title">
      <div className="panelHeader">
        <div>
          <p className="eyebrow">Consolidation planner</p>
          <h2 id="planner-title">Istanbul + Milan → New York</h2>
          <p className="muted">Decision support only · no carrier or warehouse effect</p>
        </div>
        <button onClick={calculate} disabled={busy}>{busy ? "Calculating…" : "Recalculate plan"}</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="planGrid">
        <div className="modeCard">
          <span className="status">{plan.status}</span>
          <strong>{plan.freightMode.replaceAll("_", " ")}</strong>
          <span>{plan.pallets.length} pallets · {plan.totalVolumeCbm} CBM</span>
        </div>
        <div className="priceCard">
          <span>Estimated ocean + handling</span>
          <strong>${plan.estimatedFreight.amount.toLocaleString()}</strong>
          <small>Rate card {plan.estimatedFreight.rateCardVersion}</small>
        </div>
        <div className="utilCard">
          <span>Chargeable volume</span>
          <strong>{plan.chargeableCbm} CBM</strong>
          <small>{plan.totalWeightKg.toLocaleString()} kg gross</small>
        </div>
      </div>
      <div className="reasonStrip">
        <span>Why this plan</span>
        <p>{plan.reasons.join(" ")}</p>
      </div>
      <div className="recommendations">
        {plan.deliveryRecommendations.map((item) => (
          <article key={item.orderId}>
            <div><span>{item.orderId}</span><strong>{item.provider.replaceAll("_", " ")}</strong></div>
            <p>{item.reason}</p>
          </article>
        ))}
      </div>
      <details>
        <summary>Planning assumptions and manual fallback</summary>
        <ul>{plan.assumptions.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
      <p className="planId">Plan receipt {plan.planId} · {plan.effectAuthority}</p>
    </section>
  );
}

