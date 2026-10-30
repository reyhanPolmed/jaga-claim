import { NextResponse } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth";
import { ImportInputError, previewCuratedJsonlStream } from "@/lib/services/import-service";
import { createSafeErrorEnvelope } from "@/lib/logger";
import { getEnv } from "@/lib/env";
import { guardMutation } from "@/lib/request-security";

const ALLOWED_MIME_TYPES = new Set([
  "application/json",
  "application/jsonl",
  "application/x-ndjson",
  "application/octet-stream",
  "text/plain",
]);

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin(req);
    guardMutation(req, admin.id, "import-preview", 10);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(createSafeErrorEnvelope("FILE_REQUIRED", "File upload 'file' tidak ditemukan"), { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".jsonl")) {
      return NextResponse.json(createSafeErrorEnvelope("INVALID_FILE_TYPE", "File harus memiliki ekstensi .jsonl"), { status: 400 });
    }
    if (file.type && !ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      return NextResponse.json(createSafeErrorEnvelope("INVALID_MIME_TYPE", "MIME file tidak diizinkan untuk JSONL"), { status: 400 });
    }

    const env = getEnv();
    if (file.size > env.IMPORT_MAX_BYTES) {
      return NextResponse.json(createSafeErrorEnvelope("FILE_TOO_LARGE", `Ukuran file melebihi batas ${env.IMPORT_MAX_BYTES} byte`), { status: 413 });
    }
    const result = await previewCuratedJsonlStream(file.stream(), file.name, {
      maxBytes: env.IMPORT_MAX_BYTES,
      maxLines: env.IMPORT_MAX_LINES,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    if (err instanceof ImportInputError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("IMPORT_PREVIEW_ERROR", err.message || "Gagal memproses pratinjau import"), { status: 500 });
  }
}
