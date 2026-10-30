import { prisma } from "../db";
import { Prisma } from "@prisma/client";
import { DerivedReviewState } from "./review-service";

export type DerivedScoringStatus = "not_scored" | "queued" | "processing" | "completed" | "failed";

export interface ClaimListItem {
  id: string;
  claim_key: string;
  latest_revision: number;
  primary_icd10: string;
  admission_date?: string;
  discharge_date?: string;
  service_level?: string;
  scoring_status: DerivedScoringStatus;
  review_state: DerivedReviewState;
  risk_score: number | null;
  risk_band: string | null;
}

export interface ClaimQueryFilter {
  revisionState?: "revised";
  page?: number;
  pageSize?: number;
  q?: string;
  scoringStatus?: string;
  reviewState?: string;
  riskBand?: string;
  serviceLevel?: string;
  dateFrom?: string;
  dateTo?: string;
}

export async function getDashboardSummary() {
  type MetricsRow = {
    total_claims: bigint; scored_claims: bigint; queued: bigint; processing: bigint; failed: bigint;
    high: bigint; medium: bigint; low: bigint; awaiting_review: bigint; finding_confirmed: bigint;
    dismissed: bigint; correction_requested: bigint; reviews_completed: bigint; last_scored_at: Date | null;
  };
  const [metricRows, recentImports, recentJobs, recentReviews] = await Promise.all([
    prisma.$queryRaw<MetricsRow[]>(Prisma.sql`
      WITH latest_revision AS (
        SELECT cr.*, ROW_NUMBER() OVER (PARTITION BY claim_id ORDER BY revision_number DESC) AS rn FROM claim_revisions cr
      ), latest_attempt AS (
        SELECT sji.*, ROW_NUMBER() OVER (PARTITION BY claim_revision_id ORDER BY created_at DESC, attempt_number DESC, id DESC) AS rn FROM scoring_job_items sji
      ), latest_prediction AS (
        SELECT p.*, ROW_NUMBER() OVER (PARTITION BY claim_revision_id ORDER BY scored_at DESC, id DESC) AS rn FROM predictions p
      ), latest_review AS (
        SELECT r.*, ROW_NUMBER() OVER (PARTITION BY prediction_id ORDER BY reviewed_at DESC, id DESC) AS rn FROM reviews r
      ), base AS (
        SELECT c.id, la.status AS attempt_status, lp.id AS prediction_id, lp.risk_band, lp.scored_at, lrev.action
        FROM claims c
        LEFT JOIN latest_revision lr ON lr.claim_id = c.id AND lr.rn = 1
        LEFT JOIN latest_attempt la ON la.claim_revision_id = lr.id AND la.rn = 1
        LEFT JOIN latest_prediction lp ON lp.claim_revision_id = lr.id AND lp.rn = 1
        LEFT JOIN latest_review lrev ON lrev.prediction_id = lp.id AND lrev.rn = 1
      )
      SELECT COUNT(*) AS total_claims,
        COUNT(prediction_id) AS scored_claims,
        COUNT(*) FILTER (WHERE prediction_id IS NULL AND attempt_status = 'queued') AS queued,
        COUNT(*) FILTER (WHERE prediction_id IS NULL AND attempt_status = 'processing') AS processing,
        COUNT(*) FILTER (WHERE prediction_id IS NULL AND attempt_status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE risk_band = 'high') AS high,
        COUNT(*) FILTER (WHERE risk_band = 'medium') AS medium,
        COUNT(*) FILTER (WHERE risk_band = 'low') AS low,
        COUNT(*) FILTER (WHERE prediction_id IS NOT NULL AND action IS NULL) AS awaiting_review,
        COUNT(*) FILTER (WHERE action = 'confirm') AS finding_confirmed,
        COUNT(*) FILTER (WHERE action = 'dismiss') AS dismissed,
        COUNT(*) FILTER (WHERE action = 'request_correction') AS correction_requested,
        COUNT(*) FILTER (WHERE action IS NOT NULL) AS reviews_completed,
        MAX(scored_at) AS last_scored_at
      FROM base
    `),
    prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.scoringJob.findMany({ orderBy: { createdAt: "desc" }, take: 4 }),
    prisma.review.findMany({
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
      take: 4,
      include: { claim: { select: { claimKey: true } } },
    }),
  ]);
  const metrics = metricRows[0];
  const totalClaims = Number(metrics?.total_claims || 0);
  const scoredClaims = Number(metrics?.scored_claims || 0);
  const notScoredClaims = totalClaims - scoredClaims;
  const reviewsCompleted = Number(metrics?.reviews_completed || 0);
  const scoring = { queued: Number(metrics?.queued || 0), processing: Number(metrics?.processing || 0), failed: Number(metrics?.failed || 0) };
  const riskBands = { high: Number(metrics?.high || 0), medium: Number(metrics?.medium || 0), low: Number(metrics?.low || 0) };
  const reviewStates = {
    awaiting_review: Number(metrics?.awaiting_review || 0),
    finding_confirmed: Number(metrics?.finding_confirmed || 0),
    dismissed: Number(metrics?.dismissed || 0),
    correction_requested: Number(metrics?.correction_requested || 0),
  };
  const lastScoredAt = metrics?.last_scored_at?.toISOString() || null;

  const recentActivity = [
    ...recentImports.map((item) => ({
      id: `import-${item.id}`,
      type: "import" as const,
      label: `Import ${item.status}: ${item.importedRevisionCount} revisi baru`,
      occurred_at: item.createdAt.toISOString(),
    })),
    ...recentJobs.map((item) => ({
      id: `job-${item.id}`,
      type: "scoring" as const,
      label: `Scoring ${item.status}: ${item.completedCount}/${item.totalCount} selesai`,
      occurred_at: item.createdAt.toISOString(),
    })),
    ...recentReviews.map((item) => ({
      id: `review-${item.id}`,
      type: "review" as const,
      label: `Review ${item.claim.claimKey}: ${item.action}`,
      occurred_at: item.reviewedAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, 8);

  return {
    total_claims: totalClaims,
    scored_claims: scoredClaims,
    not_scored_claims: notScoredClaims,
    risk_bands: riskBands,
    review_states: reviewStates,
    scoring,
    reviews_completed: reviewsCompleted,
    awaiting_review: reviewStates.awaiting_review,
    correction_requested: reviewStates.correction_requested,
    provider_mode: process.env.SCORING_PROVIDER === "http" ? "http" : "mock",
    last_scored_at: lastScoredAt,
    updated_at: new Date().toISOString(),
    recent_activity: recentActivity,
  };
}

export async function getClaimsList(filter: ClaimQueryFilter) {
  const page = Math.max(1, filter.page || 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize || 20));
  const clauses: Prisma.Sql[] = [];
  if (filter.revisionState === "revised") clauses.push(Prisma.sql`latest_revision > 1`);
  if (filter.q?.trim()) {
    const term = `%${filter.q.trim().toLowerCase()}%`;
    clauses.push(Prisma.sql`(LOWER(claim_key) LIKE ${term} OR LOWER(primary_icd10) LIKE ${term})`);
  }
  if (filter.scoringStatus) clauses.push(Prisma.sql`scoring_status = ${filter.scoringStatus}`);
  if (filter.reviewState) clauses.push(Prisma.sql`review_state = ${filter.reviewState}`);
  if (filter.riskBand) clauses.push(Prisma.sql`risk_band = ${filter.riskBand}`);
  if (filter.serviceLevel) clauses.push(Prisma.sql`service_level = ${filter.serviceLevel}`);
  if (filter.dateFrom) clauses.push(Prisma.sql`admission_date >= ${filter.dateFrom}`);
  if (filter.dateTo) clauses.push(Prisma.sql`admission_date <= ${filter.dateTo}`);
  const where = clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
  const offset = (page - 1) * pageSize;

  type ClaimRow = Omit<ClaimListItem, "risk_score"> & { total_count: bigint; risk_score: Prisma.Decimal | null };
  const rows = await prisma.$queryRaw<ClaimRow[]>(Prisma.sql`
    WITH latest_revision AS (
      SELECT cr.*, ROW_NUMBER() OVER (PARTITION BY claim_id ORDER BY revision_number DESC) AS rn
      FROM claim_revisions cr
    ), latest_attempt AS (
      SELECT sji.*, ROW_NUMBER() OVER (PARTITION BY claim_revision_id ORDER BY created_at DESC, attempt_number DESC, id DESC) AS rn
      FROM scoring_job_items sji
    ), latest_prediction AS (
      SELECT p.*, ROW_NUMBER() OVER (PARTITION BY claim_revision_id ORDER BY scored_at DESC, id DESC) AS rn
      FROM predictions p
    ), latest_review AS (
      SELECT r.*, ROW_NUMBER() OVER (PARTITION BY prediction_id ORDER BY reviewed_at DESC, id DESC) AS rn
      FROM reviews r
    ), base AS (
      SELECT c.id::text AS id, c.claim_key,
        lr.revision_number AS latest_revision,
        COALESCE(lr.claim_payload #>> '{diagnoses,primary_icd10}', 'Belum tersedia') AS primary_icd10,
        lr.claim_payload #>> '{episode,admission_date}' AS admission_date,
        lr.claim_payload #>> '{episode,discharge_date}' AS discharge_date,
        lr.claim_payload #>> '{episode,service_level}' AS service_level,
        CASE WHEN lp.id IS NOT NULL THEN 'completed'
             WHEN la.status IN ('queued','processing','failed') THEN la.status
             ELSE 'not_scored' END AS scoring_status,
        CASE WHEN lp.id IS NULL THEN 'not_available'
             WHEN lrev.action = 'confirm' THEN 'finding_confirmed'
             WHEN lrev.action = 'dismiss' THEN 'dismissed'
             WHEN lrev.action = 'request_correction' THEN 'correction_requested'
             ELSE 'awaiting_review' END AS review_state,
        lp.risk_score, lp.risk_band
      FROM claims c
      JOIN latest_revision lr ON lr.claim_id = c.id AND lr.rn = 1
      LEFT JOIN latest_attempt la ON la.claim_revision_id = lr.id AND la.rn = 1
      LEFT JOIN latest_prediction lp ON lp.claim_revision_id = lr.id AND lp.rn = 1
      LEFT JOIN latest_review lrev ON lrev.prediction_id = lp.id AND lrev.rn = 1
    )
    SELECT *, COUNT(*) OVER() AS total_count FROM base ${where}
    ORDER BY claim_key ASC LIMIT ${pageSize} OFFSET ${offset}
  `);
  const total = rows.length ? Number(rows[0].total_count) : 0;
  const data: ClaimListItem[] = rows.map(({ total_count: _total, ...row }) => ({
    ...row,
    risk_score: row.risk_score === null ? null : Number(row.risk_score),
  }));

  return {
    data,
    pagination: {
      page,
      page_size: pageSize,
      total,
    },
  };
}

export async function getRiskQueue(filter: {
  page?: number;
  pageSize?: number;
  riskBand?: string;
  reviewState?: string;
  reasonCode?: string;
  serviceLevel?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const page = Math.max(1, filter.page || 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize || 20));
  const clauses: Prisma.Sql[] = [];
  if (filter.riskBand) clauses.push(Prisma.sql`risk_band = ${filter.riskBand}`);
  if (filter.reviewState) clauses.push(Prisma.sql`review_state = ${filter.reviewState}`);
  if (filter.reasonCode) clauses.push(Prisma.sql`top_reason = ${filter.reasonCode}`);
  if (filter.serviceLevel) clauses.push(Prisma.sql`service_level = ${filter.serviceLevel}`);
  if (filter.q?.trim()) clauses.push(Prisma.sql`LOWER(claim_key) LIKE ${`%${filter.q.trim().toLowerCase()}%`}`);
  if (filter.dateFrom) clauses.push(Prisma.sql`admission_date >= ${filter.dateFrom}`);
  if (filter.dateTo) clauses.push(Prisma.sql`admission_date <= ${filter.dateTo}`);
  const where = clauses.length ? Prisma.sql`WHERE ${Prisma.join(clauses, " AND ")}` : Prisma.empty;
  const offset = (page - 1) * pageSize;
  type QueueRow = {
    id: string; claim_key: string; latest_revision: number; claim_revision_id: string; prediction_id: string;
    risk_score: Prisma.Decimal; risk_band: string; top_reason: string | null; reason_count: bigint; evidence_count: number;
    primary_icd10: string; service_level: string; admission_date: string | null; review_state: string; scored_at: Date;
    model_version: string; source: string; latest_attempt_status: string; latest_attempt_failed: boolean;
    latest_attempt_error: string | null; total_count: bigint;
    last_reviewed_at: Date | null; last_reviewer: string | null;
  };
  const rows = await prisma.$queryRaw<QueueRow[]>(Prisma.sql`
    WITH latest_revision AS (
      SELECT cr.*, ROW_NUMBER() OVER (PARTITION BY claim_id ORDER BY revision_number DESC) AS rn FROM claim_revisions cr
    ), latest_attempt AS (
      SELECT sji.*, ROW_NUMBER() OVER (PARTITION BY claim_revision_id ORDER BY created_at DESC, attempt_number DESC, id DESC) AS rn FROM scoring_job_items sji
    ), latest_prediction AS (
      SELECT p.*, ROW_NUMBER() OVER (PARTITION BY claim_revision_id ORDER BY scored_at DESC, id DESC) AS rn FROM predictions p
    ), latest_review AS (
      SELECT r.*, ROW_NUMBER() OVER (PARTITION BY prediction_id ORDER BY reviewed_at DESC, id DESC) AS rn FROM reviews r
    ), base AS (
      SELECT c.id::text AS id, c.claim_key, lr.revision_number AS latest_revision, lr.id::text AS claim_revision_id,
        lp.id::text AS prediction_id, lp.risk_score, lp.risk_band,
        (SELECT reason_code FROM risk_findings WHERE prediction_id = lp.id ORDER BY reason_code LIMIT 1) AS top_reason,
        (SELECT COUNT(*) FROM risk_findings WHERE prediction_id = lp.id) AS reason_count,
        CASE WHEN jsonb_typeof(lp.evidence) = 'array' THEN jsonb_array_length(lp.evidence) ELSE 0 END AS evidence_count,
        COALESCE(lr.claim_payload #>> '{diagnoses,primary_icd10}', 'Belum tersedia') AS primary_icd10,
        COALESCE(lr.claim_payload #>> '{episode,service_level}', 'Belum tersedia') AS service_level,
        lr.claim_payload #>> '{episode,admission_date}' AS admission_date,
        CASE WHEN lrev.action = 'confirm' THEN 'finding_confirmed'
             WHEN lrev.action = 'dismiss' THEN 'dismissed'
             WHEN lrev.action = 'request_correction' THEN 'correction_requested'
             ELSE 'awaiting_review' END AS review_state,
        lrev.reviewed_at AS last_reviewed_at, reviewer.display_name AS last_reviewer,
        lp.scored_at, lp.model_version, lp.source,
        COALESCE(la.status, 'completed') AS latest_attempt_status,
        COALESCE(la.status = 'failed', false) AS latest_attempt_failed,
        CASE WHEN la.status = 'failed' THEN la.error_message_safe ELSE NULL END AS latest_attempt_error
      FROM claims c
      JOIN latest_revision lr ON lr.claim_id = c.id AND lr.rn = 1
      JOIN latest_prediction lp ON lp.claim_revision_id = lr.id AND lp.rn = 1
      LEFT JOIN latest_attempt la ON la.claim_revision_id = lr.id AND la.rn = 1
      LEFT JOIN latest_review lrev ON lrev.prediction_id = lp.id AND lrev.rn = 1
      LEFT JOIN users reviewer ON reviewer.id = lrev.reviewer_id
    )
    SELECT *, COUNT(*) OVER() AS total_count FROM base ${where}
    ORDER BY risk_score DESC, scored_at DESC LIMIT ${pageSize} OFFSET ${offset}
  `);
  const total = rows.length ? Number(rows[0].total_count) : 0;
  const data = rows.map(({ total_count: _total, ...row }) => ({
    ...row,
    risk_score: Number(row.risk_score),
    reason_count: Number(row.reason_count),
    scored_at: row.scored_at.toISOString(),
    last_reviewed_at: row.last_reviewed_at?.toISOString() || null,
  }));

  return {
    data,
    pagination: {
      page,
      page_size: pageSize,
      total,
    },
  };
}

export async function getClaimDetail(claimId: string, revisionNumber?: number) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      revisions: {
        orderBy: { revisionNumber: "desc" },
        include: {
          scoringJobItems: {
            orderBy: [{ createdAt: "desc" }, { attemptNumber: "desc" }],
            take: 1,
          },
          predictions: {
            orderBy: [{ scoredAt: "desc" }, { id: "desc" }],
            include: {
              findings: true,
              reviews: {
                orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
                include: { reviewer: { select: { displayName: true, email: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!claim) return null;

  const latestRevision = claim.revisions[0];
  const selectedRevision = revisionNumber
    ? claim.revisions.find((r) => r.revisionNumber === revisionNumber) || latestRevision
    : latestRevision;

  return {
    claim: {
      id: claim.id,
      claim_key: claim.claimKey,
      created_at: claim.createdAt.toISOString(),
      updated_at: claim.updatedAt.toISOString(),
    },
    latest_revision_number: latestRevision.revisionNumber,
    selected_revision: {
      id: selectedRevision.id,
      revision_number: selectedRevision.revisionNumber,
      source_snapshot_at: selectedRevision.sourceSnapshotAt.toISOString(),
      payload_checksum: selectedRevision.payloadChecksum,
      payload: selectedRevision.claimPayload,
      latest_attempt: selectedRevision.scoringJobItems[0] || null,
      latest_prediction: selectedRevision.predictions[0] || null,
      prediction_history: selectedRevision.predictions.map((prediction) => ({
        id: prediction.id,
        risk_score: Number(prediction.riskScore),
        risk_band: prediction.riskBand,
        source: prediction.source,
        model_version: prediction.modelVersion,
        rule_version: prediction.ruleVersion,
        scored_at: prediction.scoredAt.toISOString(),
        reason_codes: prediction.findings.map((finding) => finding.reasonCode),
      })),
      review_history: selectedRevision.predictions.flatMap((prediction) =>
        prediction.reviews.map((review) => ({
          id: review.id,
          prediction_id: prediction.id,
          action: review.action,
          notes: review.notes,
          reviewed_at: review.reviewedAt.toISOString(),
          reviewer_name: review.reviewer.displayName,
          supersedes_review_id: review.supersedesReviewId,
        })),
      ).sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at)),
    },
    all_revisions: claim.revisions.map((r) => ({
      id: r.id,
      revision_number: r.revisionNumber,
      source_snapshot_at: r.sourceSnapshotAt.toISOString(),
      has_prediction: r.predictions.length > 0,
      latest_risk_band: r.predictions[0]?.riskBand || null,
      scoring_status: r.predictions[0] ? "completed" : r.scoringJobItems[0]?.status || "not_scored",
    })),
  };
}

export async function getClaimAnalysis(claimId: string) {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      revisions: {
        orderBy: { revisionNumber: "desc" },
        take: 2,
        include: {
          scoringJobItems: {
            orderBy: [{ createdAt: "desc" }, { attemptNumber: "desc" }],
            take: 1,
          },
          predictions: {
            orderBy: [{ scoredAt: "desc" }, { id: "desc" }],
            take: 1,
            include: {
              findings: true,
            },
          },
        },
      },
    },
  });

  if (!claim) return null;

  const latestRevision = claim.revisions[0];
  if (!latestRevision) return null;

  // Check if latest revision has a prediction
  const latestPrediction = latestRevision.predictions[0];
  const isStale = !latestPrediction && claim.revisions[1]?.predictions.length > 0;
  const activePred = latestPrediction || claim.revisions[1]?.predictions[0] || null;
  const latestAttempt = latestRevision.scoringJobItems[0] || null;

  if (!activePred) {
    return {
      claim_id: claim.id,
      claim_key: claim.claimKey,
      claim_revision_id: latestRevision.id,
      revision_number: latestRevision.revisionNumber,
      is_stale: false,
      scoring_status: latestAttempt?.status || "not_scored",
      latest_attempt: latestAttempt ? {
        id: latestAttempt.id,
        job_id: latestAttempt.jobId,
        status: latestAttempt.status,
        error_code: latestAttempt.errorCode,
        error_message: latestAttempt.errorMessageSafe,
      } : null,
      prediction_id: null,
      prediction: null,
    };
  }

  return {
    claim_id: claim.id,
    claim_key: claim.claimKey,
    claim_revision_id: latestRevision.id,
    revision_number: latestPrediction ? latestRevision.revisionNumber : claim.revisions[1].revisionNumber,
    is_stale: isStale,
    scoring_status: latestPrediction ? "completed" : latestAttempt?.status || "not_scored",
    latest_attempt: latestAttempt ? {
      id: latestAttempt.id,
      job_id: latestAttempt.jobId,
      status: latestAttempt.status,
      error_code: latestAttempt.errorCode,
      error_message: latestAttempt.errorMessageSafe,
    } : null,
    prediction_id: activePred.id,
    risk_score: Number(activePred.riskScore),
    risk_band: activePred.riskBand,
    reason_codes: activePred.findings.map((f) => f.reasonCode),
    evidence: activePred.evidence,
    model_version: activePred.modelVersion,
    rule_version: activePred.ruleVersion,
    source: activePred.source,
    scored_at: activePred.scoredAt.toISOString(),
  };
}
