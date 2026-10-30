"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { ScoringStatusBadge, ReviewStateBadge, RiskBadge } from "@/components/ui/badges";

export interface ClaimItem {
  id: string;
  claim_key: string;
  latest_revision: number;
  primary_icd10: string;
  admission_date?: string;
  discharge_date?: string;
  service_level?: string;
  scoring_status: string;
  review_state: string;
  risk_score: number | null;
  risk_band: string | null;
}

const badges = "[&>span]:max-w-full [&>span]:whitespace-normal [&>span]:break-words [&>span]:px-1.5 [&>span]:py-0.5 [&>span]:text-[10px] [&>span]:leading-4 [&>span>svg]:h-3 [&>span>svg]:w-3 [&>span>svg]:shrink-0";
const link = "inline-flex min-h-8 items-center justify-center rounded-md border border-primary-100 px-2 text-[10px] font-medium text-primary-700 transition-colors hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600";
const widths: Record<string, string> = { select: "5%", identity: "25%", service: "22%", status: "24%", risk: "14%", actions: "10%" };

function date(value?: string) {
  if (!value) return "Belum tersedia";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function SelectionBox({ checked, mixed = false, disabled, label, onChange }: { checked: boolean; mixed?: boolean; disabled: boolean; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed; }, [mixed]);
  return <label className="inline-flex h-9 w-7 shrink-0 items-center justify-center"><input ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={onChange} aria-label={label} className="h-3.5 w-3.5 cursor-pointer accent-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-default" /></label>;
}

export function ClaimsTable({ data, isAdmin, loading, disabled, selectedIds, onSelectionChange }: {
  data: ClaimItem[]; isAdmin: boolean; loading: boolean; disabled: boolean;
  selectedIds: Set<string>; onSelectionChange: (ids: Set<string>) => void;
}) {
  const rowSelection = useMemo<RowSelectionState>(() => Object.fromEntries([...selectedIds].map((id) => [id, true])), [selectedIds]);
  const columns = useMemo<ColumnDef<ClaimItem>[]>(() => [
    ...(isAdmin ? [{ id: "select", header: "", cell: () => null } satisfies ColumnDef<ClaimItem>] : []),
    {
      id: "identity", header: "Klaim & diagnosis",
      cell: ({ row }) => <div className="min-w-0">
        <Link href={`/claims/${row.original.id}`} className="break-all rounded font-mono text-[11px] font-medium leading-5 text-primary-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">{row.original.claim_key}</Link>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]"><span className={`rounded border px-1.5 py-0.5 ${row.original.latest_revision > 1 ? "border-primary-200 bg-primary-50 font-semibold text-primary-700" : "border-slate-200 bg-white text-slate-500"}`}>Revisi {row.original.latest_revision}</span><span className="break-all text-slate-600">ICD-10 · {row.original.primary_icd10 || "Belum tersedia"}</span></div>
      </div>,
    },
    {
      id: "service", header: "Periode & layanan",
      cell: ({ row }) => <div className="space-y-1.5 text-[10px] leading-4 text-slate-500"><p className="text-[11px] text-slate-700 tabular-nums">{date(row.original.admission_date)}<span className="block text-[10px] text-slate-500">s.d. {date(row.original.discharge_date)}</span></p><p className="break-words font-medium text-primary-600">{row.original.service_level || "Layanan belum tersedia"}</p></div>,
    },
    {
      id: "status", header: "Proses & review",
      cell: ({ row }) => <div className="space-y-2"><div className={badges}><span className="!block !p-0 !text-[9px] !text-slate-500">Scoring</span><ScoringStatusBadge status={row.original.scoring_status} /></div><div className={badges}><span className="!block !p-0 !text-[9px] !text-slate-500">Review</span><ReviewStateBadge state={row.original.review_state} /></div></div>,
    },
    {
      id: "risk", header: "Prioritas",
      cell: ({ row }) => <div className={badges}><RiskBadge band={row.original.risk_band} /><p className="mt-2 break-words font-mono text-[10px] text-slate-500 tabular-nums">{row.original.risk_score === null ? "Belum ada skor" : row.original.risk_score.toFixed(4)}</p></div>,
    },
    {
      id: "actions", header: "Aksi",
      cell: ({ row }) => <div className="flex flex-col items-stretch gap-1.5"><Link href={`/claims/${row.original.id}`} aria-label={`Detail ${row.original.claim_key}`} className={link}>Detail</Link><Link href={`/claims/${row.original.id}/analysis`} aria-label={`Analisis ${row.original.claim_key}`} className={`${link} bg-primary-50`}>Analisis</Link></div>,
    },
  ], [isAdmin]);
  const table = useReactTable({
    data, columns, getCoreRowModel: getCoreRowModel(), getRowId: (row) => row.id,
    manualPagination: true, enableSorting: false, enableRowSelection: isAdmin,
    state: { rowSelection }, onRowSelectionChange: (updater) => {
      const next = typeof updater === "function" ? updater(rowSelection) : updater;
      onSelectionChange(new Set(Object.keys(next).filter((id) => next[id])));
    },
  });
  const selectAll = <SelectionBox label="Pilih semua klaim pada halaman" checked={table.getIsAllPageRowsSelected()} mixed={table.getIsSomePageRowsSelected()} disabled={loading || disabled || !data.length} onChange={() => table.toggleAllPageRowsSelected(!table.getIsAllPageRowsSelected())} />;

  if (loading) return <div aria-busy="true" aria-label="Memuat daftar klaim" className="space-y-4 px-5 py-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-slate-50" />)}</div>;
  return <>
    <div className="hidden lg:block">
      <table className="w-full table-fixed border-collapse text-left">
        <caption className="sr-only">Daftar klaim, revisi, diagnosis, layanan, status scoring dan review, prioritas, serta aksi. Pagination dan filter diproses server.</caption>
        <colgroup>{table.getAllLeafColumns().map((column) => <col key={column.id} style={{ width: widths[column.id] }} />)}</colgroup>
        <thead className="bg-primary-50/70">{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id} scope="col" className="break-words px-3 py-2 text-[10px] font-medium text-slate-500 first:pl-4 last:pr-4">{header.id === "select" ? selectAll : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody className="divide-y divide-slate-100">{table.getRowModel().rows.map((row) => <tr key={row.id} className={`transition-colors ${row.getIsSelected() ? "bg-primary-50/80" : "hover:bg-primary-50/30"}`}>{row.getVisibleCells().map((cell) => <td key={cell.id} className="break-words px-3 py-4 align-top first:pl-4 last:pr-4">{cell.column.id === "select" ? <SelectionBox label={`Pilih klaim ${row.original.claim_key}`} checked={row.getIsSelected()} disabled={disabled} onChange={() => row.toggleSelected()} /> : flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="lg:hidden">
      {isAdmin && <div className="flex items-center gap-2 border-b border-slate-100 bg-primary-50/60 px-4 text-[11px] text-primary-700">{selectAll}<span>Pilih semua pada halaman ini</span></div>}
      <div className="divide-y divide-slate-100">{table.getRowModel().rows.map((row) => <article key={row.id} aria-label={`Klaim ${row.original.claim_key}`} className={`space-y-4 p-4 ${row.getIsSelected() ? "bg-primary-50/70" : ""}`}>
        <div className="flex items-start gap-2">{isAdmin && <SelectionBox label={`Pilih klaim ${row.original.claim_key}`} checked={row.getIsSelected()} disabled={disabled} onChange={() => row.toggleSelected()} />}<div className="min-w-0 flex-1">{flexRender(row.getAllCells().find((cell) => cell.column.id === "identity")!.column.columnDef.cell, row.getAllCells().find((cell) => cell.column.id === "identity")!.getContext())}</div></div>
        <dl className="grid min-w-0 grid-cols-1 gap-4 min-[400px]:grid-cols-2">{row.getVisibleCells().filter((cell) => !["select", "identity", "actions"].includes(cell.column.id)).map((cell) => <div key={cell.id} className="min-w-0"><dt className="mb-2 text-[10px] font-medium text-slate-500">{String(cell.column.columnDef.header)}</dt><dd>{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd></div>)}</dl>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3"><Link href={`/claims/${row.original.id}`} className={link}>Lihat detail</Link><Link href={`/claims/${row.original.id}/analysis`} className={`${link} bg-primary-50`}>Buka analisis</Link></div>
      </article>)}</div>
    </div>
  </>;
}
