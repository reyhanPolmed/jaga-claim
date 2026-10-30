"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X, CheckCircle2, AlertCircle, FileText, ArrowRight } from "lucide-react";

interface ImportError {
  line: number;
  code: string;
  message: string;
}

interface PreviewData {
  previewToken: string;
  fileChecksum: string;
  totalLines: number;
  importedClaimsCount: number;
  importedRevisionsCount: number;
  duplicateSnapshotsCount: number;
  rejectedCount: number;
  errors: ImportError[];
}

export function ImportModal({
  isOpen,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isOpen || !mounted) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, mounted]);

  useEffect(() => {
    if (!isOpen || !mounted) return;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, mounted]);

  if (!isOpen || !mounted) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setPreview(null);
      setErrorMessage(null);
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/claims/import/preview", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Gagal memproses pratinjau");
      }
      setPreview(data);
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setConfirming(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/claims/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preview_token: preview.previewToken,
          source_name: file?.name || "uploaded.jsonl",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || "Gagal konfirmasi import");
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setConfirming(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-primary-900/50 p-4 backdrop-blur-md">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="import-dialog-title" className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-primary-100 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary-100 bg-primary-50"><Upload className="h-4 w-4 text-primary-700" /></span>
            <div><h2 id="import-dialog-title" className="text-sm font-semibold text-primary-700">Import Curated JSONL Klaim</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Tambahkan snapshot klaim dari file terkurasi.
            </p>
            </div>
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Tutup dialog import" className="rounded-md p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-5 overflow-y-auto px-5 py-5">
          <ol aria-label="Tahapan import" className="flex items-center gap-3 text-[11px]">
            <li aria-current={!preview ? "step" : undefined} className={`inline-flex items-center gap-2 ${!preview ? "font-medium text-primary-700" : "text-slate-500"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${!preview ? "bg-primary-50 ring-1 ring-primary-200" : "bg-slate-100"}`}>1</span>Pilih file</li>
            <li aria-hidden="true" role="presentation" className="h-px flex-1 bg-slate-100" />
            <li aria-current={preview ? "step" : undefined} className={`inline-flex items-center gap-2 ${preview ? "font-medium text-primary-700" : "text-slate-500"}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${preview ? "bg-primary-50 ring-1 ring-primary-200" : "bg-slate-100"}`}>2</span>Pratinjau & simpan</li>
          </ol>
          {errorMessage && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] leading-5 text-rose-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>{errorMessage}</div>
            </div>
          )}

          {!preview ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 px-4 py-8 text-center transition hover:border-primary-300 hover:bg-primary-50/20">
                <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/70 bg-white"><FileText className="h-4 w-4 text-primary-700" /></span>
                <label htmlFor="curated-jsonl-file" className="block text-xs font-medium text-primary-700">Pilih file curated JSONL (.jsonl)</label>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">Satu baris untuk setiap snapshot episode FKRTL.</p>
                <input
                  id="curated-jsonl-file"
                  type="file"
                  accept=".jsonl"
                  onChange={handleFileChange}
                  className="mt-5 w-full max-w-[310px] cursor-pointer rounded-md text-[11px] text-slate-500 file:mr-3 file:rounded-md file:border file:border-slate-200 file:bg-white file:px-3 file:py-2 file:text-[11px] file:font-medium file:text-slate-600 hover:file:border-primary-300 hover:file:text-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-600"
                />
              </div>

              {file && (
                <div className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200/80 bg-white p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-700">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-primary-700" />
                    <span className="truncate font-medium">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <button
                    onClick={handlePreview}
                    disabled={loading}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary-700 px-3 py-2 text-[11px] font-medium text-white transition hover:bg-primary-800 disabled:opacity-50"
                  >
                    {loading ? "Memvalidasi..." : "Validasi & Pratinjau"}
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold">Total Baris</span>
                  <p className="text-xl font-bold text-primary-700 mt-1">{preview.totalLines}</p>
                </div>
                <div className="bg-primary-50 p-3 rounded-lg border border-primary-200 text-center">
                  <span className="text-[10px] text-primary-700 uppercase font-semibold">Klaim Baru</span>
                  <p className="text-xl font-bold text-primary-800 mt-1">{preview.importedClaimsCount}</p>
                </div>
                <div className="bg-primary-50 p-3 rounded-lg border border-primary-200 text-center">
                  <span className="text-[10px] text-primary-700 uppercase font-semibold">Revisi Valid</span>
                  <p className="text-xl font-bold text-primary-800 mt-1">{preview.importedRevisionsCount}</p>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-center">
                  <span className="text-[10px] text-amber-700 uppercase font-semibold">Duplikat Snapshot</span>
                  <p className="text-xl font-bold text-amber-800 mt-1">{preview.duplicateSnapshotsCount}</p>
                </div>
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center">
                  <span className="text-[10px] font-semibold uppercase text-rose-700">Baris Ditolak</span>
                  <p className="mt-1 text-xl font-semibold text-rose-800 tabular-nums">{preview.rejectedCount}</p>
                </div>
              </div>

              {preview.errors.length > 0 && (
                <div className="border border-rose-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-1.5 border-b border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-800">
                    <AlertCircle className="h-3.5 w-3.5 text-rose-600" />
                    Catatan validasi ({preview.errors.length})
                  </div>
                  <div className="max-h-40 divide-y divide-rose-100 overflow-y-auto bg-rose-50/30 p-2 text-[11px] leading-5 text-rose-900">
                    {preview.errors.map((err, idx) => (
                      <div key={idx} className="flex flex-wrap gap-x-2 gap-y-0.5 px-2 py-2">
                        <span className="font-mono font-bold text-rose-700">Baris {err.line}:</span>
                        <span className="font-semibold">[{err.code}]</span>
                        <span className="text-slate-700">{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] leading-5 text-slate-500">
                Hanya snapshot yang lolos validasi akan disimpan. Snapshot duplikat tidak ditambahkan kembali.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-4">
          <button
            onClick={() => { setPreview(null); setFile(null); }}
            className="min-h-9 rounded-lg px-2 py-2 text-[11px] font-medium text-slate-500 hover:text-slate-800"
          >
            Reset File
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Batal
            </button>
            {preview && (
              <button
                onClick={handleConfirm}
                disabled={confirming || preview.importedRevisionsCount === 0}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary-700 px-3 py-2 text-[11px] font-medium text-white transition hover:bg-primary-800 disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {confirming ? "Menyimpan Data..." : "Konfirmasi & Simpan"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
