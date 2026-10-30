import { NextResponse } from "next/server";
import { requireReviewer, AuthError } from "@/lib/auth";
import { getClaimDetail } from "@/lib/services/claim-service";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireReviewer(req);

    const { searchParams } = new URL(req.url);
    const revisionParam = searchParams.get("revision");
    const revisionNumber = revisionParam ? parseInt(revisionParam, 10) : undefined;

    const detail = await getClaimDetail(params.id, revisionNumber);

    if (!detail) {
      return NextResponse.json(createSafeErrorEnvelope("CLAIM_NOT_FOUND", "Data klaim tidak ditemukan"), { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil detail klaim"), { status: 500 });
  }
}
