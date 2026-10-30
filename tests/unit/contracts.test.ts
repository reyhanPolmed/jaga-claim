import { describe, it, expect } from "vitest";
import {
  claimIdSchema,
  participantKeySchema,
  reasonCodeSchema,
  mlScoreRequestSchema,
  mlScoreResponseSchema,
  REASON_CODES,
} from "../../src/lib/contracts/ml-contract";

describe("ml-contract: Identity & Enums", () => {
  it("accepts valid claim_id format", () => {
    const validId = "CLM_0123456789abcdefabcd";
    expect(claimIdSchema.safeParse(validId).success).toBe(true);
  });

  it("rejects invalid claim_id format", () => {
    expect(claimIdSchema.safeParse("CLM_123").success).toBe(false); // too short
    expect(claimIdSchema.safeParse("FKL02_0123456789abcdefabcd").success).toBe(false); // raw ID prefix
    expect(claimIdSchema.safeParse("CLM_0123456789abcdefghij").success).toBe(false); // non-hex
  });

  it("accepts valid participant_key format", () => {
    const validKey = "PST_abcdef0123456789abcd";
    expect(participantKeySchema.safeParse(validKey).success).toBe(true);
  });

  it("rejects raw PSTV01 or invalid participant_key", () => {
    expect(participantKeySchema.safeParse("PSTV01_12345").success).toBe(false);
    expect(participantKeySchema.safeParse("PST_short").success).toBe(false);
  });

  it("accepts only the 6 official reason codes", () => {
    for (const code of REASON_CODES) {
      expect(reasonCodeSchema.safeParse(code).success).toBe(true);
    }
    expect(reasonCodeSchema.safeParse("UNKNOWN_CODE").success).toBe(false);
    expect(reasonCodeSchema.safeParse("ANOMALY_MULTIVARIATE").success).toBe(false);
    expect(reasonCodeSchema.safeParse("FRAUD_DETECTED").success).toBe(false);
  });
});

describe("ml-contract: Request Validation", () => {
  const validRequest = {
    claim_id: "CLM_0123456789abcdefabcd",
    participant_key: "PST_abcdef0123456789abcd",
    prediction_time: "2026-10-24T10:00:00Z",
    episode: {
      admission_date: "2026-10-20",
      discharge_date: "2026-10-24",
      service_level: "RITL",
      provider_type: "1",
      provider_region: "31",
      care_class: "1",
      tariff_regional: "1",
    },
    diagnoses: {
      primary_icd10: "J168",
      secondary_icd10: ["A419", "E119"],
    },
    casemix: {
      inacbg_code: "J-4-16-III",
      severity: "III",
    },
    procedures: {
      procedure_type: "9396",
      special_codes: {},
    },
    financial_pre_submit: {
      billed_cost: 17187600.0,
      cbg_tariff: 17187600.0,
      special_tariffs: {},
    },
    history_features: {},
    peer_features: {},
  };

  it("validates a compliant score request", () => {
    const res = mlScoreRequestSchema.safeParse(validRequest);
    expect(res.success).toBe(true);
  });

  it("rejects request if discharge_date < admission_date", () => {
    const invalid = {
      ...validRequest,
      episode: {
        ...validRequest.episode,
        admission_date: "2026-10-25",
        discharge_date: "2026-10-20",
      },
    };
    const res = mlScoreRequestSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it("rejects post-adjudication field FKL48", () => {
    const invalid = {
      ...validRequest,
      FKL48: 15000000,
    };
    const res = mlScoreRequestSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });

  it("rejects non-UTC prediction_time without timezone offset", () => {
    const invalid = {
      ...validRequest,
      prediction_time: "2026-10-24 10:00:00",
    };
    const res = mlScoreRequestSchema.safeParse(invalid);
    expect(res.success).toBe(false);
  });
});

describe("ml-contract: Response Validation", () => {
  const validResponse = {
    claim_id: "CLM_0123456789abcdefabcd",
    risk_score: 0.87,
    risk_band: "high",
    reason_codes: ["LOS_PEER_OUTLIER"],
    evidence: [
      {
        feature: "los_days",
        value: "14 hari",
        reference: "Median peer 4 hari (p95 = 8 hari)",
      },
    ],
    model_version: "hybrid-v1.0.0",
    rule_version: "rules-v1.0.0",
    scored_at: "2026-10-24T10:05:00Z",
  };

  it("validates compliant flagged response", () => {
    const res = mlScoreResponseSchema.safeParse(validResponse);
    expect(res.success).toBe(true);
  });

  it("validates no-flags success response", () => {
    const noFlags = {
      ...validResponse,
      risk_score: 0.02,
      risk_band: "low",
      reason_codes: [],
      evidence: [],
    };
    const res = mlScoreResponseSchema.safeParse(noFlags);
    expect(res.success).toBe(true);
  });

  it("validates anomaly without reason code response", () => {
    const anomalyNoReason = {
      ...validResponse,
      risk_score: 0.65,
      risk_band: "high",
      reason_codes: [],
      evidence: [
        {
          feature: "anomaly_score",
          value: "persentil 99.8",
          reference: "Isolation Forest outlier",
        },
      ],
    };
    const res = mlScoreResponseSchema.safeParse(anomalyNoReason);
    expect(res.success).toBe(true);
  });

  it("rejects risk_score outside 0..1", () => {
    expect(mlScoreResponseSchema.safeParse({ ...validResponse, risk_score: 1.5 }).success).toBe(false);
    expect(mlScoreResponseSchema.safeParse({ ...validResponse, risk_score: -0.1 }).success).toBe(false);
  });

  it("rejects unknown reason code", () => {
    const invalidReason = {
      ...validResponse,
      reason_codes: ["UNKNOWN_REASON"],
    };
    expect(mlScoreResponseSchema.safeParse(invalidReason).success).toBe(false);
  });
});
