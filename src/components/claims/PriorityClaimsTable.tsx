"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react";
import { flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from "@tanstack/react-table";
import { REASON_CODE_LABELS, type ReasonCode } from "@/lib/contracts/ml-contract";

export interface PriorityClaim {
  id: string;
  claim_key: string;
  latest_revision: number;
  primary_icd10: string;
  risk_score: number;
  risk_band: string;
  top_reason: ReasonCode | null;
  evidence_count: number;
  review_state: string;
}

const bands: Record<string, { label: string; style: string }> = {
  high: { label: "Tinggi", style: "border-rose-200 bg-rose-50 text-rose-700" },
  medium: { label: "Sedang", style: "border-amber-200 bg-amber-50 text-amber-800" },
  low: { label: "Rendah", style: "border-primary-200 bg-primary-50 text-primary-700" },
};
const reviews: Record<string, string> = {
  awaiting_review: "Menunggu review", finding_confirmed: "Temuan dikonfirmasi",
  dismissed: "Tidak relevan", correction_requested: "Koreksi diminta",
};

export function PriorityClaimsTable({ data }: { data: PriorityClaim[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "risk_score", desc: true }]);
  const columns = useMemo<ColumnDef<PriorityClaim>[]>(() => [
    {
      accessorKey: "claim_key", header: "Klaim", enableSorting: true,
      cell: ({ row }) => <div className="min-w-[210px]">
        <Link href={`/claims/${row.original.id}`} className="rounded font-mono text-[11px] font-medium text-primary-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">{row.original.claim_key}</Link>
        <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-500"><span className="rounded border border-slate-200/80 bg-white px-1.5 py-0.5">Revisi {row.original.latest_revision}</span><span>ICD-10 · {row.original.primary_icd10 || "Belum tersedia"}</span></div>
      </div>,
    },
    {
      id: "reason", header: "Alasan peninjauan",
      cell: ({ row }) => <div className="max-w-[240px] text-[11px] leading-5 text-slate-600">
        {row.original.top_reason ? REASON_CODE_LABELS[row.original.top_reason]?.title || row.original.top_reason : row.original.evidence_count > 0 ? "Lihat bukti pendukung" : "Tanpa reason code"}
        <span className="mt-0.5 block text-[10px] text-slate-500">{row.original.evidence_count} bukti global</span>
      </div>,
    },
    {
      accessorKey: "risk_score", header: "Skor risiko", enableSorting: true,
      cell: ({ row }) => <span className="font-mono text-xs font-semibold text-primary-700 tabular-nums">{row.original.risk_score.toFixed(4)}<span className="ml-1 font-sans text-[10px] font-normal text-slate-500">/ 1</span></span>,
    },
    {
      accessorKey: "risk_band", header: "Prioritas",
      cell: ({ row }) => {
        const band = bands[row.original.risk_band];
        return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-medium ${band?.style || "border-slate-200 text-slate-500"}`}>{band?.label || "Belum tersedia"}</span>;
      },
    },
    {
      accessorKey: "review_state", header: "Status review",
      cell: ({ row }) => <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-1 text-[10px] ${row.original.review_state === "awaiting_review" ? "bg-primary-50 font-medium text-primary-700" : "bg-slate-100 text-slate-600"}`}>{reviews[row.original.review_state] || "Belum tersedia"}</span>,
    },
    {
      id: "actions", header: "Aksi",
      cell: ({ row }) => <Link href={`/claims/${row.original.id}/analysis`} aria-label={`Buka analisis ${row.original.claim_key}`} className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-primary-100 bg-white px-2.5 text-[11px] font-medium text-primary-700 transition-colors hover:border-primary-700 hover:bg-primary-700 hover:text-white active:bg-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">Analisis<ChevronRight aria-hidden="true" className="h-3 w-3" /></Link>,
    },
  ], []);
  const table = useReactTable({
    data, columns, state: { sorting }, onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getRowId: (row) => row.id, defaultColumn: { enableSorting: false }, enableMultiSort: false,
  });

  return <>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-left">
        <caption className="sr-only">Prioritas peninjauan: pengurutan kolom berlaku pada lima klaim teratas yang dimuat, bukan seluruh antrean.</caption>
        <thead className="border-y border-slate-200/70 bg-primary-50/70">
          {table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => {
            const sorted = header.column.getIsSorted();
            const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
            return <th key={header.id} scope="col" aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined} className={`whitespace-nowrap px-4 py-2 text-[10px] font-medium text-slate-500 first:pl-5 ${header.column.id === "actions" ? "sticky right-0 z-10 bg-primary-50 text-right" : ""}`}>
              {header.column.getCanSort() ? <button type="button" onClick={header.column.getToggleSortingHandler()} className="inline-flex min-h-8 items-center gap-2 rounded text-[10px] font-medium text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600" aria-label={`Ubah pengurutan berdasarkan ${header.column.id === "risk_score" ? "skor risiko" : "klaim"}`}>{flexRender(header.column.columnDef.header, header.getContext())}<SortIcon aria-hidden="true" className="h-3 w-3" /></button> : flexRender(header.column.columnDef.header, header.getContext())}
            </th>;
          })}</tr>)}
        </thead>
        <tbody className="divide-y divide-slate-100">
          {table.getRowModel().rows.map((row) => <tr key={row.id} className="group transition-colors hover:bg-primary-50/50">{row.getVisibleCells().map((cell) => <td key={cell.id} className={`px-4 py-3.5 first:pl-5 ${cell.column.id === "actions" ? "sticky right-0 bg-white text-right shadow-[-8px_0_12px_-12px_rgba(47,59,58,0.5)] group-hover:bg-primary-50" : ""}`}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}
          {data.length === 0 && <tr><td colSpan={columns.length} className="px-5 py-12 text-center"><p className="text-xs text-slate-500">Belum ada prediksi sukses pada revisi terkini.</p><Link href="/claims" className="mt-3 inline-flex min-h-8 items-center rounded text-xs font-medium text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">Buka Data Klaim</Link></td></tr>}
        </tbody>
      </table>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 text-[10px] leading-5 text-slate-500"><span>{data.length} klaim ditampilkan · Pengurutan hanya untuk daftar ini.</span><Link href="/risk-queue" className="rounded font-medium text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">Buka antrean lengkap</Link></div>
  </>;
}
