import { describe, it, expect } from "vitest";
import { deriveReviewState } from "../../src/lib/services/review-service";

describe("REVIEW-001: Derived Review State", () => {
  it("returns not_available when no prediction exists", () => {
    expect(deriveReviewState(false)).toBe("not_available");
    expect(deriveReviewState(false, "confirm")).toBe("not_available");
  });

  it("returns awaiting_review when prediction exists without reviews", () => {
    expect(deriveReviewState(true, null)).toBe("awaiting_review");
    expect(deriveReviewState(true, undefined)).toBe("awaiting_review");
  });

  it("maps confirm action to finding_confirmed", () => {
    expect(deriveReviewState(true, "confirm")).toBe("finding_confirmed");
  });

  it("maps dismiss action to dismissed", () => {
    expect(deriveReviewState(true, "dismiss")).toBe("dismissed");
  });

  it("maps request_correction action to correction_requested", () => {
    expect(deriveReviewState(true, "request_correction")).toBe("correction_requested");
  });
});
