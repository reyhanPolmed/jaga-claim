import { NextResponse } from "next/server";
import { requireReviewer, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireReviewer(req);

    const revisions = await prisma.claimRevision.findMany({
      where: { claimId: params.id },
      orderBy: { revisionNumber: "desc" },
      include: {
        scoringJobItems: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        predictions: {
          orderBy: { scoredAt: "desc" },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      data: revisions.map((r) => ({
        id: r.id,
        revision_number: r.revisionNumber,
        source_snapshot_at: r.sourceSnapshotAt.toISOString(),
        payload_checksum: r.payloadChecksum,
        scoring_status: r.predictions[0] ? "completed" : (r.scoringJobItems[0]?.status || "not_scored"),
        latest_risk_score: r.predictions[0] ? Number(r.predictions[0].riskScore) : null,
        latest_risk_band: r.predictions[0]?.riskBand || null,
      })),
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil daftar revisi klaim"), { status: 500 });
  }
}
