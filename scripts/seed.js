const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function canonicalizeJson(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return "[" + obj.map(canonicalizeJson).join(",") + "]";
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalizeJson(obj[k])).join(",") + "}";
}

function computePayloadChecksum(payload) {
  return crypto.createHash("sha256").update(canonicalizeJson(payload)).digest("hex");
}

async function main() {
  console.log("Starting idempotent seed...");

  // 1. Create or update Demo Users
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@jagaclaim.local" },
    update: { displayName: "Admin JAGA-CLAIM", role: "admin" },
    create: {
      displayName: "Admin JAGA-CLAIM",
      email: "admin@jagaclaim.local",
      role: "admin",
    },
  });

  const reviewerUser = await prisma.user.upsert({
    where: { email: "reviewer@jagaclaim.local" },
    update: { displayName: "reviewer ganteng", role: "reviewer" },
    create: {
      displayName: "reviewer ganteng",
      email: "reviewer@jagaclaim.local",
      role: "reviewer",
    },
  });

  console.log(`Users seeded: Admin (${adminUser.email}), Reviewer (${reviewerUser.email})`);

  // 2. Create Initial Demo Import Batch
  const batchChecksum = crypto.createHash("sha256").update("seed-synthetic-batch-v1").digest("hex");
  const demoBatch = await prisma.importBatch.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      importedBy: adminUser.id,
      schemaVersion: "jaga-claim-curated-v1",
      sourceName: "synthetic_demo_seed_v1.jsonl",
      fileChecksum: batchChecksum,
      status: "completed",
      totalCount: 8,
      importedClaimCount: 8,
      importedRevisionCount: 9,
      duplicateCount: 0,
      rejectedCount: 0,
      finishedAt: new Date(),
    },
  });

  // 3. Synthetic claims data definitions (8 distinct clinical episodes)
  const claimsData = [
    {
      claimKey: "CLM_00000000000000000001",
      participantKey: "PST_00000000000000000001",
      scenario: "flagged_high_multi_review",
      admission: "2026-10-10",
      discharge: "2026-10-24", // LOS 14 days
      primaryIcd10: "J189",
      secondaryIcd10: ["A419", "E119"],
      inacbg: "J-4-16-III",
      billedCost: 28500000,
      score: 0.8712,
      band: "high",
      reasonCodes: ["LOS_PEER_OUTLIER", "COST_PEER_OUTLIER"],
      evidence: [
        {
          feature: "los_days",
          value: "14 hari",
          reference: "Median peer 4 hari (p95 = 8 hari); cohort RITL Kelas 1",
        },
        {
          feature: "billed_cost",
          value: "Rp28.500.000",
          reference: "Median peer Rp12.400.000; robust z = 19.2",
        },
      ],
    },
    {
      claimKey: "CLM_00000000000000000002",
      participantKey: "PST_00000000000000000002",
      scenario: "no_flags_low",
      admission: "2026-10-18",
      discharge: "2026-10-21",
      primaryIcd10: "A090",
      secondaryIcd10: [],
      inacbg: "K-4-17-I",
      billedCost: 3200000,
      score: 0.0245,
      band: "low",
      reasonCodes: [],
      evidence: [],
    },
    {
      claimKey: "CLM_00000000000000000003",
      participantKey: "PST_00000000000000000003",
      scenario: "anomaly_without_reason",
      admission: "2026-10-15",
      discharge: "2026-10-18",
      primaryIcd10: "I200",
      secondaryIcd10: ["I10"],
      inacbg: "I-4-10-II",
      billedCost: 14750000,
      score: 0.6521,
      band: "high",
      reasonCodes: [],
      evidence: [
        {
          feature: "anomaly_score",
          value: "persentil 99.8",
          reference: "Isolation Forest: kombinasi fitur tidak lazim; bukan probabilitas fraud",
        },
      ],
    },
    {
      claimKey: "CLM_00000000000000000004",
      participantKey: "PST_00000000000000000004",
      scenario: "medium_coding_mismatch",
      admission: "2026-10-19",
      discharge: "2026-10-22",
      primaryIcd10: "E115",
      secondaryIcd10: ["I702"],
      inacbg: "E-4-10-II",
      billedCost: 8900000,
      score: 0.158,
      band: "medium",
      reasonCodes: ["CODING_MISMATCH"],
      evidence: [
        {
          feature: "rule_code",
          value: "CM02",
          reference: "Kombinasi diagnosis DM dengan komplikasi vaskular memerlukan kode prosedur penjelas",
        },
      ],
    },
    {
      claimKey: "CLM_00000000000000000005",
      participantKey: "PST_00000000000000000005",
      scenario: "multi_revision", // Will have Rev 1 and Rev 2
      admission: "2026-10-12",
      discharge: "2026-10-16",
      primaryIcd10: "K297",
      secondaryIcd10: ["D649"],
      inacbg: "K-4-18-I",
      billedCost: 5400000,
      score: 0.089,
      band: "medium",
      reasonCodes: ["DATA_QUALITY"],
      evidence: [
        {
          feature: "tariff_comparison",
          value: "Rp5.400.000",
          reference: "DQ04: Tarif kelas perawatan tidak selaras kelas regional",
        },
      ],
    },
    {
      claimKey: "CLM_00000000000000000006",
      participantKey: "PST_00000000000000000006",
      scenario: "not_scored",
      admission: "2026-10-22",
      discharge: "2026-10-24",
      primaryIcd10: "S060",
      secondaryIcd10: [],
      inacbg: "N-4-10-I",
      billedCost: 4100000,
    },
    {
      claimKey: "CLM_00000000000000000007",
      participantKey: "PST_00000000000000000007",
      scenario: "failed_scoring_item", // Item failed 503
      admission: "2026-10-20",
      discharge: "2026-10-23",
      primaryIcd10: "B509",
      secondaryIcd10: [],
      inacbg: "A-4-13-I",
      billedCost: 4950000,
      isFailedItem: true,
    },
    {
      claimKey: "CLM_00000000000000000008",
      participantKey: "PST_00000000000000000008",
      scenario: "temporal_repeat_high",
      admission: "2026-10-21",
      discharge: "2026-10-24",
      primaryIcd10: "J189",
      secondaryIcd10: [],
      inacbg: "J-4-16-I",
      billedCost: 9800000,
      score: 0.785,
      band: "high",
      reasonCodes: ["TEMPORAL_REPEAT", "POSSIBLE_DUPLICATE"],
      evidence: [
        {
          feature: "readmit_gap_days",
          value: "2 hari",
          reference: "Rawat inap ulang dengan diagnosis primer sama; gap <= 7 hari",
        },
      ],
    },
  ];

  // Create demo scoring job for synthetic items
  const demoJob = await prisma.scoringJob.upsert({
    where: { id: "00000000-0000-0000-0000-000000000020" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000020",
      requestedBy: adminUser.id,
      status: "completed",
      totalCount: 7,
      completedCount: 6,
      failedCount: 1,
      startedAt: new Date("2026-10-24T03:00:00Z"),
      finishedAt: new Date("2026-10-24T03:00:05Z"),
    },
  });

  for (let i = 0; i < claimsData.length; i++) {
    const data = claimsData[i];
    const claim = await prisma.claim.upsert({
      where: { claimKey: data.claimKey },
      update: { participantKey: data.participantKey },
      create: {
        claimKey: data.claimKey,
        participantKey: data.participantKey,
      },
    });

    const clinicalPayload = {
      episode: {
        admission_date: data.admission,
        discharge_date: data.discharge,
        service_level: "RITL",
        provider_type: "1",
        provider_region: "31",
        care_class: "1",
        tariff_regional: "1",
      },
      diagnoses: {
        primary_icd10: data.primaryIcd10,
        secondary_icd10: data.secondaryIcd10,
      },
      casemix: {
        inacbg_code: data.inacbg,
        severity: "I",
      },
      procedures: {
        procedure_type: "9396",
        special_codes: {},
      },
      financial_pre_submit: {
        billed_cost: data.billedCost,
        cbg_tariff: data.billedCost,
        special_tariffs: {},
      },
    };

    const checksum = computePayloadChecksum(clinicalPayload);

    // Create Revision 1
    const rev1 = await prisma.claimRevision.upsert({
      where: {
        uq_claim_revisions_number: {
          claimId: claim.id,
          revisionNumber: 1,
        },
      },
      update: {},
      create: {
        claimId: claim.id,
        importBatchId: demoBatch.id,
        revisionNumber: 1,
        payloadChecksum: checksum,
        claimPayload: clinicalPayload,
        sourceSnapshotAt: new Date(`${data.discharge}T08:00:00Z`),
      },
    });

    // Handle multi-revision case (Claim 5: create Rev 2)
    let activeRevision = rev1;
    if (data.scenario === "multi_revision") {
      const rev2Payload = JSON.parse(JSON.stringify(clinicalPayload));
      rev2Payload.financial_pre_submit.billed_cost = 4800000;
      const rev2Checksum = computePayloadChecksum(rev2Payload);

      activeRevision = await prisma.claimRevision.upsert({
        where: {
          uq_claim_revisions_number: {
            claimId: claim.id,
            revisionNumber: 2,
          },
        },
        update: {},
        create: {
          claimId: claim.id,
          importBatchId: demoBatch.id,
          revisionNumber: 2,
          payloadChecksum: rev2Checksum,
          claimPayload: rev2Payload,
          sourceSnapshotAt: new Date("2026-10-25T04:00:00Z"),
        },
      });
    }

    if (data.scenario === "not_scored") {
      continue;
    }

    // Create Job Item
    const jobItem = await prisma.scoringJobItem.upsert({
      where: {
        uq_job_claim_revision: {
          jobId: demoJob.id,
          claimId: claim.id,
          claimRevisionId: activeRevision.id,
        },
      },
      update: {},
      create: {
        jobId: demoJob.id,
        claimId: claim.id,
        claimRevisionId: activeRevision.id,
        status: data.isFailedItem ? "failed" : "completed",
        attemptNumber: 1,
        errorCode: data.isFailedItem ? "SERVICE_UNAVAILABLE" : null,
        errorMessageSafe: data.isFailedItem ? "Layanan scoring gagal merespons" : null,
        startedAt: new Date("2026-10-24T03:00:01Z"),
        finishedAt: new Date("2026-10-24T03:00:02Z"),
      },
    });

    if (data.isFailedItem) {
      continue;
    }

    // Create Prediction
    const existingPred = await prisma.prediction.findUnique({
      where: { scoringJobItemId: jobItem.id },
    });

    let prediction = existingPred;
    if (!prediction) {
      prediction = await prisma.prediction.create({
        data: {
          claimId: claim.id,
          claimRevisionId: activeRevision.id,
          scoringJobItemId: jobItem.id,
          riskScore: data.score,
          riskBand: data.band,
          evidence: data.evidence,
          modelVersion: "hybrid-v1.0.0-demo",
          ruleVersion: "rules-v1.0.0-demo",
          source: "mock",
          scoredAt: new Date("2026-10-24T03:00:02Z"),
        },
      });

      if (data.reasonCodes && data.reasonCodes.length > 0) {
        await prisma.riskFinding.createMany({
          data: data.reasonCodes.map((rc) => ({
            predictionId: prediction.id,
            reasonCode: rc,
          })),
          skipDuplicates: true,
        });
      }
    }

    // Create multiple reviews for claim 1 (confirm, then request_correction with supersedes)
    if (data.scenario === "flagged_high_multi_review" && prediction) {
      const review1Id = "00000000-0000-0000-0000-000000000101";
      const review1 = await prisma.review.upsert({
        where: { id: review1Id },
        update: {},
        create: {
          id: review1Id,
          claimId: claim.id,
          predictionId: prediction.id,
          reviewerId: reviewerUser.id,
          idempotencyKey: "00000000-0000-0000-0000-000000000201",
          action: "confirm",
          notes: "Temuan lama rawat 14 hari terkonfirmasi menyimpang signifikan dari cohort.",
          reviewedAt: new Date("2026-10-24T04:00:00Z"),
        },
      });

      const review2Id = "00000000-0000-0000-0000-000000000102";
      await prisma.review.upsert({
        where: { id: review2Id },
        update: {},
        create: {
          id: review2Id,
          claimId: claim.id,
          predictionId: prediction.id,
          reviewerId: reviewerUser.id,
          supersedesReviewId: review1.id,
          idempotencyKey: "00000000-0000-0000-0000-000000000202",
          action: "request_correction",
          notes: "Setelah koordinasi dengan DPJP, episode ini memerlukan koreksi data billing di SIMRS sumber.",
          reviewedAt: new Date("2026-10-24T05:30:00Z"),
        },
      });
    }
  }

  console.log("Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
