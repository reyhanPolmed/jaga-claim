import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { createScoringJob, runJobWorker, ScoringJobError } from "@/lib/services/scoring-job-service";
import { createSafeErrorEnvelope } from "@/lib/logger";
import { guardMutation } from "@/lib/request-security";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    guardMutation(req, admin.id, "scoring-create", 30);
    const body = await req.json();

    if (!body.targets || !Array.isArray(body.targets) || body.targets.length === 0) {
      return NextResponse.json(createSafeErrorEnvelope("INVALID_TARGETS", "targets wajib berupa array dan tidak boleh kosong"), { status: 400 });
    }

    const job = await createScoringJob(admin.id, body.targets);

    // Run job worker in background asynchronously
    runJobWorker(job.id).catch((err) => {
      console.error(`Background worker error for job ${job.id}:`, err);
    });

    return NextResponse.json(
      {
        job_id: job.id,
        status: job.status,
        total_count: job.totalCount,
        completed_count: job.completedCount,
        failed_count: job.failedCount,
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
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal membuat scoring job"), { status: 500 });
  }
}
