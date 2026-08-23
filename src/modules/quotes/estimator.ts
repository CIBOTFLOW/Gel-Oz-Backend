export const RATE_CARD_VERSION = "GOZ-STANDARD-2026-08";

export type QuoteMode = "AUTO" | "OCEAN_LCL" | "OCEAN_FCL_20" | "AIR";
export type OriginCountry = "TR" | "IT";

export interface QuoteEstimateInput {
  originCountry: OriginCountry;
  originCity: string;
  destinationCity: string;
  destinationState: string;
  destinationPostalCode: string;
  pieces: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  totalWeightKg: number;
  cargoValueUsd: number;
  mode: QuoteMode;
  residential: boolean;
  fragile: boolean;
  stackable: boolean;
}

export interface QuoteCostBreakdown {
  originPickup: number;
  originHandling: number;
  mainTransport: number;
  destinationHandling: number;
  customsBrokerAllowance: number;
  documentation: number;
  insuranceAllowance: number;
  lastMileAllowance: number;
  marketContingency: number;
  gelOzCoordination: number;
}

export interface QuoteOption {
  optionCode: string;
  label: string;
  mode: Exclude<QuoteMode, "AUTO">;
  arrivalPort: string;
  transitDaysMin: number;
  transitDaysMax: number;
  currency: "USD";
  estimatedTotal: number;
  providerCost: number;
  marketContingency: number;
  gelOzCoordination: number;
  marginRate: number;
  recommended: boolean;
  breakdown: QuoteCostBreakdown;
  providerPlan: Array<{ segment: string; preferredProvider: string; integration: "API" | "MANUAL_QUOTE" | "PARTNER_SETUP" }>;
}

export interface QuoteEstimate {
  rateCardVersion: string;
  generatedAt: string;
  incoterm: "EXW";
  cubicMeters: number;
  oceanChargeableCbm: number;
  airChargeableKg: number;
  suggestedMode: Exclude<QuoteMode, "AUTO">;
  options: QuoteOption[];
  exclusions: string[];
  notice: string;
}

type PortRate = {
  code: string;
  name: string;
  lclPerCbm: Record<OriginCountry, number>;
  fcl20: Record<OriginCountry, number>;
  airPerKg: Record<OriginCountry, number>;
  oceanDays: Record<OriginCountry, [number, number]>;
  airDays: [number, number];
  destinationFactor: number;
};

const PORTS: PortRate[] = [
  { code: "USNYC", name: "New York / Newark", lclPerCbm: { TR: 165, IT: 145 }, fcl20: { TR: 4550, IT: 4050 }, airPerKg: { TR: 5.9, IT: 5.5 }, oceanDays: { TR: [24, 34], IT: [18, 28] }, airDays: [4, 8], destinationFactor: 1 },
  { code: "USSAV", name: "Savannah", lclPerCbm: { TR: 185, IT: 165 }, fcl20: { TR: 4800, IT: 4300 }, airPerKg: { TR: 6.2, IT: 5.8 }, oceanDays: { TR: [27, 38], IT: [22, 32] }, airDays: [5, 9], destinationFactor: 1.02 },
  { code: "USMIA", name: "Miami", lclPerCbm: { TR: 195, IT: 175 }, fcl20: { TR: 4900, IT: 4450 }, airPerKg: { TR: 6, IT: 5.6 }, oceanDays: { TR: [28, 39], IT: [23, 34] }, airDays: [4, 8], destinationFactor: 1.04 },
  { code: "USHOU", name: "Houston", lclPerCbm: { TR: 205, IT: 190 }, fcl20: { TR: 5150, IT: 4750 }, airPerKg: { TR: 6.3, IT: 5.9 }, oceanDays: { TR: [31, 43], IT: [26, 38] }, airDays: [5, 9], destinationFactor: 1.08 },
  { code: "USLAX", name: "Los Angeles / Long Beach", lclPerCbm: { TR: 225, IT: 215 }, fcl20: { TR: 5350, IT: 5100 }, airPerKg: { TR: 6.5, IT: 6.2 }, oceanDays: { TR: [34, 47], IT: [30, 43] }, airDays: [5, 10], destinationFactor: 1.12 },
];

const money = (value: number) => Math.round(value * 100) / 100;
const positive = (value: unknown, label: string, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > max) throw new Error(`${label} must be between 0 and ${max}.`);
  return parsed;
};

export function normalizeQuoteInput(input: Partial<QuoteEstimateInput>): QuoteEstimateInput {
  const originCountry = input.originCountry === "IT" ? "IT" : input.originCountry === "TR" ? "TR" : null;
  if (!originCountry) throw new Error("Origin must be Türkiye or Italy.");
  const mode = ["AUTO", "OCEAN_LCL", "OCEAN_FCL_20", "AIR"].includes(String(input.mode)) ? input.mode as QuoteMode : "AUTO";
  const text = (value: unknown, label: string, max: number) => {
    const normalized = String(value ?? "").trim();
    if (!normalized || normalized.length > max) throw new Error(`${label} is required and must be ${max} characters or fewer.`);
    return normalized;
  };
  return {
    originCountry,
    originCity: text(input.originCity, "Origin city", 80),
    destinationCity: text(input.destinationCity, "Destination city", 80),
    destinationState: text(input.destinationState, "Destination state", 40).toUpperCase(),
    destinationPostalCode: text(input.destinationPostalCode, "Destination postal code", 16),
    pieces: Math.floor(positive(input.pieces, "Pieces", 10_000)),
    lengthCm: positive(input.lengthCm, "Length", 1_500),
    widthCm: positive(input.widthCm, "Width", 1_500),
    heightCm: positive(input.heightCm, "Height", 1_500),
    totalWeightKg: positive(input.totalWeightKg, "Total weight", 100_000),
    cargoValueUsd: positive(input.cargoValueUsd, "Cargo value", 10_000_000),
    mode,
    residential: Boolean(input.residential),
    fragile: Boolean(input.fragile),
    stackable: input.stackable !== false,
  };
}

function marginFor(chargeableCbm: number, mode: QuoteOption["mode"]) {
  if (mode === "OCEAN_FCL_20" || chargeableCbm > 15) return 0.09;
  if (chargeableCbm > 5) return 0.12;
  if (chargeableCbm > 1) return 0.15;
  return 0.18;
}

function buildOption(input: QuoteEstimateInput, port: PortRate, mode: QuoteOption["mode"], cbm: number, oceanChargeableCbm: number, airChargeableKg: number): QuoteOption {
  const originPickup = mode === "OCEAN_FCL_20" ? 560 : mode === "AIR" ? 280 : 240 + oceanChargeableCbm * 18;
  const originHandling = mode === "AIR" ? 155 : mode === "OCEAN_FCL_20" ? 390 : 165 + oceanChargeableCbm * 45;
  const mainTransport = mode === "AIR"
    ? Math.max(490, airChargeableKg * port.airPerKg[input.originCountry])
    : mode === "OCEAN_FCL_20"
      ? port.fcl20[input.originCountry]
      : Math.max(320, oceanChargeableCbm * port.lclPerCbm[input.originCountry]);
  const destinationHandling = mode === "AIR" ? 180 * port.destinationFactor : mode === "OCEAN_FCL_20" ? 900 * port.destinationFactor : (285 + oceanChargeableCbm * 75) * port.destinationFactor;
  const customsBrokerAllowance = 370;
  const documentation = 95;
  const insuranceAllowance = Math.max(40, input.cargoValueUsd * 0.006);
  const lastMileAllowance = (mode === "AIR" ? 380 : mode === "OCEAN_FCL_20" ? 950 : 420 + oceanChargeableCbm * 55) * port.destinationFactor
    + (input.residential ? 125 : 0)
    + (input.fragile ? 85 : 0);
  const baseProviderCost = originPickup + originHandling + mainTransport + destinationHandling + customsBrokerAllowance + documentation + insuranceAllowance + lastMileAllowance;
  const marketContingency = baseProviderCost * 0.07;
  const marginRate = marginFor(oceanChargeableCbm, mode);
  const gelOzCoordination = Math.max(175, (baseProviderCost + marketContingency) * marginRate);
  const providerCost = money(baseProviderCost);
  const total = money(baseProviderCost + marketContingency + gelOzCoordination);
  const days = mode === "AIR" ? port.airDays : port.oceanDays[input.originCountry];
  return {
    optionCode: `${port.code}-${mode}`,
    label: mode === "AIR" ? `Air via ${port.name}` : mode === "OCEAN_FCL_20" ? `20' container via ${port.name}` : `LCL via ${port.name}`,
    mode,
    arrivalPort: port.name,
    transitDaysMin: days[0], transitDaysMax: days[1], currency: "USD",
    estimatedTotal: total,
    providerCost,
    marketContingency: money(marketContingency),
    gelOzCoordination: money(gelOzCoordination),
    marginRate,
    recommended: false,
    breakdown: {
      originPickup: money(originPickup), originHandling: money(originHandling), mainTransport: money(mainTransport),
      destinationHandling: money(destinationHandling), customsBrokerAllowance: money(customsBrokerAllowance), documentation: money(documentation),
      insuranceAllowance: money(insuranceAllowance), lastMileAllowance: money(lastMileAllowance), marketContingency: money(marketContingency), gelOzCoordination: money(gelOzCoordination),
    },
    providerPlan: [
      { segment: "Origin pickup + export", preferredProvider: "Gel Öz approved origin forwarder", integration: "MANUAL_QUOTE" },
      { segment: mode === "AIR" ? "Air linehaul" : "Ocean freight", preferredProvider: "Vanguard / Flexport / approved forwarder", integration: "MANUAL_QUOTE" },
      { segment: "Customs entry", preferredProvider: "Licensed U.S. customs broker", integration: "PARTNER_SETUP" },
      { segment: "Final mile", preferredProvider: input.residential || cbm < 1 ? "Easyship" : "RXO Connect", integration: input.residential || cbm < 1 ? "API" : "PARTNER_SETUP" },
    ],
  };
}

export function estimateQuote(raw: Partial<QuoteEstimateInput>, now = new Date()): QuoteEstimate {
  const input = normalizeQuoteInput(raw);
  const cubicMeters = input.lengthCm * input.widthCm * input.heightCm * input.pieces / 1_000_000;
  const oceanChargeableCbm = Math.max(cubicMeters, input.totalWeightKg / 1_000);
  const airChargeableKg = Math.max(input.totalWeightKg, input.lengthCm * input.widthCm * input.heightCm * input.pieces / 6_000);
  const suggestedMode: QuoteEstimate["suggestedMode"] = input.mode === "AUTO"
    ? oceanChargeableCbm >= 14 ? "OCEAN_FCL_20" : airChargeableKg <= 120 ? "AIR" : "OCEAN_LCL"
    : input.mode;
  const oceanMode: QuoteOption["mode"] = input.mode === "OCEAN_FCL_20" || (input.mode === "AUTO" && oceanChargeableCbm >= 14) ? "OCEAN_FCL_20" : "OCEAN_LCL";
  let options = PORTS.map(port => buildOption(input, port, input.mode === "AIR" ? "AIR" : oceanMode, cubicMeters, oceanChargeableCbm, airChargeableKg));
  if (input.mode === "AUTO") {
    const fastestAir = PORTS.map(port => buildOption(input, port, "AIR", cubicMeters, oceanChargeableCbm, airChargeableKg)).sort((a, b) => a.estimatedTotal - b.estimatedTotal)[0];
    options = [...options, fastestAir];
  }
  options.sort((a, b) => a.estimatedTotal - b.estimatedTotal);
  const preferred = options.find(option => option.mode === suggestedMode) ?? options[0];
  preferred.recommended = true;
  return {
    rateCardVersion: RATE_CARD_VERSION,
    generatedAt: now.toISOString(),
    incoterm: "EXW",
    cubicMeters: money(cubicMeters), oceanChargeableCbm: money(oceanChargeableCbm), airChargeableKg: money(airChargeableKg),
    suggestedMode,
    options,
    exclusions: ["Import duties, tariffs, taxes, exams, storage, demurrage, and extraordinary accessorials", "Hazardous, regulated, temperature-controlled, or oversize cargo", "Carrier capacity and sailing or flight availability until a supplier quote is accepted"],
    notice: "Planning estimate only. A Gel Öz operator validates the cargo, HS codes, importer-of-record arrangement, provider capacity, and every supplier quote before issuing a firm offer.",
  };
}
