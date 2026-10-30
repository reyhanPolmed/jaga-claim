import { MlScoreRequest, MlScoreResponse, mlScoreResponseSchema } from "../contracts/ml-contract";
import { ScoringProvider, ScoringResult } from "./scoring-provider";

export class MockScoringProvider implements ScoringProvider {
  readonly name = "mock" as const;

  async score(request: MlScoreRequest): Promise<ScoringResult> {
    const claimId = request.claim_id;

    // Fixture 3: Simulated Failure (ends with 9999 or fail)
    if (claimId.endsWith("9999") || claimId.includes("fail")) {
      return {
        success: false,
        error: {
          status: 503,
          code: "SERVICE_UNAVAILABLE",
          message: "Model scoring service is temporarily unavailable or artifact is not ready",
        },
      };
    }

    // Fixture 4: Insufficient Data / 422 (ends with 9422)
    if (claimId.endsWith("9422")) {
      return {
        success: false,
        error: {
          status: 422,
          code: "INSUFFICIENT_DATA",
          message: "Data klinis tidak mencukupi untuk penilaian resiko",
        },
      };
    }

    // Fixture 2: No-flags Success (ends with 0002 or low)
    if (claimId.endsWith("0002") || claimId.includes("noflag")) {
      const resp: MlScoreResponse = {
        claim_id: claimId,
        risk_score: 0.0245,
        risk_band: "low",
        reason_codes: [],
        evidence: [],
        model_version: "hybrid-v1.0.0-demo",
        rule_version: "rules-v1.0.0-demo",
        scored_at: new Date().toISOString(),
      };
      return { success: true, response: resp };
    }

    // Fixture: Anomaly Without Reason Code (ends with 0003 or anomaly)
    if (claimId.endsWith("0003") || claimId.includes("anomaly")) {
      const resp: MlScoreResponse = {
        claim_id: claimId,
        risk_score: 0.6521,
        risk_band: "high",
        reason_codes: [],
        evidence: [
          {
            feature: "anomaly_score",
            value: "persentil 99.8",
            reference: "Isolation Forest: kombinasi fitur tidak lazim; bukan probabilitas fraud",
          },
        ],
        model_version: "hybrid-v1.0.0-demo",
        rule_version: "rules-v1.0.0-demo",
        scored_at: new Date().toISOString(),
      };
      return { success: true, response: resp };
    }

    // Fixture 1: Flagged Success (Default or ends with 0001)
    const resp: MlScoreResponse = {
      claim_id: claimId,
      risk_score: 0.8712,
      risk_band: "high",
      reason_codes: ["LOS_PEER_OUTLIER", "COST_PEER_OUTLIER"],
      evidence: [
        {
          feature: "los_days",
          value: "14 hari",
          reference: "Median peer 4 hari (p95 = 8 hari); cohort RITL Kelas 1",
        },
        {
          feature: "billed_cost",
          value: `Rp${request.financial_pre_submit.billed_cost.toLocaleString("id-ID")}`,
          reference: "Median peer Rp8.773.400; robust z = 19.2",
        },
      ],
      model_version: "hybrid-v1.0.0-demo",
      rule_version: "rules-v1.0.0-demo",
      scored_at: new Date().toISOString(),
    };

    // Validate response schema internally
    const validation = mlScoreResponseSchema.safeParse(resp);
    if (!validation.success) {
      return {
        success: false,
        error: {
          status: 500,
          code: "INTERNAL_MOCK_SCHEMA_ERROR",
          message: "Mock response failed contract validation",
        },
      };
    }

    return { success: true, response: validation.data };
  }
}
