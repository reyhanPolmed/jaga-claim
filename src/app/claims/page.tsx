"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileSearch, FileText, Loader2, Play, RefreshCw, Search, SlidersHorizontal, Upload, X } from "lucide-react";
import { ClaimsTable, type ClaimItem } from "@/components/claims/ClaimsTable";
import { ImportModal } from "@/components/claims/ImportModal";


interface Filters {
  revision_state: string;
  q: string;
  scoring_status: string;
  review_state: string;
  risk_band: string;
  service_level: string;
  date_from: string;
  date_to: string;
}

const emptyFilters: Filters = { revision_state: "", q: "", scoring_status: "", review_state: "", risk_band: "", service_level: "", date_from: "", date_to: "" };
const scoringTabs = [
  { value: "", label: "Semua klaim" },
  { value: "not_scored", label: "Belum dianalisis" },
  { value: "queued", label: "Dalam antrean" },
  { value: "processing", label: "Diproses" },
  { value: "completed", label: "Selesai" },
  { value: "failed", label: "Gagal" },
];
const riskLabels: Record<string, string> = { high: "Tinggi", medium: "Sedang", low: "Rendah" };
const reviewLabels: Record<string, string> = { awaiting_review: "Menunggu review", finding_confirmed: "Temuan dikonfirmasi", dismissed: "Tidak relevan", correction_requested: "Koreksi diminta", not_available: "Belum tersedia" };
const panel = "rounded-2xl border border-slate-200/80 bg-white";
const control = "h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 transition-colors focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/10 disabled:opacity-50";
const button = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40";

function formatDate(value?: string) {
  if (!value) return "Belum tersedia";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [searchDraft, setSearchDraft] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [scoringTriggering, setScoringTriggering] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const requestId = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAdmin = currentUserRole === "admin";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = { ...emptyFilters };
    for (const key of Object.keys(initial) as Array<keyof Filters>) initial[key] = params.get(key) || "";
    setFilters(initial);
    setSearchDraft(initial.q);
    setAdvancedOpen(Boolean(initial.date_from || initial.date_to || initial.revision_state));
    // Consume the dashboard shortcut once so returning/back does not reopen the dialog.
    if (params.get("import") === "1") {
      setImportModalOpen(true);
      params.delete("import");
      const query = params.toString();
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
      );
    }
    setInitialized(true);
    fetch("/api/auth/me").then((response) => response.json()).then((body) => setCurrentUserRole(body.user?.role || null)).catch(() => setCurrentUserRole(null));
    return () => { if (refreshTimer.current) clearTimeout(refreshTimer.current); };
  }, []);

  const fetchClaims = useCallback(async (signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setLoadError(null);
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    try {
      const response = await fetch(`/api/claims?${params}`, { signal });
      if (!response.ok) throw new Error("Daftar klaim tidak dapat dimuat. Silakan coba kembali.");
      const result = await response.json();
      if (currentRequest !== requestId.current) return;
      setClaims(result.data || []);
      setTotal(result.pagination?.total || 0);
    } catch (error) {
      if (signal?.aborted || currentRequest !== requestId.current) return;
      setLoadError(error instanceof Error ? error.message : "Daftar klaim tidak dapat dimuat");
    } finally {
      if (!signal?.aborted && currentRequest === requestId.current) setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => {
    if (!initialized) return;
    const controller = new AbortController();
    void fetchClaims(controller.signal);
    return () => {
      controller.abort();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [initialized, fetchClaims]);


  const updateFilter = (key: keyof Filters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setSelectedIds(new Set());
    setPage(1);
    if (key === "q") setSearchDraft(value);
  };

  const resetFilters = () => {
    setFilters({ ...emptyFilters });
    setSearchDraft("");
    setSelectedIds(new Set());
    setPage(1);
  };

  const changePage = (value: number) => { setPage(value); setSelectedIds(new Set()); };

  const handleTriggerScoring = async () => {
    if (!selectedIds.size || scoringTriggering) return;
    setScoringTriggering(true);
    setActionMessage(null);
    try {
      const targets = await Promise.all(Array.from(selectedIds).map(async (claimId) => {
        const response = await fetch(`/api/claims/${claimId}/revisions`);
        if (!response.ok) throw new Error("Revisi klaim tidak dapat dimuat. Silakan segarkan daftar.");
        const result = await response.json();
        const latest = result.data?.[0];
        if (!latest) throw new Error("Revisi klaim belum tersedia untuk scoring.");
        return { claim_id: claimId, claim_revision_id: latest.id };
      }));
      const response = await fetch("/api/scoring-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || "Scoring tidak dapat dijalankan.");
      setSelectedIds(new Set());
      setActionMessage({ type: "success", text: `${targets.length} klaim masuk antrean scoring. Segarkan daftar untuk melihat hasil terbaru.` });
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void fetchClaims(), 1500);
    } catch (error) {
      setActionMessage({ type: "error", text: error instanceof Error ? error.message : "Scoring tidak dapat dijalankan." });
    } finally {
      setScoringTriggering(false);
    }
  };

  const activeFilters = (Object.entries(filters) as Array<[keyof Filters, string]>).filter(([, value]) => value).map(([key, value]) => {
    const labels: Record<keyof Filters, string> = {
      revision_state: "Revisi 2 ke atas",
      q: `Pencarian: ${value}`,
      scoring_status: scoringTabs.find((tab) => tab.value === value)?.label || value,
      review_state: `Review: ${reviewLabels[value] || value}`,
      risk_band: `Prioritas: ${riskLabels[value] || value}`,
      service_level: `Layanan: ${value}`,
      date_from: `Dari: ${formatDate(value)}`,
      date_to: `Sampai: ${formatDate(value)}`,
    };
    return { key, label: labels[key] };
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePages = Array.from(new Set([1, page - 1, page, page + 1, totalPages])).filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);

  return (
    <div className="space-y-6 pb-3">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="sr-only">Daftar snapshot klaim FKRTL</h1>
          <p className="text-xs leading-5 text-slate-500">Kelola snapshot klaim, pantau status analisis, dan siapkan peninjauan.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button onClick={() => void fetchClaims()} disabled={loading || scoringTriggering} className={`${button} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Segarkan</button>
          {isAdmin && <button onClick={() => setImportModalOpen(true)} className={`${button} bg-primary-700 text-white shadow-sm hover:bg-primary-800`}><Upload className="h-3.5 w-3.5" />Import JSONL Klaim</button>}
        </div>
      </header>

      <section aria-label="Pencarian dan filter klaim" className={`${panel} px-5 py-5`}>
        <form onSubmit={(event) => { event.preventDefault(); updateFilter("q", searchDraft.trim()); }} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1"><Search aria-hidden="true" className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-500" /><input aria-label="Cari Claim ID atau diagnosis utama" placeholder="Cari Claim ID atau diagnosis utama..." value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} className={`${control} bg-slate-50/60 pl-9 pr-9`} />{searchDraft && <button type="button" onClick={() => updateFilter("q", "")} aria-label="Hapus pencarian" className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-800"><X className="h-3.5 w-3.5" /></button>}</div>
          <div className="flex gap-2"><button type="submit" className={`${button} bg-primary-700 text-white hover:bg-primary-800`}>Cari<ArrowRight className="h-3 w-3" /></button><button type="button" aria-expanded={advancedOpen} aria-controls="advanced-claim-filters" onClick={() => setAdvancedOpen((value) => !value)} className={`${button} flex-1 border ${advancedOpen ? "border-primary-200 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}><SlidersHorizontal className="h-3.5 w-3.5" />Filter lanjutan<ChevronDown className={`h-3 w-3 transition-transform ${advancedOpen ? "rotate-180" : ""}`} /></button></div>
        </form>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Prioritas risiko</span><select aria-label="Filter prioritas risiko" value={filters.risk_band} onChange={(event) => updateFilter("risk_band", event.target.value)} className={control}><option value="">Semua prioritas</option><option value="high">Prioritas tinggi</option><option value="medium">Prioritas sedang</option><option value="low">Prioritas rendah</option></select></label>
          <label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Status review</span><select aria-label="Filter status review" value={filters.review_state} onChange={(event) => updateFilter("review_state", event.target.value)} className={control}><option value="">Semua status review</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Tingkat layanan</span><select aria-label="Filter tingkat layanan" value={filters.service_level} onChange={(event) => updateFilter("service_level", event.target.value)} className={control}><option value="">Semua tingkat layanan</option><option value="RITL">RITL — Rawat inap</option><option value="RJTL">RJTL — Rawat jalan</option></select></label>
        </div>
        {advancedOpen && <div id="advanced-claim-filters" className="mt-5 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2 xl:grid-cols-3"><label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Revisi klaim</span><select aria-label="Filter revisi klaim" value={filters.revision_state} onChange={(event) => updateFilter("revision_state", event.target.value)} className={control}><option value="">Semua revisi</option><option value="revised">Revisi 2 ke atas</option></select></label><label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Tanggal layanan mulai</span><input type="date" aria-label="Tanggal layanan mulai" value={filters.date_from} max={filters.date_to || undefined} onChange={(event) => updateFilter("date_from", event.target.value)} className={control} /></label><label className="min-w-0 space-y-2"><span className="block text-[11px] font-medium text-slate-500">Tanggal layanan sampai</span><input type="date" aria-label="Tanggal layanan sampai" value={filters.date_to} min={filters.date_from || undefined} onChange={(event) => updateFilter("date_to", event.target.value)} className={control} /></label></div>}
        {activeFilters.length > 0 && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><span className="mr-1 text-[10px] text-slate-500">Filter aktif</span>{activeFilters.map(({ key, label }) => <button key={key} type="button" onClick={() => updateFilter(key, "")} aria-label={`Hapus filter ${label}`} className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] text-slate-600 hover:border-primary-200 hover:text-primary-700"><span className="truncate">{label}</span><X className="h-3 w-3 shrink-0" /></button>)}<button onClick={resetFilters} className="min-h-7 px-1 text-[11px] font-medium text-primary-700 hover:text-primary-900">Reset semua</button></div>}
      </section>

      {actionMessage && <div role={actionMessage.type === "error" ? "alert" : "status"} className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-xs leading-5 ${actionMessage.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-primary-200 bg-primary-50 text-primary-800"}`}><span className="inline-flex items-start gap-2">{actionMessage.type === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}{actionMessage.text}</span><button aria-label="Tutup pemberitahuan" onClick={() => setActionMessage(null)} className="rounded p-1"><X className="h-3.5 w-3.5" /></button></div>}

      <section aria-label="Daftar klaim" className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-100 bg-slate-50"><FileText className="h-3.5 w-3.5 text-slate-600" /></span><h2 className="text-[13px] font-semibold text-primary-700">Daftar klaim</h2><span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 tabular-nums">{loading ? "Memuat..." : `${total.toLocaleString("id-ID")} klaim`}</span></div><p className="text-[10px] text-slate-500">{activeFilters.length ? "Hasil sesuai filter aktif" : "Menampilkan revisi terkini"}</p></div>
        <div role="group" aria-label="Filter status scoring" className="flex flex-wrap gap-x-1 border-y border-slate-100 bg-slate-50/40 px-4">
          {scoringTabs.map((tab) => <button key={tab.value} type="button" aria-pressed={filters.scoring_status === tab.value} onClick={() => updateFilter("scoring_status", tab.value)} className={`relative min-h-11 shrink-0 whitespace-nowrap px-3 text-[11px] font-medium transition-colors first:pl-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-600 ${filters.scoring_status === tab.value ? "text-primary-700" : "text-slate-500 hover:text-primary-700"}`}>{tab.label}{filters.scoring_status === tab.value && <span aria-hidden="true" className="absolute inset-x-3 bottom-0 h-0.5 rounded-t-full bg-primary-700" />}</button>)}
        </div>

        {selectedIds.size > 0 && isAdmin && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary-100 bg-primary-50/60 px-5 py-3"><div className="flex items-center gap-3"><span className="text-[11px] font-medium text-primary-900">{selectedIds.size} klaim dipilih</span><button onClick={() => setSelectedIds(new Set())} disabled={scoringTriggering} className="text-[11px] text-primary-700 underline-offset-2 hover:underline disabled:opacity-50">Batalkan pilihan</button></div><button onClick={() => void handleTriggerScoring()} disabled={scoringTriggering || loading} className={`${button} bg-primary-700 text-white hover:bg-primary-800`}>{scoringTriggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{scoringTriggering ? "Menjalankan..." : "Jalankan Scoring"}</button></div>}

        {loadError ? <div role="alert" className="px-5 py-14 text-center"><span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50"><AlertCircle className="h-5 w-5 text-rose-600" /></span><p className="text-xs text-slate-600">{loadError}</p><button onClick={() => void fetchClaims()} className={`${button} mt-4 border border-slate-200 text-slate-600 hover:bg-slate-50`}><RefreshCw className="h-3.5 w-3.5" />Coba lagi</button></div> : <ClaimsTable data={claims} isAdmin={isAdmin} loading={loading} disabled={scoringTriggering} selectedIds={selectedIds} onSelectionChange={setSelectedIds} />}

        {!loading && !loadError && claims.length === 0 && <div className="px-5 py-14 text-center"><span className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-100 bg-slate-50"><FileSearch className="h-5 w-5 text-slate-500" /></span><h3 className="text-[13px] font-medium text-primary-700">{activeFilters.length ? "Klaim tidak ditemukan" : "Belum ada data klaim"}</h3><p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-slate-500">{activeFilters.length ? "Coba gunakan kata kunci lain atau sesuaikan filter pencarian." : "Data klaim yang telah diimpor akan tampil di sini."}</p>{activeFilters.length ? <button onClick={resetFilters} className={`${button} mt-4 border border-slate-200 text-slate-600 hover:bg-slate-50`}>Reset filter</button> : isAdmin && <button onClick={() => setImportModalOpen(true)} className={`${button} mt-4 bg-primary-700 text-white hover:bg-primary-800`}><Upload className="h-3.5 w-3.5" />Import JSONL Klaim</button>}</div>}

        <div className="flex flex-col justify-between gap-4 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center"><div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500"><label className="inline-flex items-center gap-2"><select aria-label="Jumlah klaim per halaman" value={pageSize} disabled={scoringTriggering} onChange={(event) => { setPageSize(Number(event.target.value)); changePage(1); }} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-600 focus:outline-none focus:ring-2 focus:ring-primary-600/20">{[10, 15, 25, 50].map((value) => <option key={value} value={value}>{value}</option>)}</select><span>per halaman</span></label><span className="hidden h-3 w-px bg-slate-200 sm:block" /><span aria-live="polite" className="tabular-nums">{loading ? "Memuat data..." : loadError ? "Data belum tersedia" : `${claims.length ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, total)} dari ${total.toLocaleString("id-ID")} klaim`}</span></div><nav aria-label="Pagination daftar klaim" className="flex items-center gap-1"><button aria-label="Halaman sebelumnya" onClick={() => changePage(Math.max(1, page - 1))} disabled={page <= 1 || loading || scoringTriggering} className={`${button} min-h-8 px-2 text-slate-500 hover:bg-slate-50`}><ChevronLeft className="h-3.5 w-3.5" /></button>{visiblePages.map((value, index) => <React.Fragment key={value}>{index > 0 && value - visiblePages[index - 1] > 1 && <span className="px-1 text-[11px] text-slate-500">…</span>}<button aria-label={`Halaman ${value}`} aria-current={page === value ? "page" : undefined} disabled={loading || scoringTriggering} onClick={() => changePage(value)} className={`flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 disabled:opacity-40 ${page === value ? "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100" : "text-slate-500 hover:bg-slate-50"}`}>{value}</button></React.Fragment>)}<button aria-label="Halaman berikutnya" onClick={() => changePage(Math.min(totalPages, page + 1))} disabled={page >= totalPages || loading || scoringTriggering} className={`${button} min-h-8 px-2 text-slate-500 hover:bg-slate-50`}><ChevronRight className="h-3.5 w-3.5" /></button></nav></div>
      </section>
      <p className="flex items-start gap-2 text-[10px] leading-5 text-slate-500"><FileText className="mt-1 h-3 w-3 shrink-0" />Koreksi klaim dilakukan di sistem sumber dan diimpor kembali sebagai revisi baru.</p>

      {importModalOpen && isAdmin && <ImportModal isOpen onClose={() => setImportModalOpen(false)} onSuccess={() => { setImportModalOpen(false); setPage(1); setSelectedIds(new Set()); setActionMessage({ type: "success", text: "Import selesai. Snapshot klaim yang valid berhasil disimpan." }); if (page === 1) void fetchClaims(); }} />}
    </div>
  );
}
