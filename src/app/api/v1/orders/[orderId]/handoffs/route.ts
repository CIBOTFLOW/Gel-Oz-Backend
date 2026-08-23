import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { orderId } = await context.params;
    const body = await request.json();
    const data = await fepRequest("/rest/v1/rpc/go_plan_manual_handoff", {
      method: "POST",
      body: JSON.stringify({ p_order_id: orderId, p_provider: body.provider, p_operation: body.operation, p_idempotency_key: request.headers.get("idempotency-key") ?? randomUUID() }),
    }, token);
    return NextResponse.json({ data, receipt: { authoritative: "FEP_SUPABASE", effect: "HANDOFF_PLANNED", external_effect: false } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to plan provider handoff" }, { status: 400 });
  }
}
