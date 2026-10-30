import { describe, expect, it } from 'vitest';
import { checklistEvidence, presentEvidence } from '@/lib/evidence-presentation';

describe('stakeholder evidence presentation', () => {
  const cost = { feature: 'billed_cost', value: 'Rp24.016.100', reference: 'Median peer Rp13.488.400; skala robust Rp1.132.113; robust z = 9.3; p95 peer Rp24.412.375; cohort inacbg_code+care_class (n=30); statistik periode train' };
  it('shows documented median and cohort size without treating robust z as percentile', () => {
    const display = presentEvidence(cost);
    expect(display.facts).toEqual([
      { label: 'Biaya klaim', value: 'Rp24.016.100' },
      { label: 'Nilai tengah biaya kasus sebanding', value: 'Rp13.488.400' },
      { label: 'Jumlah kasus pembanding', value: '30' },
    ]);
    expect(JSON.stringify(display)).not.toMatch(/9\.3|95%|24\.412\.375|robust/);
  });
  it('round trips original evidence in explain checklist including colon and em dash', () => {
    expect(checklistEvidence(`${cost.feature}: ${cost.value} — ${cost.reference}`)).toEqual(cost);
    const text = 'unrecognized: body with no separator';
    expect(checklistEvidence(text).reference).toBe(text);
  });
  it('does not invent numeric comparison if upstream format changes', () => {
    const d = presentEvidence({ ...cost, reference: 'format lain', value: 'unknown' });
    expect(d.facts).toEqual([]);
  });
  it('describes anomaly as review indicators, not causal contribution or probability', () => {
    const d = presentEvidence({ feature: 'anomaly_score', value: 'persentil 99.3', reference: 'Isolation Forest; pendorong utama: jumlah prosedur, biaya tagih (log), tingkat keparahan' });
    expect(d.facts[0].value).toBe('jumlah prosedur, biaya tagih, tingkat keparahan');
    expect(d.note).toContain('bukan persentase');
    expect(d.note).toContain('tidak membuktikan penyebab');
  });
  it('keeps unknown fields neutral and does not mutate originals', () => {
    const raw = { feature: 'future_feature', value: 'future value', reference: 'future reference' };
    const before = { ...raw };
    const d = presentEvidence(raw);
    expect(d.title).toBe('Bukti pendukung');
    expect(d.facts).toEqual([]);
    expect(raw).toEqual(before);
  });
});
