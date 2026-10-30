import { NextResponse } from "next/server";
import { requireReviewer, AuthError } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createSafeErrorEnvelope } from "@/lib/logger";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireReviewer(req);

    const batch = await prisma.importBatch.findUnique({
      where: { id: params.id },
      include: {
        user: { select: { displayName: true, email: true } },
      },
    });

    if (!batch) {
      return NextResponse.json(createSafeErrorEnvelope("BATCH_NOT_FOUND", "Import batch tidak ditemukan"), { status: 404 });
    }

    return NextResponse.json({
      id: batch.id,
      schema_version: batch.schemaVersion,
      source_name: batch.sourceName,
      file_checksum: batch.fileChecksum,
      status: batch.status,
      total_count: batch.totalCount,
      imported_claim_count: batch.importedClaimCount,
      imported_revision_count: batch.importedRevisionCount,
      duplicate_count: batch.duplicateCount,
      rejected_count: batch.rejectedCount,
      errors: batch.errors || [],
      imported_by: batch.user.displayName,
      created_at: batch.createdAt.toISOString(),
      finished_at: batch.finishedAt?.toISOString() || null,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(createSafeErrorEnvelope(err.code, err.message), { status: err.status });
    }
    return NextResponse.json(createSafeErrorEnvelope("INTERNAL_ERROR", "Gagal mengambil data batch import"), { status: 500 });
  }
}
