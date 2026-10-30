import { describe, expect, it } from "vitest";
import { enforceRateLimit, requireSameOrigin } from "../../src/lib/request-security";

describe("request security", () => {
  it("accepts same-origin mutations and rejects a foreign Origin", () => {
    expect(() => requireSameOrigin(new Request("http://localhost/api/test", {
      method: "POST",
      headers: { Origin: "http://localhost" },
    }))).not.toThrow();

    expect(() => requireSameOrigin(new Request("http://localhost/api/test", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    }))).toThrowError(expect.objectContaining({ status: 403, code: "CSRF_ORIGIN_REJECTED" }));
  });

  it("rejects a request after its rate-limit budget is exhausted", () => {
    const key = `unit-${crypto.randomUUID()}`;
    enforceRateLimit(key, 2, 60_000);
    enforceRateLimit(key, 2, 60_000);
    expect(() => enforceRateLimit(key, 2, 60_000)).toThrowError(
      expect.objectContaining({ status: 429, code: "RATE_LIMITED" }),
    );
  });
});
