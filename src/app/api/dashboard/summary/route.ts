import { NextResponse } from "next/server";
import { requireReviewer, AuthError } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/services/claim-service";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    await requireReviewer(req);
    const summary = await getDashboardSummary();
    return NextResponse.json(summary);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil ringkasan dashboard"), { status: 500 });
  }
}
