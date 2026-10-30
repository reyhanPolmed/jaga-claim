"use client";

import { useMemo } from "react";
import Link from "next/link";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { REASON_CODE_LABELS, type ReasonCode } from "@/lib/contracts/ml-contract";
import { RiskBadge, ReviewStateBadge } from "@/components/ui/badges";
import { formatReviewTime } from "./review-ui";

export interface ReviewQueueItem {
  claim_id: string;
  claim_key: string;
  revision_number: number;
  prediction_id: string;
  risk_score: number;
  risk_band: string;
  primary_icd10: string;
  top_reason: ReasonCode | null;
  review_state: string;
  last_reviewed_at: string | null;
  last_reviewer: string | null;
  scored_at: string;
}

const badges = "[&>span]:max-w-full [&>span]:whitespace-normal [&>span]:break-words [&>span]:px-1.5 [&>span]:py-0.5 [&>span]:text-[10px] [&>span]:leading-4 [&>span>svg]:h-3 [&>span>svg]:w-3 [&>span>svg]:shrink-0";
const action = "inline-flex min-h-9 items-center justify-center rounded-lg border border-primary-700 bg-primary-700 px-2 text-center text-[10px] font-medium leading-4 text-white transition-colors hover:border-primary-800 hover:bg-primary-800 active:bg-primary-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2";
const widths: Record<string, string> = { claim: "25%", risk: "17%", reason: "21%", review: "23%", actions: "14%" };

export function ReviewQueueTable({ data, loading }: { data: ReviewQueueItem[]; loading: boolean }) {
  const columns = useMemo<ColumnDef<ReviewQueueItem>[]>(() => [
    {
      id: "claim", header: "Klaim & diagnosis",
      cell: ({ row }) => <div className="min-w-0 space-y-2">
        <Link href={`/claims/${row.original.claim_id}`} className="block break-all rounded font-mono text-[11px] font-medium leading-5 text-primary-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">{row.original.claim_key}</Link>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]"><span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-slate-500">Revisi {row.original.revision_number}</span><span className="break-words text-slate-600">ICD-10 · {row.original.primary_icd10 || "Belum tersedia"}</span></div>
      </div>,
    },
    {
      id: "risk", header: "Skor & prioritas",
      cell: ({ row }) => <div className="space-y-2"><p className="break-words font-mono text-[14px] font-semibold text-primary-700 tabular-nums">{row.original.risk_score.toFixed(4)}<span className="ml-1 font-sans text-[10px] font-normal text-slate-500">/ 1</span></p><div className={badges}><RiskBadge band={row.original.risk_band} /></div><div className="text-[10px] leading-4 text-slate-500"><p className="mb-1">Waktu scoring</p><time dateTime={row.original.scored_at}>{formatReviewTime(row.original.scored_at)}</time></div></div>,
    },
    {
      id: "reason", header: "Alasan peninjauan",
      cell: ({ row }) => <div className="space-y-2"><p className="text-[11px] font-medium leading-5 text-slate-700">{row.original.top_reason ? REASON_CODE_LABELS[row.original.top_reason]?.title || row.original.top_reason : "Tanpa reason code"}</p>{row.original.top_reason && <p className="break-all font-mono text-[9px] leading-4 text-slate-500">{row.original.top_reason}</p>}<p className="text-[10px] leading-4 text-slate-500">Bukti lengkap tersedia di halaman review.</p></div>,
    },
    {
      id: "review", header: "Status & reviewer",
      cell: ({ row }) => <div className="space-y-2"><div className={badges}><ReviewStateBadge state={row.original.review_state} /></div><p className="break-words text-[10px] leading-5 text-slate-600 [overflow-wrap:anywhere]">{row.original.last_reviewer || "Belum direview"}</p>{row.original.last_reviewed_at && <time dateTime={row.original.last_reviewed_at} className="block text-[10px] leading-4 text-slate-500">{formatReviewTime(row.original.last_reviewed_at)}</time>}</div>,
    },
    {
      id: "actions", header: "Aksi",
      cell: ({ row }) => <Link href={`/reviews/${row.original.claim_id}`} aria-label={`${row.original.review_state === "awaiting_review" ? "Tinjau klaim" : "Lihat review"} ${row.original.claim_key}`} className={`${action} w-full`}>{row.original.review_state === "awaiting_review" ? "Tinjau klaim" : "Lihat review"}</Link>,
    },
  ], []);
  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.prediction_id, manualPagination: true, manualSorting: true, enableSorting: false });
  if (loading) return <div aria-busy="true" aria-label="Memuat antrean review" className="space-y-3 p-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-xl bg-slate-50" />)}</div>;
  if (!data.length) return null;

  return <>
    <div className="hidden lg:block"><table className="w-full table-fixed border-collapse text-left">
      <caption className="sr-only">Antrean review diurutkan berdasarkan skor risiko tertinggi oleh server. Kolom memuat klaim, diagnosis, prioritas, waktu scoring, alasan, status, reviewer, dan tindakan.</caption>
      <colgroup>{table.getAllLeafColumns().map((column) => <col key={column.id} style={{ width: widths[column.id] }} />)}</colgroup>
      <thead className="bg-primary-50/70">{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} scope="col" className="break-words px-3 py-3 text-[10px] font-medium text-slate-500 first:pl-5 last:pr-5">{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
      <tbody className="divide-y divide-slate-100">{table.getRowModel().rows.map((row) => <tr key={row.id} className="transition-colors hover:bg-primary-50/30">{row.getVisibleCells().map((cell) => <td key={cell.id} className="break-words px-3 py-4 align-top first:pl-5 last:pr-5">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
    </table></div>
    <div className="divide-y divide-slate-100 lg:hidden">{table.getRowModel().rows.map((row) => <article key={row.id} aria-label={`Review klaim ${row.original.claim_key}`} className="space-y-4 p-4">
      <dl className="grid min-w-0 grid-cols-1 gap-4 min-[440px]:grid-cols-2">{row.getVisibleCells().filter((cell) => cell.column.id !== "actions").map((cell) => <div key={cell.id} className={`min-w-0 ${cell.column.id === "claim" ? "min-[440px]:col-span-2" : ""}`}><dt className="mb-2 text-[10px] font-medium text-slate-500">{String(cell.column.columnDef.header)}</dt><dd>{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd></div>)}</dl>
      <div className="border-t border-slate-100 pt-3"><Link href={`/reviews/${row.original.claim_id}`} className={action}>{row.original.review_state === "awaiting_review" ? "Tinjau klaim" : "Lihat review"}</Link></div>
    </article>)}</div>
  </>;
}
