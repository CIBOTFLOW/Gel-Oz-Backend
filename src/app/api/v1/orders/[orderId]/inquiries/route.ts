import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { orderId } = await context.params;
    const body = await request.json();
    const data = await fepRequest("/rest/v1/rpc/go_create_customer_inquiry", {
      method: "POST",
      body: JSON.stringify({ p_order_id: orderId, p_channel: body.channel, p_category: body.category, p_subject: body.subject, p_summary: body.summary }),
    }, token);
    return NextResponse.json({ data, receipt: { authoritative: "FEP_SUPABASE", effect: "CUSTOMER_INQUIRY_RECORDED" } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to record inquiry" }, { status: 400 });
  }
}
