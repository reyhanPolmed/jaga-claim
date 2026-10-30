import { z } from "zod";
import crypto from "crypto";
import {
  claimIdSchema,
  participantKeySchema,
  episodeSchema,
  diagnosesSchema,
  casemixSchema,
  proceduresSchema,
  financialPreSubmitSchema,
} from "./ml-contract";

export const CURATED_SCHEMA_VERSION = "jaga-claim-curated-v1" as const;

export const curatedRowSchema = z
  .object({
    schema_version: z.literal(CURATED_SCHEMA_VERSION, {
      errorMap: () => ({ message: `schema_version harus '${CURATED_SCHEMA_VERSION}'` }),
    }),
    claim_id: claimIdSchema,
    participant_key: participantKeySchema,
    source_revision: z.number().int().min(1, "source_revision minimal 1"),
    snapshot_at: z
      .string()
      .datetime({ offset: true, message: "snapshot_at harus berupa datetime ISO 8601 UTC dengan Z" })
      .refine((value) => value.endsWith("Z"), "snapshot_at harus memakai UTC dengan akhiran Z"),
    episode: episodeSchema,
    diagnoses: diagnosesSchema,
    casemix: casemixSchema,
    procedures: proceduresSchema,
    financial_pre_submit: financialPreSubmitSchema,
  })
  .superRefine((data, ctx) => {
    if (data.episode.discharge_date < data.episode.admission_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "discharge_date tidak boleh sebelum admission_date",
        path: ["episode", "discharge_date"],
      });
    }
  });

export type CuratedRow = z.infer<typeof curatedRowSchema>;

export type ImportError = {
  line: number;
  code:
    | "INVALID_JSON"
    | "UNSUPPORTED_SCHEMA_VERSION"
    | "INVALID_CLAIM_ID"
    | "INVALID_PARTICIPANT_KEY"
    | "PARTICIPANT_MISMATCH"
    | "RAW_IDENTIFIER_FORBIDDEN"
    | "POST_ADJUDICATION_FIELD_FORBIDDEN"
    | "INVALID_REVISION"
    | "INVALID_DATE_RANGE"
    | "VALIDATION_ERROR"
    | "DUPLICATE_SNAPSHOT";
  message: string;
};

// Check for raw identifiers or post-adjudication fields before schema parse
export function detectForbiddenFields(rawObj: Record<string, unknown>): { code: ImportError["code"]; message: string } | null {
  const forbiddenRaw = ["FKL02", "PSTV01", "fkl02", "pstv01", "raw_claim_id", "raw_patient_id", "nik", "no_kartu"];
  const forbiddenPost = ["FKL48", "fkl48", "verified_cost", "biaya_verifikasi", "adjudication_result", "history_features", "peer_features", "risk_score", "risk_band"];

  const queue: unknown[] = [rawObj];
  while (queue.length > 0) {
    const current = queue.shift();
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (!current || typeof current !== "object") continue;

    for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
      if (forbiddenRaw.includes(key)) {
        return {
          code: "RAW_IDENTIFIER_FORBIDDEN",
          message: `Field identifier mentah (${key}) dilarang pada curated JSONL`,
        };
      }
      if (forbiddenPost.includes(key)) {
        return {
          code: "POST_ADJUDICATION_FIELD_FORBIDDEN",
          message: `Field pascaverifikasi atau feature ML (${key}) dilarang pada curated JSONL`,
        };
      }
      queue.push(value);
    }
  }

  return null;
}

// Canonical JSON stringification for stable SHA-256 checksum
export function canonicalizeJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalizeJson).join(",") + "]";
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map((key) => {
    const val = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ":" + canonicalizeJson(val);
  });
  return "{" + pairs.join(",") + "}";
}

// Compute snapshot payload checksum (SHA-256 hex)
export function computePayloadChecksum(row: CuratedRow): string {
  const clinicalPayload = {
    episode: row.episode,
    diagnoses: row.diagnoses,
    casemix: row.casemix,
    procedures: row.procedures,
    financial_pre_submit: row.financial_pre_submit,
  };
  const canonical = canonicalizeJson(clinicalPayload);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// Compute entire file checksum
export function computeFileChecksum(content: string | Buffer): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}
