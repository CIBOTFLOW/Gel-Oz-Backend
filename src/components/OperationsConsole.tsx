"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { DashboardSnapshot, Workspace } from "@/lib/fep-supabase";
import type { FreightPlan } from "@/modules/operations/contracts";
import OrderExecutionPanel from "@/components/OrderExecutionPanel";
import QuoteExecutionPanel, { type QuoteInboxItem } from "@/components/QuoteExecutionPanel";
import { LanguageSwitch, useLanguage } from "@/i18n/LanguageProvider";

type DashboardPayload = { workspaces: Workspace[]; snapshot: DashboardSnapshot | null; livePlan: FreightPlan | null; error?: string };
type IntakeReceipt = { order_id: string; tracking_number: string; state: string; created_at: string };
type TrackingResult = { tracking_number: string; state: string; service_level: string; destination: { city?: string; country_code?: string }; events: Array<{ state: string; message: string; event_at: string; city?: string }> };
type SultanRecommendation = { recommendation_id: string; action: string; recommended_provider_code: string | null; provider_reason: string; next_human_action: string; customs_ready: boolean; missing_information: string[]; pallet_estimate: { pallet_count: number; freight_mode: string; average_utilization_pct: number }; authority: Record<string, boolean> };

const transitions: Record<string, string[]> = {
  ORDER_RECEIVED: ["AWAITING_SUPPLIER", "INBOUND_TO_ORIGIN_HUB", "EXCEPTION"],
  AWAITING_SUPPLIER: ["INBOUND_TO_ORIGIN_HUB", "EXCEPTION"],
  INBOUND_TO_ORIGIN_HUB: ["RECEIVED_ORIGIN_HUB", "EXCEPTION"],
  RECEIVED_ORIGIN_HUB: ["QUALITY_CONTROL", "EXCEPTION"],
  QUALITY_CONTROL: ["REPACKAGING", "CONSOLIDATION_PLANNING", "EXCEPTION"],
  REPACKAGING: ["CONSOLIDATION_PLANNING", "EXCEPTION"],
  CONSOLIDATION_PLANNING: ["PALLETIZED", "EXCEPTION"],
  PALLETIZED: ["BOOKED", "EXCEPTION"], BOOKED: ["EXPORT_CUSTOMS", "EXCEPTION"],
  EXPORT_CUSTOMS: ["ORIGIN_DEPARTED", "EXCEPTION"], ORIGIN_DEPARTED: ["IN_TRANSIT", "EXCEPTION"],
  IN_TRANSIT: ["IMPORT_CUSTOMS", "EXCEPTION"], IMPORT_CUSTOMS: ["DESTINATION_HUB", "EXCEPTION"],
  DESTINATION_HUB: ["OUT_FOR_DELIVERY", "EXCEPTION"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_ATTEMPTED", "EXCEPTION"],
  DELIVERY_ATTEMPTED: ["OUT_FOR_DELIVERY", "EXCEPTION"],
  EXCEPTION: ["AWAITING_SUPPLIER", "INBOUND_TO_ORIGIN_HUB", "RECEIVED_ORIGIN_HUB", "QUALITY_CONTROL", "REPACKAGING", "CONSOLIDATION_PLANNING", "PALLETIZED", "BOOKED", "EXPORT_CUSTOMS", "ORIGIN_DEPARTED", "IN_TRANSIT", "IMPORT_CUSTOMS", "DESTINATION_HUB", "OUT_FOR_DELIVERY"],
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Request failed");
  return payload as T;
}

export default function OperationsConsole() {
  const { locale, text } = useLanguage();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "signed-out" | "needs-workspace" | "ready">("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<IntakeReceipt | null>(null);
  const [tracking, setTracking] = useState<TrackingResult | null>(null);
  const [sultan, setSultan] = useState<SultanRecommendation | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<QuoteInboxItem[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await jsonFetch<DashboardPayload>("/api/v1/operations/dashboard");
      setDashboard(data);
      if (data.workspaces.length) {
        const quoteData = await jsonFetch<{ data: QuoteInboxItem[] }>("/api/v1/quotes");
        setQuotes(quoteData.data);
      }
      setStatus(data.workspaces.length ? "ready" : "needs-workspace");
    } catch (error) {
      if (error instanceof Error && error.message.toLowerCase().includes("authentication")) setStatus("signed-out");
      else { setMessage(error instanceof Error ? error.message : "Unable to load operations"); setStatus("signed-out"); }
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await jsonFetch<{ pendingConfirmation?: boolean; message?: string }>("/api/v1/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password"), mode: form.get("mode") }) });
      if (result.pendingConfirmation) { setMessage(result.message ?? "Confirm your email, then sign in."); return; }
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Authentication failed"); }
    finally { setBusy(false); }
  }

  async function accountAction(action: "resend-confirmation" | "recover-password", form: HTMLFormElement) {
    const email = String(new FormData(form).get("email") ?? "");
    setBusy(true); setMessage("");
    try {
      const result = await jsonFetch<{ message: string }>("/api/v1/auth/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, email }) });
      setMessage(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Account action failed"); }
    finally { setBusy(false); }
  }

  async function bootstrap() {
    setBusy(true); setMessage("");
    try { await jsonFetch("/api/v1/workspaces", { method: "POST" }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Workspace initialization failed"); }
    finally { setBusy(false); }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!dashboard?.workspaces[0]) return;
    setBusy(true); setMessage(""); setReceipt(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const sourceOrderId = String(form.get("source_order_id") ?? "").trim();
    const payload = {
      tenant_id: dashboard.workspaces[0].tenant_id, source: String(form.get("source")), source_order_id: sourceOrderId || undefined,
      customer_reference: String(form.get("customer_reference") ?? ""), service_level: String(form.get("service_level")), incoterm: String(form.get("incoterm")), currency: "USD",
      origin: { country_code: String(form.get("origin_country")), city: String(form.get("origin_city")) },
      destination: { country_code: "US", city: String(form.get("destination_city")), postal_code: String(form.get("postal_code")) },
      ship_to: { name: String(form.get("customer_name")), address_line_1: String(form.get("address")), city: String(form.get("destination_city")), postal_code: String(form.get("postal_code")), country_code: "US" },
      customer_contact: { name: String(form.get("customer_name")), email: String(form.get("customer_email")) },
      items: [{ sku: String(form.get("sku")), title: String(form.get("title")), quantity: Number(form.get("quantity")), hs_code: String(form.get("hs_code")), country_of_origin: String(form.get("origin_country")), unit_value_minor: Math.round(Number(form.get("unit_value")) * 100), currency: "USD", length_cm: Number(form.get("length_cm")), width_cm: Number(form.get("width_cm")), height_cm: Number(form.get("height_cm")), weight_kg: Number(form.get("weight_kg")), fragile: form.get("fragile") === "on", stackable: form.get("stackable") === "on", hazardous: false }],
    };
    try {
      const result = await jsonFetch<{ data: IntakeReceipt }>("/api/v1/orders", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(payload) });
      setReceipt(result.data); formElement.reset(); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Order intake failed"); }
    finally { setBusy(false); }
  }

  async function advance(orderId: string, toState: string) {
    setBusy(true); setMessage("");
    try { await jsonFetch(`/api/v1/orders/${orderId}/advance`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to_state: toState }) }); await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Status update failed"); }
    finally { setBusy(false); }
  }

  async function recommend(orderId: string) {
    setBusy(true); setMessage(""); setSultan(null);
    try {
      const result = await jsonFetch<{ data: SultanRecommendation }>("/api/v1/operations/recommendations", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ order_id: orderId }) });
      setSultan(result.data);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sultan FEP recommendation failed"); }
    finally { setBusy(false); }
  }

  async function track(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setTracking(null); setMessage("");
    const number = String(new FormData(event.currentTarget).get("tracking_number") ?? "").trim();
    try { const result = await jsonFetch<{ data: TrackingResult }>(`/api/v1/tracking/${encodeURIComponent(number)}`); setTracking(result.data); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Tracking lookup failed"); }
  }

  const signals = useMemo(() => dashboard?.snapshot ? [
    [text("Açık siparişler","Open orders"), dashboard.snapshot.orders_open, text(`Toplam ${dashboard.snapshot.orders_total}`,`${dashboard.snapshot.orders_total} total`)],
    [text("Paletlenmemiş parçalar","Unpalletized pieces"), dashboard.snapshot.planning_packages.reduce((sum, item) => sum + item.piece_count, 0), text("Canlı paket kuyruğu","Live package queue")],
    [text("Eksik belgeler","Missing documents"), dashboard.snapshot.documents_missing, text("Gümrük kontrol listesi","Customs checklist")],
    [text("Açık istisnalar","Open exceptions"), dashboard.snapshot.exceptions_open, text(`${dashboard.snapshot.work_open} depo işi`,`${dashboard.snapshot.work_open} warehouse tasks`)],
  ] : [], [dashboard,text]);

  if (status === "loading") return <main className="centerCard"><LanguageSwitch/><p>{text("Gel Öz kontrol kulesi açılıyor…","Opening the Gel Öz control tower…")}</p></main>;
  if (status === "signed-out") return <main className="authLayout"><section className="authCard"><LanguageSwitch/><p className="eyebrow">{text("FEP güvenli operasyonlar","FEP-secured operations")}</p><h1>{text("Operatör erişimi","Operator access")}</h1><p className="muted">{text("Giriş yapın veya ilk operatör hesabını oluşturun. Müşteri takibi herkese açıktır; sipariş ve depo verileri değildir.","Sign in or create the first operator account. Customer tracking remains public; order and warehouse data does not.")}</p><form onSubmit={authenticate} className="stackForm"><label>{text("E-posta","Email")}<input required name="email" type="email" defaultValue="hello@ciflow.io" /></label><label>{text("Parola","Password")}<input required minLength={8} name="password" type="password" /></label><div className="buttonRow"><button name="mode" value="sign-in" disabled={busy}>{text("Giriş yap","Sign in")}</button><button className="secondary" name="mode" value="sign-up" disabled={busy}>{text("Hesap oluştur","Create account")}</button></div><div className="authHelp"><button type="button" onClick={event => void accountAction("resend-confirmation", event.currentTarget.form!)} disabled={busy}>{text("Doğrulamayı yeniden gönder","Resend confirmation")}</button><button type="button" onClick={event => void accountAction("recover-password", event.currentTarget.form!)} disabled={busy}>{text("Parolayı sıfırla","Reset password")}</button></div></form>{message ? <p className="errorText">{message}</p> : null}<TrackingPanel onTrack={track} tracking={tracking} /></section></main>;
  if (status === "needs-workspace") return <main className="centerCard"><section className="authCard"><LanguageSwitch/><p className="eyebrow">{text("Tek seferlik kurulum","One-time setup")}</p><h1>{text("Gel Öz Lojistik'i başlatın","Initialize Gel Öz Logistics")}</h1><p className="muted">{text("Türkiye, İtalya ve ABD operasyon çalışma alanını oluşturur ve bu hesabı sahip yapar.","Creates the Türkiye, Italy, and USA operating workspace and makes this account the owner.")}</p><button onClick={bootstrap} disabled={busy}>{busy ? text("Başlatılıyor…","Initializing…") : text("Operasyonları başlat","Initialize operations")}</button>{message ? <p className="errorText">{message}</p> : null}</section></main>;

  const snapshot = dashboard?.snapshot;
  return <main>
    <header className="topbar"><div className="brand"><span className="brandMark">GÖ</span><div><strong>Gel Öz</strong><small>{text("FEP operasyonları","FEP operations")}</small></div></div><nav><a className="active" href="#control">{text("Operasyonlar","Operations")}</a><a href="#quotes">{text("Teklif kutusu","Quote inbox")}</a><a href="#intake">{text("Sipariş girişi","Order intake")}</a><a href="#consolidation">{text("Konsolidasyon","Consolidation")}</a><a href="#tracking">{text("Takip","Tracking")}</a></nav><div className="topActions"><a href="/">{text("Müşteri sitesi","Customer site")}</a><LanguageSwitch compact/><span className="liveDot">{text("FEP canlı","FEP live")}</span><button className="secondary" onClick={async () => { await fetch("/api/v1/auth/session", { method: "DELETE" }); setStatus("signed-out"); }}>{text("Çıkış","Sign out")}</button></div></header>
    <div className="shell" id="control"><aside><p className="asideLabel">{text("Akış","Pipeline")}</p><a className="selected" href="#control">{text("Kontrol kulesi","Control tower")}</a><a href="#quotes">{text("Teklif kutusu","Quote inbox")} <span>{quotes.length}</span></a><a href="#intake">{text("Giriş","Intake")}</a><a href="#consolidation">{text("Palet planlama","Pallet planning")}</a><a href="#orders">{text("Siparişler","Orders")} <span>{snapshot?.orders_open ?? 0}</span></a><a href="#tracking">{text("Müşteri takibi","Customer tracking")}</a><p className="asideLabel second">{text("Yetki","Authority")}</p><div className="facility"><small>{text("Kayıt sistemi","System of record")}</small><strong>Supabase FEP</strong><span>{text("Her değişiklik makbuz döndürür","Every mutation returns a receipt")}</span></div></aside>
      <div className="content"><div className="pageTitle"><div><p className="eyebrow">{text("Canlı operasyon verisi","Live operational data")}</p><h1>{text("Operasyon kontrol kulesi","Operations control tower")}</h1><p>{text("Sipariş girişi, gümrük hazırlığı, konsolidasyon, sağlayıcı devirleri ve müşteri takibi.","Order intake, customs readiness, consolidation, handoffs, and customer tracking.")}</p></div><div className="scope"><span>{text("Ağ","Network")}</span><strong>{text("Türkiye + İtalya → ABD","Türkiye + Italy → USA")}</strong></div></div>
        {message ? <div className="alert"><div className="alertIcon">!</div><div><strong>{text("İşlem dikkat gerektiriyor","Action needs attention")}</strong><p>{message}</p></div></div> : null}
        <section className="signalGrid">{signals.map(([label, value, hint]) => <article key={String(label)}><span>{label}</span><strong>{value}</strong><div><b>Live</b><small>{hint}</small></div></article>)}</section>
        <section className="panel quoteInbox" id="quotes"><div className="panelHeader"><div><p className="eyebrow">{text("Müşteri → operasyon devri","Customer → operations handoff")}</p><h2>{text("Teklif kutusu","Quote inbox")}</h2><p className="muted">{text("Doğrulanmış sağlayıcı maliyet zincirini kurun, hacim bazlı Gel Öz ücretini uygulayın ve müşteriye hazır kesin teklifi yayınlayın.","Build the verified provider cost chain, apply the volume-based Gel Öz fee, and publish a customer-ready firm offer.")}</p></div><a href="/" target="_blank">{text("Müşteri hesaplayıcısını aç ↗","Open customer calculator ↗")}</a></div><div className="quoteInboxRows">{quotes.map(quote => { const recommended = quote.options.find(option => option.is_recommended) ?? quote.options[0]; const receivedRates = quote.provider_requests.filter(rate => rate.state === "RECEIVED").length; const latestOffer = quote.offers?.[0]; return <div className="quoteInboxEntry" key={quote.id}><article><div className="quoteIdentity"><strong>{quote.quote_number}</strong><span>{quote.company_name || quote.contact_name} · {quote.contact_email}</span><small>{quote.origin_city}, {quote.origin_country} → {quote.destination_city}, {quote.destination_state}</small></div><div><span className="pill warn">{quote.state.replaceAll("_", " ")}</span><small>{quote.pieces} {text("parça","pcs")} · {Number(quote.cubic_meters).toFixed(2)} CBM · {Number(quote.total_weight_kg).toLocaleString(locale)} kg</small></div><div className="quotePrice"><small>{latestOffer ? `${text("Kesin teklif","Firm offer")} v${latestOffer.version}` : recommended ? `${recommended.mode.replaceAll("_", " ")} · ${recommended.arrival_port}` : text("Fiyat planı gerekli","Needs rate plan")}</small><strong>{latestOffer ? `$${(latestOffer.total_minor / 100).toLocaleString(locale,{maximumFractionDigits:0})}` : recommended ? `$${(recommended.total_minor / 100).toLocaleString(locale,{maximumFractionDigits:0})}` : "—"}</strong><span>{receivedRates ? text(`${receivedRates} doğrulanmış sağlayıcı maliyeti`,`${receivedRates} verified provider costs`) : text("Sağlayıcı maliyetleri kaydedilmedi","Supplier costs not recorded")}</span></div><div className="quoteDescription"><small>{text("Yük","Cargo")}</small><p>{quote.cargo_description}</p><time>{new Date(quote.requested_at).toLocaleString(locale)}</time><button className="secondary" onClick={() => setSelectedQuoteId(current => current === quote.id ? null : quote.id)}>{selectedQuoteId === quote.id ? text("Fiyatlamayı kapat","Close pricing") : text("Fiyatla ve yayınla","Price & publish")}</button></div></article>{selectedQuoteId === quote.id ? <QuoteExecutionPanel quote={quote} onChanged={load} onError={setMessage} /> : null}</div>; })}{!quotes.length ? <p className="emptyState">{text("Henüz teklif talebi yok. Müşteri hesaplayıcısından gelen talepler burada hemen görünür.","No quote requests yet. Requests from the customer calculator will appear here immediately.")}</p> : null}</div></section>
        <section className="panel intakePanel" id="intake"><div className="panelHeader"><div><p className="eyebrow">{text("Yetkili giriş","Authoritative intake")}</p><h2>{text("Sipariş oluştur","Create an order")}</h2><p className="muted">{text("İlk paketi, tarafları, hizmeti, gümrük başlangıç verisini, belge listesini, takip numarasını ve teslim alma işini tek işlemde kaydeder.","Captures the first package, shipping party, service, customs seed data, document checklist, tracking number, and receiving work order in one transaction.")}</p></div></div><form onSubmit={createOrder} className="intakeForm">
          <label>{text("Kaynak","Source")}<select name="source" defaultValue="LUZIONE"><option>LUZIONE</option><option>SHOPIFY</option><option>FEP</option><option>API</option><option>MANUAL</option><option>OTHER</option></select></label><label>{text("Kaynak sipariş ID","Source order ID")}<input name="source_order_id" placeholder="LZ-10482" /></label><label>{text("Müşteri referansı","Customer reference")}<input name="customer_reference" /></label><label>{text("Hizmet","Service")}<select name="service_level" defaultValue="WHITE_GLOVE"><option>PARCEL</option><option>THRESHOLD</option><option>ROOM_OF_CHOICE</option><option>WHITE_GLOVE</option><option>LTL</option><option>FTL</option></select></label>
          <label>{text("Çıkış ülkesi","Origin country")}<select name="origin_country"><option value="TR">Türkiye</option><option value="IT">{text("İtalya","Italy")}</option></select></label><label>{text("Çıkış şehri","Origin city")}<input required name="origin_city" defaultValue="Istanbul" /></label><label>Incoterm<select name="incoterm" defaultValue="DAP"><option>EXW</option><option>FCA</option><option>FOB</option><option>CIF</option><option>DAP</option><option>DDP</option></select></label><label>{text("Varış şehri","Destination city")}<input required name="destination_city" /></label><label>{text("Posta kodu","Postal code")}<input required name="postal_code" /></label><label>{text("Müşteri adı","Customer name")}<input required name="customer_name" /></label><label>{text("Müşteri e-postası","Customer email")}<input required name="customer_email" type="email" /></label><label>{text("Açık adres","Street address")}<input required name="address" /></label>
          <label>SKU<input name="sku" /></label><label className="wide">{text("Ürün açıklaması","Item description")}<input required name="title" /></label><label>{text("Adet","Quantity")}<input required min="1" name="quantity" type="number" defaultValue="1" /></label><label>{text("GTİP / HS kodu","HS code")}<input name="hs_code" /></label><label>{text("Birim değer USD","Unit value USD")}<input required min="0" step="0.01" name="unit_value" type="number" /></label><label>{text("Uzunluk cm","Length cm")}<input required min="0.1" step="0.1" name="length_cm" type="number" /></label><label>{text("Genişlik cm","Width cm")}<input required min="0.1" step="0.1" name="width_cm" type="number" /></label><label>{text("Yükseklik cm","Height cm")}<input required min="0.1" step="0.1" name="height_cm" type="number" /></label><label>{text("Birim ağırlık kg","Unit weight kg")}<input required min="0.01" step="0.01" name="weight_kg" type="number" /></label><label className="check"><input name="stackable" type="checkbox" defaultChecked /> {text("İstiflenebilir","Stackable")}</label><label className="check"><input name="fragile" type="checkbox" /> {text("Kırılabilir","Fragile")}</label><div className="formAction"><button disabled={busy}>{busy ? text("Kaydediliyor…","Recording…") : text("Siparişi kaydet","Record order")}</button><small>{text("Rezervasyon ve gümrük beyanı insan kontrolünde kalır.","Booking and customs filing remain human-controlled.")}</small></div>
        </form>{receipt ? <div className="receipt"><strong>{receipt.tracking_number}</strong><span>{text("Sipariş kabul edildi","Order accepted")} · {receipt.state.replaceAll("_", " ")}</span></div> : null}</section>
        <section className="panel workbench" id="consolidation"><div className="panelHeader"><div><p className="eyebrow">{text("Veritabanı destekli konsolidasyon","Database-backed consolidation")}</p><h2>{text("Açık paket havuzu","Open package pool")}</h2><p className="muted">{text("Atanmamış her paketten yeniden hesaplanır. Yalnızca öneridir; gerçek yerleşimi depo personeli doğrular.","Recomputed from every unallocated package. Proposal only; warehouse staff confirm actual placement.")}</p></div></div>{dashboard?.livePlan ? <><div className="planGrid"><div className="modeCard"><span className="status">{text("ÖNERİ","PROPOSED")}</span><strong>{dashboard.livePlan.freightMode.replaceAll("_", " ")}</strong><span>{dashboard.livePlan.pallets.length} {text("palet","pallets")} · {dashboard.livePlan.packageCount} {text("parça","pieces")}</span></div><div className="priceCard"><span>{text("Tahmini navlun","Estimated freight")}</span><strong>${dashboard.livePlan.estimatedFreight.amount.toLocaleString(locale)}</strong><small>{dashboard.livePlan.estimatedFreight.rateCardVersion}</small></div><div className="utilCard"><span>{text("Ücretlendirilebilir hacim","Chargeable volume")}</span><strong>{dashboard.livePlan.chargeableCbm} CBM</strong><small>{dashboard.livePlan.totalWeightKg.toLocaleString(locale)} kg</small></div></div><div className="reasonStrip"><span>{text("Planlayıcı kararı","Planner decision")}</span><p>{dashboard.livePlan.reasons.join(" ")}</p></div><p className="planId">{dashboard.livePlan.planId} · {dashboard.livePlan.effectAuthority}</p></> : <p className="emptyState">{text("Paletleme bekleyen paket yok. Planlama havuzunu açmak için sipariş oluşturun.","No packages are waiting for palletization. Create an order to open the planning pool.")}</p>}</section>
        {sultan ? <section className="panel sultanPanel"><div><p className="eyebrow">{text("Sultan FEP · yalnızca danışman","Sultan FEP · advisory only")}</p><h2>{sultan.recommended_provider_code?.replaceAll("_", " ") ?? text("Elle inceleme gerekli","Manual review required")}</h2><p className="muted">{sultan.provider_reason}</p></div><div><span className={`pill ${sultan.customs_ready ? "good" : "warn"}`}>{sultan.customs_ready ? text("Gümrük kapıları hazır","Customs gates ready") : text(`${sultan.missing_information.length} açık kapı`,`${sultan.missing_information.length} gates open`)}</span><strong>{sultan.pallet_estimate.pallet_count} {text("palet","pallets")} · {sultan.pallet_estimate.freight_mode.replaceAll("_", " ")}</strong><p>{sultan.next_human_action}</p><small>{text("Tüm icra izinleri","All execution permissions")}: {Object.values(sultan.authority).some(Boolean) ? text("inceleme gerekli","review required") : "false"}</small></div></section> : null}
        <section className="panel" id="orders"><div className="panelHeader"><div><p className="eyebrow">{text("FedEx tarzı olay geçmişi","FedEx-style event history")}</p><h2>{text("Aktif sipariş akışı","Active order pipeline")}</h2></div></div><div className="orderTable">{snapshot?.recent_orders.map(order => <article key={order.id}><div><strong>{order.tracking_number}</strong><span>{order.source}{order.source_order_id ? ` · ${order.source_order_id}` : ""} · {order.destination_city ?? "USA"}</span></div><span className="pill neutral">{order.state.replaceAll("_", " ")}</span><select aria-label={`${text("İlerle","Advance")} ${order.tracking_number}`} defaultValue="" onChange={event => { if (event.target.value) void advance(order.id, event.target.value); }} disabled={busy}><option value="">{text("Sonraki durum…","Next status…")}</option>{(transitions[order.state] ?? []).map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select><div className="orderActions"><button className="secondary" onClick={() => setSelectedOrderId(order.id)}>{text("Operasyonu aç","Open ops")}</button><button className="secondary" onClick={() => void recommend(order.id)} disabled={busy}>{text("Sultan'a sor","Ask Sultan")}</button></div></article>)}{!snapshot?.recent_orders.length ? <p className="emptyState">{text("Henüz sipariş yok.","No orders yet.")}</p> : null}</div></section>
        {selectedOrderId ? <OrderExecutionPanel orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} onChanged={load} /> : null}
        <TrackingPanel onTrack={track} tracking={tracking} />
      </div></div>
  </main>;
}

function TrackingPanel({ onTrack, tracking }: { onTrack: (event: FormEvent<HTMLFormElement>) => Promise<void>; tracking: TrackingResult | null }) {
  const {locale,text}=useLanguage();
  return <section className="panel trackingPanel" id="tracking"><div><p className="eyebrow">{text("Müşteri görünürlüğü","Customer visibility")}</p><h2>{text("Gel Öz siparişini takip et","Track a Gel Öz order")}</h2><form onSubmit={onTrack} className="trackForm"><input required name="tracking_number" placeholder="GOZ-26-…" /><button>{text("Takip et","Track")}</button></form></div>{tracking ? <div className="timeline"><strong>{tracking.tracking_number}</strong><span className="pill good">{tracking.state.replaceAll("_", " ")}</span>{tracking.events.map(event => <article key={`${event.state}-${event.event_at}`}><b>{event.state.replaceAll("_", " ")}</b><span>{event.message}</span><small>{new Date(event.event_at).toLocaleString(locale)}</small></article>)}</div> : <p className="emptyState">{text("Müşteriye gösterilen doğrulanmış kilometre taşlarını görmek için takip numarası girin.","Enter a tracking number to see sanitized customer-facing milestones.")}</p>}</section>;
}
