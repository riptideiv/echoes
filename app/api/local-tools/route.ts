import { NextRequest, NextResponse } from "next/server";
import {
  extensionConfigured,
  getIdeaSnapshot,
  loadLocalExtension,
} from "@/lib/extensions/host";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(error: unknown, status = 500) {
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : String(error) },
    { status }
  );
}

export async function GET(req: NextRequest) {
  if (!extensionConfigured()) return NextResponse.json({ ok: true, enabled: false });
  const id = Number(req.nextUrl.searchParams.get("ideaId"));
  if (!id) return errorResponse("ideaId required", 400);
  const idea = getIdeaSnapshot(id);
  if (!idea) return errorResponse("idea not found", 404);
  try {
    const extension = await loadLocalExtension();
    const view = await extension!.getView(idea);
    return NextResponse.json({ ok: true, enabled: true, view });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  if (!extensionConfigured()) return errorResponse("local tools are not enabled", 404);
  let body: {
    ideaId?: number;
    panelId?: string;
    actionId?: string;
    values?: Record<string, string>;
  };
  try {
    body = await req.json();
  } catch {
    return errorResponse("bad json", 400);
  }
  const id = Number(body.ideaId);
  if (!id || !body.panelId || !body.actionId) {
    return errorResponse("ideaId, panelId, and actionId are required", 400);
  }
  const idea = getIdeaSnapshot(id);
  if (!idea) return errorResponse("idea not found", 404);
  try {
    const extension = await loadLocalExtension();
    const result = await extension!.execute({
      idea,
      panelId: body.panelId,
      actionId: body.actionId,
      values: body.values ?? {},
    });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
