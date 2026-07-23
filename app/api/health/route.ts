import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    appId: "com.riptideiv.echoes-report",
    version: process.env.ECHOES_REPORT_VERSION ?? "development",
  });
}
