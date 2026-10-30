import { z } from "zod";

// Regex formats according to decisions.md & ml-api-contract.md
export const CLAIM_ID_REGEX = /^CLM_[0-9a-f]{20}$/;
export const PARTICIPANT_KEY_REGEX = /^PST_[0-9a-f]{20}$/;

export const claimIdSchema = z
  .string()
  .regex(CLAIM_ID_REGEX, "claim_id harus mengikuti format ^CLM_[0-9a-f]{20}$");

export const participantKeySchema = z
  .string()
  .regex(PARTICIPANT_KEY_REGEX, "participant_key harus mengikuti format ^PST_[0-9a-f]{20}$");

export const riskBandSchema = z.enum(["low", "medium", "high"]);
export type RiskBand = z.infer<typeof riskBandSchema>;

export const REASON_CODES = [
  "COST_PEER_OUTLIER",
  "LOS_PEER_OUTLIER",
  "TEMPORAL_REPEAT",
  "POSSIBLE_DUPLICATE",
  "CODING_MISMATCH",
  "DATA_QUALITY",
] as const;

export const reasonCodeSchema = z.enum(REASON_CODES);
export type ReasonCode = z.infer<typeof reasonCodeSchema>;

export const REASON_CODE_LABELS: Record<ReasonCode, { title: string; engine: string; description: string }> = {
  COST_PEER_OUTLIER: {
    title: "Biaya Tagih Outlier Peer",
    engine: "Peer Comparison",
    description: "Biaya tagih menyimpang signifikan dibanding cohort peer.",
  },
  LOS_PEER_OUTLIER: {
    title: "Lama Rawat Outlier Peer",
    engine: "Peer Comparison",
    description: "Lama rawat (LOS) menyimpang signifikan dibanding median peer.",
  },
  TEMPORAL_REPEAT: {
    title: "Pengulangan Episode Berdekatan",
    engine: "Duplicate/Temporal",
    description: "Overlap episode, rawat inap ulang <7 hari, atau frekuensi kunjungan tidak lazim.",
  },
  POSSIBLE_DUPLICATE: {
    title: "Potensi Episode Duplikat",
    engine: "Duplicate/Temporal",
    description: "Episode pembanding memiliki kesamaan atribut tinggi pada rentang waktu dekat.",
  },
  CODING_MISMATCH: {
    title: "Ketidaksesuaian Koding Medis",
    engine: "Rule Engine",
    description: "Kombinasi diagnosis, severity, dan prosedur tidak selaras aturan koding.",
  },
  DATA_QUALITY: {
    title: "Masalah Kualitas Data",
    engine: "Rule Engine",
    description: "Inkonsistensi data episode, tanggal tidak logis, atau atribut penting hilang.",
  },
};

export const evidenceItemSchema = z.object({
  feature: z.string(),
  value: z.string(),
  reference: z.string(),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

const utcTimestampSchema = z
  .string()
  .datetime({ offset: true, message: "Timestamp harus berupa ISO 8601 UTC dengan Z" })
  .refine((value) => value.endsWith("Z"), "Timestamp harus memakai UTC dengan akhiran Z");

export const episodeSchema = z.object({
  admission_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
  discharge_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD"),
  service_level: z.string().optional(),
  provider_type: z.string().optional(),
  provider_region: z.string().optional(),
  care_class: z.string().optional(),
  tariff_regional: z.string().optional(),
  provider_kind: z.string().optional(),
  provider_ownership: z.string().optional(),
  service_unit: z.string().optional(),
  segment: z.string().optional(),
  discharge_status: z.string().optional(),
  patient_sex: z.enum(["M", "F"]).optional(),
  patient_birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const diagnosesSchema = z.object({
  primary_icd10: z.string().min(1, "primary_icd10 wajib diisi"),
  admission_icd10: z.string().optional(),
  secondary_icd10: z.array(z.string()).default([]),
});

export const casemixSchema = z.object({
  inacbg_code: z.string().min(1, "inacbg_code wajib diisi"),
  severity: z.string().optional(),
});

export const proceduresSchema = z.object({
  procedure_type: z.string().optional(),
  special_codes: z.record(z.string().nullable()).default({}),
});

export const financialPreSubmitSchema = z.object({
  billed_cost: z.number().finite().nonnegative("billed_cost harus >= 0"),
  cbg_tariff: z.number().finite().nonnegative().optional(),
  special_tariffs: z.record(z.number().finite().nonnegative()).default({}),
});

export const FORBIDDEN_ML_FIELDS = [
  "FKL02",
  "PSTV01",
  "FKL48",
  "fkl48",
  "verified_cost",
  "biaya_verifikasi",
] as const;

// Full ML Score Request Schema (POST /v1/score)
export const mlScoreRequestSchema = z
  .object({
    claim_id: claimIdSchema,
    participant_key: participantKeySchema,
    prediction_time: utcTimestampSchema,
    episode: episodeSchema,
    diagnoses: diagnosesSchema,
    casemix: casemixSchema,
    procedures: proceduresSchema,
    financial_pre_submit: financialPreSubmitSchema,
    history_features: z.record(z.unknown()).default({}),
    peer_features: z.record(z.unknown()).default({}),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    // Check forbidden fields
    const raw = data as Record<string, unknown>;
    for (const forbidden of FORBIDDEN_ML_FIELDS) {
      if (forbidden in raw) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Field terlarang '${forbidden}' tidak boleh ada dalam request scoring pre-submit`,
          path: [forbidden],
        });
      }
    }
    if (data.episode.discharge_date < data.episode.admission_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "discharge_date tidak boleh sebelum admission_date",
        path: ["episode", "discharge_date"],
      });
    }
  });

export type MlScoreRequest = z.infer<typeof mlScoreRequestSchema>;

// ML Score Response Schema (200 OK)
export const mlScoreResponseSchema = z.object({
  claim_id: claimIdSchema,
  risk_score: z
    .number()
    .min(0, "risk_score harus >= 0")
    .max(1, "risk_score harus <= 1"),
  risk_band: riskBandSchema,
  reason_codes: z.array(reasonCodeSchema),
  evidence: z.array(evidenceItemSchema),
  model_version: z.string().min(1),
  rule_version: z.string().min(1),
  scored_at: utcTimestampSchema,
});

export type MlScoreResponse = z.infer<typeof mlScoreResponseSchema>;

// ML Error Schema
export const mlErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type MlErrorResponse = z.infer<typeof mlErrorResponseSchema>;
