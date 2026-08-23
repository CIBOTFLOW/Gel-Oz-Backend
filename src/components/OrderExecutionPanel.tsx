"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type DocumentRecord = { id: string; document_type: string; status: string; is_required: boolean };
type WorkRecord = { id: string; work_type: string; state: string; priority: number; instructions: string | null };
type HandoffRecord = { id: string; provider: string; operation: string; state: string; created_at: string };
type InquiryRecord = { id: string; channel: string; category: string; state: string; subject: string; summary: string; created_at: string };
type OrderDetail = {
  order: { id: string; tracking_number: string; state: string; source: string; service_level: string; customer_reference: string | null };
  packages: Array<{ id: string; package_ref: string; status: string; piece_count: number; length_cm: number; width_cm: number; height_cm: number; weight_kg: number }>;
  documents: DocumentRecord[];
  work_orders: WorkRecord[];
  exceptions: Array<{ id: string; code: string; severity: string; state: string; summary: string }>;
  handoffs: HandoffRecord[];
  inquiries: InquiryRecord[];
  recommendations: Array<{ id: string; type: string; state: string; confidence: number; created_at: string }>;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
}

const documentNext: Record<string, string | undefined> = {
  MISSING: "UPLOADED", REQUESTED: "UPLOADED", UPLOADED: "VERIFIED",
  REJECTED: "UPLOADED", EXPIRED: "UPLOADED", NOT_REQUIRED: "REQUESTED",
};

const workNext: Record<string, string | undefined> = {
  OPEN: "IN_PROGRESS", ASSIGNED: "IN_PROGRESS", BLOCKED: "IN_PROGRESS", IN_PROGRESS: "DONE",
};

export default function OrderExecutionPanel({ orderId, onClose, onChanged }: { orderId: string; onClose: () => void; onChanged: () => Promise<void> }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const result = await requestJson<{ data: OrderDetail }>(`/api/v1/orders/${orderId}`);
      setDetail(result.data); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load order"); }
  }, [orderId]);

  useEffect(() => { void loadDetail(); }, [loadDetail]);

  async function mutate(url: string, body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      await requestJson(url, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(body) });
      await Promise.all([loadDetail(), onChanged()]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action failed"); }
    finally { setBusy(false); }
  }

  async function createInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    await mutate(`/api/v1/orders/${orderId}/inquiries`, { channel: form.get("channel"), category: form.get("category"), subject: form.get("subject"), summary: form.get("summary") });
    formElement.reset();
  }

  async function planHandoff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await mutate(`/api/v1/orders/${orderId}/handoffs`, { provider: form.get("provider"), operation: form.get("operation") });
  }

  return <section className="panel executionPanel" aria-live="polite">
    <div className="panelHeader"><div><p className="eyebrow">Order execution</p><h2>{detail?.order.tracking_number ?? "Loading order…"}</h2><p className="muted">Paperwork, warehouse work, provider handoffs, inquiries, and recommendations.</p></div><button className="secondary" onClick={onClose}>Close</button></div>
    {error ? <p className="errorText executionError">{error}</p> : null}
    {detail ? <div className="executionGrid">
      <section><h3>Packages</h3>{detail.packages.map(item => <article className="compactRow" key={item.id}><div><strong>{item.package_ref}</strong><span>{item.piece_count} × {item.length_cm}×{item.width_cm}×{item.height_cm} cm · {item.weight_kg} kg</span></div><span className="pill neutral">{item.status}</span></article>)}</section>
      <section><h3>Import / export documents</h3>{detail.documents.map(item => <article className="compactRow" key={item.id}><div><strong>{item.document_type.replaceAll("_", " ")}</strong><span>{item.is_required ? "Required" : "Optional"}</span></div><div className="compactActions"><span className={`pill ${item.status === "VERIFIED" ? "good" : "warn"}`}>{item.status}</span>{documentNext[item.status] ? <button disabled={busy} onClick={() => void mutate(`/api/v1/documents/${item.id}/status`, { to_status: documentNext[item.status] })}>{documentNext[item.status] === "VERIFIED" ? "Verify" : documentNext[item.status] === "REQUESTED" ? "Request" : "Mark uploaded"}</button> : null}</div></article>)}</section>
      <section><h3>Warehouse work</h3>{detail.work_orders.map(item => <article className="compactRow" key={item.id}><div><strong>{item.work_type.replaceAll("_", " ")}</strong><span>{item.instructions ?? `Priority ${item.priority}`}</span></div><div className="compactActions"><span className="pill neutral">{item.state}</span>{workNext[item.state] ? <button disabled={busy} onClick={() => void mutate(`/api/v1/work-orders/${item.id}/status`, { to_state: workNext[item.state] })}>{workNext[item.state] === "DONE" ? "Complete" : "Start"}</button> : null}</div></article>)}</section>
      <section><h3>Provider handoffs</h3><form className="inlineOpsForm" onSubmit={planHandoff}><select name="provider"><option>EASYSHIP</option><option>SHOPIFY_SHIPPING</option><option>RXO_CONNECT</option><option>VANGUARD_LOGISTICS</option><option>MATRAS</option></select><select name="operation"><option>RATE</option><option>BOOK</option><option>LABEL</option><option>PICKUP</option><option>TENDER</option><option>TRACK</option><option>DOCUMENT</option></select><button disabled={busy}>Plan handoff</button></form>{detail.handoffs.map(item => <article className="compactRow" key={item.id}><div><strong>{item.provider}</strong><span>{item.operation} · no external effect</span></div><span className="pill warn">{item.state}</span></article>)}</section>
      <section><h3>Customer inquiries</h3><form className="inquiryForm" onSubmit={createInquiry}><select name="channel"><option>EMAIL</option><option>PHONE</option><option>CHAT</option><option>SHOPIFY</option><option>FEP</option></select><select name="category"><option>WISMO</option><option>CHANGE_DELIVERY</option><option>DAMAGE</option><option>MISSING</option><option>CUSTOMS</option><option>BILLING</option><option>OTHER</option></select><input required minLength={3} name="subject" placeholder="Subject" /><input required minLength={3} name="summary" placeholder="Minimized inquiry summary" /><button disabled={busy}>Record inquiry</button></form>{detail.inquiries.map(item => <article className="compactRow" key={item.id}><div><strong>{item.subject}</strong><span>{item.channel} · {item.category}</span></div><span className="pill neutral">{item.state}</span></article>)}</section>
      <section><h3>Exceptions and Sultan evidence</h3>{detail.exceptions.map(item => <article className="compactRow" key={item.id}><div><strong>{item.code}</strong><span>{item.summary}</span></div><span className="pill warn">{item.severity}</span></article>)}{detail.recommendations.map(item => <article className="compactRow" key={item.id}><div><strong>{item.type.replaceAll("_", " ")}</strong><span>Confidence {Math.round(Number(item.confidence) * 100)}%</span></div><span className="pill good">{item.state}</span></article>)}{!detail.exceptions.length && !detail.recommendations.length ? <p className="emptyState">No open exceptions or saved recommendations.</p> : null}</section>
    </div> : <p className="emptyState">Loading operational record…</p>}
  </section>;
}
