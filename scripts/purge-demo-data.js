const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const confirmed = process.argv.includes("--confirm");
const demoSourceName = /^(synthetic_demo_seed_v1|e2e_test_.*)\.jsonl$/;

async function getPlan() {
  const demoBatches = await prisma.importBatch.findMany({
    where: { sourceName: { startsWith: "synthetic_demo_seed_v1" } },
    select: { id: true, sourceName: true },
  });
  const e2eBatches = await prisma.importBatch.findMany({
    where: { sourceName: { startsWith: "e2e_test_" } },
    select: { id: true, sourceName: true },
  });
  const batches = [...demoBatches, ...e2eBatches].filter((batch) => demoSourceName.test(batch.sourceName));
  const batchIds = batches.map((batch) => batch.id);

  const revisions = batchIds.length
    ? await prisma.claimRevision.findMany({ where: { importBatchId: { in: batchIds } }, select: { claimId: true } })
    : [];
  const candidateClaimIds = [...new Set(revisions.map((revision) => revision.claimId))];
  const candidateClaims = candidateClaimIds.length
    ? await prisma.claim.findMany({
      where: { id: { in: candidateClaimIds } },
      select: { id: true, revisions: { select: { importBatchId: true } } },
    })
    : [];
  const demoClaimIds = candidateClaims
    .filter((claim) => claim.revisions.length > 0 && claim.revisions.every((revision) => revision.importBatchId && batchIds.includes(revision.importBatchId)))
    .map((claim) => claim.id);
  // Imports always attach a batch to every revision. Claims without revisions,
  // or whose revisions are all unbatched, are direct integration-test remnants
  // in this local database and cannot be valid operational imports.
  const unbatchedClaims = await prisma.claim.findMany({
    where: {
      OR: [
        { revisions: { none: {} } },
        { revisions: { every: { importBatchId: null } } },
      ],
    },
    select: { id: true },
  });
  const mockPredictions = await prisma.prediction.findMany({ where: { source: "mock" }, select: { id: true } });

  return {
    batches,
    batchIds,
    demoClaimIds: [...new Set([...demoClaimIds, ...unbatchedClaims.map((claim) => claim.id)])],
    mockPredictionIds: mockPredictions.map((prediction) => prediction.id),
  };
}

async function main() {
  const plan = await getPlan();
  const summary = {
    demo_import_batches: plan.batches.length,
    demo_claims_eligible_for_deletion: plan.demoClaimIds.length,
    mock_predictions_eligible_for_deletion: plan.mockPredictionIds.length,
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!confirmed) {
    console.log("Tidak ada data dihapus. Jalankan `npm.cmd run db:purge-demo -- --confirm` setelah meninjau jumlah di atas.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (plan.mockPredictionIds.length) {
      await tx.review.deleteMany({ where: { predictionId: { in: plan.mockPredictionIds } } });
      await tx.riskFinding.deleteMany({ where: { predictionId: { in: plan.mockPredictionIds } } });
      await tx.prediction.deleteMany({ where: { id: { in: plan.mockPredictionIds } } });
    }
    if (plan.demoClaimIds.length) {
      await tx.claim.deleteMany({ where: { id: { in: plan.demoClaimIds } } });
    }
    if (plan.batchIds.length) {
      await tx.importBatch.deleteMany({
        where: { id: { in: plan.batchIds }, revisions: { none: {} } },
      });
    }
  });

  console.log("Pembersihan selesai. Hanya seed sintetis/E2E dan prediction source=mock yang dihapus.");
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
