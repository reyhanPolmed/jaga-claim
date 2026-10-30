import crypto from "crypto";
import { cookies } from "next/headers";
import { getEnv } from "./env";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, sessionClaimsSchema } from "./session-contract";
export { SESSION_COOKIE_NAME } from "./session-contract";

export type UserRole = "admin" | "reviewer";

export interface UserSession {
  id: string; // Internal UUID
  email: string;
  displayName: string;
  role: UserRole;
}

// Signs session payload with AUTH_SECRET
export function signSessionPayload(user: UserSession): string {
  const env = getEnv();
  const payloadStr = JSON.stringify({ ...user, version: 2, expiresAt: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
  const base64Payload = Buffer.from(payloadStr, "utf-8").toString("base64url");
  const hmac = crypto.createHmac("sha256", env.AUTH_SECRET).update(base64Payload).digest("hex");
  return `${base64Payload}.${hmac}`;
}

// Verifies and decodes session token
export function verifySessionToken(token: string): UserSession | null {
  try {
    const env = getEnv();
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [base64Payload, hmac] = parts;
    const expectedHmac = crypto.createHmac("sha256", env.AUTH_SECRET).update(base64Payload).digest("hex");

    if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
      return null;
    }

    const jsonStr = Buffer.from(base64Payload, "base64url").toString("utf-8");
    const parsed = sessionClaimsSchema.safeParse(JSON.parse(jsonStr));
    if (!parsed.success || parsed.data.expiresAt <= Date.now()) return null;
    const { id, email, displayName, role } = parsed.data;
    return { id, email, displayName, role };
  } catch {
    return null;
  }
}

// Extracts session from Next.js server context or incoming Request
export async function getSession(req?: Request): Promise<UserSession | null> {
  let token: string | undefined;

  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      token = authHeader.substring(7).trim();
    } else {
      const cookieHeader = req.headers.get("cookie");
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|; )${SESSION_COOKIE_NAME}=([^;]*)`));
        if (match) {
          token = decodeURIComponent(match[1]);
        }
      }
    }
  }

  if (!token) {
    try {
      const cookieStore = cookies();
      token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    } catch {
      // In non-Next server context (e.g. unit tests without request)
      token = undefined;
    }
  }

  if (!token) return null;
  return verifySessionToken(token);
}

export class AuthError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function requireUser(req?: Request): Promise<UserSession> {
  const session = await getSession(req);
  if (!session) {
    throw new AuthError(401, "UNAUTHORIZED", "Sesi login tidak ditemukan atau telah kedaluwarsa");
  }
  return session;
}

export async function requireAdmin(req?: Request): Promise<UserSession> {
  const user = await requireUser(req);
  if (user.role !== "admin") {
    throw new AuthError(403, "FORBIDDEN", "Aksi ini memerlukan kewenangan peran Admin");
  }
  return user;
}

export async function requireReviewer(req?: Request): Promise<UserSession> {
  const user = await requireUser(req);
  if (user.role !== "reviewer" && user.role !== "admin") {
    throw new AuthError(403, "FORBIDDEN", "Aksi ini memerlukan kewenangan peran Reviewer atau Admin");
  }
  return user;
}
