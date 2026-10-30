"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EvidenceList } from "@/components/claims/EvidenceList";
import { useParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, ClipboardCheck, FileSearch, FileText, History, Info, Layers, Loader2, RefreshCw, Send, UserRound } from "lucide-react";
import { RiskBadge, ReviewStateBadge } from "@/components/ui/badges";
import { REASON_CODE_LABELS } from "@/lib/contracts/ml-contract";
import type { EvidenceItem, MlScoreRequest, ReasonCode } from "@/lib/contracts/ml-contract";
import { actionOptions, compactReviewBadge, formatReviewDate, formatReviewEvidence, formatReviewTime, ReviewSectionHeading, reviewButton, reviewPanel } from "@/components/reviews/review-ui";
import type { ReviewAction } from "@/components/reviews/review-ui";

interface ReviewRecord {
  id: string;
  claim_id: string;
  prediction_id: string;
  action: ReviewAction;
  notes: string | null;
  reviewer_name: string;
  reviewed_at: string;
  supersedes_review_id: string | null;
  risk_band: string;
  risk_score: number;
}

interface DetailData {
  claim: { id: string; claim_key: string };
  latest_revision_number: number;
  selected_revision: {
    revision_number: number;
    payload: {
      episode?: Partial<MlScoreRequest["episode"]>;
      diagnoses?: Partial<MlScoreRequest["diagnoses"]>;
      casemix?: Partial<MlScoreRequest["casemix"]>;
      financial_pre_submit?: Partial<MlScoreRequest["financial_pre_submit"]>;
    };
    prediction_history: Array<{ id: string; scored_at: string; model_version: string }>;
  };
}

interface ReviewAnalysis {
  prediction_id: string | null;
  revision_number: number;
  is_stale: boolean;
  risk_band?: string;
  risk_score?: number;
  reason_codes?: ReasonCode[];
  evidence?: EvidenceItem[];
  source?: string;
  scored_at?: string;
  model_version?: string;
  rule_version?: string;
}

async function readData<T>(url: string, message: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(message);
  return response.json();
}

function money(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value) : "Belum tersedia";
}

function Field({ label, value }: { label: string; value?: string }) {
  return <div className="min-w-0 rounded-lg bg-primary-50/50 px-3 py-2.5"><dt className="text-[11px] text-slate-500">{label}</dt><dd className="mt-1 break-words text-xs font-medium leading-5 text-primary-700 [overflow-wrap:anywhere]">{value || "Belum tersedia"}</dd></div>;
}

export default function ReviewerActionPage() {
  const params = useParams();
  const claimId = params.claimId as string;
  const [claimDetail, setClaimDetail] = useState<DetailData | null>(null);
  const [analysis, setAnalysis] = useState<ReviewAnalysis | null>(null);
  const [reviews, setReviews] = useState<ReviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [historyScope, setHistoryScope] = useState<"current" | "all">("current");
  const requestId = useRef(0);
  const submitLock = useRef(false);
  const submissionKey = useRef<{ signature: string; key: string } | null>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setRefreshing(true);
    setLoadError(null);
    try {
      const [detail, result, reviewData] = await Promise.all([
        readData<DetailData>(`/api/claims/${claimId}`, "Snapshot klaim tidak dapat dimuat.", signal),
        readData<ReviewAnalysis>(`/api/claims/${claimId}/analysis`, "Hasil analisis tidak dapat dimuat.", signal),
        readData<{ data: ReviewRecord[] }>(`/api/claims/${claimId}/reviews`, "Riwayat review tidak dapat dimuat.", signal),
      ]);
      const snapshot = result.prediction_id && result.revision_number !== detail.selected_revision.revision_number
        ? await readData<DetailData>(`/api/claims/${claimId}?revision=${result.revision_number}`, "Snapshot sumber hasil analisis tidak dapat dimuat.", signal)
        : detail;
      if (signal?.aborted || currentRequest !== requestId.current) return false;
      setClaimDetail(snapshot);
      setAnalysis(result);
      setReviews([...(reviewData.data || [])].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at) || b.id.localeCompare(a.id)));
      return true;
    } catch (err) {
      if (!signal?.aborted && currentRequest === requestId.current) setLoadError(err instanceof Error ? err.message : "Data review tidak dapat dimuat.");
      return false;
    } finally {
      if (!signal?.aborted && currentRequest === requestId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [claimId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setClaimDetail(null);
    setAnalysis(null);
    setReviews([]);
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    setAction(null);
    setNotes("");
    setFormError(null);
    setNoteError(null);
    setSuccessMessage(null);
    submissionKey.current = null;
  }, [analysis?.prediction_id]);

  const currentReviews = reviews.filter((review) => review.prediction_id === analysis?.prediction_id);
  const activeReview = currentReviews[0] || null;
  const hasPrediction = Boolean(analysis?.prediction_id);
  const contextMatches = Boolean(analysis && claimDetail && analysis.revision_number === claimDetail.selected_revision.revision_number);
  const canReview = hasPrediction && contextMatches && !loadError;
  const requiredNotes = action !== null && (action !== "confirm" || Boolean(activeReview && activeReview.action !== action));
  const selectedAction = actionOptions.find((option) => option.value === action);
  const activeState = activeReview ? actionOptions.find((option) => option.value === activeReview.action)?.state || "not_available" : hasPrediction ? "awaiting_review" : "not_available";
  const displayedReviews = historyScope === "current" ? currentReviews : reviews;
  const supersededIds = new Set(reviews.map((review) => review.supersedes_review_id).filter(Boolean));

  const handleSubmitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitLock.current) return;
    setFormError(null);
    setNoteError(null);
    setSuccessMessage(null);
    if (!canReview || !analysis?.prediction_id) { setFormError("Hasil scoring yang dapat direview belum tersedia. Segarkan data klaim."); return; }
    if (!action) { setFormError("Pilih tindakan review terlebih dahulu."); return; }
    const trimmed = notes.trim();
    if (requiredNotes && !trimmed) {
      setNoteError(activeReview && activeReview.action !== action ? "Catatan wajib diisi ketika mengubah tindakan dari review sebelumnya." : "Tuliskan alasan peninjauan atau instruksi koreksi.");
      notesRef.current?.focus();
      return;
    }
    const payload = { prediction_id: analysis.prediction_id, action, notes: trimmed };
    const signature = JSON.stringify(payload);
    if (submissionKey.current?.signature !== signature) submissionKey.current = { signature, key: crypto.randomUUID() };
    submitLock.current = true;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/claims/${claimId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": submissionKey.current!.key },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Keputusan review belum dapat disimpan.");
      setSuccessMessage("Keputusan review berhasil disimpan. Riwayat sebelumnya tetap tersedia.");
      setAction(null);
      setNotes("");
      submissionKey.current = null;
      const updated = await loadData();
      if (!updated) setSuccessMessage("Review berhasil disimpan. Segarkan halaman untuk memuat histori terbaru.");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Review belum dapat disimpan. Silakan coba kembali.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (loading) return <div aria-label="Memuat workspace review" aria-busy="true" className="animate-pulse space-y-6"><div className="h-4 w-40 rounded bg-slate-200" /><div className="h-36 rounded-xl border border-slate-200/70 bg-white" /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="h-80 rounded-xl border border-slate-200/70 bg-white" /><div className="h-96 rounded-xl border border-slate-200/70 bg-white" /></div></div>;

  if (!claimDetail || !analysis) return <div role="alert" className={`${reviewPanel} mx-auto max-w-lg px-6 py-12 text-center`}><span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50"><AlertCircle className="h-5 w-5 text-rose-600" /></span><h1 className="text-base font-semibold text-primary-700">Workspace belum dapat dimuat</h1><p className="mt-2 text-xs leading-5 text-slate-500">{loadError || "Data review klaim belum tersedia."}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Link href="/reviews" className={`${reviewButton} border border-slate-200 text-slate-600 hover:bg-slate-50`}><ArrowLeft className="h-3.5 w-3.5" />Antrean review</Link><button onClick={() => void loadData()} disabled={refreshing} className={`${reviewButton} bg-primary-700 text-white hover:bg-primary-800`}><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Coba lagi</button></div></div>;

  const snapshot = claimDetail.selected_revision;
  const episode = snapshot.payload?.episode || {};
  const diagnoses = snapshot.payload?.diagnoses || {};
  const casemix = snapshot.payload?.casemix || {};
  const finance = snapshot.payload?.financial_pre_submit || {};
  const reasonCodes = analysis.reason_codes || [];
  const evidence = (analysis.evidence || []).map((item) => ({
    feature: formatReviewEvidence(item.feature),
    value: formatReviewEvidence(item.value),
    reference: formatReviewEvidence(item.reference),
  }));
  const score = typeof analysis.risk_score === "number" && Number.isFinite(analysis.risk_score) ? analysis.risk_score.toFixed(4) : "Belum tersedia";
  const snapshotHref = `/claims/${claimId}?revision=${snapshot.revision_number}`;

  return (
    <div className="space-y-6 pb-3">
      <Link href="/reviews" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"><ArrowLeft className="h-3.5 w-3.5" />Kembali ke Antrean Review</Link>

      <header className={`${reviewPanel} overflow-hidden`}>
        <div className="flex flex-col justify-between gap-5 px-5 py-5 sm:px-6 2xl:flex-row 2xl:items-center"><div className="min-w-0"><h1 className="text-[22px] font-semibold tracking-tight text-primary-700">Tinjau klaim</h1><p className="mt-2 break-all font-mono text-[11px] leading-5 text-slate-500">{claimDetail.claim.claim_key}</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">Revisi {snapshot.revision_number}</span>{analysis.source === "mock" && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">Hasil simulasi</span>}<div className={compactReviewBadge}><ReviewStateBadge state={activeState} /></div></div></div><div className="flex shrink-0 flex-wrap items-center gap-2"><button onClick={() => void loadData()} disabled={submitting || refreshing} className={`${reviewButton} border border-slate-200 text-slate-600 hover:bg-slate-50`}><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Segarkan</button><Link href="#tindakan-review" className={`${reviewButton} bg-primary-700 text-white shadow-sm hover:bg-primary-800`}><ClipboardCheck className="h-3.5 w-3.5" />Tulis review<ArrowRight className="h-3 w-3" /></Link></div></div>
        <dl className="grid grid-cols-2 border-t border-slate-100 bg-primary-50/50 lg:grid-cols-4"><div className="border-r border-slate-100 px-5 py-4"><dt className="text-[10px] text-slate-500">Skor risiko</dt><dd className="mt-2 font-mono text-xl font-semibold text-primary-700 tabular-nums">{score}</dd></div><div className="px-5 py-4 lg:border-r lg:border-slate-100"><dt className="text-[10px] text-slate-500">Prioritas peninjauan</dt><dd className={`mt-2 ${compactReviewBadge}`}><RiskBadge band={hasPrediction ? analysis.risk_band : null} /></dd></div><div className="border-r border-t border-slate-100 px-5 py-4 lg:border-t-0"><dt className="text-[10px] text-slate-500">Waktu scoring</dt><dd className="mt-2 text-[11px] font-medium text-slate-700">{hasPrediction ? formatReviewTime(analysis.scored_at) : "Belum tersedia"}</dd></div><div className="border-t border-slate-100 px-5 py-4 lg:border-t-0"><dt className="text-[10px] text-slate-500">Review pada hasil ini</dt><dd className="mt-2 text-xs font-medium text-slate-700 tabular-nums">{currentReviews.length} catatan</dd></div></dl>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-5 py-3 text-[10px] leading-5 text-slate-500"><span className="break-words [overflow-wrap:anywhere]">Model · {analysis.model_version || "Belum tersedia"}</span><span className="break-words">Aturan · {analysis.rule_version || "Belum tersedia"}</span><span>Sumber · {analysis.source === "mock" ? "Simulasi" : analysis.source || "Belum tersedia"}</span></div>
      </header>


      {analysis.is_stale && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" /><div><p className="text-[11px] font-medium leading-5 text-amber-900">Anda meninjau hasil Revisi {analysis.revision_number}, sedangkan revisi terkini adalah Revisi {claimDetail.latest_revision_number}.</p><p className="mt-1 text-[11px] leading-5 text-amber-800">Snapshot, bukti, dan tindakan di halaman ini terikat pada hasil revisi yang ditampilkan. <Link href={`/claims/${claimId}`} className="font-medium underline underline-offset-2">Lihat revisi terkini</Link></p></div></div>}
      {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-[11px] leading-5 text-rose-700"><span className="inline-flex items-center gap-2"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{loadError} Segarkan sebelum menulis review berikutnya.</span><button onClick={() => void loadData()} disabled={submitting || refreshing} className="font-medium underline">Coba lagi</button></div>}
      {successMessage && <div role="status" className="flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3 text-[11px] leading-5 text-primary-800"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />{successMessage}</div>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section id="snapshot-review" className={`${reviewPanel} scroll-mt-28 px-5 py-4`}><ReviewSectionHeading title="Konteks klaim" subtitle={`Data sumber Revisi ${snapshot.revision_number}.`} icon={FileText} /><dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2"><Field label="Diagnosis utama" value={diagnoses.primary_icd10} /><Field label="INA-CBG" value={casemix.inacbg_code} /><Field label="Tanggal masuk" value={formatReviewDate(episode.admission_date)} /><Field label="Tanggal pulang" value={formatReviewDate(episode.discharge_date)} /><Field label="Tingkat layanan" value={episode.service_level} /><Field label="Biaya tagih pra-submit" value={money(finance.billed_cost)} /></dl><Link href={snapshotHref} className="mt-5 inline-flex min-h-8 items-center gap-1 border-t border-slate-100 pt-3 text-[11px] font-medium text-primary-700 hover:text-primary-900">Lihat snapshot lengkap<ChevronRight className="h-3 w-3" /></Link></section>

          <section id="alasan-review" className={`${reviewPanel} scroll-mt-28 px-5 py-4`}><ReviewSectionHeading title="Alasan peninjauan" subtitle="Indikator dari layanan scoring." icon={Layers} count={reasonCodes.length} />{!hasPrediction ? <p className="text-[11px] leading-5 text-slate-500">Belum ada hasil scoring sukses untuk ditinjau.</p> : reasonCodes.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-4 text-[11px] leading-5 text-slate-500">Provider tidak mengembalikan kode alasan khusus. Bukti pendukung tetap dapat diperiksa di bawah.</div> : <div className="grid gap-3 2xl:grid-cols-2">{reasonCodes.map((code) => { const meta = REASON_CODE_LABELS[code]; return <div key={code} className="rounded-xl border border-primary-100 bg-primary-50/30 px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-[11px] font-medium leading-5 text-slate-700">{meta?.title || code}</h3>{meta?.engine && <span className="rounded-md border border-primary-100 bg-primary-50/60 px-1.5 py-0.5 text-[10px] text-primary-700">{meta.engine}</span>}</div><p className="mt-1.5 break-all font-mono text-[10px] leading-4 text-slate-500">{code}</p>{meta?.description && <p className="mt-2 text-[11px] leading-5 text-slate-600">{meta.description}</p>}</div>; })}</div>}</section>

          <section className={`${reviewPanel} px-5 py-4`}><ReviewSectionHeading title="Bukti pendukung" subtitle="Baca nilai dan pembanding dari hasil scoring. Bukti berlaku untuk hasil secara keseluruhan." icon={FileSearch} count={evidence.length} />{evidence.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center"><FileSearch className="mx-auto mb-2 h-4 w-4 text-slate-500" /><p className="text-[11px] leading-5 text-slate-500">Belum ada bukti terlampir pada hasil ini.</p></div> : <EvidenceList items={evidence} />}<Link href={`/claims/${claimId}/analysis`} className="mt-4 inline-flex min-h-8 items-center gap-1 text-[11px] font-medium text-primary-700 hover:text-primary-900">Buka Analisis AI<ChevronRight className="h-3 w-3" /></Link></section>
        </div>

        <aside className="min-w-0 space-y-5">
          <section id="tindakan-review" className={`${reviewPanel} scroll-mt-28 overflow-hidden px-5 py-4`}>
            <ReviewSectionHeading title="Catat hasil peninjauan" subtitle={`Pilih tindakan dan jelaskan tindak lanjut untuk Revisi ${snapshot.revision_number}.`} icon={ClipboardCheck} />
            {activeReview && <div className="mb-5 rounded-xl border border-primary-100 bg-primary-50/50 p-3"><p className="text-[10px] text-slate-500">Keputusan terbaru pada hasil ini</p><div className={`mt-2 ${compactReviewBadge}`}><ReviewStateBadge state={activeState} /></div><p className="mt-2 text-[10px] leading-4 text-slate-500">{activeReview.reviewer_name} · {formatReviewTime(activeReview.reviewed_at)}</p></div>}
            {!canReview && <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">{loadError ? "Data perlu disegarkan sebelum review dapat disimpan." : !contextMatches && hasPrediction ? "Snapshot belum sesuai dengan revisi hasil analisis." : "Revisi ini belum memiliki prediksi sukses yang dapat direview."} <Link href={`/claims/${claimId}/analysis`} className="font-medium text-primary-700 underline underline-offset-2">Lihat status analisis</Link></div>}
            {formError && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-700"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{formError}</div>}
            <form onSubmit={handleSubmitReview} noValidate>
              <fieldset disabled={!canReview || submitting || refreshing} className="space-y-5 disabled:opacity-60">
                <legend className="mb-3 text-[11px] font-semibold text-primary-700">01 · Pilih tindakan</legend>
                <div className="space-y-2">{actionOptions.map((option) => { const Icon = option.icon; const selected = action === option.value; return <label key={option.value} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-primary-600/20 ${selected ? "border-primary-600 bg-primary-50/70" : "border-slate-200/80 hover:bg-slate-50"}`}><input type="radio" name="review-action" value={option.value} checked={selected} onChange={() => { setAction(option.value); setNoteError(null); setFormError(null); }} className="mt-1 h-3.5 w-3.5 shrink-0 accent-primary-700" /><div className="min-w-0"><span className="flex items-center gap-1.5 text-[11px] font-medium leading-5 text-primary-700"><Icon className="h-3 w-3 shrink-0" />{option.label}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{option.description}</span></div></label>; })}</div>
                <div><label htmlFor="review-notes" className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-600"><span className="font-semibold text-primary-700">02 · Catatan peninjauan</span><span className={`text-[10px] ${requiredNotes ? "text-rose-700" : "font-normal text-slate-500"}`}>{requiredNotes ? "Wajib diisi" : "Opsional"}</span></label><textarea ref={notesRef} id="review-notes" rows={5} value={notes} required={requiredNotes} aria-required={requiredNotes} aria-invalid={Boolean(noteError)} aria-describedby={noteError ? "review-note-error review-notes-help" : "review-notes-help"} onChange={(event) => { setNotes(event.target.value); setNoteError(null); }} placeholder="Tuliskan hasil peninjauan, alasan tindakan, atau instruksi koreksi..." className={`w-full resize-y rounded-xl border bg-slate-50/40 p-3 text-xs leading-5 text-slate-700 transition-colors placeholder:text-slate-500 focus:outline-none focus:ring-2 ${noteError ? "border-rose-300 focus:ring-rose-500/20" : "border-slate-200 focus:border-primary-600 focus:ring-primary-600/10"}`} /><div className="mt-2 flex items-start justify-between gap-3"><p id="review-notes-help" className="text-[10px] leading-4 text-slate-500">{requiredNotes ? activeReview && activeReview.action !== action ? "Jelaskan alasan perubahan dari tindakan sebelumnya." : "Sertakan alasan atau instruksi yang dapat ditindaklanjuti." : "Catatan membantu reviewer berikutnya memahami keputusan Anda."}</p><span className="shrink-0 text-[10px] text-slate-500 tabular-nums">{notes.length} karakter</span></div>{noteError && <p id="review-note-error" role="alert" className="mt-2 text-[11px] leading-5 text-rose-700">{noteError}</p>}</div>
                {action === "request_correction" && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" /><p className="text-[10px] leading-5 text-amber-900">Perbaikan dilakukan di sistem sumber. Data hasil koreksi akan muncul sebagai revisi baru di JAGA-CLAIM.</p></div>}
                {selectedAction && <div className="flex flex-col gap-2 rounded-xl border border-primary-100 bg-primary-50/50 p-3 text-[10px]"><span className="text-slate-500">03 · Tindakan yang akan disimpan</span><span className="font-medium text-slate-700">{selectedAction.label}</span></div>}
                <button type="submit" disabled={!action || !canReview || submitting || refreshing} className={`${reviewButton} w-full bg-primary-700 text-white shadow-sm hover:bg-primary-800`}>{submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{submitting ? "Menyimpan keputusan..." : "Simpan hasil review"}</button>
              </fieldset>
            </form>
            <p className="mt-4 text-[10px] leading-5 text-slate-500">Tindakan baru ditambahkan ke histori. Catatan review sebelumnya tetap tersimpan.</p>
          </section>
        </aside>
      </div>

      <section id="histori-review" className={`${reviewPanel} scroll-mt-28 overflow-hidden`}>
        <div className="px-5 pt-5"><ReviewSectionHeading title="Riwayat keputusan review" subtitle="Jejak tindakan dan catatan yang tersimpan pada klaim ini." icon={History} count={displayedReviews.length} /></div>
        <div role="group" aria-label="Cakupan histori review" className="flex flex-wrap gap-1 border-y border-slate-100 bg-primary-50/30 px-4 py-2">{([{ value: "current", label: "Hasil yang ditinjau", count: currentReviews.length }, { value: "all", label: "Semua hasil klaim", count: reviews.length }] as const).map((scope) => <button key={scope.value} aria-pressed={historyScope === scope.value} onClick={() => setHistoryScope(scope.value)} className={`relative inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600 ${historyScope === scope.value ? "bg-white text-primary-700 ring-1 ring-primary-200" : "text-slate-500 hover:bg-white hover:text-primary-700"}`}>{scope.label}<span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{scope.count}</span></button>)}</div>
        {displayedReviews.length === 0 ? <div className="px-5 py-10 text-center"><History className="mx-auto mb-3 h-5 w-5 text-slate-500" /><p className="text-xs text-slate-600">Belum ada review pada {historyScope === "current" ? "hasil yang ditinjau" : "klaim ini"}.</p><p className="mt-2 text-[11px] leading-5 text-slate-500">Review yang disimpan akan tercatat di sini.</p></div> : <ol className="space-y-0 px-5 py-5">{displayedReviews.map((review, index) => {
          const option = actionOptions.find((item) => item.value === review.action)!;
          const Icon = option.icon;
          const isActive = review.id === activeReview?.id;
          const isSuperseded = supersededIds.has(review.id);
          const belongsToCurrent = review.prediction_id === analysis.prediction_id;
          const originPrediction = snapshot.prediction_history?.find((item) => item.id === review.prediction_id);
          const replacedReview = review.supersedes_review_id ? reviews.find((item) => item.id === review.supersedes_review_id) : null;
          return <li key={review.id} className="relative flex gap-3 pb-6 last:pb-0"><div className="relative flex w-7 shrink-0 justify-center"><span className={`relative z-10 mt-0.5 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-white ${option.tone}`}><Icon className="h-3.5 w-3.5" /></span>{index < displayedReviews.length - 1 && <span aria-hidden="true" className="absolute bottom-0 top-8 w-px bg-slate-100" />}</div><div className={`min-w-0 flex-1 rounded-xl border px-4 py-4 ${isActive ? "border-primary-200 bg-primary-50/20" : "border-slate-200/70 bg-slate-50/20"}`}><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><h3 className="text-xs font-medium leading-5 text-primary-700">{option.resultLabel}</h3><span className={`rounded-md px-1.5 py-0.5 text-[10px] ${isActive ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-500"}`}>{isActive ? "Aktif pada hasil ini" : isSuperseded ? "Telah digantikan" : belongsToCurrent ? "Riwayat sebelumnya" : "Hasil terdahulu"}</span></div><time dateTime={review.reviewed_at} className="text-[10px] leading-5 text-slate-500">{formatReviewTime(review.reviewed_at)}</time></div><p className="mt-2 flex items-start gap-1.5 break-words text-[11px] text-slate-500 [overflow-wrap:anywhere]"><UserRound className="h-3 w-3 shrink-0" />{review.reviewer_name}</p><div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] text-slate-500"><span>{belongsToCurrent || originPrediction ? `Revisi ${snapshot.revision_number}` : "Hasil scoring terdahulu"}</span><span className="font-mono tabular-nums">Skor {Number.isFinite(review.risk_score) ? review.risk_score.toFixed(4) : "Belum tersedia"}</span><div className={compactReviewBadge}><RiskBadge band={review.risk_band} /></div></div>{review.notes ? <p className="mt-3 whitespace-pre-wrap break-words rounded-md border border-slate-100 bg-white px-3 py-2.5 text-[11px] leading-5 text-slate-600">{review.notes}</p> : <p className="mt-3 text-[10px] text-slate-500">Tanpa catatan tambahan.</p>}{review.supersedes_review_id && <p className="mt-3 text-[10px] leading-5 text-slate-500">Menggantikan review sebelumnya{replacedReview ? ` oleh ${replacedReview.reviewer_name} pada ${formatReviewTime(replacedReview.reviewed_at)}` : " pada hasil scoring yang sama"}.</p>}</div></li>;
        })}</ol>}
      </section>

      <footer className="flex items-start gap-2 border-t border-slate-200/70 pt-4 text-[10px] leading-5 text-slate-500"><Info className="mt-1 h-3 w-3 shrink-0" />Skor dan prioritas membantu peninjauan manusia. Koreksi klaim tetap dilakukan di sistem sumber.</footer>
    </div>
  );
}
