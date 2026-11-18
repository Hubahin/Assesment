import { CHOICES, ChoiceListKey, INSTRUMENT_FIELDS } from '../data/instrumentSpec';
import {
  DusunCode,
  HouseholdPiiRecord,
  HouseholdRecord,
  RevisionLogRecord,
  SumberDaftar,
  VisitRecord,
} from '../types/census';

function escapeCsvCell(val: unknown): string {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvString(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvCell).join(','));
  }
  // UTF-8 BOM so Excel / Indonesian spreadsheets open cleanly
  return '\uFEFF' + lines.join('\r\n');
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper for multi-select 0/1 columns
const HOUSEHOLD_MULTI_FIELDS: { field: string; choiceKey: ChoiceListKey; source: 'A' | 'C' }[] = [
  { field: 'aset', choiceKey: 'aset', source: 'A' },
  { field: 'pinjaman', choiceKey: 'pinjaman', source: 'A' },
  { field: 'jenis_bansos', choiceKey: 'bansos', source: 'A' },
  { field: 'bencana', choiceKey: 'bencana', source: 'A' },
  { field: 'dampak_bencana', choiceKey: 'dampak', source: 'A' },
  { field: 'lembaga_agama', choiceKey: 'lembaga_agama', source: 'C' },
  { field: 'ormas', choiceKey: 'ormas', source: 'C' },
  { field: 'panggilan_tokoh', choiceKey: 'panggilan', source: 'C' },
];

const MEMBER_MULTI_FIELDS: { field: string; choiceKey: ChoiceListKey }[] = [
  { field: 'nonformal', choiceKey: 'nonformal' },
  { field: 'keterampilan', choiceKey: 'keterampilan' },
  { field: 'penyakit', choiceKey: 'penyakit' },
  { field: 'keanggotaan', choiceKey: 'lembaga' },
];

const HOUSEHOLD_SCALAR_A = [
  'jumlah_art', 'jumlah_kk', 'status_rumah', 'bukti_tanah', 'luas_bangunan', 'luas_per_kapita',
  'dinding', 'atap', 'lantai', 'jendela', 'sumber_air', 'air_minum', 'olah_air',
  'fasilitas_bab', 'lokasi_wc', 'kloset', 'buang_tinja', 'penerangan', 'daya', 'bahan_bakar',
  'tempat_sampah', 'buang_sampah', 'keluar_pangan', 'keluar_nonpangan', 'rawan_pangan',
  'luas_sawah', 'kuasa_sawah', 'luas_kebun', 'kuasa_kebun', 'luas_pekarangan', 'kuasa_pekarangan',
  'luas_kolam', 'kuasa_kolam', 'ternak_sapi', 'ternak_kambing', 'ternak_unggas', 'ternak_ikan_kolam',
  'terima_bansos', 'televisi', 'jumlah_motor', 'jumlah_mobil', 'sinyal', 'internet',
];

const HOUSEHOLD_SCALAR_C = [
  'k_selokan', 'k_kesehatan', 's_pilah', 's_plastik', 's_guna_ulang', 's_ajak', 's_rancang',
  'ormas_ya', 'tokoh_agama', 'hubungan_lembaga', 'lintas_agama', 'contoh_lintas',
  'info_agama', 'media_lokal', 'nama_media', 'tempat_pertemuan', 'topik_pertemuan', 'catatan_enumerator',
];

export function buildRumahTanggaTable(households: HouseholdRecord[]): { headers: string[]; rows: unknown[][] } {
  const baseHeaders = [
    'id_rt', 'dusun', 'rw', 'rt', 'no_bangunan', 'alamat', 'sumber', 'status_daftar', 'catatan_daftar',
    'status_cacah', 'verifikasi_status', 'verifikasi_catatan', 'verifikasi_oleh', 'verifikasi_waktu',
    'enumerator', 'lokasi_lat', 'lokasi_lng', 'lokasi_akurasi', 'lokasi_metode', 'lokasi_waktu',
    'status_kunjungan', 'kunjungan_ke', 'persetujuan', 'persetujuan_waktu', 'submittedAt',
    ...HOUSEHOLD_SCALAR_A,
    ...HOUSEHOLD_SCALAR_C,
  ];

  const multiHeaders: string[] = [];
  for (const mf of HOUSEHOLD_MULTI_FIELDS) {
    for (const opt of CHOICES[mf.choiceKey]) {
      multiHeaders.push(`${mf.field}_${opt.code}`);
    }
  }

  const headers = [...baseHeaders, ...multiHeaders];
  const rows = households.map((h) => {
    const m0 = h.modul0;
    const mA = h.modulA as Record<string, any> | undefined;
    const mC = h.modulC as Record<string, any> | undefined;

    const baseRow: unknown[] = [
      h.id_rt, h.dusun, h.rw, h.rt, h.no_bangunan, h.alamat, h.sumber, h.status_daftar, h.catatan_daftar ?? '',
      h.status_cacah, h.verifikasi_status, h.verifikasi_catatan ?? '', h.verifikasi_oleh ?? '', h.verifikasi_waktu ?? '',
      m0?.enumerator ?? h.enumerator_email ?? '',
      m0?.lokasi?.lat ?? '', m0?.lokasi?.lng ?? '', m0?.lokasi?.akurasi ?? '', m0?.lokasi?.metode ?? '', m0?.lokasi?.waktu ?? '',
      m0?.status_kunjungan ?? '', m0?.kunjungan_ke ?? '', m0?.persetujuan ?? '', m0?.persetujuan_waktu ?? '', h.submittedAt ?? '',
      ...HOUSEHOLD_SCALAR_A.map((f) => mA?.[f] ?? ''),
      ...HOUSEHOLD_SCALAR_C.map((f) => mC?.[f] ?? ''),
    ];

    const multiRow: number[] = [];
    for (const mf of HOUSEHOLD_MULTI_FIELDS) {
      const selected = (mf.source === 'A' ? mA?.[mf.field] : mC?.[mf.field]) as string[] | undefined;
      for (const opt of CHOICES[mf.choiceKey]) {
        multiRow.push(selected?.includes(opt.code) ? 1 : 0);
      }
    }

    return [...baseRow, ...multiRow];
  });

  return { headers, rows };
}

const MEMBER_SCALAR_FIELDS = [
  'hubungan', 'jk', 'tgl_lahir', 'usia', 'kewarganegaraan', 'status_penduduk', 'asal_kab', 'tahun_tinggal',
  'nik_aktif', 'punya_ktp', 'akta_lahir', 'status_kawin', 'buku_nikah', 'tahun_nikah', 'jumlah_anak',
  'partisipasi', 'jenjang_sedang', 'bantuan_pendidikan', 'alasan_tidak_sekolah', 'ijazah',
  'melek_latin', 'agama', 'baca_quran', 'pekerjaan', 'pekerjaan_lain', 'jenis_usaha', 'penghasilan',
  'kerja_ln', 'ln_sebagai', 'ln_negara', 'bpjs',
  'wg_lihat', 'wg_dengar', 'wg_jalan', 'wg_ingat', 'wg_urus_diri', 'wg_komunikasi',
  'kb_aktif', 'kb_metode', 'hamil', 'periksa_hamil',
  'posyandu_3bln', 'imunisasi', 'berat_badan', 'tinggi_badan',
  'hadir_musyawarah', 'punya_hp',
];

export function buildAnggotaTable(households: HouseholdRecord[]): { headers: string[]; rows: unknown[][] } {
  const multiHeaders: string[] = [];
  for (const mf of MEMBER_MULTI_FIELDS) {
    for (const opt of CHOICES[mf.choiceKey]) {
      multiHeaders.push(`${mf.field}_${opt.code}`);
    }
  }
  const headers = ['id_rt', 'no_urut', ...MEMBER_SCALAR_FIELDS, ...multiHeaders];
  const rows: unknown[][] = [];

  for (const h of households) {
    if (!h.modulB || h.modulB.length === 0) continue;
    for (const m of h.modulB) {
      const rec = m as unknown as Record<string, any>;
      const baseRow: unknown[] = [
        h.id_rt,
        m.no_urut,
        ...MEMBER_SCALAR_FIELDS.map((f) => rec[f] ?? ''),
      ];
      const multiRow: number[] = [];
      for (const mf of MEMBER_MULTI_FIELDS) {
        const selected = rec[mf.field] as string[] | undefined;
        for (const opt of CHOICES[mf.choiceKey]) {
          multiRow.push(selected?.includes(opt.code) ? 1 : 0);
        }
      }
      rows.push([...baseRow, ...multiRow]);
    }
  }

  return { headers, rows };
}

export function buildIdentitasTable(piiRecords: HouseholdPiiRecord[]): { headers: string[]; rows: unknown[][] } {
  const headers = ['id_rt', 'no_urut', 'nama', 'nik', 'no_kk'];
  const rows: unknown[][] = [];
  const sorted = [...piiRecords].sort((a, b) => a.id_rt.localeCompare(b.id_rt));
  for (const rec of sorted) {
    for (const m of rec.membersPii) {
      rows.push([rec.id_rt, m.no_urut, m.nama || '', m.nik || '', m.no_kk || '']);
    }
  }
  return { headers, rows };
}

export function buildKunjunganTable(visits: VisitRecord[]): { headers: string[]; rows: unknown[][] } {
  const headers = [
    'visitId', 'id_rt', 'dusun', 'rw', 'rt', 'enumerator_email', 'enumerator_name',
    'waktu', 'status_kunjungan', 'kunjungan_ke', 'persetujuan',
    'lokasi_lat', 'lokasi_lng', 'lokasi_akurasi', 'lokasi_metode', 'alasan_manual', 'catatan',
  ];
  const rows = visits.map((v) => [
    v.visitId, v.id_rt, v.dusun, v.rw, v.rt, v.enumerator_email, v.enumerator_name ?? '',
    v.waktu, v.status_kunjungan, v.kunjungan_ke ?? '', v.persetujuan ?? '',
    v.lokasi.lat, v.lokasi.lng, v.lokasi.akurasi, v.lokasi.metode, v.lokasi.alasan_manual ?? '', v.catatan ?? '',
  ]);
  return { headers, rows };
}

export function buildLogRevisiTable(logs: RevisionLogRecord[]): { headers: string[]; rows: unknown[][] } {
  const headers = [
    'logId', 'id_rt', 'rtKey', 'changedByEmail', 'changedByName', 'changedByRole',
    'fieldPath', 'oldValue', 'newValue', 'reason',
  ];
  const rows = logs.map((l) => [
    l.logId, l.id_rt, l.rtKey, l.changedByEmail, l.changedByName, l.changedByRole,
    l.fieldPath, l.oldValue, l.newValue, l.reason,
  ]);
  return { headers, rows };
}

export function downloadRumahTanggaCsv(households: HouseholdRecord[]) {
  const { headers, rows } = buildRumahTanggaTable(households);
  downloadBlob('rumah_tangga.csv', buildCsvString(headers, rows), 'text/csv;charset=utf-8;');
}

export function downloadAnggotaCsv(households: HouseholdRecord[]) {
  const { headers, rows } = buildAnggotaTable(households);
  downloadBlob('anggota.csv', buildCsvString(headers, rows), 'text/csv;charset=utf-8;');
}

export function downloadIdentitasCsv(piiRecords: HouseholdPiiRecord[]) {
  const { headers, rows } = buildIdentitasTable(piiRecords);
  downloadBlob('identitas.csv', buildCsvString(headers, rows), 'text/csv;charset=utf-8;');
}

export function downloadKunjunganCsv(visits: VisitRecord[]) {
  const { headers, rows } = buildKunjunganTable(visits);
  downloadBlob('kunjungan.csv', buildCsvString(headers, rows), 'text/csv;charset=utf-8;');
}

export function downloadLogRevisiCsv(logs: RevisionLogRecord[]) {
  const { headers, rows } = buildLogRevisiTable(logs);
  downloadBlob('log_revisi.csv', buildCsvString(headers, rows), 'text/csv;charset=utf-8;');
}

export function downloadGeoJson(households: HouseholdRecord[]) {
  const features = households
    .filter((h) => h.modul0?.lokasi && typeof h.modul0.lokasi.lat === 'number' && typeof h.modul0.lokasi.lng === 'number')
    .map((h) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [
          Number(h.modul0!.lokasi!.lng.toFixed(6)),
          Number(h.modul0!.lokasi!.lat.toFixed(6)),
        ],
      },
      properties: {
        id_rt: h.id_rt,
        dusun: h.dusun,
        rw: h.rw,
        rt: h.rt,
        no_bangunan: h.no_bangunan,
        status: h.status_cacah,
        akurasi: h.modul0!.lokasi!.akurasi,
        metode: h.modul0!.lokasi!.metode,
      },
    }));

  const geojson = {
    type: 'FeatureCollection',
    name: 'titik_rumah_tangga_cibiru_wetan_2026',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    features,
  };

  downloadBlob(
    'titik_rumah_tangga.geojson',
    JSON.stringify(geojson, null, 2),
    'application/geo+json;charset=utf-8;'
  );
}

export function downloadKamusDataCsv() {
  const headers = ['modul', 'kode_field', 'label_field', 'tipe', 'kode_opsi', 'label_opsi'];
  const rows: unknown[][] = [];
  for (const f of INSTRUMENT_FIELDS) {
    if (f.choiceKey) {
      const opts = CHOICES[f.choiceKey];
      for (const o of opts) {
        const colName = f.tipe === 'pilih_banyak' ? `${f.kode}_${o.code}` : f.kode;
        rows.push([f.modul, colName, f.label, f.tipe, o.code, o.label]);
      }
    } else {
      rows.push([f.modul, f.kode, f.label, f.tipe, '', '']);
    }
  }
  downloadBlob('kamus_data.csv', buildCsvString(headers, rows), 'text/csv;charset=utf-8;');
}

export function parseCsvMasterList(csvText: string): {
  rows: {
    dusun: DusunCode;
    rw: string;
    rt: string;
    no_bangunan: string;
    nama_kk: string;
    alamat: string;
    sumber: SumberDaftar;
  }[];
  errors: string[];
} {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV kosong atau tidak memiliki baris data.'] };
  }

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if ((ch === ',' || ch === ';') && !inQuotes) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase());
  const idxOf = (col: string) => headers.indexOf(col);
  const reqCols = ['kode_dusun', 'rw', 'rt', 'no_bangunan', 'nama_kk', 'alamat', 'sumber'];
  const missing = reqCols.filter((c) => idxOf(c) === -1);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [`Kolom wajib tidak ditemukan di header CSV: ${missing.join(', ')}`],
    };
  }

  const validSumberMap: Record<string, SumberDaftar> = {
    listing_lapangan: 'listing_lapangan',
    'listing lapangan': 'listing_lapangan',
    daftar_kk_rt: 'daftar_kk_rt',
    'daftar kk rt': 'daftar_kk_rt',
    data_desa: 'data_desa',
    'data kependudukan desa': 'data_desa',
    temuan_lapangan: 'temuan_lapangan',
    'temuan lapangan': 'temuan_lapangan',
  };

  const rows: {
    dusun: DusunCode;
    rw: string;
    rt: string;
    no_bangunan: string;
    nama_kk: string;
    alamat: string;
    sumber: SumberDaftar;
  }[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const vals = parseLine(lines[i]);
    const dusunRaw = (vals[idxOf('kode_dusun')] || '').toUpperCase() as DusunCode;
    const rwRaw = (vals[idxOf('rw')] || '').replace(/\D/g, '').padStart(2, '0');
    const rtRaw = (vals[idxOf('rt')] || '').replace(/\D/g, '').padStart(2, '0');
    const noBangunan = vals[idxOf('no_bangunan')] || '';
    const namaKk = vals[idxOf('nama_kk')] || '';
    const alamat = vals[idxOf('alamat')] || '';
    const sumberRaw = (vals[idxOf('sumber')] || '').toLowerCase();
    const sumber = validSumberMap[sumberRaw];

    if (!['D1', 'D2', 'D3', 'D4', 'D5'].includes(dusunRaw)) {
      errors.push(`Baris ${i + 1}: kode_dusun '${dusunRaw}' harus D1–D5.`);
      continue;
    }
    if (!rwRaw || !rtRaw || !noBangunan || !namaKk) {
      errors.push(`Baris ${i + 1}: rw, rt, no_bangunan, atau nama_kk kosong.`);
      continue;
    }
    if (!sumber) {
      errors.push(`Baris ${i + 1}: sumber '${vals[idxOf('sumber')]}' tidak dikenal.`);
      continue;
    }
    rows.push({
      dusun: dusunRaw,
      rw: rwRaw,
      rt: rtRaw,
      no_bangunan: noBangunan,
      nama_kk: namaKk,
      alamat,
      sumber,
    });
  }

  return { rows, errors };
}
