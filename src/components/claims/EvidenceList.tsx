import React from 'react';
import { evidenceText, presentEvidence, type DisplayEvidence } from '@/lib/evidence-presentation';

export function EvidenceList({ items }: { items: Array<{ feature: unknown; value: unknown; reference: unknown }> }) {
  return <ol className="space-y-3">{items.map((item, index) => {
    const raw: DisplayEvidence = { feature: evidenceText(item.feature), value: evidenceText(item.value), reference: evidenceText(item.reference) };
    const display = presentEvidence(raw);
    return <li key={`${raw.feature}-${index}`} className="overflow-hidden rounded-xl border border-slate-200/80">
      <div className="border-b border-primary-100 bg-primary-50/60 px-4 py-3"><p className="text-[10px] text-slate-500">Bukti {index + 1}</p><h3 className="mt-1 text-xs font-semibold leading-5 text-primary-800">{display.title}</h3></div>
      <div className="space-y-3 p-4"><p className="text-xs leading-6 text-slate-700">{display.description}</p>
        {display.facts.length > 0 && <dl className="grid gap-3 sm:grid-cols-2">{display.facts.map(fact => <div key={fact.label}><dt className="text-[11px] text-slate-500">{fact.label}</dt><dd className="mt-1 break-words text-xs font-medium leading-5 text-slate-800">{fact.value}</dd></div>)}</dl>}
        <p className="text-[11px] leading-5 text-slate-600"><span className="font-medium">Yang perlu diperiksa: </span>{display.suggestedCheck}</p>
        {display.note && <p className="text-[11px] leading-5 text-slate-500">{display.note}</p>}
        <details className="border-t border-slate-100 pt-2"><summary className="cursor-pointer rounded text-[11px] font-medium leading-7 text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600">Detail teknis — bukti asli</summary><dl className="mt-2 space-y-3 pb-2 text-[11px] leading-5 text-slate-600"><div><dt className="font-medium">Fitur</dt><dd className="break-words font-mono">{raw.feature}</dd></div><div><dt className="font-medium">Nilai</dt><dd className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{raw.value}</dd></div><div><dt className="font-medium">Referensi / pembanding</dt><dd className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{raw.reference}</dd></div></dl></details>
      </div>
    </li>;
  })}</ol>;
}
