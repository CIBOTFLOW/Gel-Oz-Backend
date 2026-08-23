"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type ProviderRate = {
  id: string;
  provider_code: string;
  segment: string;
  integration_method: string;
  state: string;
  external_reference: string | null;
  quoted_amount_minor: number | null;
  currency: string | null;
  valid_until: string | null;
  received_at: string | null;
};

export type FirmOffer = {
  id: string;
  version: number;
  state: string;
  currency: string;
  supplier_cost_minor: number;
  gel_oz_fee_minor: number;
  total_minor: number;
  valid_until: string;
};

export type QuoteInboxItem = {
  id: string;
  quote_number: string;
  state: string;
  company_name: string | null;
  contact_name: string;
  contact_email: string;
  cargo_description: string;
  origin_country: string;
  origin_city: string;
  destination_city: string;
  destination_state: string;
  mode_preference: string;
  pieces: number;
  total_weight_kg: number;
  cubic_meters: number;
  requested_at: string;
  options: Array<{ id: string; mode: string; arrival_port: string; total_minor: number; gel_oz_fee_minor: number; is_recommended: boolean }>;
  provider_requests: ProviderRate[];
  offers: FirmOffer[];
};

const providers = ["ORIGIN_FORWARDER", "VANGUARD", "FLEXPORT", "CUSTOMS_BROKER", "RXO_CONNECT", "EASYSHIP", "MATRAŞ", "OTHER"];
const segments = ["ORIGIN_PICKUP", "EXPORT", "OCEAN", "AIR", "IMPORT_CUSTOMS", "DESTINATION_HANDLING", "LAST_MILE", "INSURANCE"];
const requiredSegments = ["ORIGIN_PICKUP", "EXPORT", "IMPORT_CUSTOMS", "DESTINATION_HANDLING", "LAST_MILE"];
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
}

export default function QuoteExecutionPanel({ quote, onChanged, onError }: { quote: QuoteInboxItem; onChanged: () => Promise<void>; onError: (message: string) => void }) {
  const received = useMemo(() => quote.provider_requests.filter(rate => rate.state === "RECEIVED" && rate.currency === "USD" && rate.quoted_amount_minor && (!rate.valid_until || new Date(rate.valid_until) > new Date())), [quote.provider_requests]);
  const [selected, setSelected] = useState<string[]>(received.map(rate => rate.id));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => { setSelected(received.map(rate => rate.id)); }, [received]);

  const selectedRates = received.filter(rate => selected.includes(rate.id));
  const supplierCost = selectedRates.reduce((sum, rate) => sum + Number(rate.quoted_amount_minor ?? 0), 0);
  const margin = quote.cubic_meters < 2 ? .18 : quote.cubic_meters < 8 ? .15 : quote.cubic_meters < 20 ? .12 : .09;
  const minimumFee = quote.cubic_meters < 2 ? 37500 : quote.cubic_meters < 8 ? 45000 : quote.cubic_meters < 20 ? 65000 : 90000;
  const fee = Math.max(Math.round(supplierCost * margin), minimumFee);
  const chosenSegments = new Set(selectedRates.map(rate => rate.segment));
  const missing = requiredSegments.filter(segment => !chosenSegments.has(segment));
  if (!chosenSegments.has("OCEAN") && !chosenSegments.has("AIR")) missing.push("OCEAN_OR_AIR");
  const latestOffer = quote.offers?.[0];

  async function addRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); onError("");
    const form = new FormData(event.currentTarget);
    try {
      await jsonFetch(`/api/v1/quotes/${quote.id}/provider-rates`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ provider_code: form.get("provider_code"), segment: form.get("segment"), integration_method: form.get("integration_method"), quoted_amount_minor: Math.round(Number(form.get("amount")) * 100), currency: "USD", external_reference: form.get("external_reference"), valid_until: form.get("valid_until"), notes: form.get("notes") }),
      });
      event.currentTarget.reset(); setNotice("Verified provider cost recorded in FEP."); await onChanged();
    } catch (error) { onError(error instanceof Error ? error.message : "Provider rate could not be recorded"); }
    finally { setBusy(false); }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); onError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await jsonFetch<{ data: FirmOffer }>(`/api/v1/quotes/${quote.id}/offers`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ rate_ids: selected, terms: { valid_days: Number(form.get("valid_days")), deposit_percent: Number(form.get("deposit_percent")), notes: form.get("notes") } }),
      });
      setNotice(`Firm offer v${result.data.version} published to the customer portal.`); await onChanged();
    } catch (error) { onError(error instanceof Error ? error.message : "Firm offer could not be published"); }
    finally { setBusy(false); }
  }

  const defaultValid = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  return <section className="quoteWorkbench">
    <div className="quoteWorkbenchHead"><div><p className="eyebrow">Commercial execution</p><h3>{quote.quote_number} pricing workbench</h3><p>Record source-backed costs in USD, choose the complete EXW chain, then publish one versioned Gel Öz offer.</p></div>{latestOffer ? <div className="offerBadge"><span>Latest offer · v{latestOffer.version}</span><strong>{usd.format(latestOffer.total_minor / 100)}</strong><small>{latestOffer.state} · valid to {new Date(latestOffer.valid_until).toLocaleDateString()}</small></div> : null}</div>
    {notice ? <p className="workbenchNotice">{notice}</p> : null}
    <div className="quoteWorkbenchGrid">
      <section><h4>1. Provider cost ledger</h4><form className="rateForm" onSubmit={addRate}>
        <label>Provider<select name="provider_code" defaultValue="ORIGIN_FORWARDER">{providers.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Segment<select name="segment" defaultValue="ORIGIN_PICKUP">{segments.map(value => <option key={value}>{value}</option>)}</select></label>
        <label>Method<select name="integration_method" defaultValue="MANUAL"><option>MANUAL</option><option>EMAIL</option><option>PORTAL</option><option>API</option><option>EDI</option></select></label>
        <label>Cost USD<input required min="1" step="0.01" name="amount" type="number" /></label>
        <label>Provider reference<input required name="external_reference" placeholder="Rate / email / booking ref" /></label>
        <label>Valid until<input required name="valid_until" type="date" defaultValue={defaultValid} /></label>
        <label className="wide">Internal note<input name="notes" placeholder="Scope, exclusions, contact, surcharge basis" /></label>
        <button disabled={busy}>{busy ? "Recording…" : "Record verified cost"}</button>
      </form></section>
      <section><h4>2. Complete EXW cost chain</h4><div className="rateLedger">{received.map(rate => <label key={rate.id} className="rateLine"><input type="checkbox" checked={selected.includes(rate.id)} onChange={() => setSelected(current => current.includes(rate.id) ? current.filter(id => id !== rate.id) : [...current, rate.id])} /><span><b>{rate.segment.replaceAll("_", " ")}</b><small>{rate.provider_code} · {rate.external_reference || "No reference"}</small></span><strong>{usd.format(Number(rate.quoted_amount_minor) / 100)}</strong></label>)}{!received.length ? <p className="emptyState">No verified provider costs yet. Add one cost for every required handoff.</p> : null}</div><div className="coverageStrip"><span className={missing.length ? "missing" : "complete"}>{missing.length ? `Missing: ${missing.join(", ").replaceAll("_", " ")}` : "Complete EXW chain"}</span><small>Origin pickup · export · ocean/air · import customs · destination handling · last mile</small></div></section>
      <section className="offerComposer"><h4>3. Gel Öz firm offer</h4><div className="offerMath"><div><span>Verified supplier cost</span><strong>{usd.format(supplierCost / 100)}</strong></div><div><span>Gel Öz fee · {(margin * 100).toFixed(0)}% tier / minimum</span><strong>{usd.format(fee / 100)}</strong></div><div className="offerTotal"><span>Customer total</span><strong>{usd.format((supplierCost + fee) / 100)}</strong></div></div><form className="offerForm" onSubmit={publish}><label>Valid days<input name="valid_days" type="number" min="1" max="30" defaultValue="7" /></label><label>Deposit %<input name="deposit_percent" type="number" min="0" max="100" defaultValue="50" /></label><label className="wide">Customer terms note<input name="notes" placeholder="Optional commercial note" /></label><button disabled={busy || missing.length > 0 || supplierCost <= 0}>{busy ? "Publishing…" : "Publish firm offer"}</button><small>Publishing does not book a carrier or file customs. Those remain human-controlled.</small></form></section>
    </div>
  </section>;
}
