import { NextResponse } from "next/server";
import { fepAuth } from "@/lib/fep-supabase";
import { setOperatorSession } from "@/lib/operator-session";

export async function POST(request: Request) {
  try {
    const { access_token, refresh_token, expires_in } = await request.json();
    if (!access_token) return NextResponse.json({ error: "Doğrulama oturumu bulunamadı." }, { status: 400 });
    const user = await fepAuth.user(String(access_token));
    await setOperatorSession(String(access_token), refresh_token ? String(refresh_token) : undefined, Number(expires_in) || 3600);
    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Doğrulama tamamlanamadı." }, { status: 400 });
  }
}
