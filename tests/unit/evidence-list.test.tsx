import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EvidenceList } from '@/components/claims/EvidenceList';

describe('EvidenceList', () => {
  it('collapses raw technical evidence while keeping readable figures visible', () => {
    const html = renderToStaticMarkup(<EvidenceList items={[{
      feature: 'billed_cost', value: 'Rp24.016.100',
      reference: 'Median peer Rp13.488.400; robust z = 9.3; cohort inacbg_code+care_class (n=30)',
    }]} />);
    expect(html).toContain('Nilai tengah biaya kasus sebanding');
    expect(html).toContain('Detail teknis — bukti asli');
    expect(html).toContain('robust z = 9.3');
    expect(html).not.toMatch(/<details[^>]*\bopen(?:=|\s|>)/);
    const main = html.split('<details')[0];
    expect(main).not.toContain('robust z');
    expect(main).not.toContain('billed_cost');
  });
  it('escapes evidence text instead of treating it as HTML', () => {
    const html = renderToStaticMarkup(<EvidenceList items={[{ feature: 'unknown', value: '<script>alert(1)</script>', reference: 'unfamiliar' }]} />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('unfamiliar');
  });
});
