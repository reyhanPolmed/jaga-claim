const { spawnSync } = require("node:child_process");

if (process.env.SCORING_PROVIDER !== "http" || !process.env.ML_SERVICE_URL) {
  console.error("Set SCORING_PROVIDER=http dan ML_SERVICE_URL ke instance ML yang disepakati sebelum contract test live");
  process.exit(2);
}

const result = spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "tests/contract/live-ml.test.ts"], {
  env: { ...process.env, RUN_LIVE_ML_CONTRACT: "1" },
  stdio: "inherit",
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
