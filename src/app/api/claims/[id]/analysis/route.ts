import { NextResponse } from "next/server";
import { requireReviewer, AuthError } from "@/lib/auth";
import { getClaimAnalysis } from "@/lib/services/claim-service";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireReviewer(req);

    const analysis = await getClaimAnalysis(params.id);

    if (!analysis) {
      return NextResponse.json(createSafeErrorEnvelope("ANALYSIS_NOT_FOUND", "Hasil analisis AI belum tersedia untuk klaim ini"), { status: 404 });
    }

    return NextResponse.json(analysis);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil analisis klaim"), { status: 500 });
  }
}
