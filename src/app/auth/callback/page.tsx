"use client";

import { useEffect, useState } from "react";

export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Hesabınız doğrulanıyor…");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const error = hash.get("error_description");
    if (error) { setMessage(error); return; }
    const accessToken = hash.get("access_token");
    if (!accessToken) { setMessage("Doğrulama bağlantısı geçersiz veya süresi dolmuş."); return; }
    void fetch("/api/v1/auth/callback", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ access_token: accessToken, refresh_token: hash.get("refresh_token"), expires_in: hash.get("expires_in") }),
    }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Doğrulama tamamlanamadı.");
      window.location.replace("/musteri");
    }).catch(cause => setMessage(cause instanceof Error ? cause.message : "Doğrulama tamamlanamadı."));
  }, []);

  return <main className="centerCard"><section className="authCard"><p className="eyebrow">Gel Öz müşteri hesabı</p><h1>{message}</h1><p className="muted">Bu sayfayı kapatmadan birkaç saniye bekleyin.</p></section></main>;
}
