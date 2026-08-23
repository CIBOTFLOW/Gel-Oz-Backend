import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
  try {
    const profile = await request.json();
    const data = await fepRequest("/rest/v1/rpc/go_customer_save_profile", {
      method: "POST",
      body: JSON.stringify({ p_profile: profile, p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID() }),
    }, token);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Profil kaydedilemedi." }, { status: 400 });
  }
}
