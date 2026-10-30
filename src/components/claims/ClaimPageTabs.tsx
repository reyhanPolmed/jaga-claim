import Link from "next/link";
import { Activity, ArrowRight } from "lucide-react";

export function ClaimPageTabs({ claimId, active, revision }: { claimId: string; active: "detail" | "analysis"; revision?: number }) {
  const detail = `/claims/${claimId}${revision ? `?revision=${revision}` : ""}`;
  return <nav aria-label="Halaman klaim" className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-white p-1">
    {([{ key: "detail", label: "Detail & snapshot", href: detail }, { key: "analysis", label: "Analisis AI", href: `/claims/${claimId}/analysis` }] as const).map((item) => <Link key={item.key} href={item.href} aria-current={active === item.key ? "page" : undefined} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-4 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 ${active === item.key ? "bg-primary-700 text-white" : "text-slate-500 hover:bg-primary-50 hover:text-primary-700"}`}>{item.key === "analysis" && <Activity aria-hidden="true" className="h-3.5 w-3.5" />}{item.label}{item.key === "analysis" && <ArrowRight aria-hidden="true" className="h-3 w-3" />}</Link>)}
  </nav>;
}
