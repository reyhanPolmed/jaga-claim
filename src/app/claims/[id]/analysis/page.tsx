"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EvidenceList } from "@/components/claims/EvidenceList";
import { useParams } from "next/navigation";
import { Activity, AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, ChevronRight, ClipboardCheck, Clock3, FileSearch, FileText, Info, Layers, Loader2, Play, RefreshCw, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RiskBadge } from "@/components/ui/badges";
import { ClaimPageTabs } from "@/components/claims/ClaimPageTabs";
import { AiExplanation } from "@/components/claims/AiExplanation";
import { REASON_CODE_LABELS } from "@/lib/contracts/ml-contract";
import type { EvidenceItem, ReasonCode, RiskBand } from "@/lib/contracts/ml-contract";

interface AnalysisData {
  claim_id: string;
  claim_key: string;
  revision_number: number;
  is_stale: boolean;
  claim_revision_id: string;
  scoring_status: string;
  latest_attempt: { job_id: string; status: string; error_code: string | null; error_message: string | null } | null;
  prediction_id: string | null;
  risk_score?: number;
  risk_band?: RiskBand;
  reason_codes?: ReasonCode[];
  evidence?: EvidenceItem[];
  model_version?: string;
  rule_version?: string;
  source?: string;
  scored_at?: string;
}

const panel = "rounded-2xl border border-slate-200/80 bg-white";
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";
const compactBadge = "[&>span]:max-w-full [&>span]:whitespace-normal [&>span]:px-2 [&>span]:py-0.5 [&>span]:text-[10px] [&>span]:font-medium [&>span>svg]:h-3 [&>span>svg]:w-3";
const priorities: Record<RiskBand, { label: string; icon: string; border: string }> = {
  high: { label: "Tinggi", icon: "bg-rose-50 text-rose-600 ring-rose-100", border: "border-l-rose-400" },
  medium: { label: "Sedang", icon: "bg-amber-50 text-amber-700 ring-amber-100", border: "border-l-amber-400" },
  low: { label: "Rendah", icon: "bg-primary-50 text-primary-700 ring-primary-100", border: "border-l-primary-600" },
};

function formatTime(value?: string) {
  if (!value) return "Belum tersedia";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Belum tersedia";
  return date.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function SectionHeading({ title, subtitle, icon: Icon, count }: { title: string; subtitle?: string; icon: LucideIcon; count?: number }) {
  return <div className="mb-4 border-b border-slate-100 pb-4"><div className="flex items-center gap-2"><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-600" strokeWidth={1.75} /><h2 className="text-[13px] font-semibold leading-5 text-primary-700">{title}</h2>{count !== undefined && <span className="ml-auto rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700 tabular-nums">{count}</span>}</div>{subtitle && <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{subtitle}</p>}</div>;
}

function MetaField({ label, value, mono = false }: { label: string; value?: string; mono?: boolean }) {
  return <div className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"><dt className="text-[10px] text-slate-500">{label}</dt><dd className={`mt-1.5 break-words text-[11px] font-medium leading-5 text-slate-700 ${mono ? "font-mono" : ""}`}>{value || "Belum tersedia"}</dd></div>;
}

export default function ClaimAnalysisPage() {
  const params = useParams();
  const claimId = params.id as string;
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const requestId = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/me", { signal: controller.signal }).then((response) => response.json()).then((value) => {
      if (!controller.signal.aborted) setRole(value.user?.role || null);
    }).catch(() => { if (!controller.signal.aborted) setRole(null); });
    return () => {
      controller.abort();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [claimId]);

  const loadAnalysis = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/analysis`, { signal });
      if (!response.ok) throw new Error("Hasil analisis belum dapat dimuat. Silakan coba kembali.");
      const result = await response.json();
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setData(result);
    } catch (err) {
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setError(err instanceof Error ? err.message : "Hasil analisis belum tersedia");
    } finally {
      if (!signal?.aborted && currentRequest === requestId.current) setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadAnalysis(controller.signal);
    return () => controller.abort();
  }, [loadAnalysis]);

  const retryScoring = async () => {
    if (!data || role !== "admin" || retrying || ["queued", "processing"].includes(data.latest_attempt?.status || data.scoring_status)) return;
    setRetrying(true);
    setActionError(null);
    try {
      const isRetry = data.latest_attempt?.status === "failed" && data.latest_attempt.job_id;
      const response = await fetch(isRetry ? `/api/scoring-jobs/${data.latest_attempt!.job_id}/retry` : "/api/scoring-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: isRetry ? undefined : JSON.stringify({ targets: [{ claim_id: data.claim_id, claim_revision_id: data.claim_revision_id }] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Scoring tidak dapat dijalankan");
      refreshTimer.current = setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Scoring tidak dapat dijalankan");
      setRetrying(false);
    }
  };

  if (loading) return <div aria-label="Memuat analisis klaim" aria-busy="true" className="animate-pulse space-y-6"><div className="h-4 w-40 rounded bg-slate-200" /><div className="h-6 w-44 rounded bg-slate-200" /><div className="h-52 rounded-xl border border-slate-200/70 bg-white" /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="h-80 rounded-xl border border-slate-200/70 bg-white" /><div className="h-64 rounded-xl border border-slate-200/70 bg-white" /></div></div>;

  if (error || !data) return <div role="alert" className={`${panel} mx-auto max-w-lg px-6 py-12 text-center`}><span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50"><AlertCircle className="h-5 w-5 text-rose-600" /></span><h1 className="text-base font-semibold text-primary-700">Analisis belum tersedia</h1><p className="mt-2 text-xs leading-5 text-slate-500">{error || "Data analisis tidak tersedia."}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Link href={`/claims/${claimId}`} className={`${button} border border-slate-200 text-slate-600 hover:bg-slate-50`}><ArrowLeft className="h-3.5 w-3.5" />Detail klaim</Link><button onClick={() => void loadAnalysis()} className={`${button} bg-primary-700 text-white hover:bg-primary-800`}><RefreshCw className="h-3.5 w-3.5" />Coba lagi</button></div></div>;

  const attemptStatus = data.latest_attempt?.status || data.scoring_status;
  const failed = attemptStatus === "failed";
  const pending = ["queued", "processing"].includes(attemptStatus);
  const missingState = data.scoring_status === "queued" || data.scoring_status === "processing";
  const reasonCodes = data.reason_codes || [];
  const evidence = data.evidence || [];
  const hasValidResult = Boolean(data.prediction_id) && typeof data.risk_score === "number" && Number.isFinite(data.risk_score) && Boolean(data.risk_band && priorities[data.risk_band]);
  const priority = data.risk_band ? priorities[data.risk_band] : undefined;
  const isMock = data.source === "mock";
  const revisionHref = `/claims/${claimId}?revision=${data.revision_number}`;

  return (
    <div className="space-y-6 pb-3">
      <Link href={hasValidResult ? revisionHref : `/claims/${claimId}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"><ArrowLeft className="h-3.5 w-3.5" />Kembali ke Detail Klaim</Link>

      <header className={`${panel} flex flex-col justify-between gap-4 px-5 py-5 2xl:flex-row 2xl:items-center`}>
        <div className="min-w-0"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-700">Penjelasan hasil scoring</p><h1 className="text-[22px] font-semibold tracking-tight text-primary-700 sm:text-2xl">AI Analysis</h1><div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-2"><span className="break-all font-mono text-[11px] text-slate-600">{data.claim_key}</span><span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">Revisi {data.revision_number}</span>{isMock && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">Hasil simulasi</span>}</div></div>
        <div className="flex shrink-0 flex-wrap items-center gap-2"><button onClick={() => void loadAnalysis()} disabled={retrying} className={`${button} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><RefreshCw className="h-3.5 w-3.5" />Segarkan</button>{hasValidResult && <Link href={`/reviews/${claimId}`} className={`${button} bg-primary-700 text-white shadow-sm hover:bg-primary-800`}><ClipboardCheck className="h-3.5 w-3.5" />Buka Reviewer Workspace<ArrowRight className="h-3 w-3" /></Link>}</div>
      </header>

      <ClaimPageTabs claimId={claimId} active="analysis" revision={hasValidResult ? data.revision_number : undefined} />

      {data.is_stale && <div role="status" className="flex flex-col justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-center"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" /><div><p className="text-[11px] font-medium leading-5 text-amber-900">Hasil dari revisi terdahulu</p><p className="mt-0.5 text-[11px] leading-5 text-amber-800">Analisis ini berasal dari Revisi {data.revision_number}. Revisi terkini belum memiliki hasil scoring sukses.</p></div></div><Link href={`/claims/${claimId}`} className="inline-flex min-h-8 shrink-0 items-center gap-1 text-[11px] font-medium text-amber-900 hover:underline">Lihat revisi terkini<ChevronRight className="h-3 w-3" /></Link></div>}

      {actionError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{actionError}</div>}

      {!hasValidResult ? (
        <section className={`${panel} px-5 py-12 text-center sm:px-8`}>
          <span className={`mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${failed ? "bg-rose-50 text-rose-600" : "bg-slate-50 text-slate-500"}`}>{pending ? <Clock3 className="h-5 w-5" /> : failed ? <AlertCircle className="h-5 w-5" /> : <FileSearch className="h-5 w-5" />}</span>
          <h2 className="text-base font-semibold text-primary-700">{data.prediction_id ? "Hasil analisis belum dapat ditampilkan" : failed ? "Scoring Terakhir Gagal" : missingState ? data.scoring_status === "processing" ? "Scoring sedang diproses" : "Scoring dalam antrean" : "Klaim Belum Dianalisis"}</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">{data.prediction_id ? "Data hasil belum lengkap untuk ditampilkan. Segarkan halaman atau hubungi admin aplikasi." : failed ? data.latest_attempt?.error_message || "Attempt scoring terakhir belum menghasilkan prediksi sukses." : pending ? "Hasil akan tersedia setelah proses scoring selesai. Segarkan untuk melihat status terbaru." : "Belum ada hasil scoring sukses untuk revisi terkini."}</p>
          {failed && data.latest_attempt?.error_code && <p className="mt-3 font-mono text-[10px] text-rose-700">{data.latest_attempt.error_code}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2"><Link href={`/claims/${claimId}`} className={`${button} border border-slate-200 text-slate-600 hover:bg-slate-50`}><FileText className="h-3.5 w-3.5" />Detail klaim</Link>{role === "admin" && !pending && !data.prediction_id ? <button onClick={() => void retryScoring()} disabled={retrying} className={`${button} bg-primary-700 text-white hover:bg-primary-800`}>{retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{retrying ? "Menjalankan..." : failed ? "Coba Ulang Scoring" : "Jalankan Scoring"}</button> : <button onClick={() => void loadAnalysis()} disabled={retrying} className={`${button} bg-primary-700 text-white hover:bg-primary-800`}><RefreshCw className="h-3.5 w-3.5" />Perbarui status</button>}</div>
          {role !== "admin" && !pending && !data.prediction_id && <p className="mt-5 text-[11px] text-slate-500">Hubungi admin aplikasi untuk menjalankan scoring.</p>}
        </section>
      ) : (
        <>
          {failed && <div role="status" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-4 py-3"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700" /><div><p className="text-[11px] font-medium leading-5 text-rose-800">Attempt scoring terbaru gagal</p><p className="mt-0.5 text-[11px] leading-5 text-rose-700">Hasil sukses sebelumnya tetap ditampilkan.{data.latest_attempt?.error_message ? ` ${data.latest_attempt.error_message}` : ""}</p></div></div>}

          <section className={`${panel} overflow-hidden border-l-[3px] ${priority?.border}`}>
            <div className="flex flex-col justify-between gap-5 px-5 py-5 lg:flex-row lg:items-center">
              <div className="min-w-0"><p className="mb-3 text-[10px] font-medium uppercase tracking-[0.14em] text-primary-600">Hasil analisis · Revisi {data.revision_number}</p><h2 className="text-lg font-semibold tracking-tight text-primary-700 sm:text-xl">Prioritas Peninjauan: {priority?.label}</h2><p className="mt-2 max-w-lg text-xs leading-5 text-slate-500">Skor risiko adalah indikator urutan prioritas review, bukan probabilitas fraud atau vonis klaim salah.</p></div>
              <div className="w-full shrink-0 rounded-xl bg-primary-700 px-5 py-4 lg:w-[200px]"><p className="text-[10px] font-medium uppercase tracking-[0.1em] text-primary-100">Hybrid risk score</p><p className="mt-3 font-mono text-[30px] font-semibold leading-none tracking-tight text-white tabular-nums">{data.risk_score!.toFixed(4)}</p><div className="mt-3 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-primary-100">Skala 0–1</span><div className={compactBadge}><RiskBadge band={data.risk_band} /></div></div></div>
            </div>
            <dl className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/30 lg:grid-cols-4"><div className="border-r border-slate-100 px-5 py-4"><dt className="text-[10px] text-slate-500">Alasan ditandai</dt><dd className="mt-1.5 text-xs font-medium text-slate-700 tabular-nums">{reasonCodes.length} alasan</dd></div><div className="px-5 py-4 lg:border-r lg:border-slate-100"><dt className="text-[10px] text-slate-500">Bukti pendukung</dt><dd className="mt-1.5 text-xs font-medium text-slate-700 tabular-nums">{evidence.length} bukti global</dd></div><div className="border-r border-t border-slate-100 px-5 py-4 lg:border-t-0"><dt className="text-[10px] text-slate-500">Sumber hasil</dt><dd className={`mt-1.5 text-xs font-medium ${isMock ? "text-amber-800" : "text-slate-700"}`}>{isMock ? "Mock · Simulasi" : data.source ? "Layanan ML" : "Belum tersedia"}</dd></div><div className="border-t border-slate-100 px-5 py-4 lg:border-t-0"><dt className="text-[10px] text-slate-500">Revisi yang dianalisis</dt><dd className="mt-1.5 text-xs font-medium text-slate-700">Revisi {data.revision_number}</dd></div></dl>
          </section>

          {data.prediction_id && !isMock && <AiExplanation key={data.prediction_id} claimId={claimId} predictionId={data.prediction_id} />}

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              <section className={`${panel} px-5 py-4`}>
                <SectionHeading title="Alasan yang Perlu Ditinjau" subtitle="Indikator yang dikembalikan layanan scoring." icon={Layers} count={reasonCodes.length} />
                {reasonCodes.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-7 text-center"><Layers className="mx-auto mb-3 h-5 w-5 text-slate-500" /><h3 className="text-xs font-medium text-slate-700">Tidak ada kode alasan khusus</h3><p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-slate-500">Provider tidak mengembalikan reason code. Bukti pendukung, bila tersedia, tetap dapat ditinjau di bawah.</p></div> : <ol className="grid gap-3 2xl:grid-cols-2">{reasonCodes.map((code, index) => {
                  const meta = REASON_CODE_LABELS[code];
                  return <li key={code} className="flex gap-3 rounded-xl border border-primary-100 bg-primary-50/30 p-3.5"><span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200/70 bg-white text-[10px] text-slate-500 tabular-nums">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-xs font-medium leading-5 text-primary-700">{meta?.title || code}</h3>{meta?.engine && <span className="rounded-md border border-primary-100 bg-primary-50/70 px-2 py-0.5 text-[10px] text-primary-700">{meta.engine}</span>}</div><p className="mt-1.5 break-all font-mono text-[10px] leading-4 text-slate-500">{code}</p>{meta?.description && <p className="mt-2 text-[11px] leading-5 text-slate-600">{meta.description}</p>}</div></li>;
                })}</ol>}
              </section>

              <section className={`${panel} px-5 py-4`}>
                <SectionHeading title="Bukti Pendukung (Evidence)" subtitle="Ringkasan bukti dan hal yang perlu diperiksa. Detail teknis dapat dibuka pada setiap bukti." icon={FileSearch} count={evidence.length} />
                {evidence.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-7 text-center"><FileSearch className="mx-auto mb-3 h-5 w-5 text-slate-500" /><h3 className="text-xs font-medium text-slate-700">Belum ada bukti terlampir</h3><p className="mx-auto mt-2 max-w-md text-[11px] leading-5 text-slate-500">Hasil ini tidak menyertakan evidence. Tinjau data klaim sesuai prosedur review.</p></div> : <EvidenceList items={evidence} />}
                <p className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-slate-500"><Info className="mt-1 h-3 w-3 shrink-0" />Bukti ditampilkan untuk hasil analisis secara keseluruhan; hubungan khusus per alasan tidak tersedia.</p>
              </section>
            </div>

            <aside className="min-w-0 space-y-5">
              <section className={`${panel} px-5 py-4`}><SectionHeading title="Jejak analisis" subtitle="Identitas model dan snapshot sumber." icon={ShieldCheck} /><dl className="space-y-4"><MetaField label="Revisi sumber hasil" value={`Revisi ${data.revision_number}`} /><MetaField label="Model" value={data.model_version} mono /><MetaField label="Versi aturan" value={data.rule_version} mono /><MetaField label="Provider scoring" value={isMock ? "Mock · Simulasi" : data.source?.toUpperCase()} /><MetaField label="Waktu scoring · lokal" value={formatTime(data.scored_at)} /></dl><Link href={revisionHref} className="mt-5 inline-flex min-h-8 items-center gap-1 border-t border-slate-100 pt-3 text-[11px] font-medium text-primary-700 hover:text-primary-900">Lihat snapshot sumber<ChevronRight className="h-3 w-3" /></Link></section>

              <section className="rounded-xl border border-primary-100 bg-primary-50/40 px-5 py-5"><h2 className="text-[13px] font-semibold text-primary-700">Lanjutkan peninjauan</h2><p className="mt-2 text-[11px] leading-5 text-slate-600">Periksa alasan dan bukti, lalu catat tindakan serta catatan Anda di workspace reviewer.</p>{data.is_stale && <p className="mt-3 text-[11px] leading-5 text-amber-800">Periksa revisi yang aktif di workspace sebelum menyimpan review.</p>}<Link href={`/reviews/${claimId}`} className={`${button} mt-5 w-full bg-primary-700 text-white hover:bg-primary-800`}>Buka workspace<ArrowRight className="h-3 w-3" /></Link></section>

              {(failed || (data.is_stale && !pending)) && role === "admin" && <section className={`${panel} px-5 py-4`}><SectionHeading title="Scoring revisi terkini" subtitle={failed ? "Attempt terakhir perlu ditinjau." : "Revisi terbaru belum memiliki hasil sukses."} icon={RefreshCw} /><button onClick={() => void retryScoring()} disabled={retrying} className={`${button} w-full border border-slate-200 text-slate-600 hover:bg-slate-50`}>{retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{retrying ? "Menjalankan..." : failed ? "Coba Ulang Scoring" : "Jalankan Scoring"}</button></section>}
              {data.is_stale && pending && <section className="rounded-xl border border-slate-200/80 bg-slate-100/40 px-5 py-4"><div className="flex items-center gap-2 text-[11px] font-medium text-slate-700"><Clock3 className="h-3.5 w-3.5 text-slate-500" />{attemptStatus === "processing" ? "Revisi terkini sedang diproses" : "Revisi terkini dalam antrean"}</div><p className="mt-2 text-[11px] leading-5 text-slate-500">Segarkan halaman setelah proses scoring selesai.</p></section>}
            </aside>
          </div>
        </>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4 text-[10px] leading-5 text-slate-500"><span className="inline-flex items-center gap-1.5"><Activity className="h-3 w-3" />JAGA-CLAIM · Analisis pendukung review</span><Link href={`/claims/${claimId}`} className="inline-flex items-center gap-1 hover:text-primary-700">Rincian & riwayat klaim<ChevronRight className="h-3 w-3" /></Link></footer>
    </div>
  );
}
