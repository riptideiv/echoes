import { NextRequest, NextResponse } from "next/server";
import { getIdea, updateIdea } from "@/lib/db";
import { refineIdeaWithAnswer } from "@/lib/generate";
import { rankScore } from "@/lib/rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/answer { id, answer } — fold the answer into the idea's sources,
// regenerate just this idea, and finalize or reject it.
export async function POST(req: NextRequest) {
  let body: { id?: number; answer?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  const id = Number(body.id);
  const answer = (body.answer ?? "").trim();
  if (!id || !answer) {
    return NextResponse.json(
      { ok: false, error: "id and answer required" },
      { status: 400 }
    );
  }

  const idea = getIdea(id);
  if (!idea) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (idea.status !== "needs_input") {
    return NextResponse.json(
      { ok: false, error: "idea is not awaiting input" },
      { status: 409 }
    );
  }

  const source: string[] = JSON.parse(idea.source_json);
  try {
    const result = await refineIdeaWithAnswer({
      direction: idea.direction,
      source,
      question: idea.question ?? "",
      answer,
    });

    // The answer becomes part of the sources.
    const newSource = [...source, `My answer: ${answer}`];
    const rank =
      result.status === "finalized"
        ? rankScore(idea.evidence_strength, result.interest_score)
        : 0;

    updateIdea(id, {
      status: result.status,
      user_answer: answer,
      source_json: JSON.stringify(newSource),
      direction: result.direction,
      justification_support: result.justification_support,
      justification_interest: result.justification_interest,
      interest_score: result.interest_score,
      rank_score: rank,
      question: null,
      rejection_reason: result.rejection_reason,
    });

    const updated = getIdea(id)!;
    return NextResponse.json({
      ok: true,
      idea: { ...updated, source: JSON.parse(updated.source_json) },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
