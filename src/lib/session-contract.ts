import { z } from "zod";

export const SESSION_COOKIE_NAME = "jaga_claim_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const sessionClaimsSchema = z.object({
  id: z.string().uuid(), email: z.string().email(), displayName: z.string().min(1),
  role: z.enum(["admin", "reviewer"]), version: z.literal(2),
  expiresAt: z.number().int().positive(),
});
