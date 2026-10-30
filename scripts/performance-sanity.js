const { performance } = require("node:perf_hooks");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function collectPlan(node, summary) {
  if (!node || typeof node !== "object") return;
  if (node["Node Type"]) summary.nodeTypes.add(node["Node Type"]);
  if (node["Index Name"]) summary.indexes.add(node["Index Name"]);
  for (const child of node.Plans || []) collectPlan(child, summary);
}

async function explainWithIndexes(sql, value) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL enable_seqscan = off");
    const rows = await tx.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, value);
    return rows[0]["QUERY PLAN"][0];
  });
}

async function main() {
  const claim = await prisma.claim.findFirst({ select: { id: true } });
  if (!claim) throw new Error("Seed sintetis diperlukan sebelum performance sanity");

  const started = performance.now();
  const revisionPlan = await explainWithIndexes(
    "SELECT id FROM claim_revisions WHERE claim_id = $1::uuid ORDER BY revision_number DESC LIMIT 1",
    claim.id,
  );
  const predictionPlan = await explainWithIndexes(
    "SELECT id FROM predictions WHERE claim_id = $1::uuid ORDER BY scored_at DESC, id DESC LIMIT 1",
    claim.id,
  );
  const elapsedMs = performance.now() - started;

  const summary = { nodeTypes: new Set(), indexes: new Set() };
  collectPlan(revisionPlan.Plan, summary);
  collectPlan(predictionPlan.Plan, summary);
  const indexes = [...summary.indexes].sort();
  const requiredGroups = [
    ["idx_claim_revisions_latest", "claim_revisions_claim_id_revision_number_key"],
    ["idx_predictions_claim_latest"],
  ];
  const missing = requiredGroups.filter((group) => !group.some((name) => indexes.includes(name)));

  console.log(JSON.stringify({
    scope: "synthetic-local-sanity-not-production-benchmark",
    measured_ms: Number(elapsedMs.toFixed(2)),
    execution_ms: Number((revisionPlan["Execution Time"] + predictionPlan["Execution Time"]).toFixed(3)),
    node_types: [...summary.nodeTypes].sort(),
    indexes,
    accepted_index_groups: requiredGroups,
    forced_index_planner: true,
    passed: missing.length === 0,
    missing_index_groups: missing,
  }, null, 2));
  if (missing.length) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Performance sanity gagal");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
