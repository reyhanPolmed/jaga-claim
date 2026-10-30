import { describe, it, expect, beforeEach } from "vitest";
import { signSessionPayload, verifySessionToken, requireAdmin, requireReviewer, UserSession, AuthError } from "../../src/lib/auth";

describe("AUTH-001: Session Signing, Verification & RBAC", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "super-secret-dev-key-minimum-32-chars-long";
    process.env.DATABASE_URL = "postgresql://dummy:dummy@localhost:5432/dummy";
  });

  const adminUser: UserSession = {
    id: "00000000-0000-0000-0000-000000000001",
    email: "admin@jagaclaim.local",
    displayName: "Admin Demo",
    role: "admin",
  };

  const reviewerUser: UserSession = {
    id: "00000000-0000-0000-0000-000000000002",
    email: "reviewer@jagaclaim.local",
    displayName: "dr. Ahmad Reviewer",
    role: "reviewer",
  };

  it("signs and verifies session tokens correctly", () => {
    const token = signSessionPayload(adminUser);
    const verified = verifySessionToken(token);
    expect(verified).toEqual(adminUser);
  });

  it("rejects tampered tokens", () => {
    const token = signSessionPayload(adminUser);
    const tampered = token.slice(0, -4) + "abcd";
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("enforces admin-only access", async () => {
    const adminToken = signSessionPayload(adminUser);
    const adminReq = new Request("http://localhost/api/test", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const user = await requireAdmin(adminReq);
    expect(user.role).toBe("admin");

    const reviewerToken = signSessionPayload(reviewerUser);
    const reviewerReq = new Request("http://localhost/api/test", {
      headers: { Authorization: `Bearer ${reviewerToken}` },
    });

    await expect(requireAdmin(reviewerReq)).rejects.toThrow(AuthError);
  });

  it("allows reviewer and admin access to reviewer routes", async () => {
    const reviewerToken = signSessionPayload(reviewerUser);
    const reviewerReq = new Request("http://localhost/api/test", {
      headers: { Authorization: `Bearer ${reviewerToken}` },
    });
    const user = await requireReviewer(reviewerReq);
    expect(user.role).toBe("reviewer");

    const adminToken = signSessionPayload(adminUser);
    const adminReq = new Request("http://localhost/api/test", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const admin = await requireReviewer(adminReq);
    expect(admin.role).toBe("admin");
  });

  it("throws 401 UNAUTHORIZED when no token is present", async () => {
    const emptyReq = new Request("http://localhost/api/test");
    await expect(requireAdmin(emptyReq)).rejects.toThrow("Sesi login tidak ditemukan");
  });
});
