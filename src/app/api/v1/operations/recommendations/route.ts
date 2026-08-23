import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

const SULTAN_FEP_URL = process.env.SULTAN_FEP_URL;
const SULTAN_FEP_SERVICE_TOKEN = process.env.SULTAN_FEP_SERVICE_TOKEN;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

const sha256 = (value: unknown) => `sha256:${createHash("sha256").update(canonical(value)).digest("hex")}`;

type OrderRow = { id: string; tenant_id: string; state: string; service_level: string; incoterm: string | null; origin: Record<string, string>; destination: Record<string, string>; created_at: string };
type PackageRow = { id: string; length_cm: string | number; width_cm: string | number; height_cm: string | number; weight_kg: string | number; piece_count: number; stackable: boolean; fragile: boolean };
type DocumentRow = { id: string; document_type: string; status: string; is_required: boolean; checksum_sha256: string | null };
type ExceptionRow = { code: string };

export async function POST(request: Request) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!SULTAN_FEP_URL) return NextResponse.json({ error: "Sultan FEP is not deployed or SULTAN_FEP_URL is not configured." }, { status: 503 });
  try {
    const { order_id: orderId } = await request.json();
    if (!orderId) return NextResponse.json({ error: "order_id is required" }, { status: 400 });
    const encoded = encodeURIComponent(orderId);
    const [orders, packages, documents, exceptions] = await Promise.all([
      fepRequest<OrderRow[]>(`/rest/v1/go_orders?id=eq.${encoded}&select=id,tenant_id,state,service_level,incoterm,origin,destination,created_at`, {}, token),
      fepRequest<PackageRow[]>(`/rest/v1/go_packages?order_id=eq.${encoded}&select=id,length_cm,width_cm,height_cm,weight_kg,piece_count,stackable,fragile`, {}, token),
      fepRequest<DocumentRow[]>(`/rest/v1/go_documents?order_id=eq.${encoded}&select=id,document_type,status,is_required,checksum_sha256`, {}, token),
      fepRequest<ExceptionRow[]>(`/rest/v1/go_exceptions?order_id=eq.${encoded}&state=not.in.(RESOLVED,CANCELLED)&select=code`, {}, token),
    ]);
    const order = orders[0];
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (!packages.length) return NextResponse.json({ error: "The order has no packages to evaluate" }, { status: 400 });
    const snapshotWithoutHash = {
      order_id: order.id,
      tenant_id_hash: sha256(order.tenant_id),
      snapshot_version: "1.0.0",
      current_state: order.state,
      origin_country: order.origin.country_code ?? "TR",
      destination_country: order.destination.country_code ?? "US",
      service_level: order.service_level,
      incoterm: order.incoterm,
      packages: packages.map((item) => ({ package_id: item.id, length_cm: Number(item.length_cm), width_cm: Number(item.width_cm), height_cm: Number(item.height_cm), weight_kg: Number(item.weight_kg), piece_count: item.piece_count, stackable: item.stackable, fragile: item.fragile })),
      documents: documents.map((item) => ({ document_type: item.document_type, status: item.status, required: item.is_required, evidence_ref: item.status === "VERIFIED" ? item.checksum_sha256 ?? `document:${item.id}` : null })),
      open_exception_codes: exceptions.map((item) => item.code),
      allowed_provider_codes: ["EASYSHIP", "SHOPIFY_SHIPPING", "RXO_CONNECT", "VANGUARD_LOGISTICS", "MATRAS"],
      created_at: order.created_at,
    };
    const snapshot = { ...snapshotWithoutHash, snapshot_hash: sha256(snapshotWithoutHash) };
    const idempotencyKey = request.headers.get("idempotency-key") ?? randomUUID();
    const response = await fetch(`${SULTAN_FEP_URL.replace(/\/$/, "")}/v1/fulfillment/recommendations`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-fep-service-token": SULTAN_FEP_SERVICE_TOKEN ?? "" },
      body: JSON.stringify({ idempotency_key: idempotencyKey, snapshot }),
      cache: "no-store",
    });
    const recommendation = await response.json();
    if (!response.ok) throw new Error(recommendation.detail ?? recommendation.error ?? "Sultan FEP request failed");
    await fepRequest("/rest/v1/go_ai_recommendations", {
      method: "POST", headers: { prefer: "return=minimal" },
      body: JSON.stringify({ tenant_id: order.tenant_id, order_id: order.id, recommendation_type: "FULFILLMENT_ROUTING", input_snapshot_hash: snapshot.snapshot_hash, model_version: recommendation.model_version, recommendation, confidence: recommendation.confidence, state: "PROPOSED" }),
    }, token);
    await fepRequest("/rest/v1/go_operation_events", {
      method: "POST", headers: { prefer: "return=minimal" },
      body: JSON.stringify({ tenant_id: order.tenant_id, aggregate_type: "ORDER", aggregate_id: order.id, event_type: "SULTAN_FULFILLMENT_RECOMMENDATION_RECORDED", actor_type: "SULTAN", idempotency_key: idempotencyKey, payload: { recommendation_id: recommendation.recommendation_id, action: recommendation.action, provider: recommendation.recommended_provider_code } }),
    }, token);
    return NextResponse.json({ data: recommendation, receipt: { authoritative: "FEP_SUPABASE", effect: "RECOMMENDATION_RECORDED", booking_effect: false } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Fulfillment recommendation failed" }, { status: 400 });
  }
}
