import { NextResponse } from "next/server";
import { fepRequest, SupabaseApiError } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function GET() {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
  try {
    await fepRequest("/rest/v1/rpc/go_claim_customer_records", { method: "POST", body: "{}" }, token);
    const data = await fepRequest("/rest/v1/rpc/go_customer_dashboard", { method: "POST", body: "{}" }, token);
    return NextResponse.json({ data });
  } catch (error) {
    const status = error instanceof SupabaseApiError && (error.status === 401 || error.status === 403) ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Müşteri paneli yüklenemedi." }, { status });
  }
}
