import { AuthError } from "./auth";

const buckets = new Map<string, { count: number; resetAt: number }>();

export function requireSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const expected = new URL(req.url).origin;
  if (origin !== expected) throw new AuthError(403, "CSRF_ORIGIN_REJECTED", "Origin request tidak diizinkan");
}

export function enforceRateLimit(key: string, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count++;
  if (current.count > limit) throw new AuthError(429, "RATE_LIMITED", "Terlalu banyak request. Silakan coba kembali beberapa saat lagi");
}

export function guardMutation(req: Request, actorId: string, action: string, limit = 30) {
  requireSameOrigin(req);
  enforceRateLimit(`${actorId}:${action}`, limit);
}
