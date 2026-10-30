import React from "react";
import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type ReviewAction = "confirm" | "dismiss" | "request_correction";

export const reviewPanel = "rounded-2xl border border-slate-200/80 bg-white";
export const reviewButton = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";
export const reviewControl = "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/10";
export const compactReviewBadge = "[&>span]:max-w-full [&>span]:whitespace-normal [&>span]:break-words [&>span]:px-2 [&>span]:py-0.5 [&>span]:text-[10px] [&>span]:font-medium [&>span>svg]:h-3 [&>span>svg]:w-3 [&>span>svg]:shrink-0";

export const reviewTabs = [
  { value: "awaiting_review", label: "Menunggu review" },
  { value: "finding_confirmed", label: "Temuan dikonfirmasi" },
  { value: "correction_requested", label: "Koreksi diminta" },
  { value: "dismissed", label: "Tidak relevan" },
  { value: "all", label: "Semua status" },
];

export const actionOptions: Array<{ value: ReviewAction; label: string; resultLabel: string; state: string; description: string; icon: LucideIcon; tone: string }> = [
  { value: "confirm", label: "Konfirmasi temuan", resultLabel: "Temuan dikonfirmasi", state: "finding_confirmed", description: "Temuan perlu ditindaklanjuti berdasarkan hasil peninjauan.", icon: CheckCircle2, tone: "text-primary-700 bg-primary-50" },
  { value: "request_correction", label: "Minta koreksi", resultLabel: "Koreksi diminta", state: "correction_requested", description: "Perbaikan dilakukan di sistem sumber dan masuk sebagai revisi baru.", icon: RotateCcw, tone: "text-amber-700 bg-amber-50" },
  { value: "dismiss", label: "Tidak relevan", resultLabel: "Temuan tidak relevan", state: "dismissed", description: "Temuan dinilai tidak relevan; jelaskan alasan peninjauan.", icon: XCircle, tone: "text-slate-600 bg-slate-100" },
];

export function formatReviewTime(value?: string | null) {
  if (!value) return "Belum tersedia";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Belum tersedia";
}

export function formatReviewDate(value?: string) {
  if (!value) return "Belum tersedia";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Belum tersedia";
}

export function formatReviewEvidence(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Belum tersedia";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try { return JSON.stringify(value) ?? "Belum tersedia"; } catch { return "Tidak dapat ditampilkan"; }
}

export function ReviewSectionHeading({ title, subtitle, icon: Icon, count }: { title: string; subtitle?: string; icon: LucideIcon; count?: number }) {
  return <div className="mb-4 border-b border-slate-100 pb-4"><div className="flex items-center gap-2"><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-600" strokeWidth={1.75} /><h2 className="min-w-0 text-[13px] font-semibold leading-5 text-primary-700">{title}</h2>{count !== undefined && <span className="ml-auto rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700 tabular-nums">{count}</span>}</div>{subtitle && <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{subtitle}</p>}</div>;
}
