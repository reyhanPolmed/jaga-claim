-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "imported_by" UUID NOT NULL,
    "schema_version" TEXT NOT NULL,
    "source_name" TEXT NOT NULL,
    "file_checksum" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "imported_claim_count" INTEGER NOT NULL DEFAULT 0,
    "imported_revision_count" INTEGER NOT NULL DEFAULT 0,
    "duplicate_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" UUID NOT NULL,
    "claim_key" TEXT NOT NULL,
    "participant_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_revisions" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "import_batch_id" UUID,
    "revision_number" INTEGER NOT NULL,
    "payload_checksum" TEXT NOT NULL,
    "claim_payload" JSONB NOT NULL,
    "source_snapshot_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_jobs" (
    "id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "scoring_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_job_items" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "claim_revision_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "error_code" TEXT,
    "error_message_safe" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_job_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predictions" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "claim_revision_id" UUID NOT NULL,
    "scoring_job_item_id" UUID NOT NULL,
    "risk_score" DECIMAL(5,4) NOT NULL,
    "risk_band" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "model_version" TEXT NOT NULL,
    "rule_version" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "predictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_findings" (
    "id" UUID NOT NULL,
    "prediction_id" UUID NOT NULL,
    "reason_code" TEXT NOT NULL,
    "evidence" JSONB,

    CONSTRAINT "risk_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "prediction_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "supersedes_review_id" UUID,
    "idempotency_key" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "reviewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "claims_claim_key_key" ON "claims"("claim_key");

-- CreateIndex
CREATE INDEX "idx_claims_participant" ON "claims"("participant_key");

-- CreateIndex
CREATE INDEX "idx_claim_revisions_latest" ON "claim_revisions"("claim_id", "revision_number" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "claim_revisions_claim_id_revision_number_key" ON "claim_revisions"("claim_id", "revision_number");

-- CreateIndex
CREATE UNIQUE INDEX "claim_revisions_claim_id_payload_checksum_key" ON "claim_revisions"("claim_id", "payload_checksum");

-- CreateIndex
CREATE INDEX "idx_job_items_job_status" ON "scoring_job_items"("job_id", "status");

-- CreateIndex
CREATE INDEX "idx_job_items_claim_latest" ON "scoring_job_items"("claim_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "scoring_job_items_job_id_claim_id_claim_revision_id_key" ON "scoring_job_items"("job_id", "claim_id", "claim_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "predictions_scoring_job_item_id_key" ON "predictions"("scoring_job_item_id");

-- CreateIndex
CREATE INDEX "idx_predictions_claim_latest" ON "predictions"("claim_id", "scored_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_predictions_revision" ON "predictions"("claim_revision_id", "scored_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "risk_findings_prediction_id_reason_code_key" ON "risk_findings"("prediction_id", "reason_code");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_idempotency_key_key" ON "reviews"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_reviews_prediction_latest" ON "reviews"("prediction_id", "reviewed_at" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_revisions" ADD CONSTRAINT "claim_revisions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_revisions" ADD CONSTRAINT "claim_revisions_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_jobs" ADD CONSTRAINT "scoring_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_job_items" ADD CONSTRAINT "scoring_job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scoring_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_job_items" ADD CONSTRAINT "scoring_job_items_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_job_items" ADD CONSTRAINT "scoring_job_items_claim_revision_id_fkey" FOREIGN KEY ("claim_revision_id") REFERENCES "claim_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_claim_revision_id_fkey" FOREIGN KEY ("claim_revision_id") REFERENCES "claim_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predictions" ADD CONSTRAINT "predictions_scoring_job_item_id_fkey" FOREIGN KEY ("scoring_job_item_id") REFERENCES "scoring_job_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_findings" ADD CONSTRAINT "risk_findings_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "predictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_supersedes_review_id_fkey" FOREIGN KEY ("supersedes_review_id") REFERENCES "reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE;
