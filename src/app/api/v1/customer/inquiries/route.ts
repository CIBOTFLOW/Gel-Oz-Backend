import { NextResponse } from "next/server";
import { fepRequest } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function POST(request: Request) {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Giriş yapmanız gerekiyor." }, { status: 401 });
  try {
    const body = await request.json();
    const data = await fepRequest("/rest/v1/rpc/go_customer_open_inquiry", {
      method: "POST",
      body: JSON.stringify({ p_order_id: body.order_id, p_category: body.category, p_subject: body.subject, p_message: body.message, p_idempotency_key: request.headers.get("idempotency-key") ?? crypto.randomUUID() }),
    }, token);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Destek talebi oluşturulamadı." }, { status: 400 });
  }
}
