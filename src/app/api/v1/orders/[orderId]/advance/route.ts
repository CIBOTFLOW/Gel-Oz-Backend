import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { orderId } = await context.params;
    const body = await request.json();
    const result = await fepRequest("/rest/v1/rpc/go_advance_order", {
      method: "POST",
      body: JSON.stringify({ p_order_id: orderId, p_to_state: body.to_state, p_customer_message: body.customer_message ?? null, p_internal_detail: body.internal_detail ?? null }),
    }, token);
    return NextResponse.json({ data: result, receipt: { authoritative: "FEP_SUPABASE", effect: "TRACKING_EVENT_RECORDED" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to advance order" }, { status: 400 });
  }
}
