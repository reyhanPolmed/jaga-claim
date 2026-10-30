import { getEnv } from "../env";
import { ScoringProvider } from "./scoring-provider";
import { MockScoringProvider } from "./mock-scoring-provider";
import { HttpScoringProvider } from "./http-scoring-provider";

let providerInstance: ScoringProvider | null = null;

export function getScoringProvider(): ScoringProvider {
  if (providerInstance) {
    return providerInstance;
  }

  const env = getEnv();

  if (env.SCORING_PROVIDER === "http") {
    providerInstance = new HttpScoringProvider(env.ML_SERVICE_URL, env.ML_SERVICE_TIMEOUT_MS, env.ML_SERVICE_TOKEN || undefined);
  } else {
    providerInstance = new MockScoringProvider();
  }

  return providerInstance;
}

// For testing purposes: reset provider singleton
export function resetScoringProvider(): void {
  providerInstance = null;
}
