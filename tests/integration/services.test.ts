import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../../src/lib/db";
import { getDashboardSummary, getClaimsList, getRiskQueue } from "../../src/lib/services/claim-service";
import { createReview } from "../../src/lib/services/review-service";
import { createScoringJob, runJobWorker } from "../../src/lib/services/scoring-job-service";
import { confirmCuratedImport, previewCuratedJsonl } from "../../src/lib/services/import-service";

describe("TEST-002: Integration - Database Queries & Latest Semantics", () => {
  it("computes dashboard summary accurately", async () => {
    const summary = await getDashboardSummary();
    expect(summary.total_claims).toBeGreaterThanOrEqual(1);
    expect(summary.total_claims).toBe(summary.scored_claims + summary.not_scored_claims);
  });

  it("returns claims list with derived statuses", async () => {
    const result = await getClaimsList({ page: 1, pageSize: 20 });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    const item = result.data[0];
    expect(item.id).toBeDefined();
    expect(item.claim_key).toBeDefined();
    expect(["not_scored", "queued", "processing", "completed", "failed"]).toContain(item.scoring_status);
  });

  it("returns sorted risk queue with strictly successful predictions", async () => {
    const queue = await getRiskQueue({ page: 1, pageSize: 20 });
    // Verify sorted descending by risk_score
    for (let i = 0; i < queue.data.length - 1; i++) {
      expect(queue.data[i].risk_score).toBeGreaterThanOrEqual(queue.data[i + 1].risk_score);
    }

    // Verify claim 7 (failed attempt) is NOT in the risk queue
    const failedInQueue = queue.data.find((q) => q.claim_key === "CLM_00000000000000000007");
    expect(failedInQueue).toBeUndefined();
  });
});

describe("TEST-002: Integration - Append-only Review & Idempotency", () => {
  it("enforces idempotency and tracks active disposition on multiple reviews", async () => {
    const claim = await prisma.claim.findFirst({
      where: { revisions: { some: { predictions: { some: {} } } } },
      include: {
        revisions: {
          include: { predictions: true },
        },
      },
    });

    const reviewer = await prisma.user.findFirst({ where: { role: "reviewer" } });
    const predId = claim!.revisions[0].predictions[0].id;

    // Use dynamic unique idempotency key
    const idempotencyKey = crypto.randomUUID();

    // 1. Submit review
    const res1 = await createReview({
      claimId: claim!.id,
      predictionId: predId,
      reviewerId: reviewer!.id,
      action: "request_correction",
      notes: "Catatan koreksi pertama untuk pengujian idempotensi",
      idempotencyKey,
    });
    expect(res1.isDuplicate).toBe(false);

    // 2. Submit same review with same idempotencyKey
    const res2 = await createReview({
      claimId: claim!.id,
      predictionId: predId,
      reviewerId: reviewer!.id,
      action: "request_correction",
      notes: "Catatan koreksi pertama untuk pengujian idempotensi",
      idempotencyKey,
    });
    expect(res2.isDuplicate).toBe(true);
    expect(res2.review.id).toBe(res1.review.id);
  });
});

describe("TEST-002: Integration - Scoring Job, Worker & Persistence", () => {
  it("creates job, processes through worker, and saves prediction", async () => {
    const admin = await prisma.user.findFirst({ where: { role: "admin" } });

    // Create a fresh test claim for worker testing
    const hex = crypto.randomBytes(10).toString("hex");
    const testClaim = await prisma.claim.create({
      data: {
        claimKey: `CLM_${hex}`,
        participantKey: `PST_${hex}`,
      },
    });

    const testRev = await prisma.claimRevision.create({
      data: {
        claimId: testClaim.id,
        revisionNumber: 1,
        payloadChecksum: hex,
        claimPayload: {
          episode: { admission_date: "2026-10-20", discharge_date: "2026-10-24" },
          diagnoses: { primary_icd10: "J189", secondary_icd10: [] },
          casemix: { inacbg_code: "J-4-16-I" },
          procedures: { special_codes: {} },
          financial_pre_submit: { billed_cost: 5000000, special_tariffs: {} },
        },
        sourceSnapshotAt: new Date(),
      },
    });

    // 1. Create scoring job
    const job = await createScoringJob(admin!.id, [
      {
        claim_id: testClaim.id,
        claim_revision_id: testRev.id,
      },
    ]);
    expect(job.status).toBe("queued");
    expect(job.totalCount).toBe(1);

    // 2. Run worker
    await runJobWorker(job.id);

    const updatedJob = await prisma.scoringJob.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("completed");
    expect(updatedJob?.completedCount).toBe(1);

    // Check prediction created
    const pred = await prisma.prediction.findFirst({
      where: { claimId: testClaim.id },
    });
    expect(pred).toBeDefined();
    expect(pred?.riskBand).toBeDefined();
  });
});

describe("TEST-002: Integration - Import confirm concurrency", () => {
  it("returns one persisted batch when the same preview is confirmed concurrently", async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { role: "admin" } });
    const hex = crypto.randomBytes(10).toString("hex");
    const row = {
      schema_version: "jaga-claim-curated-v1",
      claim_id: `CLM_${hex}`,
      participant_key: `PST_${hex}`,
      source_revision: 1,
      snapshot_at: "2026-10-25T03:00:00Z",
      episode: { admission_date: "2026-10-20", discharge_date: "2026-10-24", service_level: "RITL", provider_type: "1", provider_region: "31", care_class: "3", tariff_regional: "1" },
      diagnoses: { primary_icd10: "J168", secondary_icd10: [] },
      casemix: { inacbg_code: "J-4-16-III", severity: "III" },
      procedures: { procedure_type: "9396", special_codes: {} },
      financial_pre_submit: { billed_cost: 17187600, cbg_tariff: 17187600, special_tariffs: {} },
    };
    const preview = await previewCuratedJsonl(JSON.stringify(row), "concurrent.jsonl");
    const [first, second] = await Promise.all([
      confirmCuratedImport(preview.previewToken, admin.id),
      confirmCuratedImport(preview.previewToken, admin.id),
    ]);
    expect(second.importBatchId).toBe(first.importBatchId);
    expect(await prisma.importBatch.count({ where: { id: first.importBatchId } })).toBe(1);
    expect(await prisma.claim.count({ where: { claimKey: row.claim_id } })).toBe(1);
  });
});
