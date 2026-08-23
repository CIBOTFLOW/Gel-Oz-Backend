import { NextResponse } from "next/server";
import { fepAuth } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Parola yenileme oturumu bulunamadı." }, { status: 401 });
  try {
    const { password } = await request.json();
    if (typeof password !== "string" || password.length < 8 || password.length > 128) return NextResponse.json({ error: "Yeni parola 8–128 karakter olmalıdır." }, { status: 400 });
    await fepAuth.updatePassword(token, password);
    return NextResponse.json({ message: "Parolanız güncellendi." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Parola güncellenemedi." }, { status: 400 });
  }
}
