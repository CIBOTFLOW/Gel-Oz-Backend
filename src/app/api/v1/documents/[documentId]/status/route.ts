import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request, context: { params: Promise<{ documentId: string }> }) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const { documentId } = await context.params;
    const body = await request.json();
    const data = await fepRequest("/rest/v1/rpc/go_set_document_status", {
      method: "POST",
      body: JSON.stringify({ p_document_id: documentId, p_to_status: body.to_status, p_checksum_sha256: body.checksum_sha256 ?? null }),
    }, token);
    return NextResponse.json({ data, receipt: { authoritative: "FEP_SUPABASE", effect: "DOCUMENT_STATUS_CHANGED" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update document" }, { status: 400 });
  }
}
