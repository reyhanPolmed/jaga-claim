"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";
import { PriorityClaimsTable, type PriorityClaim } from "@/components/claims/PriorityClaimsTable";

interface DashboardData {
  total_claims: number;
  scored_claims: number;
  not_scored_claims: number;
  risk_bands: Record<"high" | "medium" | "low", number>;
  review_states: Record<"awaiting_review" | "finding_confirmed" | "dismissed" | "correction_requested", number>;
  scoring: Record<"queued" | "processing" | "failed", number>;
  awaiting_review: number;
  correction_requested: number;
  updated_at: string;
}


const priorities = {
  high: { label: "Tinggi", dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-200/70", color: "#f43f5e" },
  medium: { label: "Sedang", dot: "bg-amber-400", badge: "bg-amber-50 text-amber-800 ring-amber-200/70", color: "#fbbf24" },
  low: { label: "Rendah", dot: "bg-primary-600", badge: "bg-primary-50 text-primary-700 ring-primary-200/70", color: "#435450" },
};
const reviewLabels: Record<string, string> = {
  awaiting_review: "Menunggu review",
  finding_confirmed: "Temuan dikonfirmasi",
  dismissed: "Tidak relevan",
  correction_requested: "Koreksi diminta",
};
const panel = "rounded-2xl border border-slate-200/80 bg-white";
const action = "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2";

function formatTime(value: string) {
  return new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [topQueue, setTopQueue] = useState<PriorityClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, queueResponse, authResponse] = await Promise.all([
        fetch("/api/dashboard/summary"), fetch("/api/risk-queue?page=1&page_size=5"), fetch("/api/auth/me"),
      ]);
      if (!summaryResponse.ok || !queueResponse.ok) throw new Error("Ringkasan operasional tidak dapat dimuat");
      const [summary, queue, auth] = await Promise.all([
        summaryResponse.json(), queueResponse.json(), authResponse.ok ? authResponse.json() : Promise.resolve({}),
      ]);
      setData(summary);
      setTopQueue(queue.data || []);
      setRole(auth.user?.role || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan sistem");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  if (loading) {
    return (
      <div aria-label="Memuat dashboard" aria-busy="true" className="animate-pulse space-y-7">
        <div className="space-y-3"><div className="h-6 w-52 rounded-md bg-slate-200" /><div className="h-3 w-72 max-w-full rounded bg-slate-200/70" /></div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-[112px] rounded-xl border border-slate-200/70 bg-white" />)}</div>
        <div className="h-96 rounded-2xl border border-slate-200/70 bg-white" />
        <div className="grid gap-6 md:grid-cols-2"><div className="h-72 rounded-2xl border border-slate-200/70 bg-white" /><div className="h-72 rounded-2xl border border-slate-200/70 bg-white" /></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div role="alert" className={`${panel} mx-auto max-w-lg px-6 py-12 text-center`}>
        <h1 className="text-base font-semibold text-primary-700">Gagal Memuat Dashboard</h1>
        <p className="mt-2 text-xs leading-5 text-slate-500">{error}</p>
        <button onClick={() => void loadDashboard()} className={`${action} mt-5 bg-primary-700 text-white hover:bg-primary-800`}>Coba Lagi</button>
      </div>
    );
  }

  const scoredBase = Math.max(1, data.scored_claims);
  const cards = [
    { label: "Menunggu review", value: data.awaiting_review, help: "Hasil analisis siap ditinjau", href: "/reviews?review_state=awaiting_review", featured: true },
    { label: "Total klaim", value: data.total_claims, help: "Seluruh klaim pada revisi terkini", href: "/claims" },
    { label: "Belum dianalisis", value: data.not_scored_claims, help: "Belum memiliki hasil scoring sukses", href: "/claims?scoring_status=not_scored" },
    { label: "Dalam antrean", value: data.scoring.queued, help: `${data.scoring.processing.toLocaleString("id-ID")} klaim lainnya sedang diproses`, href: "/claims?scoring_status=queued" },
    { label: "Scoring gagal", value: data.scoring.failed, help: "Buka daftar untuk ditinjau admin", href: "/claims?scoring_status=failed" },
    { label: "Koreksi diminta", value: data.correction_requested, help: "Tindak lanjut dilakukan di sistem sumber", href: "/reviews?review_state=correction_requested" },
  ];

  return (
    <div className="space-y-7 pb-3">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="sr-only">Ringkasan klaim</h1>
          <p className="max-w-xl text-xs leading-5 text-slate-500">Pantau klaim, prioritaskan peninjauan, dan ikuti tindak lanjut dalam satu tampilan.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button onClick={() => void loadDashboard()} className={`${action} border border-slate-200 bg-white text-slate-600 hover:bg-slate-50`}><RefreshCw className="h-3.5 w-3.5" />Segarkan</button>
          <Link href="/reviews?review_state=awaiting_review" className={`${action} bg-primary-700 text-white hover:bg-primary-800`}>Mulai review<ArrowRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
          {role === "admin" && <Link href="/claims?import=1" className={`${action} border border-slate-200 bg-white text-primary-700 hover:bg-primary-50`}>Import data</Link>}
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Ringkasan operasional">
        {cards.map(({ label, value, help, href, featured }) => (
          <Link key={label} href={href} className={`group min-w-0 rounded-xl border px-4 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 ${featured ? "border-primary-700 bg-primary-700 hover:bg-primary-800" : "border-slate-200/80 bg-white hover:border-primary-300 hover:bg-primary-50/30"}`}>
            <p className={`text-[11px] font-medium ${featured ? "text-primary-100" : "text-slate-500"}`}>{label}</p>
            <p className={`mt-2.5 text-[24px] font-semibold leading-none tracking-tight tabular-nums ${featured ? "text-white" : "text-primary-700"}`}>{value.toLocaleString("id-ID")}</p>
            <p className={`mt-2 text-[10px] leading-4 ${featured ? "text-primary-200" : "text-slate-500"}`}>{help}</p>
          </Link>
        ))}
      </section>

      <div className="min-w-0 space-y-6">
          <section className={`${panel} overflow-hidden`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-5">
              <div>
                <h2 className="text-[14px] font-semibold text-primary-700">Prioritas peninjauan</h2><p className="mt-1.5 text-[11px] leading-5 text-slate-500">Lima klaim dengan skor tertinggi pada revisi terkini, termasuk yang sudah direview.</p>
              </div>
              <Link href="/risk-queue" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[11px] font-medium text-primary-700 hover:text-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">Lihat semua<ArrowRight className="h-3 w-3" /></Link>
            </div>
            <PriorityClaimsTable data={topQueue} />
            <div className="border-t border-slate-100 bg-primary-50/40 px-5 py-3"><p className="text-[10px] leading-5 text-slate-500">Skor 0–1 menunjukkan prioritas review, bukan probabilitas fraud atau keputusan klaim.</p></div>
          </section>

        <div className="grid min-w-0 gap-6 md:grid-cols-2">
          <section className={`${panel} px-5 py-4`}>
            <h2 className="text-[14px] font-semibold text-primary-700">Distribusi prioritas</h2>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-500">Hanya hasil sukses pada revisi terkini.</p>
            <p className="mt-4 text-[24px] font-semibold leading-none tracking-tight text-primary-700 tabular-nums">{data.scored_claims.toLocaleString("id-ID")}<span className="ml-2 text-[11px] font-normal tracking-normal text-slate-500">klaim dianalisis</span></p>
            <div aria-hidden="true" className="mb-5 mt-5 flex h-2 gap-0.5 overflow-hidden rounded-full bg-slate-100">
              {(["high", "medium", "low"] as const).map((band) => <span key={band} style={{ width: `${data.risk_bands[band] / scoredBase * 100}%`, backgroundColor: priorities[band].color }} />)}
            </div>
            <div className="space-y-1">
              {(["high", "medium", "low"] as const).map((band) => <Link key={band} href={`/risk-queue?risk_band=${band}`} className="flex min-h-10 items-center justify-between gap-3 rounded-lg px-2 text-[11px] transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"><span className="flex items-center gap-2 text-slate-600"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${priorities[band].dot}`} />{priorities[band].label}</span><span className="flex items-center gap-4 tabular-nums"><span className="text-[10px] text-slate-500">{(data.risk_bands[band] / scoredBase * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%</span><span className="min-w-8 text-right font-semibold text-primary-700">{data.risk_bands[band].toLocaleString("id-ID")}</span></span></Link>)}
            </div>
            <div className="flex justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] text-slate-500"><span>{data.scored_claims.toLocaleString("id-ID")} klaim dianalisis</span><span className="tabular-nums">dari {data.total_claims.toLocaleString("id-ID")} klaim</span></div>
          </section>

          <section className={`${panel} px-5 py-4`}>
            <h2 className="text-[13px] font-semibold text-primary-700">Status review</h2>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">Tindak lanjut pada prediksi terbaru.</p>
            <div className="mt-5 space-y-4">
              {Object.entries(data.review_states).map(([state, count]) => {
                const progress = Math.min(100, count / scoredBase * 100);
                const color = state === "awaiting_review" ? "bg-primary-700" : state === "correction_requested" ? "bg-amber-400" : state === "finding_confirmed" ? "bg-primary-300" : "bg-slate-300";
                return <Link key={state} href={`/reviews?review_state=${state}`} className="group block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"><div className="mb-2 flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-600 transition-colors group-hover:text-primary-700">{reviewLabels[state]}</span><span className="font-semibold text-primary-700 tabular-nums">{count.toLocaleString("id-ID")}</span></div><div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${progress}%` }} /></div></Link>;
              })}
            </div>
          </section>


        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-4 text-[10px] leading-4 text-slate-500"><span>JAGA-CLAIM · Workspace peninjauan klaim FKRTL</span><span className="inline-flex items-center gap-1.5"><RefreshCw className="h-2.5 w-2.5" />Diperbarui {formatTime(data.updated_at)}</span></footer>
    </div>
  );
}
