import { NextResponse } from "next/server";
import { clearOperatorSession, operatorToken, setOperatorSession } from "@/lib/operator-session";
import { fepAuth, SupabaseApiError } from "@/lib/fep-supabase";

export async function GET() {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ authenticated: false });
  try {
    const user = await fepAuth.user(token);
    return NextResponse.json({ authenticated: true, user });
  } catch {
    await clearOperatorSession();
    return NextResponse.json({ authenticated: false });
  }
}

export async function POST(request: Request) {
  try {
    const { email, password, mode = "sign-in" } = await request.json();
    if (!email || !password || String(password).length < 8) return NextResponse.json({ error: "Email and an 8+ character password are required." }, { status: 400 });
    const callback = new URL("/auth/callback", request.url).toString();
    const session = mode === "sign-up" ? await fepAuth.signUp(email, password, callback) : await fepAuth.signIn(email, password);
    if (!session.access_token) return NextResponse.json({ pendingConfirmation: true, message: "Hesabınızı doğrulamak için e-postanızdaki bağlantıya tıklayın, ardından giriş yapın." }, { status: 202 });
    await setOperatorSession(session.access_token, session.refresh_token, session.expires_in);
    return NextResponse.json({ authenticated: true, user: session.user });
  } catch (error) {
    const status = error instanceof SupabaseApiError ? Math.min(Math.max(error.status, 400), 499) : 500;
    const message = error instanceof SupabaseApiError && error.code === "email_not_confirmed"
      ? "E-posta adresiniz henüz doğrulanmadı. Doğrulama e-postasını yeniden gönderin ve gelen bağlantıya tıklayın."
      : error instanceof SupabaseApiError && error.code === "invalid_credentials"
        ? "E-posta veya parola hatalı. Parolanızı unuttuysanız yenileme bağlantısı isteyin."
        : error instanceof Error ? error.message : "Giriş başarısız";
    return NextResponse.json({ error: message, code: error instanceof SupabaseApiError ? error.code : undefined }, { status });
  }
}

export async function DELETE() {
  await clearOperatorSession();
  return NextResponse.json({ authenticated: false });
}
