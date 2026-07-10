import { NextRequest, NextResponse } from "next/server";
import { distinctDates, listIdeas } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ideas?date=YYYY-MM-DD&archived=1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dates = distinctDates();
  const date = searchParams.get("date") || dates[0] || undefined;
  const includeArchived = searchParams.get("archived") === "1";
  const favoritesOnly = searchParams.get("favorites") === "1";

  const ideas = listIdeas({ date, includeArchived, favoritesOnly });
  return NextResponse.json({
    ideas: ideas.map((r) => ({
      ...r,
      source: JSON.parse(r.source_json) as string[],
    })),
    dates,
    date: date ?? null,
  });
}
