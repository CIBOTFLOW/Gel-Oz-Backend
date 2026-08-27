"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/i18n/LanguageProvider";

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
  const {text}=useLanguage();
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
    <div className="panelHeader"><div><p className="eyebrow">{text("Sipariş yürütme","Order execution")}</p><h2>{detail?.order.tracking_number ?? text("Sipariş yükleniyor…","Loading order…")}</h2><p className="muted">{text("Evrak, depo işleri, sağlayıcı devirleri, müşteri soruları ve öneriler.","Paperwork, warehouse work, provider handoffs, inquiries, and recommendations.")}</p></div><button className="secondary" onClick={onClose}>{text("Kapat","Close")}</button></div>
    {error ? <p className="errorText executionError">{error}</p> : null}
    {detail ? <div className="executionGrid">
      <section><h3>{text("Paketler","Packages")}</h3>{detail.packages.map(item => <article className="compactRow" key={item.id}><div><strong>{item.package_ref}</strong><span>{item.piece_count} × {item.length_cm}×{item.width_cm}×{item.height_cm} cm · {item.weight_kg} kg</span></div><span className="pill neutral">{item.status}</span></article>)}</section>
      <section><h3>{text("İthalat / ihracat belgeleri","Import / export documents")}</h3>{detail.documents.map(item => <article className="compactRow" key={item.id}><div><strong>{item.document_type.replaceAll("_", " ")}</strong><span>{item.is_required ? text("Zorunlu","Required") : text("İsteğe bağlı","Optional")}</span></div><div className="compactActions"><span className={`pill ${item.status === "VERIFIED" ? "good" : "warn"}`}>{item.status}</span>{documentNext[item.status] ? <button disabled={busy} onClick={() => void mutate(`/api/v1/documents/${item.id}/status`, { to_status: documentNext[item.status] })}>{documentNext[item.status] === "VERIFIED" ? text("Doğrula","Verify") : documentNext[item.status] === "REQUESTED" ? text("Talep et","Request") : text("Alındı kaydet","Record received")}</button> : null}</div></article>)}</section>
      <section><h3>{text("Depo işleri","Warehouse work")}</h3>{detail.work_orders.map(item => <article className="compactRow" key={item.id}><div><strong>{item.work_type.replaceAll("_", " ")}</strong><span>{item.instructions ?? `${text("Öncelik","Priority")} ${item.priority}`}</span></div><div className="compactActions"><span className="pill neutral">{item.state}</span>{workNext[item.state] ? <button disabled={busy} onClick={() => void mutate(`/api/v1/work-orders/${item.id}/status`, { to_state: workNext[item.state] })}>{workNext[item.state] === "DONE" ? text("Tamamla","Complete") : text("Başlat","Start")}</button> : null}</div></article>)}</section>
      <section><h3>{text("Sağlayıcı devirleri","Provider handoffs")}</h3><form className="inlineOpsForm" onSubmit={planHandoff}><select name="provider"><option>EASYSHIP</option><option>SHOPIFY_SHIPPING</option><option>RXO_CONNECT</option><option>VANGUARD_LOGISTICS</option><option>MATRAS</option></select><select name="operation"><option>RATE</option><option>BOOK</option><option>LABEL</option><option>PICKUP</option><option>TENDER</option><option>TRACK</option><option>DOCUMENT</option></select><button disabled={busy}>{text("Devri planla","Plan handoff")}</button></form>{detail.handoffs.map(item => <article className="compactRow" key={item.id}><div><strong>{item.provider}</strong><span>{item.operation} · {text("dış etki yok","no external effect")}</span></div><span className="pill warn">{item.state}</span></article>)}</section>
      <section><h3>{text("Müşteri soruları","Customer inquiries")}</h3><form className="inquiryForm" onSubmit={createInquiry}><select name="channel"><option>EMAIL</option><option>PHONE</option><option>CHAT</option><option>SHOPIFY</option><option>FEP</option></select><select name="category"><option>WISMO</option><option>CHANGE_DELIVERY</option><option>DAMAGE</option><option>MISSING</option><option>CUSTOMS</option><option>BILLING</option><option>OTHER</option></select><input required minLength={3} name="subject" placeholder={text("Konu","Subject")} /><input required minLength={3} name="summary" placeholder={text("Kısa soru özeti","Minimized inquiry summary")} /><button disabled={busy}>{text("Soruyu kaydet","Record inquiry")}</button></form>{detail.inquiries.map(item => <article className="compactRow" key={item.id}><div><strong>{item.subject}</strong><span>{item.channel} · {item.category}</span></div><span className="pill neutral">{item.state}</span></article>)}</section>
      <section><h3>{text("İstisnalar ve Sultan kanıtı","Exceptions and Sultan evidence")}</h3>{detail.exceptions.map(item => <article className="compactRow" key={item.id}><div><strong>{item.code}</strong><span>{item.summary}</span></div><span className="pill warn">{item.severity}</span></article>)}{detail.recommendations.map(item => <article className="compactRow" key={item.id}><div><strong>{item.type.replaceAll("_", " ")}</strong><span>{text("Güven","Confidence")} {Math.round(Number(item.confidence) * 100)}%</span></div><span className="pill good">{item.state}</span></article>)}{!detail.exceptions.length && !detail.recommendations.length ? <p className="emptyState">{text("Açık istisna veya kayıtlı öneri yok.","No open exceptions or saved recommendations.")}</p> : null}</section>
    </div> : <p className="emptyState">{text("Operasyon kaydı yükleniyor…","Loading operational record…")}</p>}
  </section>;
}
