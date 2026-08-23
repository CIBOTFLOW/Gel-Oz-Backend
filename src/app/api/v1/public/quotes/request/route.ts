import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { estimateQuote, normalizeQuoteInput } from "@/modules/quotes/estimator";

type QuoteReceipt = { quote_number: string; state: string; requested_at: string; duplicate: boolean };

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 32_000) return NextResponse.json({ error: "Quote request is too large." }, { status: 413 });
    const body = await request.json();
    if (body.website) return NextResponse.json({ data: { quote_number: "RECEIVED", state: "ESTIMATE_REQUESTED", requested_at: new Date().toISOString() } });
    const shipment = normalizeQuoteInput(body.shipment ?? {});
    const estimate = estimateQuote(shipment);
    const contactName = String(body.contact?.name ?? "").trim();
    const contactEmail = String(body.contact?.email ?? "").trim().toLowerCase();
    const cargoDescription = String(body.cargoDescription ?? "").trim();
    if (!contactName || contactName.length > 120) throw new Error("Contact name is required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail) || contactEmail.length > 254) throw new Error("A valid contact email is required.");
    if (cargoDescription.length < 2 || cargoDescription.length > 500) throw new Error("Cargo description must be between 2 and 500 characters.");
    const idempotencyKey = request.headers.get("idempotency-key") ?? crypto.randomUUID();
    const receipt = await fepRequest<QuoteReceipt>("/rest/v1/rpc/go_submit_quote_request", {
      method: "POST",
      body: JSON.stringify({
        p_idempotency_key: idempotencyKey,
        p_payload: {
          company_name: String(body.contact?.company ?? "").trim() || null,
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: String(body.contact?.phone ?? "").trim() || null,
          cargo_description: cargoDescription,
          origin_country: shipment.originCountry,
          origin_city: shipment.originCity,
          destination_country: "US",
          destination_city: shipment.destinationCity,
          destination_state: shipment.destinationState,
          destination_postal_code: shipment.destinationPostalCode,
          mode: shipment.mode,
          pieces: shipment.pieces,
          length_cm: shipment.lengthCm,
          width_cm: shipment.widthCm,
          height_cm: shipment.heightCm,
          total_weight_kg: shipment.totalWeightKg,
          cargo_value_usd: shipment.cargoValueUsd,
          residential: shipment.residential,
          fragile: shipment.fragile,
          stackable: shipment.stackable,
        },
        p_estimate: estimate,
      }),
    });
    return NextResponse.json({ data: receipt, estimate }, { status: receipt.duplicate ? 200 : 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save the quote request." }, { status: 400 });
  }
}
