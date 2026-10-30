import { NextResponse } from "next/server";
import { requireReviewer, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createReview, ReviewValidationError } from "@/lib/services/review-service";
import { createSafeErrorEnvelope } from "@/lib/logger";
import { guardMutation } from "@/lib/request-security";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireReviewer(req);

    const reviews = await prisma.review.findMany({
      where: { claimId: params.id },
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
      include: {
        reviewer: { select: { id: true, displayName: true, email: true } },
        prediction: { select: { id: true, riskScore: true, riskBand: true, modelVersion: true } },
      },
    });

    return NextResponse.json({
      data: reviews.map((r) => ({
        id: r.id,
        claim_id: r.claimId,
        prediction_id: r.predictionId,
        action: r.action,
        notes: r.notes,
        reviewer_name: r.reviewer.displayName,
        reviewer_email: r.reviewer.email,
        reviewed_at: r.reviewedAt.toISOString(),
        supersedes_review_id: r.supersedesReviewId,
        risk_band: r.prediction.riskBand,
        risk_score: Number(r.prediction.riskScore),
      })),
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil riwayat review"), { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireReviewer(req);
    guardMutation(req, user.id, "review-create", 40);
    const body = await req.json();

    const { action, notes, prediction_id, supersedes_review_id } = body;
    const idempotency_key = req.headers.get("idempotency-key");

    if (!action || !["confirm", "dismiss", "request_correction"].includes(action)) {
      return NextResponse.json(createSafeErrorEnvelope("INVALID_ACTION", "action harus salah satu dari: confirm, dismiss, request_correction"), { status: 400 });
    }

    if (!idempotency_key) {
      return NextResponse.json(createSafeErrorEnvelope("IDEMPOTENCY_KEY_REQUIRED", "idempotency_key wajib disertakan"), { status: 400 });
    }

    if (!prediction_id) {
      return NextResponse.json(createSafeErrorEnvelope("PREDICTION_ID_REQUIRED", "prediction_id wajib disertakan"), { status: 400 });
    }

    const result = await createReview({
      claimId: params.id,
      predictionId: prediction_id,
      reviewerId: user.id,
      action,
      notes,
      idempotencyKey: idempotency_key,
      supersedesReviewId: supersedes_review_id || null,
    });

    return NextResponse.json(
      {
        id: result.review.id,
        claim_id: result.review.claimId,
        prediction_id: result.review.predictionId,
        reviewer_id: user.id,
        action: result.review.action,
        notes: result.review.notes,
        is_duplicate: result.isDuplicate,
        reviewed_at: result.review.reviewedAt.toISOString(),
      },
      { status: result.isDuplicate ? 200 : 201 }
    );
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    if (err instanceof ReviewValidationError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: 400 });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal menyimpan keputusan review"), { status: 500 });
  }
}
