import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";
import { prisma } from "../../src/lib/db";
import { previewCuratedJsonl, confirmCuratedImport } from "../../src/lib/services/import-service";
import { createScoringJob, runJobWorker } from "../../src/lib/services/scoring-job-service";
import { getRiskQueue, getClaimDetail, getClaimAnalysis } from "../../src/lib/services/claim-service";
import { createReview } from "../../src/lib/services/review-service";

describe("TEST-003: E2E Full Workflow", () => {
  let adminUser: any;
  let reviewerUser: any;

  beforeAll(async () => {
    adminUser = await prisma.user.findFirst({ where: { role: "admin" } });
    reviewerUser = await prisma.user.findFirst({ where: { role: "reviewer" } });
  });

  it("completes full cycle: import -> score -> queue -> analysis -> review -> rescore", async () => {
    const uniqueHex = crypto.randomBytes(10).toString("hex");
    const testClaimKey = `CLM_${uniqueHex}`;
    const testParticipantKey = `PST_${uniqueHex}`;

    // 1. Prepare JSONL for Revision 1
    const row1 = {
      schema_version: "jaga-claim-curated-v1",
      claim_id: testClaimKey,
      participant_key: testParticipantKey,
      source_revision: 1,
      snapshot_at: "2026-10-24T08:00:00Z",
      episode: {
        admission_date: "2026-10-10",
        discharge_date: "2026-10-24", // LOS 14 days
        service_level: "RITL",
        provider_type: "1",
        provider_region: "31",
        care_class: "1",
        tariff_regional: "1",
      },
      diagnoses: {
        primary_icd10: "J189",
        secondary_icd10: ["A419"],
      },
      casemix: {
        inacbg_code: "J-4-16-III",
        severity: "III",
      },
      procedures: {
        procedure_type: "9396",
        special_codes: {},
      },
      financial_pre_submit: {
        billed_cost: 25000000,
        cbg_tariff: 25000000,
        special_tariffs: {},
      },
    };

    const jsonlContent1 = JSON.stringify(row1);

    // 2. Import Preview & Confirm
    const preview1 = await previewCuratedJsonl(jsonlContent1, "e2e_test_rev1.jsonl");
    expect(preview1.importedClaimsCount).toBe(1);
    expect(preview1.rejectedCount).toBe(0);

    const confirm1 = await confirmCuratedImport(preview1.previewToken, adminUser.id, "e2e_test_rev1.jsonl");
    expect(confirm1.importedClaims).toBe(1);
    expect(confirm1.importedRevisions).toBe(1);

    // Verify claim exists in DB
    const claim = await prisma.claim.findUnique({
      where: { claimKey: testClaimKey },
      include: { revisions: true },
    });
    expect(claim).toBeDefined();
    expect(claim?.revisions.length).toBe(1);
    const rev1Id = claim!.revisions[0].id;

    // 3. Trigger Scoring Job
    const job = await createScoringJob(adminUser.id, [
      { claim_id: claim!.id, claim_revision_id: rev1Id },
    ]);
    expect(job.status).toBe("queued");

    // Worker processes item
    await runJobWorker(job.id);

    // Verify prediction created
    const analysis1 = await getClaimAnalysis(claim!.id);
    expect(analysis1).toBeDefined();
    expect(analysis1?.risk_band).toBe("high");
    expect(analysis1?.reason_codes).toContain("LOS_PEER_OUTLIER");
    expect(analysis1?.is_stale).toBe(false);

    // 4. Verify in Risk Queue
    const queue = await getRiskQueue({ page: 1, pageSize: 50 });
    const queueItem = queue.data.find((q) => q.claim_key === testClaimKey);
    expect(queueItem).toBeDefined();
    expect(queueItem?.review_state).toBe("awaiting_review");

    // 5. Reviewer Workspace: Review 1 (Confirm)
    const review1Res = await createReview({
      claimId: claim!.id,
      predictionId: analysis1!.prediction_id!,
      reviewerId: reviewerUser.id,
      action: "confirm",
      notes: "Konfirmasi awal LOS 14 hari",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(review1Res.review.action).toBe("confirm");

    // Check queue state updated to finding_confirmed
    const queueAfterReview1 = await getRiskQueue({ page: 1, pageSize: 50 });
    const queueItemAfter1 = queueAfterReview1.data.find((q) => q.claim_key === testClaimKey);
    expect(queueItemAfter1?.review_state).toBe("finding_confirmed");

    // 6. Review 2 (Supersedes Review 1: request_correction)
    const review2Res = await createReview({
      claimId: claim!.id,
      predictionId: analysis1!.prediction_id!,
      reviewerId: reviewerUser.id,
      action: "request_correction",
      notes: "Perlu perbaikan tanggal rawat pada SIMRS",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(review2Res.review.action).toBe("request_correction");
    expect(review2Res.review.supersedesReviewId).toBe(review1Res.review.id);

    // 7. Source system sends Revision 2
    const row2 = {
      ...row1,
      source_revision: 2,
      snapshot_at: "2026-10-25T02:00:00Z",
      episode: {
        ...row1.episode,
        discharge_date: "2026-10-14", // Corrected to 4 days LOS
      },
    };
    const jsonlContent2 = JSON.stringify(row2);
    const preview2 = await previewCuratedJsonl(jsonlContent2, "e2e_test_rev2.jsonl");
    expect(preview2.importedRevisionsCount).toBe(1);

    await confirmCuratedImport(preview2.previewToken, adminUser.id, "e2e_test_rev2.jsonl");

    // Verify claim now has 2 revisions
    const detailAfterRev2 = await getClaimDetail(claim!.id);
    expect(detailAfterRev2?.latest_revision_number).toBe(2);
    expect(detailAfterRev2?.all_revisions.length).toBe(2);

    // Check that analysis indicates stale before new scoring
    const analysisBeforeRescore = await getClaimAnalysis(claim!.id);
    expect(analysisBeforeRescore?.is_stale).toBe(true);

    // 8. Rescore Revision 2
    const rev2Id = detailAfterRev2!.selected_revision.id;
    const rescoreJob = await createScoringJob(adminUser.id, [
      { claim_id: claim!.id, claim_revision_id: rev2Id },
    ]);
    await runJobWorker(rescoreJob.id);

    // 9. Verify state resets to awaiting_review for the new prediction
    const analysisAfterRescore = await getClaimAnalysis(claim!.id);
    expect(analysisAfterRescore?.is_stale).toBe(false);
    expect(analysisAfterRescore?.revision_number).toBe(2);
    expect(analysisAfterRescore?.prediction_id).not.toBe(analysis1!.prediction_id);

    const queueAfterRescore = await getRiskQueue({ page: 1, pageSize: 50 });
    const queueItemAfterRescore = queueAfterRescore.data.find((q) => q.claim_key === testClaimKey);
    expect(queueItemAfterRescore?.review_state).toBe("awaiting_review");
    expect(queueItemAfterRescore?.latest_revision).toBe(2);
  });
});
