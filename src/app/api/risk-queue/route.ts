import { NextResponse } from "next/server";
import { requireReviewer, AuthError } from "@/lib/auth";
import { getRiskQueue } from "@/lib/services/claim-service";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    await requireReviewer(req);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("page_size") || "20", 10);
    const riskBand = searchParams.get("risk_band") || undefined;
    const reviewState = searchParams.get("review_state") || undefined;
    const reasonCode = searchParams.get("reason_code") || undefined;
    const serviceLevel = searchParams.get("service_level") || undefined;
    const q = searchParams.get("q") || undefined;
    const dateFrom = searchParams.get("date_from") || undefined;
    const dateTo = searchParams.get("date_to") || undefined;

    const result = await getRiskQueue({
      page,
      pageSize,
      riskBand,
      reviewState,
      reasonCode,
      serviceLevel,
      q,
      dateFrom,
      dateTo,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil antrean risiko"), { status: 500 });
  }
}
