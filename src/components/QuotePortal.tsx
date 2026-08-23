"use client";

import { FormEvent, useState } from "react";
import type { QuoteEstimate, QuoteEstimateInput, QuoteOption } from "@/modules/quotes/estimator";

type Receipt = { quote_number: string; state: string; requested_at: string };
type Tracking = { tracking_number: string; state: string; service_level: string; destination: { city?: string; country_code?: string }; events: Array<{ state: string; message: string; event_at: string }> };

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function shipmentFrom(form: FormData): QuoteEstimateInput {
  return {
    originCountry: String(form.get("originCountry")) as QuoteEstimateInput["originCountry"],
    originCity: String(form.get("originCity")),
    destinationCity: String(form.get("destinationCity")),
    destinationState: String(form.get("destinationState")),
    destinationPostalCode: String(form.get("destinationPostalCode")),
    pieces: Number(form.get("pieces")), lengthCm: Number(form.get("lengthCm")), widthCm: Number(form.get("widthCm")), heightCm: Number(form.get("heightCm")),
    totalWeightKg: Number(form.get("totalWeightKg")), cargoValueUsd: Number(form.get("cargoValueUsd")),
    mode: String(form.get("mode")) as QuoteEstimateInput["mode"], residential: form.get("residential") === "on", fragile: form.get("fragile") === "on", stackable: form.get("stackable") === "on",
  };
}

export default function QuotePortal() {
  const [estimate, setEstimate] = useState<QuoteEstimate | null>(null);
  const [shipment, setShipment] = useState<QuoteEstimateInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setReceipt(null);
    const nextShipment = shipmentFrom(new FormData(event.currentTarget));
    try {
      const result = await jsonFetch<{ data: QuoteEstimate }>("/api/v1/public/quotes/estimate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(nextShipment) });
      setShipment(nextShipment); setEstimate(result.data);
      requestAnimationFrame(() => document.getElementById("estimate-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to calculate this shipment."); }
    finally { setBusy(false); }
  }

  async function requestQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!shipment) return;
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await jsonFetch<{ data: Receipt }>("/api/v1/public/quotes/request", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ shipment, cargoDescription: form.get("cargoDescription"), website: form.get("website"), contact: { name: form.get("name"), email: form.get("email"), phone: form.get("phone"), company: form.get("company") } }),
      });
      setReceipt(result.data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to request a firm quote."); }
    finally { setBusy(false); }
  }

  async function track(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); setTracking(null);
    const number = String(new FormData(event.currentTarget).get("trackingNumber") ?? "").trim();
    try { const result = await jsonFetch<{ data: Tracking }>(`/api/v1/tracking/${encodeURIComponent(number)}`); setTracking(result.data); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Tracking number not found."); }
  }

  return <main className="publicSite">
    <header className="publicNav"><a className="publicBrand" href="#top"><span>GÖ</span><div><strong>Gel Öz</strong><small>Cross-border logistics</small></div></a><nav><a href="#calculator">Estimate</a><a href="#how-it-works">How it works</a><a href="#track">Track</a></nav><a className="operatorLink" href="/operations">Operator console →</a></header>
    <section className="quoteHero" id="top"><div className="heroCopy"><p className="eyebrow">EXW · Türkiye & Italy → United States</p><h1>One shipment.<br/>Every handoff mapped.</h1><p>Gel Öz coordinates origin pickup, export, ocean or air freight, U.S. customs, and final-mile delivery—then gives your team one quote and one tracking number.</p><div className="heroProof"><span>Ocean LCL + FCL</span><span>Air freight</span><span>Door delivery</span></div></div><div className="routeVisual"><div className="routePoint"><small>ORIGIN</small><strong>Türkiye / Italy</strong><span>EXW pickup + export</span></div><div className="routeLine"><b>GÖ</b></div><div className="routePoint end"><small>DESTINATION</small><strong>United States</strong><span>Customs + final mile</span></div></div></section>

    <section className="calculatorSection" id="calculator"><div className="sectionIntro"><p className="eyebrow">Standard planning estimate</p><h2>Compare routes before requesting a firm quote.</h2><p>The calculator applies weight-or-measure rules, air volumetric weight, port-specific internal standards, a market contingency, and a visible Gel Öz coordination fee.</p></div>
      <form className="quoteCalculator" onSubmit={calculate}>
        <div className="formBand"><span>01</span><div><strong>Lane</strong><small>Origin supplier to final U.S. destination</small></div></div>
        <div className="quoteFields"><label>Origin country<select name="originCountry" defaultValue="TR"><option value="TR">Türkiye</option><option value="IT">Italy</option></select></label><label>Origin city<input required name="originCity" defaultValue="Istanbul" /></label><label>Destination city<input required name="destinationCity" placeholder="New York" /></label><label>State<input required maxLength={40} name="destinationState" placeholder="NY" /></label><label>Postal code<input required name="destinationPostalCode" placeholder="10001" /></label><label>Mode<select name="mode" defaultValue="AUTO"><option value="AUTO">Recommend for me</option><option value="OCEAN_LCL">Ocean LCL</option><option value="OCEAN_FCL_20">20&apos; FCL</option><option value="AIR">Air freight</option></select></label></div>
        <div className="formBand"><span>02</span><div><strong>Cargo</strong><small>Dimensions are per piece; weight is total</small></div></div>
        <div className="quoteFields cargo"><label>Pieces<input required min="1" max="10000" name="pieces" type="number" defaultValue="1" /></label><label>Length cm<input required min="0.1" step="0.1" name="lengthCm" type="number" defaultValue="100" /></label><label>Width cm<input required min="0.1" step="0.1" name="widthCm" type="number" defaultValue="80" /></label><label>Height cm<input required min="0.1" step="0.1" name="heightCm" type="number" defaultValue="60" /></label><label>Total weight kg<input required min="0.1" step="0.1" name="totalWeightKg" type="number" defaultValue="120" /></label><label>Cargo value USD<input required min="1" step="0.01" name="cargoValueUsd" type="number" defaultValue="5000" /></label></div>
        <div className="quoteChecks"><label><input name="stackable" type="checkbox" defaultChecked/> Stackable</label><label><input name="fragile" type="checkbox"/> Fragile</label><label><input name="residential" type="checkbox" defaultChecked/> Residential delivery</label><button disabled={busy}>{busy ? "Calculating…" : "Compare routes"}</button></div>
      </form>
      {message ? <div className="publicAlert">{message}</div> : null}
    </section>

    {estimate ? <section className="estimateResults" id="estimate-results"><div className="estimateSummary"><div><p className="eyebrow">{estimate.rateCardVersion}</p><h2>{estimate.cubicMeters} CBM · {estimate.oceanChargeableCbm} chargeable CBM</h2><p>{estimate.airChargeableKg} air chargeable kg · Suggested {estimate.suggestedMode.replaceAll("_", " ")}</p></div><div className="estimateTag">PLANNING ESTIMATE<br/><small>Supplier validation required</small></div></div>
      <div className="routeOptions">{estimate.options.map(option => <OptionCard key={option.optionCode} option={option}/>)}</div>
      <div className="quoteFinePrint"><strong>What this includes</strong><p>Origin pickup, handling, linehaul, destination handling, a customs-broker allowance, documents, insurance allowance, final mile, market contingency, and Gel Öz coordination.</p><strong>Not yet included</strong><p>{estimate.exclusions.join(" · ")}</p><small>{estimate.notice}</small></div>
      <form className="firmQuoteForm" onSubmit={requestQuote}><div><p className="eyebrow">Move from estimate to execution</p><h2>Request supplier-backed pricing</h2><p>We open a quote file, source each required leg, validate customs assumptions, and issue a time-limited firm offer.</p></div><div className="contactGrid"><label>Name<input required name="name" /></label><label>Work email<input required type="email" name="email" /></label><label>Company<input name="company" /></label><label>Phone<input name="phone" /></label><label className="full">What are you shipping?<textarea required minLength={2} maxLength={500} name="cargoDescription" placeholder="Furniture, lighting, machinery…" /></label><label className="honey">Website<input tabIndex={-1} autoComplete="off" name="website" /></label><button disabled={busy}>{busy ? "Opening quote…" : "Request firm quote"}</button></div></form>
      {receipt ? <div className="quoteReceipt"><span>Quote file opened</span><strong>{receipt.quote_number}</strong><p>Gel Öz operations can now see this request in the quote inbox. Keep this reference for follow-up.</p></div> : null}
    </section> : null}

    <section className="processSection" id="how-it-works"><div className="sectionIntro"><p className="eyebrow">One operational record</p><h2>From supplier door to customer door.</h2></div><div className="processGrid">{[["01","Source","Collect forwarder, airline, ocean, broker, and delivery pricing."],["02","Validate","Confirm dimensions, HS codes, importer of record, documents, and capacity."],["03","Consolidate","Receive, inspect, repackage, palletize, and decide LCL versus FCL."],["04","Deliver","Book approved providers and publish milestone events under one Gel Öz number."]].map(([n,title,copy])=><article key={n}><span>{n}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>

    <section className="publicTracking" id="track"><div><p className="eyebrow">Customer visibility</p><h2>Track a Gel Öz order.</h2><p>Milestones are sanitized for the end customer while operations keeps the full exception and provider history.</p><form onSubmit={track}><input required name="trackingNumber" placeholder="GOZ-26-…"/><button>Track</button></form></div>{tracking ? <div className="publicTimeline"><strong>{tracking.tracking_number}</strong><span>{tracking.state.replaceAll("_"," ")}</span>{tracking.events.map(event=><article key={`${event.state}-${event.event_at}`}><b>{event.state.replaceAll("_"," ")}</b><p>{event.message}</p><small>{new Date(event.event_at).toLocaleString()}</small></article>)}</div>:<div className="trackingBlank">Your consolidated route,<br/>one milestone at a time.</div>}</section>
    <footer><div className="publicBrand"><span>GÖ</span><div><strong>Gel Öz</strong><small>Cross-border logistics</small></div></div><p>Planning estimates are non-binding. Customs decisions remain with the importer of record and licensed broker; bookings require operator approval.</p><a href="/operations">Staff access</a></footer>
  </main>;
}

function OptionCard({ option }: { option: QuoteOption }) {
  return <article className={option.recommended ? "routeOption recommended" : "routeOption"}>{option.recommended ? <span className="recommendFlag">RECOMMENDED</span> : null}<p>{option.mode.replaceAll("_", " ")}</p><h3>{option.arrivalPort}</h3><strong>{usd.format(option.estimatedTotal)}</strong><small>{option.transitDaysMin}–{option.transitDaysMax} planning days</small><div><span>Provider legs <b>{usd.format(option.providerCost)}</b></span><span>Market contingency <b>{usd.format(option.marketContingency)}</b></span><span>Gel Öz coordination <b>{usd.format(option.gelOzCoordination)}</b></span></div><details><summary>Provider plan</summary>{option.providerPlan.map(item => <p key={item.segment}><b>{item.segment}</b><br/>{item.preferredProvider} · {item.integration.replaceAll("_", " ")}</p>)}</details></article>;
}
