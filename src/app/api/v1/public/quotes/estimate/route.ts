import { NextResponse } from "next/server";
import { estimateQuote } from "@/modules/quotes/estimator";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 32_000) return NextResponse.json({ error: "Estimate request is too large." }, { status: 413 });
    const estimate = estimateQuote(await request.json());
    return NextResponse.json({ data: estimate }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to estimate this shipment." }, { status: 400 });
  }
}
