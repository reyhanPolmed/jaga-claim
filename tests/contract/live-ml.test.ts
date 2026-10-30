import { describe, expect, it } from "vitest";
import { getEnv } from "../../src/lib/env";
import { MlScoreRequest } from "../../src/lib/contracts/ml-contract";
import { HttpScoringProvider } from "../../src/lib/scoring/http-scoring-provider";

const runLive = process.env.RUN_LIVE_ML_CONTRACT === "1";

describe.skipIf(!runLive)("HTTP-002: live ML contract", () => {
  it("accepts the approved synthetic v1 request and returns a contract-valid response", async () => {
    const env = getEnv();
    const request: MlScoreRequest = {
      claim_id: "CLM_0123456789abcdef0001",
      participant_key: "PST_abcdef0123456789abcd",
      prediction_time: new Date().toISOString(),
      episode: {
        admission_date: "2026-10-20", discharge_date: "2026-10-24", service_level: "RITL",
        provider_type: "1", provider_region: "31", care_class: "1", tariff_regional: "1",
      },
      diagnoses: { primary_icd10: "J168", secondary_icd10: ["A419"] },
      casemix: { inacbg_code: "J-4-16-III", severity: "III" },
      procedures: { procedure_type: "9396", special_codes: {} },
      financial_pre_submit: { billed_cost: 17187600, cbg_tariff: 17187600, special_tariffs: {} },
      history_features: {},
      peer_features: {},
    };
    const provider = new HttpScoringProvider(env.ML_SERVICE_URL, env.ML_SERVICE_TIMEOUT_MS, env.ML_SERVICE_TOKEN);
    const result = await provider.score(request);
    expect(result.success, result.success ? undefined : `${result.error.code}: ${result.error.message}`).toBe(true);
    if (result.success) expect(result.response.claim_id).toBe(request.claim_id);
  });
});
