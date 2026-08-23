import { NextResponse } from "next/server";
import { fepRequest, type DashboardSnapshot, type Workspace } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";
import { createFreightPlan } from "@/modules/operations/planning";
import type { CommerceSource, DeliveryService, OriginCountry } from "@/modules/operations/contracts";

function livePlan(snapshot: DashboardSnapshot) {
  if (!snapshot.planning_packages.length) return null;
  const grouped = new Map<string, typeof snapshot.planning_packages>();
  for (const item of snapshot.planning_packages) grouped.set(item.order_id, [...(grouped.get(item.order_id) ?? []), item]);
  return createFreightPlan({
    tenantId: snapshot.tenant_id,
    idempotencyKey: `dashboard-${snapshot.planning_packages.map((item) => item.package_id).sort().join("-")}`,
    destinationPort: "New York / Newark",
    orders: [...grouped.entries()].map(([orderId, packages]) => ({
      orderId,
      customerName: "Minimized customer",
      destinationPostalCode: "",
      commerceSource: (packages[0].source === "SHOPIFY" ? "SHOPIFY" : packages[0].source === "MANUAL" ? "MANUAL" : "API") as CommerceSource,
      deliveryService: (["PARCEL", "THRESHOLD", "ROOM_OF_CHOICE", "WHITE_GLOVE"].includes(packages[0].service_level) ? packages[0].service_level : "THRESHOLD") as DeliveryService,
      packages: packages.map((item) => ({
        packageId: item.package_id,
        orderId,
        originCountry: (item.origin_country === "IT" ? "IT" : "TR") as OriginCountry,
        lengthCm: Number(item.length_cm), widthCm: Number(item.width_cm), heightCm: Number(item.height_cm),
        weightKg: Number(item.weight_kg), quantity: Number(item.piece_count), stackable: item.stackable, fragile: item.fragile,
      })),
    })),
    rateCard: { currency: "USD", version: "OPS-2026-08", lclMinimumUsd: 950, lclPerChargeableCbmUsd: 185, lclOriginHandlingUsd: 420, lclDestinationHandlingUsd: 680, fcl20Usd: 5_900, fcl40Usd: 8_400, fcl40HighCubeUsd: 9_100 },
  });
}

export async function GET() {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const workspaces = await fepRequest<Workspace[]>("/rest/v1/rpc/go_my_workspaces", { method: "POST", body: "{}" }, token);
    if (!workspaces.length) return NextResponse.json({ workspaces, snapshot: null });
    const snapshot = await fepRequest<DashboardSnapshot>("/rest/v1/rpc/go_dashboard_snapshot", {
      method: "POST",
      body: JSON.stringify({ p_tenant_id: workspaces[0].tenant_id }),
    }, token);
    return NextResponse.json({ workspaces, snapshot, livePlan: livePlan(snapshot) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load operations" }, { status: 400 });
  }
}
