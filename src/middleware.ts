import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, sessionClaimsSchema } from "@/lib/session-contract";

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 2 || !/^[0-9a-f]{64}$/.test(parts[1])) return false;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signature = Uint8Array.from(parts[1].match(/.{2}/g)!, (byte) => parseInt(byte, 16));
    if (!await crypto.subtle.verify("HMAC", key, signature, new TextEncoder().encode(parts[0]))) return false;
    const encoded = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")), (char) => char.charCodeAt(0));
    const parsed = sessionClaimsSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success && parsed.data.expiresAt > Date.now();
  } catch { return false; }
}

export async function middleware(request: NextRequest) {
  const valid = await hasValidSession(request);
  if (request.nextUrl.pathname === "/login") {
    return valid ? NextResponse.redirect(new URL("/dashboard", request.url)) : NextResponse.next();
  }
  if (!valid) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/", "/login", "/dashboard/:path*", "/claims/:path*", "/risk-queue/:path*", "/reviews/:path*"] };
