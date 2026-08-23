import { NextResponse } from "next/server";
import { clearOperatorSession, operatorToken, setOperatorSession } from "@/lib/operator-session";
import { fepAuth, SupabaseApiError } from "@/lib/fep-supabase";

export async function GET() {
  return NextResponse.json({ authenticated: Boolean(await operatorToken()) });
}

export async function POST(request: Request) {
  try {
    const { email, password, mode = "sign-in" } = await request.json();
    if (!email || !password || String(password).length < 8) return NextResponse.json({ error: "Email and an 8+ character password are required." }, { status: 400 });
    const session = mode === "sign-up" ? await fepAuth.signUp(email, password) : await fepAuth.signIn(email, password);
    if (!session.access_token) return NextResponse.json({ pendingConfirmation: true, message: "Check your email to confirm the account, then sign in." }, { status: 202 });
    await setOperatorSession(session.access_token, session.refresh_token, session.expires_in);
    return NextResponse.json({ authenticated: true, user: session.user });
  } catch (error) {
    const status = error instanceof SupabaseApiError ? Math.min(Math.max(error.status, 400), 499) : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Authentication failed" }, { status });
  }
}

export async function DELETE() {
  await clearOperatorSession();
  return NextResponse.json({ authenticated: false });
}
