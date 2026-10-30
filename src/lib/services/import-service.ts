import crypto from "crypto";
import { prisma } from "../db";
import {
  curatedRowSchema,
  detectForbiddenFields,
  computePayloadChecksum,
  computeFileChecksum,
  CuratedRow,
  ImportError,
} from "../contracts/curated-import";

export const DEFAULT_IMPORT_MAX_BYTES = 50 * 1024 * 1024;
export const DEFAULT_IMPORT_MAX_LINES = 50_000;
const PREVIEW_TTL_MS = 30 * 60 * 1000;

export class ImportInputError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

export interface ImportPreviewResult {
  previewToken: string;
  fileChecksum: string;
  totalLines: number;
  importedClaimsCount: number;
  importedRevisionsCount: number;
  duplicateSnapshotsCount: number;
  rejectedCount: number;
  errors: ImportError[];
}

export interface ImportConfirmResult {
  importBatchId: string;
  importedClaims: number;
  importedRevisions: number;
  duplicateSnapshots: number;
  rejected: number;
  errors: ImportError[];
}

type Candidate = { line: number; row: CuratedRow; checksum: string };
type PreviewEntry = {
  fileChecksum: string;
  sourceName: string;
  validRows: CuratedRow[];
  duplicateCount: number;
  errors: ImportError[];
  totalLines: number;
  createdAt: number;
  confirmPromise?: Promise<ImportConfirmResult>;
  confirmedResult?: ImportConfirmResult;
};

// App Router compiles preview and confirm routes into different module bundles.
// Keep the bounded, TTL-protected cache on the Node global so both bundles in
// one application process resolve the same preview token. This is intentionally
// process-local; production multi-instance deployment still requires shared
// staging storage before imports are distributed across instances.
type ImportPreviewGlobal = typeof globalThis & {
  __jagaClaimImportPreviewCache?: Map<string, PreviewEntry>;
};

const importPreviewGlobal = globalThis as ImportPreviewGlobal;
const previewCache = importPreviewGlobal.__jagaClaimImportPreviewCache ?? new Map<string, PreviewEntry>();
importPreviewGlobal.__jagaClaimImportPreviewCache = previewCache;

function cleanOldPreviews() {
  const now = Date.now();
  for (const [token, data] of previewCache.entries()) {
    if (now - data.createdAt > PREVIEW_TTL_MS) previewCache.delete(token);
  }
}

function safeSourceName(sourceName: string) {
  return sourceName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180) || "uploaded.jsonl";
}

function parseLine(rawLine: string, line: number, errors: ImportError[]): Candidate | null {
  const trimmed = rawLine.trim();
  if (!trimmed) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(trimmed);
  } catch {
    errors.push({ line, code: "INVALID_JSON", message: "Baris bukan format JSON yang valid" });
    return null;
  }
  if (!parsedJson || typeof parsedJson !== "object") {
    errors.push({ line, code: "VALIDATION_ERROR", message: "Baris harus berupa JSON objek" });
    return null;
  }

  const forbidden = detectForbiddenFields(parsedJson as Record<string, unknown>);
  if (forbidden) {
    errors.push({ line, code: forbidden.code, message: forbidden.message });
    return null;
  }

  const parsed = curatedRowSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    errors.push({
      line,
      code: "VALIDATION_ERROR",
      message: issue ? `${issue.path.join(".")}: ${issue.message}` : "Validasi data gagal",
    });
    return null;
  }
  return { line, row: parsed.data, checksum: computePayloadChecksum(parsed.data) };
}

async function finalizePreview(
  candidates: Candidate[],
  errors: ImportError[],
  totalLines: number,
  fileChecksum: string,
  sourceName: string,
): Promise<ImportPreviewResult> {
  cleanOldPreviews();
  const validCandidates: Candidate[] = [];
  const seen = new Map<string, { participantKey: string; revisions: Set<number>; checksums: Set<string> }>();
  let duplicateCount = 0;

  for (const candidate of candidates) {
    const { row, checksum, line } = candidate;
    const tracked = seen.get(row.claim_id);
    if (!tracked) {
      seen.set(row.claim_id, {
        participantKey: row.participant_key,
        revisions: new Set([row.source_revision]),
        checksums: new Set([checksum]),
      });
      validCandidates.push(candidate);
      continue;
    }
    if (tracked.participantKey !== row.participant_key) {
      errors.push({ line, code: "PARTICIPANT_MISMATCH", message: "participant_key tidak konsisten untuk claim_id yang sama dalam file" });
    } else if (tracked.checksums.has(checksum)) {
      duplicateCount++;
      errors.push({ line, code: "DUPLICATE_SNAPSHOT", message: "Snapshot data klinis duplikat terdeteksi dalam file" });
    } else if (tracked.revisions.has(row.source_revision)) {
      errors.push({ line, code: "INVALID_REVISION", message: `Konflik nomor revisi ${row.source_revision} untuk claim_id yang sama dengan isi berbeda` });
    } else {
      tracked.revisions.add(row.source_revision);
      tracked.checksums.add(checksum);
      validCandidates.push(candidate);
    }
  }

  const claimKeys = [...new Set(validCandidates.map((item) => item.row.claim_id))];
  const existingClaims = claimKeys.length === 0 ? [] : await prisma.claim.findMany({
    where: { claimKey: { in: claimKeys } },
    select: {
      claimKey: true,
      participantKey: true,
      revisions: { select: { revisionNumber: true, payloadChecksum: true } },
    },
  });
  const existingByKey = new Map(existingClaims.map((claim) => [claim.claimKey, claim]));
  const validRows: CuratedRow[] = [];

  for (const candidate of validCandidates) {
    const { row, checksum, line } = candidate;
    const existing = existingByKey.get(row.claim_id);
    if (!existing) {
      validRows.push(row);
      continue;
    }
    if (existing.participantKey !== row.participant_key) {
      errors.push({ line, code: "PARTICIPANT_MISMATCH", message: "participant_key tidak cocok dengan klaim yang sudah tersimpan di database" });
      continue;
    }
    if (existing.revisions.some((revision) => revision.payloadChecksum === checksum)) {
      duplicateCount++;
      errors.push({ line, code: "DUPLICATE_SNAPSHOT", message: "Snapshot data klaim dengan checksum identik sudah pernah tersimpan" });
      continue;
    }
    const maxRevision = Math.max(0, ...existing.revisions.map((revision) => revision.revisionNumber));
    if (row.source_revision <= maxRevision) {
      errors.push({ line, code: "INVALID_REVISION", message: `Nomor revisi (${row.source_revision}) harus lebih tinggi dari revisi tersimpan (${maxRevision})` });
      continue;
    }
    validRows.push(row);
  }

  const previewToken = crypto.randomUUID();
  previewCache.set(previewToken, {
    fileChecksum,
    sourceName: safeSourceName(sourceName),
    validRows,
    duplicateCount,
    errors,
    totalLines,
    createdAt: Date.now(),
  });

  return {
    previewToken,
    fileChecksum,
    totalLines,
    importedClaimsCount: new Set(validRows.map((row) => row.claim_id)).size,
    importedRevisionsCount: validRows.length,
    duplicateSnapshotsCount: duplicateCount,
    rejectedCount: errors.filter((error) => error.code !== "DUPLICATE_SNAPSHOT").length,
    errors,
  };
}

export async function previewCuratedJsonl(
  content: string,
  sourceName = "uploaded.jsonl",
  limits = { maxBytes: DEFAULT_IMPORT_MAX_BYTES, maxLines: DEFAULT_IMPORT_MAX_LINES },
): Promise<ImportPreviewResult> {
  const bytes = Buffer.from(content, "utf8");
  if (bytes.byteLength > limits.maxBytes) throw new ImportInputError("FILE_TOO_LARGE", `Ukuran file melebihi batas ${limits.maxBytes} byte`, 413);
  const lines = content.split(/\r?\n/);
  if (lines.length > limits.maxLines) throw new ImportInputError("TOO_MANY_LINES", `Jumlah baris melebihi batas ${limits.maxLines}`, 413);
  const errors: ImportError[] = [];
  const candidates = lines.map((line, index) => parseLine(line, index + 1, errors)).filter((item): item is Candidate => item !== null);
  return finalizePreview(candidates, errors, lines.length, computeFileChecksum(bytes), sourceName);
}

export async function previewCuratedJsonlStream(
  stream: ReadableStream<Uint8Array>,
  sourceName = "uploaded.jsonl",
  limits = { maxBytes: DEFAULT_IMPORT_MAX_BYTES, maxLines: DEFAULT_IMPORT_MAX_LINES },
): Promise<ImportPreviewResult> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const hash = crypto.createHash("sha256");
  const errors: ImportError[] = [];
  const candidates: Candidate[] = [];
  let buffered = "";
  let totalBytes = 0;
  let totalLines = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > limits.maxBytes) throw new ImportInputError("FILE_TOO_LARGE", `Ukuran file melebihi batas ${limits.maxBytes} byte`, 413);
      hash.update(value);
      buffered += decoder.decode(value, { stream: true });
      const parts = buffered.split(/\r?\n/);
      buffered = parts.pop() ?? "";
      for (const line of parts) {
        totalLines++;
        if (totalLines > limits.maxLines) throw new ImportInputError("TOO_MANY_LINES", `Jumlah baris melebihi batas ${limits.maxLines}`, 413);
        const parsed = parseLine(line, totalLines, errors);
        if (parsed) candidates.push(parsed);
      }
    }
    buffered += decoder.decode();
  } catch (error) {
    if (error instanceof ImportInputError) throw error;
    throw new ImportInputError("INVALID_UTF8", "File harus menggunakan encoding UTF-8 yang valid");
  } finally {
    reader.releaseLock();
  }

  if (buffered.length > 0 || totalLines === 0) {
    totalLines++;
    if (totalLines > limits.maxLines) throw new ImportInputError("TOO_MANY_LINES", `Jumlah baris melebihi batas ${limits.maxLines}`, 413);
    const parsed = parseLine(buffered, totalLines, errors);
    if (parsed) candidates.push(parsed);
  }
  return finalizePreview(candidates, errors, totalLines, hash.digest("hex"), sourceName);
}

async function persistPreview(entry: PreviewEntry, importedByUserId: string): Promise<ImportConfirmResult> {
  const { validRows, duplicateCount, errors, fileChecksum, totalLines, sourceName } = entry;
  const batch = await prisma.$transaction(async (tx) => {
    const importBatch = await tx.importBatch.create({
      data: {
        importedBy: importedByUserId,
        schemaVersion: "jaga-claim-curated-v1",
        sourceName,
        fileChecksum,
        status: "completed",
        totalCount: totalLines,
        duplicateCount,
        rejectedCount: errors.filter((error) => error.code !== "DUPLICATE_SNAPSHOT").length,
        errors: errors.length > 0 ? (errors as any) : undefined,
        finishedAt: new Date(),
      },
    });
    let importedClaims = 0;
    let importedRevisions = 0;
    for (const row of validRows) {
      let claim = await tx.claim.findUnique({ where: { claimKey: row.claim_id } });
      if (!claim) {
        claim = await tx.claim.create({ data: { claimKey: row.claim_id, participantKey: row.participant_key } });
        importedClaims++;
      }
      await tx.claimRevision.create({
        data: {
          claimId: claim.id,
          importBatchId: importBatch.id,
          revisionNumber: row.source_revision,
          payloadChecksum: computePayloadChecksum(row),
          claimPayload: {
            episode: row.episode,
            diagnoses: row.diagnoses,
            casemix: row.casemix,
            procedures: row.procedures,
            financial_pre_submit: row.financial_pre_submit,
          } as any,
          sourceSnapshotAt: new Date(row.snapshot_at),
        },
      });
      importedRevisions++;
    }
    await tx.importBatch.update({
      where: { id: importBatch.id },
      data: { importedClaimCount: importedClaims, importedRevisionCount: importedRevisions },
    });
    return { importBatchId: importBatch.id, importedClaims, importedRevisions };
  });
  return {
    ...batch,
    duplicateSnapshots: duplicateCount,
    rejected: errors.filter((error) => error.code !== "DUPLICATE_SNAPSHOT").length,
    errors,
  };
}

export async function confirmCuratedImport(previewToken: string, importedByUserId: string, _legacySourceName?: string): Promise<ImportConfirmResult> {
  cleanOldPreviews();
  const entry = previewCache.get(previewToken);
  if (!entry) throw new ImportInputError("INVALID_PREVIEW_TOKEN", "Token pratinjau tidak valid atau telah kedaluwarsa");
  if (entry.confirmedResult) return entry.confirmedResult;
  if (entry.confirmPromise) return entry.confirmPromise;

  entry.confirmPromise = persistPreview(entry, importedByUserId)
    .then((result) => {
      entry.confirmedResult = result;
      return result;
    })
    .catch((error) => {
      entry.confirmPromise = undefined;
      throw error;
    });
  return entry.confirmPromise;
}
