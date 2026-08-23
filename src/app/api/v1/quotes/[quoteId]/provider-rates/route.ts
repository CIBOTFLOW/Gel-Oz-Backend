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
    const data = await fepRequest("/rest/v1/rpc/go_record_provider_rate", {
      method: "POST",
      body: JSON.stringify({
        p_quote_request_id: quoteId,
        p_rate: body,
        p_idempotency_key: request.headers.get("idempotency-key") ?? randomUUID(),
      }),
    }, token);
    return NextResponse.json({ data, receipt: { authoritative: "FEP_SUPABASE", effect: "PROVIDER_RATE_RECORDED" } }, { status: 201 });
  } catch (error) {
    const status = error instanceof SupabaseApiError && (error.status === 401 || error.status === 403) ? error.status : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Provider rate could not be recorded" }, { status });
  }
}
