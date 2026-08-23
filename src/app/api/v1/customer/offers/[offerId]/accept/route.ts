import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fepRequest, SupabaseApiError } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request, context: { params: Promise<{ offerId: string }> }) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
  try {
    const { offerId } = await context.params;
    const body = await request.json();
    const data = await fepRequest("/rest/v1/rpc/go_customer_accept_offer", {
      method: "POST",
      body: JSON.stringify({
        p_offer_id: offerId,
        p_delivery: body,
        p_idempotency_key: request.headers.get("idempotency-key") ?? randomUUID(),
      }),
    }, token);
    return NextResponse.json({ data, receipt: { authoritative: "FEP_SUPABASE", effect: "OFFER_ACCEPTED_ORDER_CREATED" } }, { status: 201 });
  } catch (error) {
    const status = error instanceof SupabaseApiError && (error.status === 401 || error.status === 403) ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Teklif kabul edilemedi." }, { status });
  }
}
