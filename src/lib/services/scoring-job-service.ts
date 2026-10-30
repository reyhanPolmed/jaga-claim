import { prisma } from "../db";
import { getScoringProvider } from "../scoring/scoring-factory";
import { MlScoreRequest, mlScoreRequestSchema } from "../contracts/ml-contract";
import { logger } from "../logger";

export interface ScoringTarget {
  claim_id: string; // Internal Claim UUID
  claim_revision_id: string; // Internal ClaimRevision UUID
}

export class ScoringJobError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function createScoringJob(requestedByUserId: string, targets: ScoringTarget[]) {
  if (!targets || targets.length === 0) {
    throw new ScoringJobError("EMPTY_TARGETS", "Target scoring tidak boleh kosong");
  }

  // Deduplicate targets by claim_revision_id
  const uniqueMap = new Map<string, ScoringTarget>();
  for (const t of targets) {
    uniqueMap.set(t.claim_revision_id, t);
  }
  const uniqueTargets = Array.from(uniqueMap.values());

  // Verify all revisions belong to their respective claims
  const revisionIds = uniqueTargets.map((t) => t.claim_revision_id);
  const revisions = await prisma.claimRevision.findMany({
    where: { id: { in: revisionIds } },
    select: { id: true, claimId: true },
  });

  const revisionMap = new Map(revisions.map((r) => [r.id, r.claimId]));
  for (const t of uniqueTargets) {
    const actualClaimId = revisionMap.get(t.claim_revision_id);
    if (!actualClaimId || actualClaimId !== t.claim_id) {
      throw new ScoringJobError(
        "INVALID_TARGET",
        `Revisi ${t.claim_revision_id} tidak ditemukan atau bukan milik klaim ${t.claim_id}`
      );
    }
  }

  // Create job and items transactionally
  const job = await prisma.$transaction(async (tx) => {
    const createdJob = await tx.scoringJob.create({
      data: {
        requestedBy: requestedByUserId,
        status: "queued",
        totalCount: uniqueTargets.length,
        completedCount: 0,
        failedCount: 0,
      },
    });

    await tx.scoringJobItem.createMany({
      data: uniqueTargets.map((t) => ({
        jobId: createdJob.id,
        claimId: t.claim_id,
        claimRevisionId: t.claim_revision_id,
        status: "queued",
        attemptNumber: 1,
      })),
    });

    return createdJob;
  });

  return job;
}

// Process single item with provider
export async function processScoringJobItem(itemId: string): Promise<boolean> {
  const item = await prisma.scoringJobItem.findUnique({
    where: { id: itemId },
    include: {
      claim: true,
      revision: true,
      job: true,
    },
  });

  if (!item || item.status !== "queued") {
    return false;
  }

  // Atomically mark as processing
  const claimed = await prisma.scoringJobItem.updateMany({
    where: { id: itemId, status: "queued" },
    data: { status: "processing", startedAt: new Date() },
  });

  if (claimed.count === 0) {
    return false;
  }

  // Update job status to processing if first item
  await prisma.scoringJob.updateMany({
    where: { id: item.jobId, status: "queued" },
    data: { status: "processing", startedAt: new Date() },
  });

  const rawPayload = item.revision.claimPayload as Record<string, any>;
  const scoreRequestPayload: MlScoreRequest = {
    claim_id: item.claim.claimKey,
    participant_key: item.claim.participantKey,
    prediction_time: new Date().toISOString(),
    episode: rawPayload.episode,
    diagnoses: rawPayload.diagnoses,
    casemix: rawPayload.casemix,
    procedures: rawPayload.procedures,
    financial_pre_submit: rawPayload.financial_pre_submit,
    history_features: {},
    peer_features: {},
  };

  const validation = mlScoreRequestSchema.safeParse(scoreRequestPayload);
  if (!validation.success) {
    const msg = validation.error.issues[0]?.message || "Request schema invalid";
    await recordScoringFailure(item.id, item.jobId, "VALIDATION_ERROR", msg);
    return false;
  }

  const provider = getScoringProvider();
  const result = await provider.score(validation.data);

  if (!result.success) {
    await recordScoringFailure(item.id, item.jobId, result.error.code, result.error.message);
    return false;
  }

  // Scoring successful: Persist prediction and findings transactionally
  const response = result.response;
  await prisma.$transaction(async (tx) => {
    // 1. Mark item completed
    await tx.scoringJobItem.update({
      where: { id: item.id },
      data: {
        status: "completed",
        finishedAt: new Date(),
      },
    });

    // 2. Insert prediction
    const prediction = await tx.prediction.create({
      data: {
        claimId: item.claimId,
        claimRevisionId: item.claimRevisionId,
        scoringJobItemId: item.id,
        riskScore: response.risk_score,
        riskBand: response.risk_band,
        evidence: response.evidence as any,
        modelVersion: response.model_version,
        ruleVersion: response.rule_version,
        source: provider.name,
        scoredAt: new Date(response.scored_at),
      },
    });

    // 3. Insert risk findings for each reason code
    if (response.reason_codes && response.reason_codes.length > 0) {
      await tx.riskFinding.createMany({
        data: response.reason_codes.map((code) => ({
          predictionId: prediction.id,
          reasonCode: code,
        })),
        skipDuplicates: true,
      });
    }

    // 4. Increment completed_count on job
    await tx.scoringJob.update({
      where: { id: item.jobId },
      data: { completedCount: { increment: 1 } },
    });
  });

  await checkAndFinalizeJob(item.jobId);
  return true;
}

async function recordScoringFailure(itemId: string, jobId: string, errorCode: string, safeMessage: string) {
  logger.warn(`Scoring failed for item ${itemId}: [${errorCode}] ${safeMessage}`, {
    jobId,
    itemId,
  });

  await prisma.$transaction(async (tx) => {
    await tx.scoringJobItem.update({
      where: { id: itemId },
      data: {
        status: "failed",
        errorCode,
        errorMessageSafe: safeMessage,
        finishedAt: new Date(),
      },
    });

    await tx.scoringJob.update({
      where: { id: jobId },
      data: { failedCount: { increment: 1 } },
    });
  });

  await checkAndFinalizeJob(jobId);
}

async function checkAndFinalizeJob(jobId: string) {
  const job = await prisma.scoringJob.findUnique({
    where: { id: jobId },
  });

  if (!job) return;

  const totalDone = job.completedCount + job.failedCount;
  if (totalDone >= job.totalCount) {
    let finalStatus = "completed";
    if (job.failedCount > 0) {
      finalStatus = job.completedCount === 0 ? "failed" : "partial_failed";
    }
    await prisma.scoringJob.update({
      where: { id: jobId },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
      },
    });
  }
}

// Process all queued items for a job (worker runner)
export async function runJobWorker(jobId: string): Promise<void> {
  const items = await prisma.scoringJobItem.findMany({
    where: { jobId, status: "queued" },
    select: { id: true },
  });

  for (const item of items) {
    await processScoringJobItem(item.id);
  }
}

// Retry failed items: creates a NEW scoring job
export async function retryFailedScoringJob(jobId: string, requestedByUserId: string) {
  const failedItems = await prisma.scoringJobItem.findMany({
    where: { jobId, status: "failed" },
    include: { revision: true },
  });

  if (failedItems.length === 0) {
    throw new ScoringJobError("NO_FAILED_ITEMS", "Tidak ada item gagal yang dapat dicoba ulang pada job ini");
  }

  const newJob = await prisma.$transaction(async (tx) => {
    const createdJob = await tx.scoringJob.create({
      data: {
        requestedBy: requestedByUserId,
        status: "queued",
        totalCount: failedItems.length,
        completedCount: 0,
        failedCount: 0,
      },
    });

    await tx.scoringJobItem.createMany({
      data: failedItems.map((old) => ({
        jobId: createdJob.id,
        claimId: old.claimId,
        claimRevisionId: old.claimRevisionId,
        status: "queued",
        attemptNumber: old.attemptNumber + 1,
      })),
    });

    return createdJob;
  });

  return newJob;
}
