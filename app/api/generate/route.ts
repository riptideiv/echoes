import { NextResponse } from "next/server";
import { runDailyPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/generate — run the daily pipeline for the current rolling window.
export async function POST() {
  try {
    const report = await runDailyPipeline();
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
