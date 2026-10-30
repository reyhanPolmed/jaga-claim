/** Display-only translation of saved evidence. Never computes scores or new findings. */
export interface DisplayEvidence { feature: string; value: string; reference: string }

export function evidenceText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Belum tersedia';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value) ?? 'Belum tersedia'; } catch { return 'Tidak dapat ditampilkan'; }
}

export function checklistEvidence(item: string): DisplayEvidence {
  const match = /^([A-Za-z0-9_]+):\s*([\s\S]*?)\s+—\s+([\s\S]*)$/.exec(item);
  return match ? { feature: match[1], value: match[2], reference: match[3] }
    : { feature: '', value: '', reference: item };
}

const labels: Record<string, [string, string, string]> = {
  billed_cost: ['Biaya yang ditagihkan', 'Bandingkan biaya klaim dengan kelompok kasus sebanding.', 'Periksa rincian tagihan dan dokumen pendukung bersama petugas klaim.'],
  los_days: ['Lama perawatan', 'Periksa lama perawatan bersama pembanding kasus serupa.', 'Konfirmasikan tanggal masuk, tanggal pulang, dan dokumen layanan.'],
  anomaly_score: ['Kombinasi karakteristik yang tidak lazim', 'Model menandai kombinasi karakteristik yang tidak lazim dibanding data pelatihan. Ini merupakan petunjuk untuk pemeriksaan lebih lanjut.', 'Tinjau indikator dan dokumen layanan bersama petugas yang berwenang.'],
  dup_exact_ref: ['Episode pembanding dengan atribut identik', 'Sistem menemukan episode lain dengan sejumlah atribut yang identik. Hal ini perlu dikonfirmasi melalui dokumen sumber.', 'Bandingkan kedua episode untuk memastikan apakah pelayanan berbeda atau terdapat pencatatan ganda.'],
  dup_fuzzy_ref: ['Episode pembanding yang sangat mirip', 'Sistem menemukan episode lain yang sangat mirip pada atribut yang diperiksa.', 'Bandingkan kedua episode dan dokumen layanan.'],
  readmit_gap_days: ['Jarak waktu rawat inap ulang', 'Terdapat catatan jarak waktu rawat inap ulang yang perlu ditinjau.', 'Periksa tanggal dan konteks pelayanan pada dokumen sumber.'],
  overlap_prior_inpatient: ['Waktu layanan yang tumpang tindih', 'Sistem menandai waktu layanan yang tumpang tindih dengan rawat inap sebelumnya.', 'Konfirmasikan tanggal layanan kedua episode.'],
  same_cbg_visits_30d: ['Kunjungan sebelumnya untuk kelompok kasus yang sama', 'Periksa pola pengulangan kunjungan dalam tiga puluh hari.', 'Tinjau riwayat layanan dan dokumen pendukungnya.'],
  peer_features: ['Ketersediaan kasus pembanding', 'Kelompok kasus pembanding belum mencukupi untuk pemeriksaan ini. Bukti yang terbatas tidak berarti klaim bebas masalah.', 'Gunakan pemeriksaan dokumen dan bukti lain yang tersedia.'],
};

export function presentEvidence(input: DisplayEvidence) {
  const [title, description, suggestedCheck] = labels[input.feature] ?? [
    input.feature.startsWith('CM') ? 'Data pengodean perlu diperiksa' : input.feature.startsWith('DQ') ? 'Kelengkapan atau konsistensi data perlu diperiksa' : 'Bukti pendukung',
    'Tinjau bukti ini bersama dokumen sumber. Rincian aslinya tersedia pada detail teknis.',
    'Konfirmasikan temuan bersama petugas klaim yang berwenang.',
  ];
  const facts: Array<{ label: string; value: string }> = [];
  if (input.feature === 'billed_cost') {
    // Parse only the documented formatted currency; never infer a percentile or threshold.
    const amount = /^Rp\s*\d[\d.,]*$/.test(input.value.trim()) ? input.value.trim() : null;
    const median = /^Median peer (Rp\s*\d[\d.,]*);/.exec(input.reference)?.[1];
    const count = /\(n=(\d+)\)/.exec(input.reference)?.[1];
    if (amount) facts.push({ label: 'Biaya klaim', value: amount });
    if (median) facts.push({ label: 'Nilai tengah biaya kasus sebanding', value: median });
    if (count) facts.push({ label: 'Jumlah kasus pembanding', value: count });
  } else if (input.feature === 'anomaly_score') {
    const indicators: Record<string, string> = {
      'jumlah prosedur': 'jumlah prosedur', 'biaya tagih (log)': 'biaya tagih',
      'tingkat keparahan': 'tingkat keparahan', 'lama rawat': 'lama perawatan',
      'jumlah dx sekunder': 'jumlah diagnosis tambahan', 'jumlah bab dx sekunder': 'keragaman kelompok diagnosis tambahan',
      'jumlah komponen special': 'jumlah komponen tarif khusus', 'porsi tarif special': 'porsi tarif khusus',
      'kunjungan 30 hari': 'jumlah kunjungan sebelumnya dalam tiga puluh hari',
      'kunjungan CBG sama 30 hari': 'kunjungan sebelumnya pada kelompok kasus sama',
      'jarak dari kunjungan terakhir': 'jarak sejak kunjungan terakhir', 'usia': 'usia',
      'rasio tagih/tarif': 'perbandingan biaya tagih dengan tarif', 'rawat inap': 'jenis rawat inap',
      'deviasi biaya vs peer': 'perbedaan biaya terhadap kasus sebanding',
      'deviasi LOS vs peer': 'perbedaan lama rawat terhadap kasus sebanding',
      'kelangkaan kombinasi dx-CBG': 'kelangkaan kombinasi diagnosis dan kelompok kasus',
      'dx masuk = dx primer': 'kesesuaian diagnosis masuk dengan diagnosis utama',
    };
    const listed = /pendorong utama: (.+)$/.exec(input.reference)?.[1].split(',').map(s => s.trim());
    if (listed?.length && listed.every(s => Boolean(indicators[s]))) {
      facts.push({ label: 'Indikator untuk ditinjau', value: listed.map(s => indicators[s]).join(', ') });
    }
  } else if (['los_days', 'readmit_gap_days', 'same_cbg_visits_30d'].includes(input.feature)) {
    facts.push({ label: 'Nilai yang tercatat', value: input.value });
  }
  return { title, description, suggestedCheck, facts,
    note: input.feature === 'anomaly_score' ? 'Posisi anomali bukan persentase peluang fraud. Indikator yang menyimpang tidak membuktikan penyebab atau kesalahan klaim.' : null };
}
