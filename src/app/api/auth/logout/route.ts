import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth";
import { AuthError } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/request-security";

export async function POST(req: Request) {
  try { requireSameOrigin(req); } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    return NextResponse.json({ error: { code: "LOGOUT_FAILED", message: "Tidak dapat keluar" } }, { status: 500 });
  }
  const response = NextResponse.json({ success: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
