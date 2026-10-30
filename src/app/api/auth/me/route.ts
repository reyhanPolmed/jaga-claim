import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { AuthError } from "@/lib/auth";
import { requireSameOrigin } from "@/lib/request-security";

export async function GET(req: Request) {
  const session = await getSession(req);
  if (!session) {
    return NextResponse.json({ user: null }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ user: session }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  try {
    requireSameOrigin(req);
    const response = NextResponse.json({ success: true });
    response.cookies.delete(SESSION_COOKIE_NAME);
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "LOGOUT_FAILED", message: "Logout tidak dapat diproses" } }, { status: 500 });
  }
}
