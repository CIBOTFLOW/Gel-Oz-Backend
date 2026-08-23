export type OriginCountry = "TR" | "IT";
export type Currency = "USD" | "EUR" | "TRY";
export type DeliveryService = "PARCEL" | "THRESHOLD" | "ROOM_OF_CHOICE" | "WHITE_GLOVE";
export type CommerceSource = "SHOPIFY" | "API" | "MANUAL";

export interface PackageInput {
  packageId: string;
  orderId: string;
  originCountry: OriginCountry;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
  quantity: number;
  stackable: boolean;
  fragile: boolean;
}

export interface OrderInput {
  orderId: string;
  customerName: string;
  destinationPostalCode: string;
  commerceSource: CommerceSource;
  deliveryService: DeliveryService;
  packages: PackageInput[];
}

export interface RateCardInput {
  currency: Currency;
  version: string;
  lclMinimumUsd: number;
  lclPerChargeableCbmUsd: number;
  lclOriginHandlingUsd: number;
  lclDestinationHandlingUsd: number;
  fcl20Usd: number;
  fcl40Usd: number;
  fcl40HighCubeUsd: number;
}

export interface PlanningRequest {
  tenantId: string;
  idempotencyKey: string;
  destinationPort: string;
  orders: OrderInput[];
  rateCard: RateCardInput;
}

export type FreightMode = "LCL" | "FCL_20" | "FCL_40" | "FCL_40_HC";
export type LastMileProvider = "EASYSHIP" | "SHOPIFY_SHIPPING" | "RXO_CONNECT" | "MANUAL_FREIGHT";

export interface PalletPlan {
  palletId: string;
  originCountry: OriginCountry;
  packageIds: string[];
  volumeCbm: number;
  weightKg: number;
  utilizationPct: number;
}

export interface ContainerPlan {
  equipment: Exclude<FreightMode, "LCL">;
  estimatedContainers: number;
  volumeUtilizationPct: number;
  palletUtilizationPct: number;
  weightUtilizationPct: number;
}

export interface DeliveryRecommendation {
  orderId: string;
  provider: LastMileProvider;
  reason: string;
  manualFallback: string;
}

export interface FreightPlan {
  schemaVersion: "2026-08-22";
  planId: string;
  status: "PROPOSED";
  effectAuthority: "NO_EFFECT";
  tenantId: string;
  destinationPort: string;
  packageCount: number;
  totalVolumeCbm: number;
  totalWeightKg: number;
  chargeableCbm: number;
  pallets: PalletPlan[];
  freightMode: FreightMode;
  containers: ContainerPlan[];
  estimatedFreight: { amount: number; currency: Currency; rateCardVersion: string };
  deliveryRecommendations: DeliveryRecommendation[];
  reasons: string[];
  assumptions: string[];
}

