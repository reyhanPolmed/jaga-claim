import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { retryFailedScoringJob, runJobWorker, ScoringJobError } from "@/lib/services/scoring-job-service";
import { createSafeErrorEnvelope } from "@/lib/logger";
import { guardMutation } from "@/lib/request-security";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin(req);
    guardMutation(req, admin.id, "scoring-retry", 20);
    const newJob = await retryFailedScoringJob(params.id, admin.id);

    // Launch worker for retried job
    runJobWorker(newJob.id).catch((err) => {
      console.error(`Background worker error for retry job ${newJob.id}:`, err);
    });

    return NextResponse.json(
      {
        job_id: newJob.id,
        status: newJob.status,
        total_count: newJob.totalCount,
        completed_count: newJob.completedCount,
        failed_count: newJob.failedCount,
      },
      { status: 202 }
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    if (err instanceof ScoringJobError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: 400 });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal memproses retry job"), { status: 500 });
  }
}
