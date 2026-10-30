import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { confirmCuratedImport, ImportInputError } from "@/lib/services/import-service";
import { createSafeErrorEnvelope } from "@/lib/logger";
import { guardMutation } from "@/lib/request-security";

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    guardMutation(req, admin.id, "import-confirm", 10);
    const body = await req.json();

    const previewToken = body.preview_token || body.previewToken;
    if (!previewToken) {
      return NextResponse.json(createSafeErrorEnvelope("PREVIEW_TOKEN_REQUIRED", "preview_token wajib disertakan"), { status: 400 });
    }

    const result = await confirmCuratedImport(previewToken, admin.id);

    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    if (err instanceof ImportInputError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("IMPORT_CONFIRM_ERROR", err.message || "Gagal mengonfirmasi import"), { status: 500 });
  }
}
