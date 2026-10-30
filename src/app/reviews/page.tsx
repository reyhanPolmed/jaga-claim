"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, ArrowDownWideNarrow, ArrowRight, ChevronLeft, ChevronRight, FileSearch, Info, RefreshCw, Search, X } from "lucide-react";
import { ReviewQueueTable, type ReviewQueueItem } from "@/components/reviews/ReviewQueueTable";
import { reviewTabs } from "@/components/reviews/review-ui";

const reviewPanel = "rounded-2xl border border-slate-200/80 bg-white";
const reviewButton = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";
const reviewControl = "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/10";

export default function ReviewerWorkspaceQueuePage() {
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [filterState, setFilterState] = useState("awaiting_review");
  const [riskBand, setRiskBand] = useState("");
  const [q, setQ] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("review_state") || params.get("state");
    if (state && reviewTabs.some((tab) => tab.value === state)) setFilterState(state);
    setRiskBand(params.get("risk_band") || "");
    setQ(params.get("q") || "");
    setSearchDraft(params.get("q") || "");
    setInitialized(true);
  }, []);

  const fetchItems = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ state: filterState, page: String(page), page_size: String(pageSize) });
    if (riskBand) params.set("risk_band", riskBand);
    if (q) params.set("q", q);
    try {
      const response = await fetch(`/api/reviews?${params}`, { signal });
      if (!response.ok) throw new Error("Antrean review tidak dapat dimuat. Silakan coba kembali.");
      const result = await response.json();
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setItems(result.data || []);
      setTotal(result.pagination?.total || 0);
    } catch (err) {
      if (!signal?.aborted && currentRequest === requestId.current) setError(err instanceof Error ? err.message : "Antrean review tidak dapat dimuat");
    } finally {
      if (!signal?.aborted && currentRequest === requestId.current) setLoading(false);
    }
  }, [filterState, page, pageSize, riskBand, q]);

  useEffect(() => {
    if (!initialized) return;
    const controller = new AbortController();
    void fetchItems(controller.signal);
    return () => controller.abort();
  }, [fetchItems, initialized]);

  const resetFilters = () => { setQ(""); setSearchDraft(""); setRiskBand(""); setFilterState("awaiting_review"); setPage(1); };
  const hasFilters = Boolean(q || riskBand || filterState !== "awaiting_review");
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const riskLabels: Record<string, string> = { high: "Tinggi", medium: "Sedang", low: "Rendah" };

  return (
    <div className="space-y-6 pb-3">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h1 className="sr-only">Antrean peninjauan klaim</h1><p className="max-w-xl text-xs leading-5 text-slate-500">Tinjau temuan, catat tindakan, dan ikuti histori review setiap klaim.</p></div>
        <div className="flex shrink-0 flex-wrap items-center gap-2"><button onClick={() => void fetchItems()} disabled={loading} className={`${reviewButton} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Segarkan</button><Link href="/risk-queue" className={`${reviewButton} bg-primary-700 text-white shadow-sm hover:bg-primary-800`}><Activity className="h-3.5 w-3.5" />Risk Queue<ArrowRight className="h-3 w-3" /></Link></div>
      </header>

      <section aria-label="Pencarian antrean review" className={`${reviewPanel} px-5 py-5`}>
        <form onSubmit={(event) => { event.preventDefault(); setQ(searchDraft.trim()); setPage(1); }} className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0"><label htmlFor="review-search" className="mb-2 block text-[11px] font-medium text-slate-500">Cari klaim</label><div className="flex gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-500" aria-hidden="true" /><input id="review-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Cari berdasarkan Claim ID..." className={`${reviewControl} bg-slate-50/60 pl-9 pr-9`} />{searchDraft && <button type="button" aria-label="Hapus pencarian" onClick={() => { setSearchDraft(""); setQ(""); setPage(1); }} className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800"><X className="h-3.5 w-3.5" /></button>}</div><button type="submit" className={`${reviewButton} bg-primary-700 text-white hover:bg-primary-800`}>Cari<ArrowRight className="h-3 w-3" /></button></div></div>
          <label className="min-w-0"><span className="mb-2 block text-[11px] font-medium text-slate-500">Prioritas risiko</span><select value={riskBand} onChange={(event) => { setRiskBand(event.target.value); setPage(1); }} className={reviewControl}><option value="">Semua prioritas</option><option value="high">Prioritas tinggi</option><option value="medium">Prioritas sedang</option><option value="low">Prioritas rendah</option></select></label>
        </form>
        {hasFilters && <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><span className="text-[10px] text-slate-500">Filter aktif</span>{q && <button onClick={() => { setQ(""); setSearchDraft(""); setPage(1); }} aria-label="Hapus filter pencarian" className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-600"><span className="truncate">Pencarian: {q}</span><X className="h-3 w-3 shrink-0" /></button>}{riskBand && <button onClick={() => { setRiskBand(""); setPage(1); }} className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-600">Prioritas: {riskLabels[riskBand] || riskBand}<X className="h-3 w-3" /></button>}{filterState !== "awaiting_review" && <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{reviewTabs.find((tab) => tab.value === filterState)?.label}</span>}<button onClick={resetFilters} className="min-h-7 px-1 text-[11px] font-medium text-primary-700 hover:text-primary-900">Reset filter</button></div>}
      </section>

      <section aria-label="Antrean review klaim" className={`${reviewPanel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="flex flex-wrap items-center gap-2.5"><h2 className="text-[14px] font-semibold text-primary-700">Antrean review</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 tabular-nums">{loading ? "Memuat..." : error ? "Belum tersedia" : `${total.toLocaleString("id-ID")} klaim`}</span></div><span className="inline-flex items-center gap-1.5 text-[10px] text-slate-500"><ArrowDownWideNarrow className="h-3 w-3" />Skor tertinggi lebih dahulu</span></div>
        <div role="group" aria-label="Filter status review" className="flex flex-wrap gap-1 border-y border-slate-100 bg-primary-50/40 px-4 py-2">{reviewTabs.map((tab) => <button key={tab.value} aria-pressed={filterState === tab.value} onClick={() => { setFilterState(tab.value); setPage(1); }} className={`relative min-h-9 shrink-0 rounded-lg px-3 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600 ${filterState === tab.value ? "bg-primary-700 text-white" : "text-slate-500 hover:bg-white hover:text-primary-700"}`}>{tab.label}</button>)}</div>

        {error ? <div role="alert" className="px-5 py-14 text-center"><span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50"><AlertCircle className="h-5 w-5 text-rose-600" /></span><p className="text-xs leading-5 text-slate-600">{error}</p><button onClick={() => void fetchItems()} className={`${reviewButton} mt-4 border border-slate-200 text-slate-600 hover:bg-slate-50`}><RefreshCw className="h-3.5 w-3.5" />Coba lagi</button></div> : <ReviewQueueTable data={items} loading={loading} />}

        {!loading && !error && items.length === 0 && <div className="px-5 py-14 text-center"><span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50"><FileSearch className="h-5 w-5 text-slate-500" /></span><h3 className="text-[13px] font-medium text-primary-700">Tidak ada klaim pada antrean ini</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">{hasFilters ? "Coba ubah status, prioritas, atau kata kunci pencarian." : "Klaim dengan hasil scoring sukses yang belum direview akan tampil di sini."}</p>{hasFilters ? <button onClick={resetFilters} className={`${reviewButton} mt-4 border border-slate-200 text-slate-600 hover:bg-slate-50`}>Reset filter</button> : <Link href="/risk-queue" className={`${reviewButton} mt-4 bg-primary-700 text-white hover:bg-primary-800`}>Buka Risk Queue<ArrowRight className="h-3 w-3" /></Link>}</div>}

        <div className="flex flex-col justify-between gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center"><div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500"><label className="inline-flex items-center gap-2"><select aria-label="Jumlah klaim per halaman" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20">{[10, 15, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select><span>per halaman</span></label><span aria-live="polite" className="tabular-nums">{loading ? "Memuat antrean..." : error ? "Data belum tersedia" : `${items.length ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} dari ${total.toLocaleString("id-ID")} klaim`}</span></div><nav aria-label="Pagination antrean review" className="flex items-center gap-1"><button aria-label="Halaman sebelumnya" disabled={page <= 1 || loading || Boolean(error)} onClick={() => setPage((value) => Math.max(1, value - 1))} className={`${reviewButton} min-h-8 px-2 text-slate-500 hover:bg-slate-50`}><ChevronLeft className="h-3.5 w-3.5" /></button>{pages.map((value, index) => <React.Fragment key={value}>{index > 0 && value - pages[index - 1] > 1 && <span className="px-1 text-[11px] text-slate-500">…</span>}<button aria-label={`Halaman ${value}`} aria-current={page === value ? "page" : undefined} disabled={loading || Boolean(error)} onClick={() => setPage(value)} className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:opacity-40 ${page === value ? "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100" : "text-slate-500 hover:bg-slate-50"}`}>{value}</button></React.Fragment>)}<button aria-label="Halaman berikutnya" disabled={page >= totalPages || loading || Boolean(error)} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className={`${reviewButton} min-h-8 px-2 text-slate-500 hover:bg-slate-50`}><ChevronRight className="h-3.5 w-3.5" /></button></nav></div>
      </section>
      <p className="flex items-start gap-2 rounded-xl border border-primary-100 bg-primary-50/40 px-4 py-3 text-[10px] leading-5 text-slate-500"><Info className="mt-1 h-3 w-3 shrink-0" />Antrean memakai prediksi sukses terbaru pada revisi terkini. Histori lengkap tersedia di halaman review masing-masing klaim.</p>
    </div>
  );
}
