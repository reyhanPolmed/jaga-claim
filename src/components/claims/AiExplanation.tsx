"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";
import { explanationResponseSchema, type MlExplanation } from "@/lib/contracts/ml-explanation";

import { EvidenceList } from './EvidenceList';
import { checklistEvidence } from '@/lib/evidence-presentation';

const statusLabels: Record<MlExplanation["llm_status"], string> = {
  success: "Ringkasan dihasilkan oleh DeepSeek dari kategori alasan yang tersedia.",
  disabled: "LLM dinonaktifkan oleh layanan ML. Ringkasan menggunakan template.",
  no_reason_codes: "Tidak ada kode alasan khusus. Layanan ML menggunakan template.",
  not_configured: "LLM belum dikonfigurasi pada layanan ML. Ringkasan menggunakan template.",
  fallback: "LLM tidak tersedia atau hasilnya tidak valid. Layanan ML mengembalikan template.",
};

export function AiExplanation({ claimId, predictionId }: { claimId: string; predictionId: string }) {
  const [result, setResult] = useState<MlExplanation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  const generate = async () => {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/claims/${claimId}/explanation`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prediction_id: predictionId }), signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Penjelasan belum dapat dimuat");
      const parsed = explanationResponseSchema.safeParse(body);
      if (!parsed.success || body.prediction_id !== predictionId) throw new Error("Respons penjelasan tidak sesuai hasil yang dibuka");
      if (!controller.signal.aborted) setResult(parsed.data);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Penjelasan belum dapat dimuat");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      activeRequest.current = null;
    }
  };

  return <section aria-label="Penjelasan AI" aria-busy={loading} className="overflow-hidden rounded-2xl border border-primary-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-primary-100 bg-primary-50/60 px-5 py-4">
      <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-[14px] font-semibold text-primary-700">Penjelasan AI</h2><span className="rounded border border-primary-200 px-1.5 py-0.5 text-[9px] font-medium text-primary-600">Pendukung review</span></div><p className="mt-1.5 text-[11px] leading-5 text-slate-500">Pahami kategori alasan dalam bahasa yang lebih sederhana.</p></div>
      {!result && <button type="button" onClick={() => void generate()} disabled={loading} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary-700 px-3 text-xs font-medium text-white hover:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 disabled:opacity-50">{loading ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />}{loading ? "Menyusun penjelasan..." : error ? "Coba Lagi" : "Buat Penjelasan AI"}</button>}
    </div>
    <div className="space-y-4 px-5 py-4">
      {error && <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-700"><AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      {loading && <p role="status" className="text-xs leading-5 text-slate-500">Menghubungi layanan penjelasan. Proses ini dapat memerlukan beberapa detik.</p>}
      {!result && !loading && <p className="text-xs leading-6 text-slate-500">Buat ringkasan dari hasil scoring yang sedang ditampilkan. Skor, prioritas, dan evidence tetap mengikuti prediction sumber.</p>}
      {result && <>
        <div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-primary-50 px-2 py-1 text-[10px] font-medium text-primary-700">{result.source === "deepseek" ? "LLM · DeepSeek" : "Template · layanan ML"}</span>{result.llm_model && <span className="text-[10px] text-slate-500">{result.llm_model}</span>}</div>
        <p className="whitespace-pre-wrap break-words rounded-r-xl border-l-2 border-primary-300 bg-primary-50/50 px-4 py-3 text-xs leading-6 text-primary-700 [overflow-wrap:anywhere]">{result.summary}</p>
        <p className="text-[11px] leading-5 text-slate-500">{statusLabels[result.llm_status]}</p>
        {result.checklist.length > 0 && <div className="space-y-3"><h3 className="text-xs font-medium text-primary-700">Bukti untuk ditinjau</h3><EvidenceList items={result.checklist.map(checklistEvidence)} /></div>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-[10px] leading-5 text-slate-500"><span>{result.disclaimer}</span><span>Prompt: {result.prompt_version}</span></div>
      </>}
    </div>
  </section>;
}
