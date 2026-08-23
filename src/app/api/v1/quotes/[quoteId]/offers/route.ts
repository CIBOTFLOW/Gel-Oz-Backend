import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fepRequest, SupabaseApiError } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { quoteId } = await context.params;
    const body = await request.json();
    const data = await fepRequest("/rest/v1/rpc/go_publish_firm_offer", {
      method: "POST",
      body: JSON.stringify({
        p_quote_request_id: quoteId,
        p_rate_ids: Array.isArray(body.rate_ids) ? body.rate_ids : [],
        p_terms: body.terms ?? {},
        p_idempotency_key: request.headers.get("idempotency-key") ?? randomUUID(),
      }),
    }, token);
    return NextResponse.json({ data, receipt: { authoritative: "FEP_SUPABASE", effect: "FIRM_OFFER_PUBLISHED" } }, { status: 201 });
  } catch (error) {
    const status = error instanceof SupabaseApiError && (error.status === 401 || error.status === 403) ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Firm offer could not be published" }, { status });
  }
}
