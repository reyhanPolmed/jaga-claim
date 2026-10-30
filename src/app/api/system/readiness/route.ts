import { NextResponse } from "next/server";
import { AuthError, requireReviewer } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request) {
  try {
    const user = await requireReviewer(req);
    const env = getEnv();
    const mode = env.SCORING_PROVIDER;
    if (user.role !== "admin") return NextResponse.json({ provider_mode: mode });

    const startedAt = Date.now();
    let database: "ready" | "unavailable" = "ready";
    try { await prisma.$queryRaw`SELECT 1`; } catch { database = "unavailable"; }

    let provider: "ready" | "simulation" | "unavailable" = "simulation";
    if (mode === "http") {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(env.ML_SERVICE_TIMEOUT_MS, 3000));
      try {
        const response = await fetch(`${env.ML_SERVICE_URL.replace(/\/$/, "")}/health`, {
          signal: controller.signal,
          cache: "no-store",
          headers: env.ML_SERVICE_TOKEN ? { Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : undefined,
        });
        if (response.ok) {
          const health = await response.json().catch(() => null) as { status?: unknown } | null;
          provider = health?.status === "ok" ? "ready" : "unavailable";
        } else {
          provider = "unavailable";
        }
      } catch {
        provider = "unavailable";
      } finally {
        clearTimeout(timeout);
      }
    }

    return NextResponse.json({
      provider_mode: mode,
      database,
      provider,
      checked_at: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
    });
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json(createSafeErrorEnvelope(error.code, error.message), { status: error.status });
    return NextResponse.json(createSafeErrorEnvelope("READINESS_FAILED", "Status kesiapan tidak dapat diperiksa"), { status: 500 });
  }
}
