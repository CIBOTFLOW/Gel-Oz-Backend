import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { fepServiceRequest } from "@/lib/fep-supabase";

const INTAKE_SECRET = process.env.GEL_OZ_INTAKE_WEBHOOK_SECRET;
const DEFAULT_TENANT_ID = process.env.GEL_OZ_DEFAULT_TENANT_ID ?? "0dacaac2-2f26-436d-af15-7dfd9fd3706d";
const allowedSources = new Set(["LUZIONE", "SHOPIFY", "FEP", "API", "OTHER"]);

function validSignature(rawBody: string, timestamp: string, supplied: string) {
  if (!INTAKE_SECRET || !/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const ageMs = Math.abs(Date.now() - Number(timestamp) * 1000);
  if (ageMs > 5 * 60 * 1000) return false;
  const expected = createHmac("sha256", INTAKE_SECRET).update(`${timestamp}.${rawBody}`).digest();
  const received = Buffer.from(supplied, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function POST(request: Request) {
  if (!INTAKE_SECRET || !DEFAULT_TENANT_ID) return NextResponse.json({ error: "Integration intake is not configured" }, { status: 503 });
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-gel-oz-timestamp") ?? "";
  const signature = request.headers.get("x-gel-oz-signature") ?? "";
  if (!validSignature(rawBody, timestamp, signature)) return NextResponse.json({ error: "Invalid or stale intake signature" }, { status: 401 });
  try {
    const payload = JSON.parse(rawBody);
    const source = String(payload.source ?? request.headers.get("x-gel-oz-source") ?? "API").toUpperCase();
    if (!allowedSources.has(source)) return NextResponse.json({ error: "Unsupported intake source" }, { status: 400 });
    if (!payload.source_order_id) return NextResponse.json({ error: "source_order_id is required" }, { status: 400 });
    const normalized = { ...payload, tenant_id: DEFAULT_TENANT_ID, source };
    const data = await fepServiceRequest("/rest/v1/rpc/go_intake_order", {
      method: "POST",
      body: JSON.stringify({ p_payload: normalized, p_idempotency_key: `${source}:${payload.source_order_id}` }),
    });
    return NextResponse.json({ data, receipt: { authoritative: "FEP_SUPABASE", effect: "ORDER_CREATED", source } }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Integration intake failed" }, { status: 400 });
  }
}
