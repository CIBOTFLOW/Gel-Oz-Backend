import { NextResponse } from "next/server";
import { fepRequest, type Workspace } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function GET() {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const workspaces = await fepRequest<Workspace[]>("/rest/v1/rpc/go_my_workspaces", { method: "POST", body: "{}" }, token);
    if (!workspaces.length) return NextResponse.json({ data: [] });
    const quotes = await fepRequest<unknown[]>("/rest/v1/rpc/go_quote_inbox", { method: "POST", body: JSON.stringify({ p_tenant_id: workspaces[0].tenant_id }) }, token);
    return NextResponse.json({ data: quotes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load quote inbox" }, { status: 400 });
  }
}
