import { MlScoreRequest, MlScoreResponse } from "../contracts/ml-contract";

export type ScoringSuccess = {
  success: true;
  response: MlScoreResponse;
};

export type ScoringFailure = {
  success: false;
  error: {
    status: number;
    code: string;
    message: string;
  };
};

export type ScoringResult = ScoringSuccess | ScoringFailure;

export interface ScoringProvider {
  score(request: MlScoreRequest): Promise<ScoringResult>;
  name: "mock" | "http";
}
