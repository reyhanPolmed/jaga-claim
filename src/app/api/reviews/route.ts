import { NextResponse } from "next/server";
import { AuthError, requireReviewer } from "@/lib/auth";
import { getRiskQueue } from "@/lib/services/claim-service";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    await requireReviewer(req);
    const params = new URL(req.url).searchParams;
    const state = params.get("state") || "awaiting_review";
    const page = Math.max(1, Number(params.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.get("page_size") || 20)));
    const result = await getRiskQueue({
      page,
      pageSize,
      reviewState: state === "all" ? undefined : state,
      riskBand: params.get("risk_band") || undefined,
      q: params.get("q") || undefined,
    });
    return NextResponse.json({
      data: result.data.map((item) => ({
        claim_id: item.id,
        claim_key: item.claim_key,
        revision_number: item.latest_revision,
        prediction_id: item.prediction_id,
        risk_score: item.risk_score,
        risk_band: item.risk_band,
        primary_icd10: item.primary_icd10,
        top_reason: item.top_reason,
        review_state: item.review_state,
        last_reviewed_at: item.last_reviewed_at,
        last_reviewer: item.last_reviewer,
        scored_at: item.scored_at,
      })),
      pagination: result.pagination,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json(createSafeErrorEnvelope(error.code, error.message), { status: error.status });
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil antrean review"), { status: 500 });
  }
}
