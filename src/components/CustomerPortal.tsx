"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Profile = { email: string; full_name: string | null; company_name: string | null; phone: string | null; locale: string; notification_preferences: Record<string, boolean> };
type FirmOffer = { id: string; version: number; state: string; currency: string; supplier_cost_minor: number; gel_oz_fee_minor: number; total_minor: number; line_items: Array<{ provider_code: string; segment: string; amount_minor: number }>; terms: { deposit_percent?: number; duties_and_taxes?: string; provider_booking?: string; notes?: string }; valid_until: string; sent_at: string | null; accepted_at: string | null };
type Quote = { id: string; quote_number: string; state: string; cargo_description: string; origin: { country_code: string; city: string }; destination: { city: string; state: string; postal_code?: string }; pieces: number; weight_kg: number; cubic_meters: number; requested_at: string; options: Array<{ mode: string; arrival_port: string; transit_days_min: number; transit_days_max: number; total_minor: number; is_recommended: boolean }>; offers: FirmOffer[] };
type Order = { id: string; tracking_number: string; customer_reference: string | null; state: string; service_level: string; origin: Record<string,string>; destination: Record<string,string>; promised_delivery_at: string | null; created_at: string; events: Array<{ state: string; message: string; event_at: string; city?: string }> };
type Document = { id: string; order_id: string; document_type: string; status: string; version: number; is_required: boolean; updated_at: string };
type Inquiry = { id: string; order_id: string; category: string; state: string; subject: string; summary: string; created_at: string };
type Dashboard = { profile: Profile; summary: { active_orders: number; open_quotes: number; documents_needed: number; open_inquiries: number }; quotes: Quote[]; orders: Order[]; documents: Document[]; inquiries: Inquiry[] };

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "İşlem tamamlanamadı.");
  return payload as T;
}

const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const states: Record<string,string> = {
  ESTIMATE_REQUESTED: "Teklif inceleniyor", SOURCING_RATES: "Taşıyıcı fiyatları toplanıyor", FIRM_QUOTE_SENT: "Kesin teklif hazır", ACCEPTED: "Kabul edildi", EXPIRED: "Süresi doldu", VOID: "Geçersiz",
  ORDER_RECEIVED: "Sipariş alındı", AWAITING_SUPPLIER: "Tedarikçi bekleniyor",
  INBOUND_TO_ORIGIN_HUB: "Çıkış merkezine geliyor", RECEIVED_ORIGIN_HUB: "Çıkış merkezinde", QUALITY_CONTROL: "Kalite kontrol",
  REPACKAGING: "Yeniden paketleniyor", CONSOLIDATION_PLANNING: "Konsolidasyon planlanıyor", PALLETIZED: "Paletlendi",
  BOOKED: "Rezervasyon yapıldı", EXPORT_CUSTOMS: "İhracat gümrüğünde", ORIGIN_DEPARTED: "Çıkış yaptı", IN_TRANSIT: "Yolda",
  IMPORT_CUSTOMS: "ABD gümrüğünde", DESTINATION_HUB: "Varış merkezinde", OUT_FOR_DELIVERY: "Dağıtımda", DELIVERED: "Teslim edildi",
  EXCEPTION: "İnceleme gerekiyor", OPEN: "Açık", VERIFIED: "Doğrulandı", MISSING: "Eksik", RECEIVED: "Alındı",
};
const label = (value: string) => states[value] ?? value.replaceAll("_", " ");

export default function CustomerPortal() {
  const [status, setStatus] = useState<"loading"|"signed-out"|"ready">("loading");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await jsonFetch<{ data: Dashboard }>("/api/v1/customer/dashboard");
      setDashboard(result.data); setStatus("ready"); setMessage("");
    } catch (error) {
      if (error instanceof Error && error.message.includes("Giriş")) setStatus("signed-out");
      else { setStatus("signed-out"); setMessage(error instanceof Error ? error.message : "Panel yüklenemedi."); }
    }
  }, []);

  useEffect(() => { setRecovery(window.location.hash === "#parola-yenile"); void load(); }, [load]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await jsonFetch<{ pendingConfirmation?: boolean; message?: string }>("/api/v1/auth/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password"), mode: form.get("mode") }) });
      if (result.pendingConfirmation) { setNotice(result.message ?? "E-postanızı doğrulayın."); return; }
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Giriş başarısız."); }
    finally { setBusy(false); }
  }

  async function accountAction(action: "resend-confirmation"|"recover-password", form: HTMLFormElement) {
    const email = String(new FormData(form).get("email") ?? "");
    setBusy(true); setMessage(""); setNotice("");
    try {
      const result = await jsonFetch<{ message: string }>("/api/v1/auth/action", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, email }) });
      setNotice(result.message);
    } catch (error) { setMessage(error instanceof Error ? error.message : "İşlem tamamlanamadı."); }
    finally { setBusy(false); }
  }

  if (status === "loading") return <main className="customerApp loadingCustomer"><div className="customerLoading"><span>GÖ</span><p>Müşteri hesabınız hazırlanıyor…</p></div></main>;
  if (status === "signed-out") return <main className="customerAuth"><a className="publicBrand" href="/"><span>GÖ</span><div><strong>Gel Öz</strong><small>Ana sayfaya dön</small></div></a><section className="customerAuthCopy"><p className="eyebrow">Tüm lojistiğiniz, tek hesapta</p><h1>Tekliften teslimata kadar görünürlük.</h1><p>Tekliflerinizi, aktif siparişlerinizi, gümrük belgelerinizi ve teslimat adımlarını güvenli Gel Öz hesabınızdan izleyin.</p><div><span>01</span> Teklif geçmişi ve rota seçenekleri</div><div><span>02</span> Tek Gel Öz takip numarası</div><div><span>03</span> Belge ve destek merkezi</div></section><section className="customerAuthCard"><p className="eyebrow">Müşteri girişi</p><h2>Hesabınıza erişin</h2><p>Teklif verirken kullandığınız e-postayla hesap açarsanız geçmiş kayıtlarınız otomatik bağlanır.</p><form className="stackForm" onSubmit={authenticate}><label>E-posta<input required name="email" type="email" defaultValue="hello@ciflow.io" /></label><label>Parola<input required minLength={8} name="password" type="password" /></label><div className="buttonRow"><button name="mode" value="sign-in" disabled={busy}>Giriş yap</button><button className="secondary" name="mode" value="sign-up" disabled={busy}>Hesap oluştur</button></div><div className="authHelp"><button type="button" onClick={event => void accountAction("resend-confirmation", event.currentTarget.form!)} disabled={busy}>Doğrulama e-postasını gönder</button><button type="button" onClick={event => void accountAction("recover-password", event.currentTarget.form!)} disabled={busy}>Parolamı unuttum</button></div></form>{notice ? <p className="successText">{notice}</p> : null}{message ? <p className="errorText">{message}</p> : null}<small>Personel misiniz? <a href="/operations">Operasyon merkezine gidin →</a></small></section></main>;

  if (!dashboard) return null;
  return <main className="customerApp">
    <header className="customerTop"><a className="publicBrand" href="/"><span>GÖ</span><div><strong>Gel Öz</strong><small>Müşteri merkezi</small></div></a><nav><a href="#overview">Özet</a><a href="#orders">Gönderiler</a><a href="#quotes">Teklifler</a><a href="#documents">Belgeler</a><a href="#support">Destek</a></nav><div className="customerIdentity"><span>{dashboard.profile.email}</span><button className="secondary" onClick={async()=>{ await fetch("/api/v1/auth/session",{method:"DELETE"}); setStatus("signed-out"); setDashboard(null); }}>Çıkış</button></div></header>
    <div className="customerShell"><aside className="customerSide"><p className="asideLabel">Hesabım</p><a className="selected" href="#overview">Genel bakış</a><a href="#orders">Gönderiler <span>{dashboard.summary.active_orders}</span></a><a href="#quotes">Teklifler <span>{dashboard.summary.open_quotes}</span></a><a href="#documents">Belgeler <span className={dashboard.summary.documents_needed ? "danger" : ""}>{dashboard.summary.documents_needed}</span></a><a href="#support">Destek <span>{dashboard.summary.open_inquiries}</span></a><div className="customerPromise"><small>Gel Öz görünürlük sözü</small><strong>Her teslimat için tek kayıt.</strong><p>Tedarikçi kapısından son adrese kadar doğrulanmış kilometre taşları.</p></div></aside>
      <div className="customerContent" id="overview"><section className="customerWelcome"><div><p className="eyebrow">Müşteri kontrol merkezi</p><h1>Merhaba, {dashboard.profile.full_name || dashboard.profile.company_name || dashboard.profile.email.split("@")[0]}.</h1><p>Aktif işlerinizi, bekleyen belgelerinizi ve Gel Öz ekibiyle görüşmelerinizi burada yönetin.</p></div><a className="primaryLink" href="/#calculator">Yeni teklif al →</a></section>
        {recovery ? <RecoveryPanel onSaved={()=>{setRecovery(false);setNotice("Parolanız güncellendi. Yeni parolanızla giriş yapabilirsiniz.");history.replaceState(null,"","/musteri");}} onError={setMessage}/> : null}
        {notice ? <div className="customerNotice">{notice}</div> : null}{message ? <div className="publicAlert">{message}</div> : null}
        <section className="customerSignals">{[["Aktif gönderi",dashboard.summary.active_orders,"Uçtan uca takip"],["Açık teklif",dashboard.summary.open_quotes,"Rota karşılaştırması"],["Gereken belge",dashboard.summary.documents_needed,"Gümrük hazırlığı"],["Açık destek",dashboard.summary.open_inquiries,"Gel Öz ekibi"]].map(([title,value,hint])=><article key={String(title)}><span>{title}</span><strong>{value}</strong><small>{hint}</small></article>)}</section>

        <section className="customerPanel" id="orders"><div className="customerPanelHead"><div><p className="eyebrow">Uçtan uca gönderiler</p><h2>Sipariş ve teslimat takibi</h2></div><a href="/#track">Numarayla takip et</a></div>{dashboard.orders.length ? <div className="customerOrderList">{dashboard.orders.map(order=><article key={order.id}><div className="orderLead"><span className="statusDot"/><div><strong>{order.tracking_number}</strong><small>{order.origin.city || order.origin.country_code} → {order.destination.city || "ABD"} · {order.service_level.replaceAll("_"," ")}</small></div></div><div><span className="customerPill">{label(order.state)}</span>{order.promised_delivery_at ? <small>Tahmini teslimat {new Date(order.promised_delivery_at).toLocaleDateString("tr-TR")}</small> : <small>Tarih planlanıyor</small>}</div><details><summary>Kilometre taşlarını aç</summary>{order.events.length ? <div className="customerTimeline">{order.events.map(event=><div key={`${event.state}-${event.event_at}`}><b>{label(event.state)}</b><p>{event.message}</p><small>{new Date(event.event_at).toLocaleString("tr-TR")}{event.city ? ` · ${event.city}` : ""}</small></div>)}</div>:<p className="muted">İlk operasyon olayı bekleniyor.</p>}</details></article>)}</div>:<Empty title="Henüz aktif gönderiniz yok" copy="Onaylanan teklifiniz siparişe dönüştüğünde takip numarası ve kilometre taşları burada görünür." action="Teklif hesapla" href="/#calculator"/>}</section>

        <section className="customerPanel" id="quotes"><div className="customerPanelHead"><div><p className="eyebrow">Şeffaf maliyet</p><h2>Tekliflerim</h2></div><a href="/#calculator">Yeni teklif</a></div>{dashboard.quotes.length ? <div className="customerQuoteList">{dashboard.quotes.map(quote=>{const option=quote.options.find(item=>item.is_recommended)??quote.options[0];const offer=quote.offers?.find(item=>item.state==="SENT")??quote.offers?.[0];return <article className={offer?.state==="SENT"?"firmOfferReady":""} key={quote.id}><div><strong>{quote.quote_number}</strong><span className="customerPill">{label(quote.state)}</span><p>{quote.cargo_description}</p><small>{quote.origin.city} → {quote.destination.city}, {quote.destination.state} · {quote.pieces} parça · {Number(quote.cubic_meters).toFixed(2)} m³</small>{offer?<OfferAcceptance quote={quote} offer={offer} profile={dashboard.profile} onAccepted={async receipt=>{setNotice(`Teklif kabul edildi. Takip numaranız: ${receipt.tracking_number}`);await load();}} onError={setMessage}/>:null}</div><div className="quoteBest"><small>{offer?`Gel Öz kesin teklif · v${offer.version}`:option ? `${option.mode.replaceAll("_"," ")} · ${option.arrival_port}` : "Rota hazırlanıyor"}</small><strong>{offer?money.format(offer.total_minor/100):option ? money.format(option.total_minor/100) : "—"}</strong><span>{offer?`${new Date(offer.valid_until).toLocaleDateString("tr-TR")} tarihine kadar geçerli`:option ? `${option.transit_days_min}–${option.transit_days_max} planlama günü` : "Operasyon incelemesinde"}</span></div></article>})}</div>:<Empty title="Henüz teklifiniz yok" copy="Türkiye veya İtalya'dan ABD'ye EXW teslimat için rotaları karşılaştırın ve tedarikçi destekli teklif isteyin." action="İlk teklifimi hesapla" href="/#calculator"/>}</section>

        <section className="customerPanel" id="documents"><div className="customerPanelHead"><div><p className="eyebrow">Gümrük hazırlığı</p><h2>Belge merkezi</h2></div><span>Dosyalar operasyon ekibi tarafından doğrulanır</span></div>{dashboard.documents.length?<div className="documentGrid">{dashboard.documents.map(document=><article key={document.id}><span>{document.document_type.replaceAll("_"," ")}</span><strong>{label(document.status)}</strong><small>v{document.version} · {new Date(document.updated_at).toLocaleDateString("tr-TR")}</small>{document.is_required?<b>Zorunlu</b>:<b>Destekleyici</b>}</article>)}</div>:<Empty title="Belge talebi bulunmuyor" copy="Ticari fatura, paketleme listesi, menşe ve gümrük belgeleri gerektiğinde burada listelenecek."/>}</section>

        <SupportPanel orders={dashboard.orders} inquiries={dashboard.inquiries} onCreated={async()=>{setNotice("Destek talebiniz Gel Öz operasyon ekibine ulaştı.");await load();}} onError={setMessage}/>
        <ProfilePanel profile={dashboard.profile} onSaved={async()=>{setNotice("Hesap bilgileriniz kaydedildi.");await load();}} onError={setMessage}/>
      </div>
    </div>
  </main>;
}

function Empty({title,copy,action,href}:{title:string;copy:string;action?:string;href?:string}) { return <div className="customerEmpty"><span>GÖ</span><h3>{title}</h3><p>{copy}</p>{action&&href?<a href={href}>{action} →</a>:null}</div>; }

function OfferAcceptance({quote,offer,profile,onAccepted,onError}:{quote:Quote;offer:FirmOffer;profile:Profile;onAccepted:(receipt:{tracking_number:string})=>Promise<void>;onError:(message:string)=>void}) {
  const [busy,setBusy]=useState(false);
  if(offer.state!=="SENT") return <div className="acceptedOffer"><b>{label(offer.state)}</b><span>{offer.accepted_at?new Date(offer.accepted_at).toLocaleString("tr-TR"):"Bu teklif artık işlem beklemiyor."}</span></div>;
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);onError("");const form=new FormData(event.currentTarget);try{const result=await jsonFetch<{data:{tracking_number:string}}>(`/api/v1/customer/offers/${offer.id}/accept`,{method:"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({name:form.get("name"),phone:form.get("phone"),address_line_1:form.get("address_line_1"),address_line_2:form.get("address_line_2"),service_level:form.get("service_level")})});await onAccepted(result.data);}catch(error){onError(error instanceof Error?error.message:"Teklif kabul edilemedi.");}finally{setBusy(false)}}
  return <details className="offerAcceptance"><summary>Kesin teklif ayrıntıları ve onay →</summary><div className="offerBreakdown"><div><span>Doğrulanmış taşıma ve hizmet maliyeti</span><strong>{money.format(offer.supplier_cost_minor/100)}</strong></div><div><span>Gel Öz uçtan uca koordinasyon bedeli</span><strong>{money.format(offer.gel_oz_fee_minor/100)}</strong></div><div><span>Toplam</span><strong>{money.format(offer.total_minor/100)}</strong></div></div><div className="offerScope">{offer.line_items.map(item=><span key={`${item.segment}-${item.provider_code}`}>{item.segment.replaceAll("_"," ")} · {item.provider_code}</span>)}</div><p className="offerTerms">%{offer.terms.deposit_percent??50} ön ödeme ile operasyon başlar. Vergi ve gümrük vergileri ayrıca yazılmadıkça dahil değildir. Taşıyıcı rezervasyonu Gel Öz operasyon ekibinin insan onayından sonra kesinleşir.</p><form className="acceptOfferForm" onSubmit={submit}><label>Alıcı adı<input required name="name" defaultValue={profile.full_name??""}/></label><label>Telefon<input required name="phone" defaultValue={profile.phone??""}/></label><label className="wide">Teslimat adresi<input required minLength={5} name="address_line_1" placeholder="Sokak, bina ve daire"/></label><label className="wide">Adres devamı<input name="address_line_2" placeholder="Opsiyonel"/></label><label>Son teslimat hizmeti<select name="service_level" defaultValue="WHITE_GLOVE"><option value="WHITE_GLOVE">White glove</option><option value="ROOM_OF_CHOICE">Odaya teslim</option><option value="THRESHOLD">Kapı eşiği</option><option value="LTL">LTL</option><option value="FTL">FTL</option><option value="PARCEL">Paket</option></select></label><label className="acceptConfirm"><input required type="checkbox"/> <span>{money.format(offer.total_minor/100)} tutarındaki v{offer.version} teklifi ve yukarıdaki koşulları onaylıyorum.</span></label><button disabled={busy}>{busy?"Sipariş oluşturuluyor…":"Teklifi kabul et ve takip numarası oluştur"}</button><small>{quote.destination.city}, {quote.destination.state} {quote.destination.postal_code} teslimatı için.</small></form></details>;
}

function RecoveryPanel({onSaved,onError}:{onSaved:()=>void;onError:(message:string)=>void}) {
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);onError("");const form=new FormData(event.currentTarget);const password=String(form.get("password")??"");const confirm=String(form.get("confirm")??"");if(password!==confirm){onError("Parolalar eşleşmiyor.");setBusy(false);return;}try{await jsonFetch("/api/v1/auth/password",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password})});onSaved();}catch(error){onError(error instanceof Error?error.message:"Parola güncellenemedi.");}finally{setBusy(false)}}
  return <section className="customerPanel recoveryPanel"><div><p className="eyebrow">Güvenli hesap işlemi</p><h2>Yeni parolanızı belirleyin</h2><p>En az 8 karakter kullanın. Bu işlem mevcut kurtarma oturumunuz doğrulandıktan sonra yapılır.</p></div><form onSubmit={submit}><label>Yeni parola<input required minLength={8} maxLength={128} name="password" type="password" autoComplete="new-password"/></label><label>Yeni parola tekrar<input required minLength={8} maxLength={128} name="confirm" type="password" autoComplete="new-password"/></label><button disabled={busy}>{busy?"Güncelleniyor…":"Parolayı güncelle"}</button></form></section>;
}

function SupportPanel({orders,inquiries,onCreated,onError}:{orders:Order[];inquiries:Inquiry[];onCreated:()=>Promise<void>;onError:(message:string)=>void}) {
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);onError("");const form=new FormData(event.currentTarget);try{await jsonFetch("/api/v1/customer/inquiries",{method:"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({order_id:form.get("order_id"),category:form.get("category"),subject:form.get("subject"),message:form.get("message")})});event.currentTarget.reset();await onCreated();}catch(error){onError(error instanceof Error?error.message:"Destek talebi açılamadı.");}finally{setBusy(false)}}
  return <section className="customerPanel" id="support"><div className="customerPanelHead"><div><p className="eyebrow">Bize ulaşın</p><h2>Destek merkezi</h2></div><span>Takip · teslimat · gümrük · hasar</span></div>{orders.length?<form className="supportForm" onSubmit={submit}><label>Gönderi<select required name="order_id"><option value="">Seçin…</option>{orders.map(order=><option key={order.id} value={order.id}>{order.tracking_number}</option>)}</select></label><label>Konu türü<select name="category" defaultValue="WISMO"><option value="WISMO">Takip</option><option value="CHANGE_DELIVERY">Teslimat değişikliği</option><option value="CUSTOMS">Gümrük</option><option value="MISSING">Eksik ürün/belge</option><option value="DAMAGE">Hasar</option><option value="BILLING">Faturalama</option><option value="OTHER">Diğer</option></select></label><label className="wide">Konu<input required minLength={2} maxLength={140} name="subject"/></label><label className="wide">Mesaj<textarea required minLength={2} maxLength={2000} name="message"/></label><button disabled={busy}>{busy?"Gönderiliyor…":"Talep oluştur"}</button></form>:<p className="emptyState">Destek talebini belirli bir gönderiye bağlamak için önce aktif bir sipariş gerekir.</p>}{inquiries.length?<div className="inquiryList">{inquiries.map(item=><article key={item.id}><div><strong>{item.subject}</strong><small>{item.category} · {new Date(item.created_at).toLocaleDateString("tr-TR")}</small></div><span className="customerPill">{label(item.state)}</span></article>)}</div>:null}</section>;
}

function ProfilePanel({profile,onSaved,onError}:{profile:Profile;onSaved:()=>Promise<void>;onError:(message:string)=>void}) {
  const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);onError("");const form=new FormData(event.currentTarget);try{await jsonFetch("/api/v1/customer/profile",{method:"POST",headers:{"content-type":"application/json","idempotency-key":crypto.randomUUID()},body:JSON.stringify({full_name:form.get("full_name"),company_name:form.get("company_name"),phone:form.get("phone"),locale:form.get("locale"),notifications:{email:form.get("email_notifications")==="on",milestones:form.get("milestones")==="on",exceptions:form.get("exceptions")==="on"}})});await onSaved();}catch(error){onError(error instanceof Error?error.message:"Profil kaydedilemedi.");}finally{setBusy(false)}}
  return <section className="customerPanel profilePanel" id="profile"><div className="customerPanelHead"><div><p className="eyebrow">Hesap tercihleri</p><h2>Profil ve bildirimler</h2></div><span>{profile.email}</span></div><form className="profileForm" onSubmit={submit}><label>Ad soyad<input name="full_name" defaultValue={profile.full_name??""}/></label><label>Şirket<input name="company_name" defaultValue={profile.company_name??""}/></label><label>Telefon<input name="phone" defaultValue={profile.phone??""}/></label><label>Dil<select name="locale" defaultValue={profile.locale??"tr-TR"}><option value="tr-TR">Türkçe</option><option value="en-US">English</option></select></label><div className="profileChecks"><label><input type="checkbox" name="email_notifications" defaultChecked={profile.notification_preferences?.email!==false}/> E-posta bildirimleri</label><label><input type="checkbox" name="milestones" defaultChecked={profile.notification_preferences?.milestones!==false}/> Kilometre taşları</label><label><input type="checkbox" name="exceptions" defaultChecked={profile.notification_preferences?.exceptions!==false}/> İstisnalar</label></div><button disabled={busy}>{busy?"Kaydediliyor…":"Tercihleri kaydet"}</button></form></section>;
}
