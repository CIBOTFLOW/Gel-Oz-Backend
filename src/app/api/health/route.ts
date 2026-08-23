import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ service: "gel-oz-operations", status: "ok", schemaVersion: "2026-08-22" });
}

