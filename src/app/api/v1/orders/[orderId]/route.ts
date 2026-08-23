import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function GET(_: Request, context: { params: Promise<{ orderId: string }> }) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { orderId } = await context.params;
    const data = await fepRequest("/rest/v1/rpc/go_order_operations", {
      method: "POST", body: JSON.stringify({ p_order_id: orderId }),
    }, token);
    if (!data) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load order operations" }, { status: 400 });
  }
}
