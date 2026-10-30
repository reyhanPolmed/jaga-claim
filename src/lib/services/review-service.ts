import { prisma } from "../db";
import { z } from "zod";

export const reviewActionSchema = z.enum(["confirm", "dismiss", "request_correction"]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;

export type DerivedReviewState =
  | "not_available"
  | "awaiting_review"
  | "finding_confirmed"
  | "dismissed"
  | "correction_requested";

export interface CreateReviewInput {
  claimId: string;
  predictionId: string;
  reviewerId: string;
  action: ReviewAction;
  notes?: string | null;
  idempotencyKey: string;
  supersedesReviewId?: string | null;
}

export class ReviewValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function deriveReviewState(latestPredictionExists: boolean, latestAction?: ReviewAction | null): DerivedReviewState {
  if (!latestPredictionExists) {
    return "not_available";
  }
  if (!latestAction) {
    return "awaiting_review";
  }
  switch (latestAction) {
    case "confirm":
      return "finding_confirmed";
    case "dismiss":
      return "dismissed";
    case "request_correction":
      return "correction_requested";
  }
}

export async function createReview(input: CreateReviewInput) {
  const { claimId, predictionId, reviewerId, action, notes, idempotencyKey, supersedesReviewId } = input;

  // 1. Check idempotency: if record with same idempotencyKey exists, return it
  const existingIdempotent = await prisma.review.findUnique({
    where: { idempotencyKey },
  });
  if (existingIdempotent) {
    return { review: existingIdempotent, isDuplicate: true };
  }

  // 2. Validate prediction belongs to claim
  const prediction = await prisma.prediction.findUnique({
    where: { id: predictionId },
  });
  if (!prediction || prediction.claimId !== claimId) {
    throw new ReviewValidationError(
      "INVALID_PREDICTION",
      "Prediction tidak ditemukan atau bukan milik klaim ini"
    );
  }

  // 3. Find latest existing review for this prediction to check action transitions
  const existingReviews = await prisma.review.findMany({
    where: { predictionId },
    orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
    take: 1,
  });
  const latestReview = existingReviews[0] ?? null;

  // 4. Validate notes requirement:
  // - dismiss and request_correction REQUIRE notes
  // - changing action from previous review REQUIRES notes
  const trimmedNotes = notes?.trim() || "";
  if ((action === "dismiss" || action === "request_correction") && trimmedNotes.length === 0) {
    throw new ReviewValidationError(
      "NOTES_REQUIRED",
      `Catatan wajib diisi untuk tindakan '${action === "dismiss" ? "Tidak Relevan" : "Minta Koreksi"}'`
    );
  }

  if (latestReview && latestReview.action !== action && trimmedNotes.length === 0) {
    throw new ReviewValidationError(
      "NOTES_REQUIRED",
      "Catatan wajib diisi ketika mengubah keputusan dari tinjauan sebelumnya"
    );
  }

  // 5. Validate supersedesReviewId if provided
  if (supersedesReviewId) {
    const targetSuperseded = await prisma.review.findUnique({
      where: { id: supersedesReviewId },
    });
    if (!targetSuperseded || targetSuperseded.predictionId !== predictionId) {
      throw new ReviewValidationError(
        "INVALID_SUPERSEDES",
        "supersedes_review_id harus menunjuk pada tinjauan pada prediksi yang sama"
      );
    }
  }

  // 6. Insert new review (append-only)
  const newReview = await prisma.review.create({
    data: {
      claimId,
      predictionId,
      reviewerId,
      action,
      notes: trimmedNotes || null,
      idempotencyKey,
      supersedesReviewId: supersedesReviewId ?? (latestReview ? latestReview.id : null),
    },
  });

  return { review: newReview, isDuplicate: false };
}
