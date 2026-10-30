"use client";

import { useMemo } from "react";
import Link from "next/link";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { REASON_CODE_LABELS, type ReasonCode } from "@/lib/contracts/ml-contract";
import { RiskBadge, ReviewStateBadge } from "@/components/ui/badges";

export interface RiskQueueItem {
  id: string;
  claim_key: string;
  latest_revision: number;
  risk_score: number;
  risk_band: string;
  top_reason: ReasonCode | null;
  reason_count: number;
  evidence_count: number;
  service_level: string;
  admission_date: string | null;
  review_state: string;
  scored_at: string;
  model_version: string;
  source: string;
  latest_attempt_failed: boolean;
  latest_attempt_error: string | null;
  last_reviewed_at?: string | null;
  last_reviewer?: string | null;
}

const badge = "[&>span]:max-w-full [&>span]:whitespace-normal [&>span]:break-words [&>span]:px-1.5 [&>span]:py-0.5 [&>span]:text-[10px] [&>span]:leading-4 [&>span>svg]:h-3 [&>span>svg]:w-3 [&>span>svg]:shrink-0";
const link = "inline-flex min-h-8 items-center justify-center rounded-md border border-primary-100 px-2 text-[10px] font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600";
const reviewLink = "inline-flex min-h-8 items-center justify-center rounded-md border border-primary-700 bg-primary-700 px-2 text-[10px] font-medium text-white transition-colors hover:border-primary-800 hover:bg-primary-800 active:bg-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2";
const widths: Record<string, string> = { claim: "25%", score: "18%", reason: "25%", review: "19%", actions: "13%" };

function date(value: string | null) {
  if (!value) return "Belum tersedia";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
function time(value?: string | null) {
  return value ? new Date(value).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Belum tersedia";
}

export function RiskQueueTable({ data, loading, page, pageSize }: { data: RiskQueueItem[]; loading: boolean; page: number; pageSize: number }) {
  const columns = useMemo<ColumnDef<RiskQueueItem>[]>(() => [
    {
      id: "claim", header: "Klaim & layanan",
      cell: ({ row }) => <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5"><span className="rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 tabular-nums">#{(page - 1) * pageSize + row.index + 1}</span><span className="text-[10px] text-slate-500">Revisi {row.original.latest_revision}</span></div>
        <Link href={`/claims/${row.original.id}`} className="block break-all rounded font-mono text-[11px] font-medium leading-5 text-primary-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">{row.original.claim_key}</Link>
        <p className="text-[10px] leading-5 text-slate-500"><span className="block font-medium text-primary-600">{row.original.service_level || "Layanan belum tersedia"}</span>Tanggal layanan · {date(row.original.admission_date)}</p>
      </div>,
    },
    {
      id: "score", header: "Skor & prioritas",
      cell: ({ row }) => <div className="space-y-2">
        <p className="break-words font-mono text-[15px] font-semibold text-primary-700 tabular-nums">{row.original.risk_score.toFixed(4)}<span className="ml-1 font-sans text-[10px] font-normal text-slate-500">/ 1</span></p>
        <div className={badge}><RiskBadge band={row.original.risk_band} /></div>
        <div className="space-y-1 text-[10px] leading-4 text-slate-500"><time dateTime={row.original.scored_at} className="block">{time(row.original.scored_at)}</time><p className="break-words [overflow-wrap:anywhere]">Model · {row.original.model_version || "Belum tersedia"}</p><p className={row.original.source === "mock" ? "font-medium text-amber-800" : "text-primary-600"}>Sumber · {row.original.source === "mock" ? "Simulasi" : row.original.source === "http" ? "Layanan ML · HTTP" : row.original.source || "Belum tersedia"}</p></div>
      </div>,
    },
    {
      id: "reason", header: "Alasan & bukti",
      cell: ({ row }) => <div className="space-y-2">
        <p className="text-[11px] font-medium leading-5 text-slate-700">{row.original.top_reason ? REASON_CODE_LABELS[row.original.top_reason]?.title || row.original.top_reason : row.original.evidence_count > 0 ? "Lihat bukti pendukung" : "Tanpa reason code"}</p>
        {row.original.top_reason && <p className="break-all font-mono text-[9px] leading-4 text-slate-500">{row.original.top_reason}</p>}
        <p className="flex flex-wrap gap-x-2 text-[10px] leading-5 text-slate-500"><span>{row.original.reason_count} alasan</span><span>{row.original.evidence_count} bukti global</span></p>
        {row.original.latest_attempt_failed && <div className="rounded-lg border border-rose-100 bg-rose-50 p-2 text-[10px] leading-5 text-rose-700"><p className="font-medium">Scoring terbaru gagal</p><p>Hasil sukses sebelumnya tetap ditampilkan.</p>{row.original.latest_attempt_error && <p className="mt-1 break-words [overflow-wrap:anywhere]">{row.original.latest_attempt_error}</p>}</div>}
      </div>,
    },
    {
      id: "review", header: "Peninjauan",
      cell: ({ row }) => <div className="space-y-2"><div className={badge}><ReviewStateBadge state={row.original.review_state} /></div><p className="break-words text-[10px] leading-5 text-slate-500 [overflow-wrap:anywhere]">{row.original.last_reviewer || "Belum ada reviewer"}</p>{row.original.last_reviewed_at && <time dateTime={row.original.last_reviewed_at} className="block text-[10px] leading-4 text-slate-500">{time(row.original.last_reviewed_at)}</time>}</div>,
    },
    {
      id: "actions", header: "Aksi",
      cell: ({ row }) => <div className="flex flex-col gap-1.5"><Link href={`/claims/${row.original.id}/analysis`} aria-label={`Analisis ${row.original.claim_key}`} className={link}>Analisis</Link><Link href={`/reviews/${row.original.id}`} aria-label={`Review ${row.original.claim_key}`} className={reviewLink}>Review</Link></div>,
    },
  ], [page, pageSize]);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id, manualPagination: true, manualSorting: true, enableSorting: false });

  if (loading) return <div aria-busy="true" aria-label="Memuat antrean risiko" className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-50" />)}</div>;
  if (!data.length) return null;
  return <>
    <div className="hidden lg:block">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Antrean klaim diurutkan menurut skor tertinggi oleh server, dengan seluruh atribut dibungkus dalam kolom.</caption>
        <colgroup>{table.getAllLeafColumns().map((column) => <col key={column.id} style={{ width: widths[column.id] }} />)}</colgroup>
        <thead className="bg-primary-50/70">{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} scope="col" className="break-words px-3 py-3 text-[10px] font-medium text-slate-500 first:pl-5 last:pr-5">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody className="divide-y divide-slate-100">{table.getRowModel().rows.map((row) => <tr key={row.id} className="transition-colors hover:bg-primary-50/30">{row.getVisibleCells().map((cell) => <td key={cell.id} className="break-words px-3 py-4 align-top first:pl-5 last:pr-5">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="divide-y divide-slate-100 lg:hidden">{table.getRowModel().rows.map((row) => <article key={row.id} aria-label={`Klaim ${row.original.claim_key}`} className="space-y-4 p-4">
      <dl className="grid min-w-0 grid-cols-1 gap-4 min-[440px]:grid-cols-2">{row.getVisibleCells().filter((cell) => cell.column.id !== "actions").map((cell) => <div key={cell.id} className={`min-w-0 ${cell.column.id === "claim" ? "min-[440px]:col-span-2" : ""}`}><dt className="mb-2 text-[10px] font-medium text-slate-500">{String(cell.column.columnDef.header)}</dt><dd>{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd></div>)}</dl>
      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3"><Link href={`/claims/${row.original.id}/analysis`} className={link}>Buka analisis</Link><Link href={`/reviews/${row.original.id}`} className={reviewLink}>Review klaim</Link></div>
    </article>)}</div>
  </>;
}
