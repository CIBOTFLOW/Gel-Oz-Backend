import { NextResponse } from "next/server";
import type { PlanningRequest } from "@/modules/operations/contracts";
import { createFreightPlan } from "@/modules/operations/planning";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PlanningRequest;
    const plan = createFreightPlan(body);
    return NextResponse.json({ data: plan, receipt: { effect: "NO_EFFECT", readback: "response" } }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PLANNING_REQUEST",
          message: error instanceof Error ? error.message : "Unable to calculate freight plan",
        },
      },
      { status: 400 },
    );
  }
}

