import React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, HelpCircle } from "lucide-react";

export function RiskBadge({ band }: { band: string | null | undefined }) {
  if (!band) return <span className="text-slate-400 text-xs">—</span>;

  const b = band.toLowerCase();
  if (b === "high") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-danger-100 text-danger-700 border border-danger-200">
        <AlertCircle className="w-3.5 h-3.5" />
        Tinggi
      </span>
    );
  }
  if (b === "medium") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-warning-100 text-warning-700 border border-warning-200">
        <AlertTriangle className="w-3.5 h-3.5" />
        Sedang
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-success-100 text-success-700 border border-success-200">
      <CheckCircle2 className="w-3.5 h-3.5" />
      Rendah
    </span>
  );
}

export function ScoringStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3" />
          Selesai
        </span>
      );
    case "processing":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 animate-pulse">
          <Clock className="w-3 h-3" />
          Diproses
        </span>
      );
    case "queued":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
          <Clock className="w-3 h-3" />
          Dalam Antrean
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <AlertCircle className="w-3 h-3" />
          Gagal
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200">
          <HelpCircle className="w-3 h-3" />
          Belum Dianalisis
        </span>
      );
  }
}

export function ReviewStateBadge({ state }: { state: string }) {
  switch (state) {
    case "finding_confirmed":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-danger-50 text-danger-700 border border-danger-200">
          Temuan Dikonfirmasi
        </span>
      );
    case "dismissed":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
          Tidak Relevan
        </span>
      );
    case "correction_requested":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          Koreksi Diminta
        </span>
      );
    case "awaiting_review":
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200">
          Menunggu Review
        </span>
      );
    default:
      return <span className="text-slate-400 text-xs">Belum Tersedia</span>;
  }
}

export function RevisionBadge({ revisionNumber }: { revisionNumber: number }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
      Revisi {revisionNumber}
    </span>
  );
}
