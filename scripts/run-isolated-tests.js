const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const suite = process.argv[2];
if (!suite || !suite.startsWith("tests/")) {
  console.error("Usage: node scripts/run-isolated-tests.js tests/<suite>");
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL wajib tersedia untuk test database terisolasi");
  process.exit(2);
}

const schemaName = `jaga_claim_test_${crypto.randomBytes(6).toString("hex")}`;
const baseUrl = new URL(process.env.DATABASE_URL);
const testUrl = new URL(process.env.DATABASE_URL);
testUrl.searchParams.set("schema", schemaName);
const admin = new PrismaClient({ datasources: { db: { url: baseUrl.toString() } } });
const testEnv = {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
  NODE_ENV: "test",
  SCORING_PROVIDER: "mock",
};

function run(modulePath, args) {
  const result = spawnSync(process.execPath, [modulePath, ...args], { env: testEnv, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${args.join(" ")} gagal dengan exit code ${result.status}`);
}

async function main() {
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    run("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
    const seed = spawnSync(process.execPath, ["scripts/seed.js"], { env: testEnv, stdio: "inherit", shell: false });
    if (seed.error) throw seed.error;
    if (seed.status !== 0) throw new Error(`seed gagal dengan exit code ${seed.status}`);
    run("node_modules/vitest/vitest.mjs", ["run", "--dir", suite]);
    const reset = spawnSync(process.execPath, ["scripts/reset-dev.js"], { env: testEnv, stdio: "inherit", shell: false });
    if (reset.error) throw reset.error;
    if (reset.status !== 0) throw new Error(`reset test gagal dengan exit code ${reset.status}`);
    run("node_modules/prisma/build/index.js", ["migrate", "deploy"]);
  } finally {
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await admin.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Isolated test runner gagal");
  process.exit(1);
});
