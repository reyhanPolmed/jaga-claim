"use client";

import React, { useEffect, useState } from "react";
import { Info } from "lucide-react";

type Readiness = { provider_mode: "mock" | "http"; provider?: "ready" | "simulation" | "unavailable" };

export function DemoBanner() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);

  useEffect(() => {
    fetch("/api/system/readiness", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((value) => setReadiness(value))
      .catch(() => setReadiness(null));
  }, []);

  if (!readiness) {
    return <div className="border-b border-slate-200/70 bg-slate-100 px-4 py-2 text-[11px] leading-5 text-slate-600 sm:px-6 lg:px-8 xl:px-10" role="status"><div className="mx-auto max-w-[1360px]">Memuat status scoring...</div></div>;
  }
  const isMock = readiness.provider_mode === "mock";
  const unavailable = readiness?.provider_mode === "http" && readiness.provider === "unavailable";
  if (!isMock && !unavailable) return null;
  return (
    <div className={`${isMock ? "bg-amber-50/95 border-amber-200/60 text-amber-900" : "bg-rose-50 border-rose-200 text-rose-900"} border-b px-4 py-2 text-[11px] leading-5 sm:px-6 lg:px-8 xl:px-10`} role="status">
      <div className="mx-auto flex w-full max-w-[1360px] items-start gap-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {isMock ? <span><strong className="font-semibold">MODE SIMULASI</strong><span aria-hidden="true" className="mx-2 opacity-40">/</span>Hasil Mock ML untuk pengujian. Skor menunjukkan prioritas review, bukan probabilitas fraud atau keputusan klaim.</span> : <span><strong className="font-semibold">LAYANAN ML TIDAK TERSEDIA</strong><span aria-hidden="true" className="mx-2 opacity-40">/</span>Scoring HTTP sedang tidak siap. Sistem tidak beralih ke Mock.</span>}
      </div>
    </div>
  );
}
