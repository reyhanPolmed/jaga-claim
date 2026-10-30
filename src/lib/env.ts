import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  ADMIN_LOGIN_EMAIL: z.string().email().default("admin@jagaclaim.local"),
  REVIEWER_LOGIN_EMAIL: z.string().email().default("reviewer@jagaclaim.local"),
  ADMIN_PASSWORD_HASH: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^scrypt:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/).optional()),
  REVIEWER_PASSWORD_HASH: z.preprocess((value) => value === "" ? undefined : value, z.string().regex(/^scrypt:32768:8:1:[0-9a-f]{32}:[0-9a-f]{128}$/).optional()),
  SCORING_PROVIDER: z.enum(["mock", "http"]).default("mock"),
  ML_SERVICE_URL: z.string().url("ML_SERVICE_URL must be a valid URL").default("http://localhost:8000").refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
  }, "ML_SERVICE_URL harus HTTP(S) dan tidak boleh memuat credential"),
  ML_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  ML_EXPLAIN_TIMEOUT_MS: z.coerce.number().int().positive().max(60000).default(25000),
  ML_SERVICE_TOKEN: z.preprocess((value) => value === "" ? undefined : value, z.string().min(16).optional()),
  IMPORT_MAX_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  IMPORT_MAX_LINES: z.coerce.number().int().positive().default(50_000),
  PORT: z.coerce.number().int().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env | null = null;

export function getEnv(): Env {
  if (parsedEnv) {
    return parsedEnv;
  }

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    console.error(`[CONFIG ERROR] Invalid environment configuration: ${errorDetails}`);
    throw new Error(`Invalid environment configuration: ${errorDetails}`);
  }

  parsedEnv = result.data;
  return parsedEnv;
}
