import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, signSessionPayload, SESSION_COOKIE_NAME, type UserSession } from "@/lib/auth";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/session-contract";
import { verifyPassword } from "@/lib/password";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { enforceRateLimit, requireSameOrigin } from "@/lib/request-security";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(256),
}).strict();
const rejected = () => NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "Email atau kata sandi tidak sesuai" } }, { status: 401 });

export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    enforceRateLimit("credential-login:global", 60);
    const body = credentialsSchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return rejected();
    enforceRateLimit(`credential-login:${body.data.email}`, 10);
    const env = getEnv();
    if (!env.ADMIN_PASSWORD_HASH || !env.REVIEWER_PASSWORD_HASH || env.ADMIN_LOGIN_EMAIL.toLowerCase() === env.REVIEWER_LOGIN_EMAIL.toLowerCase()) {
      return NextResponse.json({ error: { code: "LOGIN_NOT_CONFIGURED", message: "Konfigurasi akun belum siap. Hubungi administrator." } }, { status: 503 });
    }
    const accounts = [
      { email: env.ADMIN_LOGIN_EMAIL.toLowerCase(), hash: env.ADMIN_PASSWORD_HASH, role: "admin" as const, name: "Admin JAGA-CLAIM" },
      { email: env.REVIEWER_LOGIN_EMAIL.toLowerCase(), hash: env.REVIEWER_PASSWORD_HASH, role: "reviewer" as const, name: "reviewer ganteng" },
    ];
    const account = accounts.find((item) => item.email === body.data.email);
    const valid = await verifyPassword(body.data.password, account?.hash || env.ADMIN_PASSWORD_HASH);
    if (!valid || !account) return rejected();
    const existing = await prisma.user.findUnique({ where: { email: account.email } });
    if (existing && existing.role !== account.role) return rejected();
    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { displayName: account.name },
      create: { email: account.email, role: account.role, displayName: account.name },
    });
    const sessionPayload: UserSession = { id: user.id, email: user.email, displayName: user.displayName, role: user.role as UserSession["role"] };
    const response = NextResponse.json({ user: sessionPayload }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE_NAME, signSessionPayload(sessionPayload), {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
      path: "/", maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    return NextResponse.json({ error: { code: "LOGIN_FAILED", message: "Login belum dapat diproses. Silakan coba kembali." } }, { status: 500 });
  }
}
