import { NextResponse } from "next/server";
import { fepServiceRequest } from "@/lib/fep-supabase";

export async function GET(_: Request, context: { params: Promise<{ trackingNumber: string }> }) {
  try {
    const { trackingNumber } = await context.params;
    const normalized = trackingNumber.trim().toUpperCase();
    if (normalized.length < 6 || normalized.length > 64) {
      return NextResponse.json({ error: "Tracking number not found" }, { status: 404 });
    }
    const data = await fepServiceRequest("/rest/v1/rpc/go_public_tracking", {
      method: "POST",
      body: JSON.stringify({ p_tracking_number: normalized }),
    });
    if (!data) return NextResponse.json({ error: "Tracking number not found" }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Tracking lookup failed" }, { status: 400 });
  }
}
