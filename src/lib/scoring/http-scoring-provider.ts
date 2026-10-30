import { MlScoreRequest, mlScoreResponseSchema } from "../contracts/ml-contract";
import { ScoringProvider, ScoringResult } from "./scoring-provider";

export class HttpScoringProvider implements ScoringProvider {
  readonly name = "http" as const;
  private baseUrl: string;
  private timeoutMs: number;
  private token?: string;

  constructor(baseUrl: string, timeoutMs: number = 5000, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.timeoutMs = timeoutMs;
    this.token = token;
  }

  async score(request: MlScoreRequest): Promise<ScoringResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/v1/score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseJson: unknown;

      try {
        responseJson = JSON.parse(responseText);
      } catch {
        return {
          success: false,
          error: {
            status: 502,
            code: "INVALID_JSON_RESPONSE",
            message: "Layanan ML mengembalikan respons yang bukan JSON valid",
          },
        };
      }

      if (!response.ok) {
        const errorData = responseJson as { error?: { code?: string } };
        const upstreamCode = errorData?.error?.code;
        return {
          success: false,
          error: {
            status: response.status,
            code: upstreamCode && /^[A-Z0-9_]{1,64}$/.test(upstreamCode) ? upstreamCode : `HTTP_${response.status}`,
            message: `Layanan ML menolak request dengan status ${response.status}`,
          },
        };
      }

      // Validate response against contract schema
      const parseResult = mlScoreResponseSchema.safeParse(responseJson);
      if (!parseResult.success) {
        return {
          success: false,
          error: {
            status: 502,
            code: "SCHEMA_VALIDATION_ERROR",
            message: "Respons layanan ML tidak mematuhi kontrak v1",
          },
        };
      }

      const validated = parseResult.data;

      // Verify claim_id match per contract requirement
      if (validated.claim_id !== request.claim_id) {
        return {
          success: false,
          error: {
            status: 502,
            code: "CLAIM_ID_MISMATCH",
            message: `claim_id pada respons (${validated.claim_id}) tidak cocok dengan request (${request.claim_id})`,
          },
        };
      }

      return {
        success: true,
        response: validated,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof Error && err.name === "AbortError") {
        return {
          success: false,
          error: {
            status: 504,
            code: "TIMEOUT",
            message: `Layanan ML tidak merespons dalam batas waktu ${this.timeoutMs}ms`,
          },
        };
      }

      return {
        success: false,
        error: {
          status: 503,
          code: "CONNECTION_FAILED",
          message: "Gagal terhubung ke layanan ML",
        },
      };
    }
  }
}
