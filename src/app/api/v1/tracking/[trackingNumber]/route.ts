import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";

export async function GET(_: Request, context: { params: Promise<{ trackingNumber: string }> }) {
  try {
    const { trackingNumber } = await context.params;
    const data = await fepRequest("/rest/v1/rpc/go_public_tracking", { method: "POST", body: JSON.stringify({ p_tracking_number: trackingNumber }) });
    if (!data) return NextResponse.json({ error: "Tracking number not found" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tracking lookup failed" }, { status: 400 });
  }
}
