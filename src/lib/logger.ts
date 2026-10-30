// SEC-001: Structured Logger with Redaction & Safe Error Envelope

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  userId?: string;
  role?: string;
  path?: string;
  method?: string;
  action?: string;
  jobId?: string;
  itemId?: string;
  batchId?: string;
  claimId?: string; // Only internal UUID or pseudonim CLM_ allowed
  [key: string]: unknown;
}

export interface SafeErrorEnvelope {
  error: {
    code: string;
    message: string;
    correlation_id?: string;
  };
}

// Redact sensitive patterns (HMAC keys, tokens, participant keys, raw clinical dumps)
const SENSITIVE_KEYS = new Set([
  "secret",
  "token",
  "auth_secret",
  "authorization",
  "password",
  "hmac",
  "salt",
  "fkl02",
  "pstv01",
  "fkl48",
  "nik",
  "no_kartu",
  "participant_key",
  "claim_payload",
]);

export function redactSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 5) return "[DEPTH_EXCEEDED]";
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    // Redact participant key PST_...
    let clean = obj.replace(/PST_[0-9a-f]{20}/gi, "PST_***REDACTED***");
    // Redact raw tokens or hex secrets
    clean = clean.replace(/bearer\s+[A-Za-z0-9-_.]+/gi, "Bearer ***REDACTED***");
    return clean;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof obj === "object") {
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.has(lowerKey)) {
        redacted[key] = "***REDACTED***";
      } else {
        redacted[key] = redactSensitiveData(value, depth + 1);
      }
    }
    return redacted;
  }

  return obj;
}

export class Logger {
  private defaultContext: LogContext;

  constructor(defaultContext: LogContext = {}) {
    this.defaultContext = defaultContext;
  }

  child(context: LogContext): Logger {
    return new Logger({ ...this.defaultContext, ...context });
  }

  private log(level: "INFO" | "WARN" | "ERROR" | "DEBUG", message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const merged = { ...this.defaultContext, ...context };
    const sanitized = redactSensitiveData(merged);

    const logEntry = {
      timestamp,
      level,
      message,
      context: sanitized,
    };

    const formatted = JSON.stringify(logEntry);
    if (level === "ERROR") {
      console.error(formatted);
    } else if (level === "WARN") {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  info(message: string, context?: LogContext) {
    this.log("INFO", message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log("WARN", message, context);
  }

  error(message: string, context?: LogContext) {
    this.log("ERROR", message, context);
  }

  debug(message: string, context?: LogContext) {
    this.log("DEBUG", message, context);
  }
}

export const logger = new Logger();

// Helper to format safe errors for public API responses
export function createSafeErrorEnvelope(code: string, message: string, correlationId?: string): SafeErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(correlationId ? { correlation_id: correlationId } : {}),
    },
  };
}
