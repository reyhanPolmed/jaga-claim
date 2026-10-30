import { describe, it, expect } from "vitest";
import { MockScoringProvider } from "../../src/lib/scoring/mock-scoring-provider";
import { HttpScoringProvider } from "../../src/lib/scoring/http-scoring-provider";
import { MlScoreRequest } from "../../src/lib/contracts/ml-contract";

describe("SCORE-001: MockScoringProvider Fixtures", () => {
  const provider = new MockScoringProvider();

  const baseRequest: MlScoreRequest = {
    claim_id: "CLM_0123456789abcdef0001",
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
      secondary_icd10: ["A419"],
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

  it("returns flagged success fixture for claim ending with 0001", async () => {
    const res = await provider.score(baseRequest);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.response.risk_band).toBe("high");
      expect(res.response.risk_score).toBeGreaterThan(0.7);
      expect(res.response.reason_codes).toContain("LOS_PEER_OUTLIER");
      expect(res.response.evidence.length).toBeGreaterThan(0);
      expect(res.response.model_version).toContain("demo");
    }
  });

  it("returns no-flags success fixture for claim ending with 0002", async () => {
    const req = { ...baseRequest, claim_id: "CLM_0123456789abcdef0002" };
    const res = await provider.score(req);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.response.risk_band).toBe("low");
      expect(res.response.reason_codes).toEqual([]);
      expect(res.response.evidence).toEqual([]);
    }
  });

  it("returns anomaly-without-reason fixture for claim ending with 0003", async () => {
    const req = { ...baseRequest, claim_id: "CLM_0123456789abcdef0003" };
    const res = await provider.score(req);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.response.risk_band).toBe("high");
      expect(res.response.reason_codes).toEqual([]);
      expect(res.response.evidence[0].feature).toBe("anomaly_score");
    }
  });

  it("returns 503 error for claim ending with 9999 without creating prediction", async () => {
    const req = { ...baseRequest, claim_id: "CLM_0123456789abcdef9999" };
    const res = await provider.score(req);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.status).toBe(503);
      expect(res.error.code).toBe("SERVICE_UNAVAILABLE");
    }
  });

  it("returns 422 error for claim ending with 9422 without creating prediction", async () => {
    const req = { ...baseRequest, claim_id: "CLM_0123456789abcdef9422" };
    const res = await provider.score(req);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.status).toBe(422);
      expect(res.error.code).toBe("INSUFFICIENT_DATA");
    }
  });
});

describe("HTTP-001: HttpScoringProvider Safe Error & Validation", () => {
  it("detects claim_id mismatch from response", async () => {
    // Mock global fetch
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          claim_id: "CLM_99999999999999999999", // Mismatched ID!
          risk_score: 0.5,
          risk_band: "medium",
          reason_codes: [],
          evidence: [],
          model_version: "hybrid-v1.0.0",
          rule_version: "rules-v1.0.0",
          scored_at: new Date().toISOString(),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    try {
      const httpProvider = new HttpScoringProvider("http://ml-test-service:8000", 1000);
      const req: any = {
        claim_id: "CLM_0123456789abcdefabcd",
        participant_key: "PST_abcdef0123456789abcd",
      };
      const res = await httpProvider.score(req);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe("CLAIM_ID_MISMATCH");
      }
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("handles HTTP 503 from real service safely", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Model artifacts are still loading",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      );

    try {
      const httpProvider = new HttpScoringProvider("http://ml-test-service:8000", 1000);
      const req: any = {
        claim_id: "CLM_0123456789abcdefabcd",
        participant_key: "PST_abcdef0123456789abcd",
      };
      const res = await httpProvider.score(req);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.status).toBe(503);
        expect(res.error.code).toBe("SERVICE_UNAVAILABLE");
      }
    } finally {
      global.fetch = originalFetch;
    }
  });
});
