import { describe, it, expect } from "vitest";
import { redactSensitiveData, createSafeErrorEnvelope } from "../../src/lib/logger";

describe("SEC-001: Logger Redaction & Error Envelope", () => {
  it("redacts participant keys (PST_...)", () => {
    const raw = "Processing participant PST_abcdef0123456789abcd for evaluation";
    const redacted = redactSensitiveData(raw);
    expect(redacted).not.toContain("PST_abcdef0123456789abcd");
    expect(redacted).toContain("PST_***REDACTED***");
  });

  it("redacts sensitive object keys (FKL02, PSTV01, FKL48, passwords, tokens, claim_payload)", () => {
    const data = {
      requestId: "req-123",
      claimId: "CLM_0123456789abcdefabcd",
      fkl02: "raw_claim_123",
      pstv01: "raw_patient_456",
      fkl48: 15000000,
      token: "secret-token",
      claim_payload: { complex: "payload" },
    };

    const cleaned = redactSensitiveData(data) as Record<string, unknown>;
    expect(cleaned.requestId).toBe("req-123");
    expect(cleaned.claimId).toBe("CLM_0123456789abcdefabcd");
    expect(cleaned.fkl02).toBe("***REDACTED***");
    expect(cleaned.pstv01).toBe("***REDACTED***");
    expect(cleaned.fkl48).toBe("***REDACTED***");
    expect(cleaned.token).toBe("***REDACTED***");
    expect(cleaned.claim_payload).toBe("***REDACTED***");
  });

  it("formats safe error envelope without leaking internal details", () => {
    const envelope = createSafeErrorEnvelope("VALIDATION_ERROR", "Data invalid", "req-corr-999");
    expect(envelope).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Data invalid",
        correlation_id: "req-corr-999",
      },
    });
  });
});
