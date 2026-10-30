import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReviewer, AuthError } from "@/lib/auth";
import { guardMutation } from "@/lib/request-security";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { createSafeErrorEnvelope } from "@/lib/logger";
import { mlScoreResponseSchema } from "@/lib/contracts/ml-contract";
import { explanationResponseSchema } from "@/lib/contracts/ml-explanation";

export const maxDuration = 60;
const requestSchema = z.object({ prediction_id: z.string().uuid() }).strict();
const error = (status: number, code: string, message: string) => NextResponse.json(createSafeErrorEnvelope(code, message), { status });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireReviewer(req);
    guardMutation(req, user.id, "claim-explanation", 10);
    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!z.string().uuid().safeParse(params.id).success || !parsed.success) {
      return error(400, "INVALID_REQUEST", "ID klaim dan prediction harus valid");
    }
    const env = getEnv();
    if (env.SCORING_PROVIDER !== "http") return error(409, "EXPLANATION_UNAVAILABLE", "Penjelasan layanan ML tersedia pada mode HTTP");

    const prediction = await prisma.prediction.findFirst({
      where: { id: parsed.data.prediction_id, claimId: params.id },
      include: { claim: { select: { claimKey: true } }, findings: true },
    });
    if (!prediction) return error(404, "PREDICTION_NOT_FOUND", "Prediction untuk klaim ini tidak ditemukan");
    if (prediction.source !== "http") return error(409, "MOCK_PREDICTION", "Hasil simulasi tidak dikirim ke layanan penjelasan nyata");

    const payload = mlScoreResponseSchema.safeParse({
      claim_id: prediction.claim.claimKey,
      risk_score: Number(prediction.riskScore),
      risk_band: prediction.riskBand,
      reason_codes: prediction.findings.map((finding) => finding.reasonCode),
      evidence: prediction.evidence,
      model_version: prediction.modelVersion,
      rule_version: prediction.ruleVersion,
      scored_at: prediction.scoredAt.toISOString(),
    });
    if (!payload.success) return error(409, "INVALID_PREDICTION", "Data prediction tidak memenuhi kontrak penjelasan");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.ML_EXPLAIN_TIMEOUT_MS);
    try {
      const upstream = await fetch(`${env.ML_SERVICE_URL.replace(/\/$/, "")}/v1/explain`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", ...(env.ML_SERVICE_TOKEN ? { Authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : {}) },
        body: JSON.stringify(payload.data),
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
      if (!upstream.ok) return error(502, "EXPLANATION_SERVICE_ERROR", "Layanan penjelasan belum dapat memenuhi permintaan. Silakan coba lagi.");
      const explanation = explanationResponseSchema.safeParse(await upstream.json());
      if (!explanation.success || explanation.data.claim_id !== payload.data.claim_id) {
        return error(502, "EXPLANATION_CONTRACT_ERROR", "Respons penjelasan tidak sesuai kontrak atau klaim");
      }
      return NextResponse.json({ ...explanation.data, prediction_id: prediction.id }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return controller.signal.aborted
        ? error(504, "EXPLANATION_TIMEOUT", "Waktu tunggu penjelasan habis. Silakan coba lagi.")
        : error(502, "EXPLANATION_UNAVAILABLE", "Layanan penjelasan tidak dapat dihubungi atau respons tidak valid");
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err instanceof AuthError) return error(err.status, err.code, err.message);
    return error(500, "INTERNAL_ERROR", "Penjelasan belum dapat dimuat");
  }
}
