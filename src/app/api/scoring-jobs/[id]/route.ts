import { NextResponse } from "next/server";
import { requireReviewer, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireReviewer(req);

    const job = await prisma.scoringJob.findUnique({
      where: { id: params.id },
      include: {
        items: {
          select: {
            id: true,
            claimId: true,
            claimRevisionId: true,
            status: true,
            attemptNumber: true,
            errorCode: true,
            errorMessageSafe: true,
            startedAt: true,
            finishedAt: true,
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json(createSafeErrorEnvelope("JOB_NOT_FOUND", "Scoring job tidak ditemukan"), { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      total_count: job.totalCount,
      completed_count: job.completedCount,
      failed_count: job.failedCount,
      started_at: job.startedAt?.toISOString() || null,
      finished_at: job.finishedAt?.toISOString() || null,
      items: job.items.map((item) => ({
        id: item.id,
        claim_id: item.claimId,
        claim_revision_id: item.claimRevisionId,
        status: item.status,
        attempt_number: item.attemptNumber,
        error_code: item.errorCode,
        error_message_safe: item.errorMessageSafe,
        started_at: item.startedAt?.toISOString() || null,
        finished_at: item.finishedAt?.toISOString() || null,
      })),
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil status scoring job"), { status: 500 });
  }
}
