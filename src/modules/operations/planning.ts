import { createHash } from "node:crypto";
import type {
  ContainerPlan,
  DeliveryRecommendation,
  FreightMode,
  FreightPlan,
  OrderInput,
  PackageInput,
  PalletPlan,
  PlanningRequest,
} from "./contracts";

const EURO_PALLET = { volumeCbm: 1.65, maxWeightKg: 1_000 };
const EQUIPMENT = {
  FCL_20: { usableCbm: 28, palletSlots: 11, maxWeightKg: 21_000 },
  FCL_40: { usableCbm: 58, palletSlots: 24, maxWeightKg: 26_000 },
  FCL_40_HC: { usableCbm: 68, palletSlots: 24, maxWeightKg: 26_000 },
} as const;

const round = (value: number, places = 2) => {
  const scale = 10 ** places;
  return Math.round((value + Number.EPSILON) * scale) / scale;
};

const packageVolume = (item: PackageInput) =>
  (item.lengthCm * item.widthCm * item.heightCm * item.quantity) / 1_000_000;

const packageWeight = (item: PackageInput) => item.weightKg * item.quantity;

function validateRequest(request: PlanningRequest) {
  if (!request.tenantId.trim() || !request.idempotencyKey.trim()) {
    throw new Error("tenantId and idempotencyKey are required");
  }
  if (!request.orders.length) throw new Error("At least one order is required");
  const ids = new Set<string>();
  for (const order of request.orders) {
    if (!order.orderId.trim() || !order.packages.length) throw new Error("Every order requires an ID and package");
    for (const item of order.packages) {
      if (ids.has(item.packageId)) throw new Error(`Duplicate packageId: ${item.packageId}`);
      ids.add(item.packageId);
      const values = [item.lengthCm, item.widthCm, item.heightCm, item.weightKg, item.quantity];
      if (values.some((value) => !Number.isFinite(value) || value <= 0)) {
        throw new Error(`Package ${item.packageId} has invalid dimensions, weight, or quantity`);
      }
    }
  }
}

function stablePayload(request: PlanningRequest) {
  return JSON.stringify({
    ...request,
    orders: [...request.orders]
      .sort((a, b) => a.orderId.localeCompare(b.orderId))
      .map((order) => ({
        ...order,
        packages: [...order.packages].sort((a, b) => a.packageId.localeCompare(b.packageId)),
      })),
  });
}

function palletize(packages: PackageInput[]): PalletPlan[] {
  const expanded = packages
    .flatMap((item) =>
      Array.from({ length: item.quantity }, (_, index) => ({
        ...item,
        quantity: 1,
        unitId: item.quantity === 1 ? item.packageId : `${item.packageId}-${index + 1}`,
        volume: packageVolume({ ...item, quantity: 1 }),
        weight: item.weightKg,
      })),
    )
    .sort((a, b) => b.volume - a.volume || b.weight - a.weight || a.unitId.localeCompare(b.unitId));

  const pallets: Array<PalletPlan & { fragile: boolean }> = [];
  for (const item of expanded) {
    const maxVolume = item.stackable && !item.fragile ? EURO_PALLET.volumeCbm : EURO_PALLET.volumeCbm * 0.72;
    const existing = pallets.find(
      (pallet) =>
        pallet.originCountry === item.originCountry &&
        !pallet.fragile &&
        !item.fragile &&
        pallet.volumeCbm + item.volume <= maxVolume &&
        pallet.weightKg + item.weight <= EURO_PALLET.maxWeightKg,
    );
    if (existing) {
      existing.packageIds.push(item.unitId);
      existing.volumeCbm = round(existing.volumeCbm + item.volume, 3);
      existing.weightKg = round(existing.weightKg + item.weight);
      existing.utilizationPct = round((existing.volumeCbm / EURO_PALLET.volumeCbm) * 100);
    } else {
      pallets.push({
        palletId: `PLT-${String(pallets.length + 1).padStart(3, "0")}`,
        originCountry: item.originCountry,
        packageIds: [item.unitId],
        volumeCbm: round(item.volume, 3),
        weightKg: round(item.weight),
        utilizationPct: round((item.volume / EURO_PALLET.volumeCbm) * 100),
        fragile: item.fragile,
      });
    }
  }
  return pallets.map(({ fragile: _fragile, ...pallet }) => pallet);
}

function chooseEquipment(totalVolumeCbm: number, palletCount: number, totalWeightKg: number) {
  const entries = Object.entries(EQUIPMENT) as Array<[Exclude<FreightMode, "LCL">, (typeof EQUIPMENT)[keyof typeof EQUIPMENT]]>;
  return entries.find(([, equipment]) =>
    totalVolumeCbm <= equipment.usableCbm && palletCount <= equipment.palletSlots && totalWeightKg <= equipment.maxWeightKg,
  );
}

function containerPlan(
  mode: Exclude<FreightMode, "LCL">,
  volume: number,
  pallets: number,
  weight: number,
): ContainerPlan {
  const equipment = EQUIPMENT[mode];
  const estimatedContainers = Math.max(
    1,
    Math.ceil(Math.max(volume / equipment.usableCbm, pallets / equipment.palletSlots, weight / equipment.maxWeightKg)),
  );
  return {
    equipment: mode,
    estimatedContainers,
    volumeUtilizationPct: round((volume / (equipment.usableCbm * estimatedContainers)) * 100),
    palletUtilizationPct: round((pallets / (equipment.palletSlots * estimatedContainers)) * 100),
    weightUtilizationPct: round((weight / (equipment.maxWeightKg * estimatedContainers)) * 100),
  };
}

function deliveryRecommendation(order: OrderInput): DeliveryRecommendation {
  const items = order.packages.flatMap((item) => Array.from({ length: item.quantity }, () => item));
  const parcelEligible = items.every(
    (item) => item.weightKg <= 30 && Math.max(item.lengthCm, item.widthCm, item.heightCm) <= 120 && item.lengthCm + item.widthCm + item.heightCm <= 220,
  );
  const totalWeight = items.reduce((sum, item) => sum + item.weightKg, 0);

  if (order.deliveryService === "WHITE_GLOVE" || order.deliveryService === "ROOM_OF_CHOICE" || totalWeight > 300) {
    return {
      orderId: order.orderId,
      provider: "RXO_CONNECT",
      reason: "Bulky, heavy, or in-home service requires scheduled freight delivery.",
      manualFallback: "Export the delivery packet and book with the approved local white-glove/LTL partner.",
    };
  }
  if (parcelEligible && order.commerceSource === "SHOPIFY") {
    return {
      orderId: order.orderId,
      provider: "SHOPIFY_SHIPPING",
      reason: "Shopify-origin parcel order can retain order and label continuity.",
      manualFallback: "Rate and create the parcel label in Easyship, then record tracking on the order.",
    };
  }
  if (parcelEligible) {
    return {
      orderId: order.orderId,
      provider: "EASYSHIP",
      reason: "All packages fit the configurable parcel envelope.",
      manualFallback: "Create the label directly with an approved parcel carrier and record tracking.",
    };
  }
  return {
    orderId: order.orderId,
    provider: "MANUAL_FREIGHT",
    reason: "Cargo exceeds parcel limits and does not yet require configured white-glove service.",
    manualFallback: "Request an LTL/last-mile quote from an approved partner and attach its reference.",
  };
}

export function createFreightPlan(request: PlanningRequest): FreightPlan {
  validateRequest(request);
  const packages = request.orders.flatMap((order) => order.packages);
  const totalVolumeCbm = round(packages.reduce((sum, item) => sum + packageVolume(item), 0), 3);
  const totalWeightKg = round(packages.reduce((sum, item) => sum + packageWeight(item), 0));
  const chargeableCbm = round(Math.max(totalVolumeCbm, totalWeightKg / 1_000), 3);
  const pallets = palletize(packages);
  const fittingEquipment = chooseEquipment(totalVolumeCbm, pallets.length, totalWeightKg);
  const twenty = EQUIPMENT.FCL_20;
  const threshold = Math.max(
    totalVolumeCbm / twenty.usableCbm,
    pallets.length / twenty.palletSlots,
    totalWeightKg / twenty.maxWeightKg,
  );

  const fclMode: Exclude<FreightMode, "LCL"> = fittingEquipment?.[0] ?? "FCL_40_HC";
  const fclCandidate = containerPlan(fclMode, totalVolumeCbm, pallets.length, totalWeightKg);
  const lclEstimate = Math.max(
    request.rateCard.lclMinimumUsd,
    chargeableCbm * request.rateCard.lclPerChargeableCbmUsd +
      request.rateCard.lclOriginHandlingUsd +
      request.rateCard.lclDestinationHandlingUsd,
  );
  const fclRate = {
    FCL_20: request.rateCard.fcl20Usd,
    FCL_40: request.rateCard.fcl40Usd,
    FCL_40_HC: request.rateCard.fcl40HighCubeUsd,
  }[fclMode] * fclCandidate.estimatedContainers;

  const useFcl = threshold >= 0.7 || fclRate <= lclEstimate;
  const freightMode: FreightMode = useFcl ? fclMode : "LCL";
  const reasons = useFcl
    ? [
        threshold >= 0.7
          ? `Cargo consumes ${round(threshold * 100)}% of the limiting 20-foot capacity dimension.`
          : "The configured FCL rate is lower than the LCL estimate.",
        `${fclMode.replaceAll("_", " ")} is the smallest feasible equipment estimate.`,
      ]
    : [
        `Cargo is below the 70% FCL planning threshold at ${round(threshold * 100)}%.`,
        "LCL preserves consolidation flexibility at the configured rate card.",
      ];

  return {
    schemaVersion: "2026-08-22",
    planId: `plan_${createHash("sha256").update(stablePayload(request)).digest("hex").slice(0, 16)}`,
    status: "PROPOSED",
    effectAuthority: "NO_EFFECT",
    tenantId: request.tenantId,
    destinationPort: request.destinationPort,
    packageCount: packages.reduce((sum, item) => sum + item.quantity, 0),
    totalVolumeCbm,
    totalWeightKg,
    chargeableCbm,
    pallets,
    freightMode,
    containers: useFcl ? [fclCandidate] : [],
    estimatedFreight: {
      amount: round(useFcl ? fclRate : lclEstimate),
      currency: request.rateCard.currency,
      rateCardVersion: request.rateCard.version,
    },
    deliveryRecommendations: request.orders.map(deliveryRecommendation),
    reasons,
    assumptions: [
      "Planning estimate only; carrier quotes, sailings, customs, accessorials, duties, insurance, and last-mile charges require readback.",
      "Euro-pallet estimate uses 1.65 CBM and 1,000 kg maximum; fragile cargo receives reduced usable stacking volume.",
      "FCL selection occurs at 70% of the limiting 20-foot capacity dimension or when the configured FCL linehaul is cheaper.",
      "Hazardous, refrigerated, oversized, vehicle, and regulated cargo require a specialist workflow.",
    ],
  };
}

