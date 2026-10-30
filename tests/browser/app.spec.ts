import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page, role: "admin" | "reviewer" = "admin") {
  const response = await page.request.post("/api/auth/login", { data: { role }, headers: { Origin: "http://localhost:3010" } });
  expect(response.ok()).toBeTruthy();
}

test.beforeEach(async ({ page }) => { await login(page); });

test("desktop navigation and import dialog keyboard flow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop-only interaction");
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard JAGA-CLAIM" })).toBeVisible();
  await page.getByRole("link", { name: "Data Klaim" }).click();
  await expect(page.getByRole("heading", { name: "Data Klaim FKRTL" })).toBeVisible();
  await page.getByRole("button", { name: "Import JSONL Klaim" }).click();
  await expect(page.getByRole("dialog", { name: "Import Curated JSONL Klaim" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Import Curated JSONL Klaim" })).toBeHidden();
});

test("invalid import file is rejected without exposing payload", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop-chromium", "desktop-only import interaction");
  await page.goto("/claims");
  await page.getByRole("button", { name: "Import JSONL Klaim" }).click();
  await page.getByLabel("Pilih file curated JSONL (.jsonl)").setInputFiles({
    name: "invalid.txt",
    mimeType: "text/plain",
    buffer: Buffer.from('{"raw_patient_id":"should-not-be-rendered"}'),
  });
  await page.getByRole("button", { name: /Validasi & Pratinjau/ }).click();
  const alert = page.getByRole("dialog", { name: "Import Curated JSONL Klaim" }).getByRole("alert");
  await expect(alert).toContainText("ekstensi .jsonl");
  await expect(alert).not.toContainText("should-not-be-rendered");
});

test("failed scoring exposes safe admin retry state", async ({ page }) => {
  const response = await page.request.get("/api/claims?scoring_status=failed&page_size=1");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  test.skip(body.data.length === 0, "seed has no failed scoring item");
  await page.goto(`/claims/${body.data[0].id}/analysis`);
  await expect(page.getByRole("heading", { name: "Scoring Terakhir Gagal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba Ulang Scoring" })).toBeVisible();
});

test("claim detail and analysis expose auditable revision state", async ({ page }) => {
  const response = await page.request.get("/api/claims?scoring_status=completed&page_size=1");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.data.length).toBeGreaterThan(0);
  const claim = body.data[0];

  await page.goto(`/claims/${claim.id}`);
  await expect(page.getByRole("heading", { name: claim.claim_key })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Riwayat Scoring Revisi" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Riwayat Review Revisi" })).toBeVisible();
  await expect(page.getByRole("button", { name: /edit/i })).toHaveCount(0);

  await page.goto(`/claims/${claim.id}/analysis`);
  await expect(page.getByRole("heading", { name: /Prioritas Peninjauan/ })).toBeVisible();
  await expect(page.getByText(/Skor risiko adalah indikator urutan prioritas/)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBeFalsy();
});

test("reviewer cannot access admin import endpoint", async ({ page }) => {
  await login(page, "reviewer");
  await page.goto("/claims");
  await expect(page.getByRole("button", { name: "Import JSONL Klaim" })).toHaveCount(0);
  const response = await page.request.post("/api/claims/import/preview", {
    multipart: { file: { name: "empty.jsonl", mimeType: "application/x-ndjson", buffer: Buffer.from("{}") } },
    headers: { Origin: "http://localhost:3010" },
  });
  expect(response.status()).toBe(403);
});

test("mutation CSRF and baseline response headers are enforced", async ({ page }) => {
  const rejected = await page.request.post("/api/auth/login", {
    data: { role: "admin" },
    headers: { Origin: "https://attacker.example" },
  });
  expect(rejected.status()).toBe(403);

  const response = await page.request.get("/dashboard");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
});

test("API authentication, role authorization, and unknown-object handling are enforced", async ({ page }) => {
  const origin = { Origin: "http://localhost:3010" };
  const logout = await page.request.post("/api/auth/logout", { headers: origin });
  expect(logout.ok()).toBeTruthy();
  for (const path of ["/api/claims", "/api/risk-queue", "/api/dashboard/summary", "/api/reviews", "/api/system/readiness"]) {
    expect((await page.request.get(path)).status(), path).toBe(401);
  }

  await login(page, "reviewer");
  const missingId = "00000000-0000-4000-8000-000000000000";
  expect((await page.request.get(`/api/claims/${missingId}`)).status()).toBe(404);
  const scoring = await page.request.post("/api/scoring-jobs", {
    data: { targets: [] },
    headers: origin,
  });
  expect(scoring.status()).toBe(403);
});

for (const path of ["/dashboard", "/claims", "/risk-queue", "/reviews"]) {
  test(`@a11y ${path} has no serious accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await page.locator("main").waitFor();
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((violation) => ["critical", "serious"].includes(violation.impact || ""));
    const diagnostic = serious.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    }));
    expect(serious, JSON.stringify(diagnostic, null, 2)).toEqual([]);
  });
}

test("mobile navigation works without horizontal page overflow", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-360", "mobile-only interaction");
  await page.goto("/dashboard");
  const menu = page.getByRole("button", { name: /menu/i });
  await menu.click();
  await page.getByRole("link", { name: "Risk Queue" }).click();
  await expect(page.getByRole("heading", { name: /Risk Queue/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBeFalsy();
});
