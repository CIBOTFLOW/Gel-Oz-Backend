import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request, context: { params: Promise<{ workOrderId: string }> }) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { workOrderId } = await context.params;
    const body = await request.json();
    const data = await fepRequest("/rest/v1/rpc/go_set_work_order_state", {
      method: "POST", body: JSON.stringify({ p_work_order_id: workOrderId, p_to_state: body.to_state }),
    }, token);
    return NextResponse.json({ data, receipt: { authoritative: "FEP_SUPABASE", effect: "WORK_ORDER_STATE_CHANGED" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update warehouse work" }, { status: 400 });
  }
}
