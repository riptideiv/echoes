import { NextRequest, NextResponse } from "next/server";
import { getIdea, setFavorite, updateIdea } from "@/lib/db";
import type { IdeaStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED: IdeaStatus[] = ["ready", "finalized", "rejected"];

// PATCH /api/idea/:id — either { favorite: boolean } to toggle saved, or
// { status, rejection_reason? } for manual finalize / reject.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  const idea = getIdea(id);
  if (!idea) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }

  let body: {
    status?: IdeaStatus;
    rejection_reason?: string;
    favorite?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }

  if (typeof body.favorite === "boolean") {
    setFavorite(id, body.favorite);
    const updated = getIdea(id)!;
    return NextResponse.json({
      ok: true,
      idea: { ...updated, source: JSON.parse(updated.source_json) },
    });
  }

  const status = body.status;
  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json(
      { ok: false, error: `status must be one of ${ALLOWED.join(", ")}` },
      { status: 400 }
    );
  }

  updateIdea(id, {
    status,
    rejection_reason:
      status === "rejected" ? body.rejection_reason ?? "Dismissed." : null,
  });
  const updated = getIdea(id)!;
  return NextResponse.json({
    ok: true,
    idea: { ...updated, source: JSON.parse(updated.source_json) },
  });
}
