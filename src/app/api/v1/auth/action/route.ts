import { NextResponse } from "next/server";
import { fepAuth, SupabaseApiError } from "@/lib/fep-supabase";

export async function POST(request: Request) {
  try {
    const { action, email } = await request.json();
    const normalizedEmail = String(email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalizedEmail)) return NextResponse.json({ error: "Geçerli bir e-posta adresi girin." }, { status: 400 });
    const redirect = new URL("/auth/callback", request.url).toString();
    if (action === "resend-confirmation") await fepAuth.resendConfirmation(normalizedEmail, redirect);
    else if (action === "recover-password") await fepAuth.recoverPassword(normalizedEmail, redirect);
    else return NextResponse.json({ error: "Desteklenmeyen hesap işlemi." }, { status: 400 });
    return NextResponse.json({ message: action === "resend-confirmation" ? "Doğrulama e-postası yeniden gönderildi." : "Parola yenileme e-postası gönderildi." });
  } catch (error) {
    const status = error instanceof SupabaseApiError ? Math.min(Math.max(error.status, 400), 499) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Hesap işlemi başarısız." }, { status });
  }
}
