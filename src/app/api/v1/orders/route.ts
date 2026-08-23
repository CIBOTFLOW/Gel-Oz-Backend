import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const body = await request.json();
    const result = await fepRequest("/rest/v1/rpc/go_intake_order", {
      method: "POST",
      body: JSON.stringify({ p_payload: body, p_idempotency_key: request.headers.get("idempotency-key") ?? randomUUID() }),
    }, token);
    return NextResponse.json({ data: result, receipt: { authoritative: "FEP_SUPABASE", effect: "ORDER_CREATED" } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Order intake failed" }, { status: 400 });
  }
}
