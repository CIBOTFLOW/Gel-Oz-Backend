import type { PlanningRequest } from "./contracts";

export const samplePlanningRequest: PlanningRequest = {
  tenantId: "gel-oz-demo",
  idempotencyKey: "demo-wave-2026-08-22",
  destinationPort: "Port of New York/New Jersey",
  rateCard: {
    currency: "USD",
    version: "demo-2026-08",
    lclMinimumUsd: 980,
    lclPerChargeableCbmUsd: 185,
    lclOriginHandlingUsd: 360,
    lclDestinationHandlingUsd: 640,
    fcl20Usd: 6_900,
    fcl40Usd: 8_900,
    fcl40HighCubeUsd: 9_600
  },
  orders: [
    {
      orderId: "GO-1048",
      customerName: "Luzione New York",
      destinationPostalCode: "10013",
      commerceSource: "SHOPIFY",
      deliveryService: "WHITE_GLOVE",
      packages: [
        {
          packageId: "PKG-1048-A",
          orderId: "GO-1048",
          originCountry: "IT",
          lengthCm: 210,
          widthCm: 96,
          heightCm: 82,
          weightKg: 118,
          quantity: 2,
          stackable: false,
          fragile: true
        }
      ]
    },
    {
      orderId: "GO-1051",
      customerName: "Bay Area Design House",
      destinationPostalCode: "94010",
      commerceSource: "API",
      deliveryService: "THRESHOLD",
      packages: [
        {
          packageId: "PKG-1051-A",
          orderId: "GO-1051",
          originCountry: "TR",
          lengthCm: 118,
          widthCm: 82,
          heightCm: 72,
          weightKg: 74,
          quantity: 4,
          stackable: true,
          fragile: false
        }
      ]
    },
    {
      orderId: "GO-1057",
      customerName: "Atelier Sample Desk",
      destinationPostalCode: "33131",
      commerceSource: "SHOPIFY",
      deliveryService: "PARCEL",
      packages: [
        {
          packageId: "PKG-1057-A",
          orderId: "GO-1057",
          originCountry: "TR",
          lengthCm: 48,
          widthCm: 34,
          heightCm: 22,
          weightKg: 12,
          quantity: 2,
          stackable: true,
          fragile: false
        }
      ]
    }
  ]
};

