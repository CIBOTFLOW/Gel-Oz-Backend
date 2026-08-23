import { NextResponse } from "next/server";
import { fepRequest, type Workspace } from "@/lib/fep-supabase";
import { operatorToken } from "@/lib/operator-session";

export async function GET() {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const workspaces = await fepRequest<Workspace[]>("/rest/v1/rpc/go_my_workspaces", { method: "POST", body: "{}" }, token);
    return NextResponse.json({ workspaces });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load workspaces" }, { status: 400 });
  }
}

export async function POST() {
  const token = await operatorToken();
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const workspace = await fepRequest("/rest/v1/rpc/go_bootstrap_workspace", {
      method: "POST",
      body: JSON.stringify({ p_name: "Gel Öz Logistics", p_slug: "gel-oz-logistics" }),
    }, token);
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to initialize workspace" }, { status: 400 });
  }
}
