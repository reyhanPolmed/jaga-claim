"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowDownWideNarrow, ArrowRight, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, FileSearch, Info, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { RiskQueueTable, type RiskQueueItem } from "@/components/claims/RiskQueueTable";
import { REASON_CODE_LABELS, ReasonCode } from "@/lib/contracts/ml-contract";


interface QueueFilters {
  q: string;
  risk_band: string;
  review_state: string;
  reason_code: string;
  service_level: string;
  date_from: string;
  date_to: string;
}

const emptyFilters: QueueFilters = { q: "", risk_band: "", review_state: "", reason_code: "", service_level: "", date_from: "", date_to: "" };
const priorityTabs = [
  { value: "", label: "Semua prioritas", dot: "bg-slate-400" },
  { value: "high", label: "Prioritas tinggi", dot: "bg-rose-500" },
  { value: "medium", label: "Prioritas sedang", dot: "bg-amber-400" },
  { value: "low", label: "Prioritas rendah", dot: "bg-primary-600" },
];
const reviewLabels: Record<string, string> = {
  awaiting_review: "Menunggu review",
  finding_confirmed: "Temuan dikonfirmasi",
  dismissed: "Tidak relevan",
  correction_requested: "Koreksi diminta",
};
const panel = "rounded-2xl border border-slate-200/80 bg-white";
const control = "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/10";
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

function formatDate(value: string | null) {
  if (!value) return "Belum tersedia";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}


export default function RiskQueuePage() {
  const [items, setItems] = useState<RiskQueueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [filters, setFilters] = useState<QueueFilters>(emptyFilters);
  const [searchDraft, setSearchDraft] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = { ...emptyFilters };
    for (const key of Object.keys(initial) as Array<keyof QueueFilters>) initial[key] = params.get(key) || "";
    setFilters(initial);
    setSearchDraft(initial.q);
    setAdvancedOpen(Boolean(initial.date_from || initial.date_to));
    setInitialized(true);
  }, []);

  const fetchQueue = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    try {
      const response = await fetch(`/api/risk-queue?${params}`, { signal });
      if (!response.ok) throw new Error("Antrean risiko tidak dapat dimuat. Silakan coba kembali.");
      const result = await response.json();
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setItems(result.data || []);
      setTotal(result.pagination?.total || 0);
    } catch (err) {
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setError(err instanceof Error ? err.message : "Antrean risiko tidak dapat dimuat");
    } finally {
      if (!signal?.aborted && currentRequest === requestId.current) setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    if (!initialized) return;
    const controller = new AbortController();
    void fetchQueue(controller.signal);
    return () => controller.abort();
  }, [initialized, fetchQueue]);

  const updateFilter = (key: keyof QueueFilters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
    if (key === "q") setSearchDraft(value);
  };

  const resetFilters = () => {
    setFilters({ ...emptyFilters });
    setSearchDraft("");
    setPage(1);
  };

  const activeFilters = (Object.entries(filters) as Array<[keyof QueueFilters, string]>).filter(([, value]) => value).map(([key, value]) => {
    let label = value;
    if (key === "q") label = `Pencarian: ${value}`;
    if (key === "risk_band") label = priorityTabs.find((tab) => tab.value === value)?.label || value;
    if (key === "review_state") label = `Review: ${reviewLabels[value] || value}`;
    if (key === "reason_code") label = `Alasan: ${REASON_CODE_LABELS[value as ReasonCode]?.title || value}`;
    if (key === "service_level") label = `Layanan: ${value}`;
    if (key === "date_from") label = `Dari: ${formatDate(value)}`;
    if (key === "date_to") label = `Sampai: ${formatDate(value)}`;
    return { key, label };
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePages = Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);

  return (
    <div className="space-y-6 pb-3">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="sr-only">Antrean prioritas review klaim</h1>
          <p className="max-w-xl text-xs leading-5 text-slate-500">Temukan klaim yang perlu diperiksa, telaah bukti pendukung, dan lanjutkan review.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button onClick={() => void fetchQueue()} disabled={loading} className={`${button} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Segarkan</button>
          <Link href="/reviews?review_state=awaiting_review" className={`${button} bg-primary-700 text-white shadow-sm hover:bg-primary-800`}><ClipboardCheck className="h-3.5 w-3.5" />Workspace review<ArrowRight className="h-3 w-3" /></Link>
        </div>
      </header>

      <section aria-label="Pencarian dan filter antrean" className={`${panel} px-5 py-5`}>
        <form onSubmit={(event) => { event.preventDefault(); updateFilter("q", searchDraft.trim()); }} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-500" /><input aria-label="Cari Claim ID" placeholder="Cari klaim berdasarkan Claim ID..." value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className={`${control} bg-slate-50/60 pl-9 pr-9`} />{searchDraft && <button type="button" onClick={() => updateFilter("q", "")} aria-label="Hapus pencarian" className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800"><X className="h-3.5 w-3.5" /></button>}</div>
          <div className="flex gap-2"><button type="submit" className={`${button} bg-primary-700 text-white hover:bg-primary-800`}>Cari<ArrowRight className="h-3 w-3" /></button><button type="button" aria-expanded={advancedOpen} aria-controls="advanced-queue-filters" onClick={() => setAdvancedOpen((value) => !value)} className={`${button} flex-1 border ${advancedOpen ? "border-primary-200 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}><SlidersHorizontal className="h-3.5 w-3.5" />Filter lanjutan<ChevronDown className={`h-3 w-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} /></button></div>
        </form>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Status review</span><select aria-label="Filter status review" value={filters.review_state} onChange={(event) => updateFilter("review_state", event.target.value)} className={control}><option value="">Semua status review</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Alasan utama</span><select aria-label="Filter reason code" value={filters.reason_code} onChange={(event) => updateFilter("reason_code", event.target.value)} className={control}><option value="">Semua alasan utama</option>{Object.entries(REASON_CODE_LABELS).map(([code, meta]) => <option key={code} value={code}>{meta.title}</option>)}</select></label>
          <label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Tingkat layanan</span><select aria-label="Filter tingkat layanan" value={filters.service_level} onChange={(event) => updateFilter("service_level", event.target.value)} className={control}><option value="">Semua tingkat layanan</option><option value="RITL">RITL — Rawat inap</option><option value="RJTL">RJTL — Rawat jalan</option></select></label>
        </div>
        {advancedOpen && <div id="advanced-queue-filters" className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2"><label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Tanggal layanan mulai</span><input type="date" aria-label="Tanggal layanan mulai" value={filters.date_from} max={filters.date_to || undefined} onChange={(event) => updateFilter("date_from", event.target.value)} className={control} /></label><label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Tanggal layanan sampai</span><input type="date" aria-label="Tanggal layanan sampai" value={filters.date_to} min={filters.date_from || undefined} onChange={(event) => updateFilter("date_to", event.target.value)} className={control} /></label></div>}
        {activeFilters.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><span className="mr-1 text-[10px] text-slate-500">Filter aktif</span>{activeFilters.map(({ key, label }) => <button key={key} type="button" onClick={() => updateFilter(key, "")} aria-label={`Hapus filter ${label}`} className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-600 hover:border-primary-200 hover:text-primary-700"><span className="truncate">{label}</span><X className="h-3 w-3 shrink-0" /></button>)}<button onClick={resetFilters} aria-label="Reset semua filter antrean" className="min-h-7 px-1 text-[11px] font-medium text-primary-700 hover:text-primary-900">Reset semua</button></div>}
      </section>

      <section aria-label="Antrean prioritas review" className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2.5"><h2 className="text-[13px] font-semibold text-primary-700">Antrean prioritas review</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">{loading ? "Memuat..." : error ? "Belum tersedia" : `${total.toLocaleString("id-ID")} klaim`}</span></div>
          <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><ArrowDownWideNarrow className="h-3 w-3" />Skor tertinggi lebih dahulu</span>
        </div>
        <div role="group" aria-label="Filter prioritas risiko" className="flex flex-wrap gap-1 border-y border-slate-100 bg-primary-50/40 px-4 py-2">
          {priorityTabs.map((tab) => <button key={tab.value} type="button" aria-pressed={filters.risk_band === tab.value} onClick={() => updateFilter("risk_band", tab.value)} className={`relative inline-flex min-h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600 ${filters.risk_band === tab.value ? "bg-primary-700 text-white" : "text-slate-500 hover:bg-white hover:text-primary-700"}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tab.dot}`} />{tab.label}</button>)}
        </div>

        {error ? (
          <div role="alert" className="px-5 py-14 text-center"><span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50"><AlertCircle className="h-5 w-5 text-rose-600" /></span><h3 className="text-[13px] font-medium text-primary-700">Antrean belum dapat ditampilkan</h3><p className="mt-2 text-xs leading-5 text-slate-500">{error}</p><button onClick={() => void fetchQueue()} className={`${button} mt-4 border border-slate-200 text-slate-600 hover:bg-slate-50`}><RefreshCw className="h-3.5 w-3.5" />Coba lagi</button></div>
        ) : (
          <RiskQueueTable data={items} loading={loading} page={page} pageSize={pageSize} />
        )}

        {!loading && !error && items.length === 0 && <div className="px-5 py-14 text-center"><span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50"><FileSearch className="h-5 w-5 text-slate-500" /></span><h3 className="text-[13px] font-medium text-primary-700">{activeFilters.length ? "Tidak ada klaim yang sesuai" : "Antrean review masih kosong"}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">{activeFilters.length ? "Sesuaikan prioritas atau filter untuk melihat klaim lainnya." : "Klaim dengan hasil scoring sukses pada revisi terkini akan tampil di sini."}</p>{activeFilters.length ? <button onClick={resetFilters} className={`${button} mt-4 border border-slate-200 text-slate-600 hover:bg-slate-50`}>Reset filter</button> : <Link href="/claims" className={`${button} mt-4 bg-primary-700 text-white hover:bg-primary-800`}>Buka Data Klaim<ArrowRight className="h-3 w-3" /></Link>}</div>}

        <div className="flex flex-col justify-between gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500"><label className="inline-flex items-center gap-2"><select aria-label="Jumlah klaim per halaman" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20">{[10, 15, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select><span>per halaman</span></label><span className="hidden h-3 w-px bg-slate-200 sm:block" /><span aria-live="polite" className="tabular-nums">{loading ? "Memuat antrean..." : error ? "Data belum tersedia" : `${items.length ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} dari ${total.toLocaleString("id-ID")} klaim`}</span></div>
          <nav aria-label="Pagination antrean risiko" className="flex items-center gap-1"><button aria-label="Halaman sebelumnya" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading || Boolean(error)} className={`${button} min-h-8 px-2 text-slate-500 hover:bg-slate-50`}><ChevronLeft className="h-3.5 w-3.5" /></button>{visiblePages.map((value, index) => <React.Fragment key={value}>{index > 0 && value - visiblePages[index - 1] > 1 && <span className="px-1 text-[11px] text-slate-500">…</span>}<button aria-label={`Halaman ${value}`} aria-current={page === value ? "page" : undefined} disabled={loading || Boolean(error)} onClick={() => setPage(value)} className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:opacity-40 ${page === value ? "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100" : "text-slate-500 hover:bg-slate-50"}`}>{value}</button></React.Fragment>)}<button aria-label="Halaman berikutnya" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading || Boolean(error)} className={`${button} min-h-8 px-2 text-slate-500 hover:bg-slate-50`}><ChevronRight className="h-3.5 w-3.5" /></button></nav>
        </div>
      </section>

      <div className="flex items-start gap-2 rounded-lg border border-primary-100/80 bg-primary-50/40 px-4 py-3"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary-700" /><p className="text-[11px] leading-5 text-slate-600">Skor 0–1 dan prioritas menunjukkan urutan peninjauan, bukan probabilitas fraud atau keputusan penolakan. Setiap klaim tetap memerlukan pemeriksaan bukti oleh reviewer.</p></div>
    </div>
  );
}
