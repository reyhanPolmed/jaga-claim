import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer, AuthError } from "@/lib/auth";
import { getClaimsList } from "@/lib/services/claim-service";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    await requireReviewer(req);

    const { searchParams } = new URL(req.url);
    const revisionState = z.enum(["revised"]).optional().safeParse(searchParams.get("revision_state") || undefined);
    if (!revisionState.success) return NextResponse.json(createSafeErrorEnvelope("INVALID_FILTER", "Filter revisi tidak valid"), { status: 400 });
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("page_size") || "20", 10);
    const q = searchParams.get("q") || undefined;
    const scoringStatus = searchParams.get("scoring_status") || undefined;
    const reviewState = searchParams.get("review_state") || undefined;
    const riskBand = searchParams.get("risk_band") || undefined;
    const serviceLevel = searchParams.get("service_level") || undefined;
    const dateFrom = searchParams.get("date_from") || undefined;
    const dateTo = searchParams.get("date_to") || undefined;

    const result = await getClaimsList({
      revisionState: revisionState.data,
      page,
      pageSize,
      q,
      scoringStatus,
      reviewState,
      riskBand,
      serviceLevel,
      dateFrom,
      dateTo,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil daftar klaim"), { status: 500 });
  }
}
