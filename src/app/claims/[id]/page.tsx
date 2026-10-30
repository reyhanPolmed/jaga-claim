"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Activity, AlertCircle, AlertTriangle, ArrowLeft, Building2, CalendarDays, Check, ChevronDown, ChevronRight, ClipboardCheck, Clock3, FileCheck2, FileText, History, Layers, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { RiskBadge, ScoringStatusBadge, ReviewStateBadge } from "@/components/ui/badges";
import { ClaimPageTabs } from "@/components/claims/ClaimPageTabs";
import type { MlScoreRequest } from "@/lib/contracts/ml-contract";

type ReviewAction = "confirm" | "dismiss" | "request_correction";
type Snapshot = {
  episode?: Partial<MlScoreRequest["episode"]>;
  diagnoses?: Partial<MlScoreRequest["diagnoses"]>;
  casemix?: Partial<MlScoreRequest["casemix"]>;
  procedures?: Partial<MlScoreRequest["procedures"]>;
  financial_pre_submit?: Partial<MlScoreRequest["financial_pre_submit"]>;
};

interface PredictionHistory {
  id: string;
  risk_score: number;
  risk_band: string;
  source: string;
  model_version: string;
  rule_version?: string;
  scored_at: string;
  reason_codes: string[];
}

interface ReviewHistory {
  id: string;
  prediction_id: string;
  action: ReviewAction;
  notes: string | null;
  reviewed_at: string;
  reviewer_name: string;
  supersedes_review_id?: string | null;
}

interface ClaimRevision {
  id: string;
  revision_number: number;
  source_snapshot_at: string;
  has_prediction: boolean;
  latest_risk_band: string | null;
  scoring_status?: string;
}

interface ClaimDetailData {
  claim: { id: string; claim_key: string; created_at: string; updated_at: string };
  latest_revision_number: number;
  selected_revision: {
    id: string;
    revision_number: number;
    source_snapshot_at: string;
    payload_checksum: string;
    payload: Snapshot;
    latest_attempt: { status: string; errorCode?: string | null; errorMessageSafe?: string | null; attemptNumber?: number } | null;
    latest_prediction: { id: string; riskBand: string; reviews?: Array<{ action: ReviewAction }> } | null;
    prediction_history: PredictionHistory[];
    review_history: ReviewHistory[];
  };
  all_revisions: ClaimRevision[];
}

const panel = "rounded-2xl border border-slate-200/80 bg-white";
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:opacity-40";
const compactBadge = "[&>span]:max-w-full [&>span]:whitespace-normal [&>span]:px-2 [&>span]:py-0.5 [&>span]:text-[10px] [&>span]:font-medium [&>span>svg]:h-3 [&>span>svg]:w-3";
const actionLabels: Record<ReviewAction, string> = { confirm: "Temuan dikonfirmasi", dismiss: "Temuan tidak relevan", request_correction: "Koreksi diminta" };
const reviewStates: Record<ReviewAction, string> = { confirm: "finding_confirmed", dismiss: "dismissed", request_correction: "correction_requested" };

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "Belum tersedia";
  const date = new Date(withTime ? value : `${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "Belum tersedia";
  return withTime
    ? date.toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatMoney(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value)
    : "Belum tersedia";
}

function SectionHeading({ title, subtitle, icon: Icon, count }: { title: string; subtitle?: string; icon: LucideIcon; count?: number }) {
  return <div className="mb-4 border-b border-slate-100 pb-4"><div className="flex items-center gap-2"><Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-primary-600" strokeWidth={1.75} /><h2 className="text-[13px] font-semibold leading-5 text-primary-700">{title}</h2>{count !== undefined && <span className="ml-auto rounded-md bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700 tabular-nums">{count}</span>}</div>{subtitle && <p className="mt-1.5 text-[11px] leading-5 text-slate-500">{subtitle}</p>}</div>;
}

function DetailField({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="min-w-0 rounded-lg bg-primary-50/40 px-3 py-2.5"><dt className="text-[11px] leading-4 text-slate-500">{label}</dt><dd className="mt-1 break-words text-xs font-medium leading-5 text-primary-700 [overflow-wrap:anywhere]">{value === null || value === undefined || value === "" ? "Belum tersedia" : value}</dd></div>;
}

function ExtraFields({ title, values, money = false }: { title: string; values?: Record<string, unknown>; money?: boolean }) {
  if (!values || Object.keys(values).length === 0) return null;
  return <details className="group mt-5 border-t border-slate-100 pt-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium text-slate-600 [&::-webkit-details-marker]:hidden">{title}<ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" /></summary><dl className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3">{Object.entries(values).map(([key, value]) => <div key={key} className="flex flex-wrap justify-between gap-2 text-[11px]"><dt className="break-all text-slate-500">{key}</dt><dd className="break-all font-mono text-slate-600">{value === null || value === undefined ? "Belum tersedia" : money && typeof value === "number" ? formatMoney(value) : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details>;
}

export default function ClaimDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const claimId = params.id as string;
  const revisionParam = searchParams.get("revision");
  const [data, setData] = useState<ClaimDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    const query = revisionParam ? `?${new URLSearchParams({ revision: revisionParam })}` : "";
    try {
      const response = await fetch(`/api/claims/${claimId}${query}`, { signal });
      if (!response.ok) throw new Error(response.status === 404 ? "Data klaim tidak ditemukan." : "Detail klaim tidak dapat dimuat. Silakan coba kembali.");
      const result = await response.json();
      if (!signal?.aborted) setData(result);
    } catch (err) {
      if (!signal?.aborted) setError(err instanceof Error ? err.message : "Detail klaim tidak dapat dimuat");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [claimId, revisionParam]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(controller.signal);
    return () => controller.abort();
  }, [loadDetail]);

  if (loading) return <div aria-label="Memuat detail klaim" aria-busy="true" className="animate-pulse space-y-6"><div className="h-4 w-36 rounded bg-slate-200" /><div className="h-36 rounded-xl border border-slate-200/70 bg-white" /><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="space-y-6"><div className="h-60 rounded-xl border border-slate-200/70 bg-white" /><div className="h-64 rounded-xl border border-slate-200/70 bg-white" /></div><div className="h-80 rounded-xl border border-slate-200/70 bg-white" /></div></div>;

  if (error || !data) return <div role="alert" className={`${panel} mx-auto max-w-lg px-6 py-12 text-center`}><span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50"><AlertCircle className="h-5 w-5 text-rose-600" /></span><h1 className="text-base font-semibold text-primary-700">Detail klaim belum tersedia</h1><p className="mt-2 text-xs leading-5 text-slate-500">{error || "Data klaim tidak tersedia."}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Link href="/claims" className={`${button} border border-slate-200 text-slate-600 hover:bg-slate-50`}><ArrowLeft className="h-3.5 w-3.5" />Data Klaim</Link><button onClick={() => void loadDetail()} className={`${button} bg-primary-700 text-white hover:bg-primary-800`}><RefreshCw className="h-3.5 w-3.5" />Coba lagi</button></div></div>;

  const { claim, selected_revision: revision, all_revisions: revisions, latest_revision_number: latestRevisionNumber } = data;
  const episode = revision.payload?.episode || {};
  const diagnoses = revision.payload?.diagnoses || {};
  const casemix = revision.payload?.casemix || {};
  const procedures = revision.payload?.procedures || {};
  const finance = revision.payload?.financial_pre_submit || {};
  const isPastRevision = revision.revision_number < latestRevisionNumber;
  const predictions = revision.prediction_history || [];
  const reviews = [...(revision.review_history || [])].sort((a, b) => b.reviewed_at.localeCompare(a.reviewed_at) || b.id.localeCompare(a.id));
  const prediction = predictions[0];
  const latestAction = revision.latest_prediction?.reviews?.[0]?.action;
  const reviewState = prediction ? latestAction ? reviewStates[latestAction] : "awaiting_review" : "not_available";
  const attemptStatus = revision.latest_attempt?.status || (prediction ? "completed" : "not_scored");
  const hasFailedAttempt = revision.latest_attempt?.status === "failed";
  const sourceLabel = prediction?.source === "mock" ? "Simulasi" : prediction ? "Layanan ML" : "Belum dianalisis";
  let los: number | undefined;
  if (episode.admission_date && episode.discharge_date) {
    const days = (new Date(episode.discharge_date).getTime() - new Date(episode.admission_date).getTime()) / 86_400_000;
    if (Number.isFinite(days) && days >= 0) los = Math.max(1, Math.round(days));
  }

  return (
    <div className="space-y-6 pb-3">
      <Link href="/claims" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[11px] font-medium text-slate-500 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"><ArrowLeft className="h-3.5 w-3.5" />Kembali ke Data Klaim</Link>

      <header className={`${panel} overflow-hidden`}>
        <div className="flex flex-col justify-between gap-5 px-5 py-5 sm:px-6 2xl:flex-row 2xl:items-center">
          <div className="min-w-0"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary-700">Detail klaim</p><h1 className="break-all font-mono text-base font-semibold tracking-tight text-primary-700 sm:text-lg">{claim.claim_key}</h1><div className="mt-3 flex flex-wrap items-center gap-2"><span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">Revisi {revision.revision_number}</span><span className={`rounded-md border px-2 py-0.5 text-[10px] ${isPastRevision ? "border-amber-200 bg-amber-50 text-amber-800" : "border-primary-100 bg-primary-50 text-primary-700"}`}>{isPastRevision ? "Revisi terdahulu" : "Revisi terkini"}</span>{prediction?.source === "mock" && <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-800">Hasil simulasi</span>}</div></div>
        </div>
        <div className="border-t border-slate-100 px-5 py-3 sm:px-6"><ClaimPageTabs claimId={claim.id} active="detail" revision={revision.revision_number} /></div>
        <div className="grid grid-cols-2 border-t border-slate-100 bg-primary-50/50 lg:grid-cols-4">
          <div className="border-r border-slate-100 px-5 py-4 sm:px-6"><p className="text-[10px] text-slate-500">Tingkat layanan</p><p className="mt-2 text-xs font-medium text-primary-700">{episode.service_level || "Belum tersedia"}</p></div>
          <div className="px-5 py-4 sm:px-6 lg:border-r lg:border-slate-100"><p className="text-[10px] text-slate-500">Lama rawat</p><p className="mt-2 text-xs font-medium text-primary-700 tabular-nums">{los !== undefined ? `${los} hari` : "Belum tersedia"}</p></div>
          <div className="border-r border-t border-slate-100 px-5 py-4 sm:px-6 lg:border-t-0"><p className="text-[10px] text-slate-500">Attempt scoring terakhir</p><div className={`mt-2 ${compactBadge}`}><ScoringStatusBadge status={attemptStatus} /></div></div>
          <div className="border-t border-slate-100 px-5 py-4 sm:px-6 lg:border-t-0"><p className="text-[10px] text-slate-500">Review hasil terbaru</p><div className={`mt-2 ${compactBadge}`}><ReviewStateBadge state={reviewState} /></div></div>
        </div>
      </header>

      {isPastRevision && <div role="status" className="flex flex-col justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-center"><div className="flex items-start gap-2"><History className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" /><p className="text-[11px] leading-5 text-amber-900">Anda melihat Revisi {revision.revision_number}. Snapshot terbaru adalah Revisi {latestRevisionNumber}; tombol analisis membuka konteks revisi terkini.</p></div><Link href={`/claims/${claim.id}`} scroll={false} className="inline-flex min-h-8 shrink-0 items-center gap-1 text-[11px] font-medium text-amber-900 hover:underline">Lihat revisi terkini<ChevronRight className="h-3 w-3" /></Link></div>}
      {hasFailedAttempt && <div role="status" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-4 py-3"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-700" /><div><p className="text-[11px] font-medium leading-5 text-rose-800">Attempt scoring terakhir gagal.{prediction ? " Hasil sukses sebelumnya tetap tersedia pada riwayat revisi ini." : " Revisi ini belum memiliki hasil sukses yang dapat direview."}</p>{revision.latest_attempt?.errorMessageSafe && <p className="mt-1 text-[11px] leading-5 text-rose-700">{revision.latest_attempt.errorMessageSafe}</p>}</div></div>}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px] 2xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <section className={`${panel} px-5 py-4`}><SectionHeading title="Informasi episode layanan" subtitle="Periode dan konteks layanan FKRTL." icon={CalendarDays} /><dl className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 2xl:grid-cols-3"><DetailField label="Tanggal masuk" value={formatDate(episode.admission_date)} /><DetailField label="Tanggal pulang" value={formatDate(episode.discharge_date)} /><DetailField label="Tingkat layanan" value={episode.service_level} /><DetailField label="Kelas rawat" value={episode.care_class ? `Kelas ${episode.care_class}` : undefined} /><DetailField label="Regional tarif" value={episode.tariff_regional ? `Regional ${episode.tariff_regional}` : undefined} /><DetailField label="Wilayah provider" value={episode.provider_region} /></dl></section>

          <section className={`${panel} px-5 py-4`}>
            <SectionHeading title="Diagnosis & prosedur medis" subtitle="Kode yang tercatat pada snapshot terpilih." icon={FileCheck2} />
            <div className="grid gap-5 sm:grid-cols-2"><div><p className="mb-2 text-[11px] text-slate-500">Diagnosis utama · ICD-10</p>{diagnoses.primary_icd10 ? <span className="inline-flex rounded-md border border-primary-100 bg-primary-50/60 px-2.5 py-1.5 font-mono text-xs font-medium text-primary-800">{diagnoses.primary_icd10}</span> : <p className="text-xs text-slate-500">Belum tersedia</p>}</div><div><p className="mb-2 text-[11px] text-slate-500">Diagnosis sekunder</p>{diagnoses.secondary_icd10?.length ? <div className="flex flex-wrap gap-1.5">{diagnoses.secondary_icd10.map((code, index) => <span key={`${code}-${index}`} className="rounded-md border border-slate-200/80 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600">{code}</span>)}</div> : <p className="text-xs leading-5 text-slate-500">{diagnoses.secondary_icd10 ? "Tidak ada diagnosis sekunder" : "Belum tersedia"}</p>}</div></div>
            <dl className="mt-5 grid grid-cols-2 gap-5 border-t border-slate-100 pt-5"><DetailField label="Prosedur utama" value={procedures.procedure_type} /><DetailField label="Diagnosis saat masuk" value={diagnoses.admission_icd10} /></dl>
            <ExtraFields title="Kode prosedur khusus" values={procedures.special_codes} />
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <section className={`${panel} min-w-0 px-5 py-5`}><SectionHeading title="Casemix & INA-CBG" subtitle="Pengelompokan pada data sumber." icon={Building2} /><dl className="space-y-5"><DetailField label="Kode INA-CBG" value={casemix.inacbg_code} /><DetailField label="Tingkat keparahan (severity)" value={casemix.severity} /></dl></section>
            <section className={`${panel} min-w-0 px-5 py-5`}><SectionHeading title="Biaya & tarif pra-submit" subtitle="Nominal sebelum proses verifikasi." icon={Wallet} /><dl><div className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-3"><dt className="text-[11px] text-slate-500">Biaya tagih</dt><dd className="mt-2 break-words text-lg font-semibold tracking-tight text-primary-700 tabular-nums">{formatMoney(finance.billed_cost)}</dd></div><div className="mt-4 flex flex-wrap items-baseline justify-between gap-2"><dt className="text-[11px] text-slate-500">Tarif INA-CBG</dt><dd className="text-xs font-medium text-slate-700 tabular-nums">{formatMoney(finance.cbg_tariff)}</dd></div></dl><ExtraFields title="Tarif khusus" values={finance.special_tariffs} money /></section>
          </div>

          <section id="riwayat-scoring" className={`${panel} scroll-mt-28 px-5 py-5`}>
            <SectionHeading title="Riwayat scoring" subtitle={`Hasil scoring yang tersimpan untuk Revisi ${revision.revision_number}.`} icon={Activity} count={predictions.length} />
            {predictions.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center"><Clock3 className="mx-auto mb-2 h-4 w-4 text-slate-500" /><p className="text-[11px] leading-5 text-slate-500">Belum ada hasil scoring sukses untuk revisi ini.</p></div> : <ol className="space-y-0">{predictions.map((item, index) => <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0"><div className="relative flex w-6 shrink-0 justify-center"><span className={`relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${index === 0 ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-500"}`}><Activity className="h-3 w-3" /></span>{index < predictions.length - 1 && <span aria-hidden="true" className="absolute bottom-0 top-7 w-px bg-slate-100" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><time dateTime={item.scored_at} className="text-[11px] font-medium text-slate-700">{formatDate(item.scored_at, true)}</time>{index === 0 && <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] text-primary-700">Terbaru pada revisi ini</span>}</div><div className={`flex items-center gap-2 ${compactBadge}`}><span className="font-mono text-xs font-semibold text-primary-700 tabular-nums">{item.risk_score.toFixed(4)}</span><RiskBadge band={item.risk_band} /></div></div><p className="mt-1.5 break-words text-[10px] leading-5 text-slate-500">{item.model_version} · {item.source === "mock" ? "Simulasi" : "Layanan ML"} · {item.reason_codes.length} alasan</p>{item.rule_version && <p className="text-[10px] leading-4 text-slate-500">Aturan: {item.rule_version}</p>}</div></li>)}</ol>}
          </section>

          <section id="riwayat-review" className={`${panel} scroll-mt-28 px-5 py-5`}>
            <SectionHeading title="Riwayat review" subtitle={`Catatan peninjauan untuk hasil scoring Revisi ${revision.revision_number}.`} icon={ClipboardCheck} count={reviews.length} />
            {reviews.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/40 px-4 py-6 text-center"><ClipboardCheck className="mx-auto mb-2 h-4 w-4 text-slate-500" /><p className="text-[11px] leading-5 text-slate-500">Belum ada review untuk hasil scoring revisi ini.</p></div> : <ol>{reviews.map((review, index) => {
              const sourceIndex = predictions.findIndex((item) => item.id === review.prediction_id);
              const sourcePrediction = predictions[sourceIndex];
              const superseded = reviews.some((item) => item.supersedes_review_id === review.id);
              return <li key={review.id} className="relative flex gap-3 pb-5 last:pb-0"><div className="relative flex w-6 shrink-0 justify-center"><span className={`relative z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${review.action === "request_correction" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}><ClipboardCheck className="h-3 w-3" /></span>{index < reviews.length - 1 && <span aria-hidden="true" className="absolute bottom-0 top-7 w-px bg-slate-100" />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-medium text-slate-700">{actionLabels[review.action]}</p>{superseded && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Telah digantikan</span>}</div><time dateTime={review.reviewed_at} className="text-[10px] text-slate-500">{formatDate(review.reviewed_at, true)}</time></div><p className="mt-1.5 text-[10px] leading-4 text-slate-500">{review.reviewer_name}{sourcePrediction && ` · Hasil scoring ${formatDate(sourcePrediction.scored_at, true)}`}</p>{review.notes && <p className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 text-[11px] leading-5 text-slate-600">{review.notes}</p>}</div></li>;
            })}</ol>}
          </section>
        </div>

        <aside className="min-w-0 space-y-5">
          <section id="riwayat-revisi" className={`${panel} scroll-mt-28 px-5 py-4`}>
            <SectionHeading title="Riwayat revisi" subtitle="Pilih snapshot yang ingin ditinjau." icon={Layers} count={revisions.length} />
            <label className="block"><span className="mb-2 block text-[11px] text-slate-500">Revisi snapshot</span><select value={revision.revision_number} onChange={(event) => router.push(`/claims/${claim.id}?revision=${event.target.value}`, { scroll: false })} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/10">{revisions.map((item) => <option key={item.id} value={item.revision_number}>Revisi {item.revision_number}{item.revision_number === latestRevisionNumber ? " (Terkini)" : ""}</option>)}</select></label>
            <ol className="mt-4 space-y-2">{revisions.map((item) => {
              const selected = item.id === revision.id;
              return <li key={item.id}><Link href={`/claims/${claim.id}?revision=${item.revision_number}`} scroll={false} aria-current={selected ? "true" : undefined} className={`block rounded-lg border px-3 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${selected ? "border-primary-200 bg-primary-50/50" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-[11px] font-medium text-primary-700"><span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full ${selected ? "bg-primary-700 text-white" : "bg-slate-100 text-slate-500"}`}>{selected ? <Check className="h-2.5 w-2.5" /> : <History className="h-2.5 w-2.5" />}</span>Revisi {item.revision_number}</span>{item.revision_number === latestRevisionNumber && <span className="text-[10px] text-primary-700">Terkini</span>}</div><time dateTime={item.source_snapshot_at} className="mt-2 block text-[10px] leading-4 text-slate-500">{formatDate(item.source_snapshot_at, true)}</time><div className={`mt-2 ${compactBadge}`}><ScoringStatusBadge status={item.scoring_status || (item.has_prediction ? "completed" : "not_scored")} /></div></Link></li>;
            })}</ol>
          </section>

          <section className={`${panel} px-5 py-4`}><SectionHeading title="Hasil pada revisi ini" subtitle={`Revisi ${revision.revision_number} · ${sourceLabel}`} icon={Activity} />{prediction ? <><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] text-slate-500">Skor risiko</p><p className="mt-1.5 font-mono text-xl font-semibold text-primary-700 tabular-nums">{prediction.risk_score.toFixed(4)}<span className="ml-1.5 font-sans text-[10px] font-normal text-slate-500">/ 1</span></p></div><div className={compactBadge}><RiskBadge band={prediction.risk_band} /></div></div><dl className="mt-5 space-y-4 border-t border-slate-100 pt-4"><DetailField label="Model" value={prediction.model_version} /><DetailField label="Waktu scoring" value={formatDate(prediction.scored_at, true)} /></dl><p className="mt-4 text-[10px] leading-5 text-slate-500">Indikator prioritas review, bukan probabilitas fraud.</p></> : <p className="text-[11px] leading-5 text-slate-500">Belum ada hasil scoring sukses yang tersedia untuk revisi ini.</p>}</section>

          <section className={`${panel} px-5 py-4`}><SectionHeading title="Asal & integritas data" subtitle="Asal dan waktu pencatatan data." icon={ShieldCheck} /><dl className="space-y-4"><DetailField label="Snapshot dari sistem sumber" value={formatDate(revision.source_snapshot_at, true)} /><DetailField label="Klaim pertama tercatat" value={formatDate(claim.created_at, true)} /><DetailField label="Pembaruan klaim terakhir" value={formatDate(claim.updated_at, true)} /></dl><details className="group mt-5 border-t border-slate-100 pt-4"><summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-medium text-slate-600 [&::-webkit-details-marker]:hidden">Detail integritas<ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" /></summary><p className="mb-2 mt-3 text-[10px] text-slate-500">Checksum snapshot · SHA-256</p><p className="break-all rounded-md border border-slate-200/70 bg-slate-50 p-2.5 font-mono text-[10px] leading-5 text-slate-600">{revision.payload_checksum || "Belum tersedia"}</p></details></section>
        </aside>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-slate-200/70 bg-slate-100/40 px-4 py-3"><FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /><p className="text-[11px] leading-5 text-slate-500">Koreksi dilakukan di sistem sumber dan dikirim kembali sebagai revisi baru. Riwayat snapshot, scoring, dan review tetap tersimpan.</p></div>
    </div>
  );
}
