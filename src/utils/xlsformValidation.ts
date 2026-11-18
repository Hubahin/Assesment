import {
  CensusDraft,
  MemberPiiItem,
  Modul0Data,
  ModulAData,
  ModulBItem,
  ModulCData,
  ValidationIssue,
} from '../types/census';

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function calculateAge(tglLahir?: string): number | undefined {
  if (!tglLahir || !/^\d{4}-\d{2}-\d{2}$/.test(tglLahir)) return undefined;
  const dob = new Date(`${tglLahir}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return undefined;
  const now = new Date();
  const diffDays = (now.getTime() - dob.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return -1;
  return Math.floor(diffDays / 365.25);
}

export function calculateLuasPerKapita(luasBangunan?: number, jumlahArt?: number): number | undefined {
  if (typeof luasBangunan !== 'number' || typeof jumlahArt !== 'number' || jumlahArt <= 0 || luasBangunan <= 0) {
    return undefined;
  }
  return Math.round((luasBangunan / jumlahArt) * 10) / 10;
}

export function maskDigits(val: string | undefined, showFull: boolean): string {
  if (!val) return '-';
  if (showFull) return val;
  if (val.length <= 4) return val;
  return `${'*'.repeat(val.length - 4)}${val.slice(-4)}`;
}

export function getOptionLabel(choices: readonly { code: string; label: string }[], code?: string): string {
  if (!code) return '-';
  return choices.find((c) => c.code === code)?.label ?? code;
}

export function hasExclusiveConflict(arr?: string[], exclusiveCodes: string[] = ['tidak_ada']): boolean {
  if (!arr || arr.length <= 1) return false;
  return exclusiveCodes.some((ex) => arr.includes(ex));
}

export function isModulBFieldRelevant(
  field: keyof ModulBItem | 'nik' | 'no_kk',
  m: ModulBItem,
  nikVal?: string
): boolean {
  const usia = calculateAge(m.tgl_lahir);
  const hasUsia = typeof usia === 'number' && usia >= 0;

  switch (field) {
    case 'asal_kab':
    case 'tahun_tinggal':
      return Boolean(m.status_penduduk && m.status_penduduk !== 'asli');
    case 'nik_aktif':
      return Boolean(nikVal && /^\d{16}$/.test(nikVal));
    case 'no_kk':
      return m.hubungan === 'kk';
    case 'punya_ktp':
      return hasUsia && usia >= 17;
    case 'status_kawin':
      return hasUsia && usia >= 10;
    case 'buku_nikah':
      return hasUsia && usia >= 10 && m.status_kawin === 'kawin';
    case 'tahun_nikah':
      return hasUsia && usia >= 10 && m.status_kawin === 'kawin' && m.buku_nikah === 'ya';
    case 'jumlah_anak':
      return m.hubungan === 'kk' || m.hubungan === 'pasangan';
    // Pendidikan & keagamaan (>= 5)
    case 'partisipasi':
    case 'ijazah':
    case 'nonformal':
    case 'agama':
      return hasUsia && usia >= 5;
    case 'jenjang_sedang':
    case 'bantuan_pendidikan':
      return hasUsia && usia >= 5 && m.partisipasi === 'masih';
    case 'alasan_tidak_sekolah':
      return hasUsia && usia >= 7 && usia <= 18 && m.partisipasi === 'tidak_lagi';
    case 'melek_latin':
      return hasUsia && usia >= 7;
    case 'baca_quran':
      return hasUsia && usia >= 5 && m.agama === 'islam';
    // Pekerjaan & penghasilan (>= 15)
    case 'pekerjaan':
    case 'keterampilan':
    case 'kerja_ln':
      return hasUsia && usia >= 15;
    case 'pekerjaan_lain':
      return hasUsia && usia >= 15 && m.pekerjaan === 'lainnya';
    case 'jenis_usaha':
      return hasUsia && usia >= 15 && m.pekerjaan === 'pedagang';
    case 'penghasilan':
      return (
        hasUsia &&
        usia >= 15 &&
        Boolean(m.pekerjaan) &&
        m.pekerjaan !== 'tidak_bekerja' &&
        m.pekerjaan !== 'pelajar' &&
        m.pekerjaan !== 'mengurus_rt'
      );
    case 'ln_sebagai':
    case 'ln_negara':
      return hasUsia && usia >= 15 && m.kerja_ln === 'ya';
    // Washington Group (>= 5)
    case 'wg_lihat':
    case 'wg_dengar':
    case 'wg_jalan':
    case 'wg_ingat':
    case 'wg_urus_diri':
    case 'wg_komunikasi':
      return hasUsia && usia >= 5;
    // KB & kesehatan ibu
    case 'kb_aktif':
    case 'hamil':
      return m.jk === 'p' && hasUsia && usia >= 15 && usia <= 49 && m.status_kawin === 'kawin';
    case 'kb_metode':
      return (
        m.jk === 'p' &&
        hasUsia &&
        usia >= 15 &&
        usia <= 49 &&
        m.status_kawin === 'kawin' &&
        m.kb_aktif === 'ya'
      );
    case 'periksa_hamil':
      return (
        m.jk === 'p' &&
        hasUsia &&
        usia >= 15 &&
        usia <= 49 &&
        m.status_kawin === 'kawin' &&
        m.hamil === 'ya'
      );
    // Balita (< 5)
    case 'posyandu_3bln':
    case 'imunisasi':
    case 'berat_badan':
    case 'tinggi_badan':
      return hasUsia && usia < 5;
    // Kelembagaan (>= 15)
    case 'keanggotaan':
    case 'hadir_musyawarah':
    case 'punya_hp':
      return hasUsia && usia >= 15;
    default:
      return true;
  }
}

export function cleanCensusData(
  modul0: Modul0Data,
  modulA: ModulAData,
  modulB: ModulBItem[],
  modulC: ModulCData,
  membersPii: MemberPiiItem[]
): {
  modul0: Modul0Data;
  modulA?: ModulAData;
  modulB?: ModulBItem[];
  modulC?: ModulCData;
  membersPii: MemberPiiItem[];
} {
  const cleanM0: Modul0Data = {
    id_rt: modul0.id_rt,
    dusun: modul0.dusun,
    rw: modul0.rw,
    rt: modul0.rt,
    no_bangunan: modul0.no_bangunan,
    nama_kk_daftar: modul0.nama_kk_daftar,
    enumerator: modul0.enumerator,
    ...(modul0.lokasi ? { lokasi: modul0.lokasi } : {}),
    ...(modul0.status_kunjungan ? { status_kunjungan: modul0.status_kunjungan } : {}),
    ...(modul0.status_kunjungan === 'tidak_ditemui' && modul0.kunjungan_ke !== undefined
      ? { kunjungan_ke: modul0.kunjungan_ke }
      : {}),
    ...(modul0.status_kunjungan === 'ditemui' && modul0.persetujuan
      ? { persetujuan: modul0.persetujuan, persetujuan_waktu: modul0.persetujuan_waktu }
      : {}),
    ...(modul0.status_kunjungan === 'ditemui' && modul0.persetujuan === 'ya' && modul0.has_foto_rumah
      ? { has_foto_rumah: true }
      : {}),
  };

  if (cleanM0.status_kunjungan !== 'ditemui' || cleanM0.persetujuan !== 'ya') {
    return {
      modul0: cleanM0,
      membersPii: [],
    };
  }

  // Strip hidden fields in Modul A
  const cleanMA: ModulAData = { ...modulA };
  cleanMA.luas_per_kapita = calculateLuasPerKapita(cleanMA.luas_bangunan, cleanMA.jumlah_art);
  if (cleanMA.fasilitas_bab !== 'sendiri' && cleanMA.fasilitas_bab !== 'bersama') {
    delete cleanMA.lokasi_wc;
  }
  if (!cleanMA.fasilitas_bab || cleanMA.fasilitas_bab === 'tidak_ada') {
    delete cleanMA.kloset;
    delete cleanMA.buang_tinja;
  }
  if (cleanMA.penerangan !== 'pln_sendiri') delete cleanMA.daya;
  if (!(typeof cleanMA.luas_sawah === 'number' && cleanMA.luas_sawah > 0)) delete cleanMA.kuasa_sawah;
  if (!(typeof cleanMA.luas_kebun === 'number' && cleanMA.luas_kebun > 0)) delete cleanMA.kuasa_kebun;
  if (!(typeof cleanMA.luas_pekarangan === 'number' && cleanMA.luas_pekarangan > 0)) delete cleanMA.kuasa_pekarangan;
  if (!(typeof cleanMA.luas_kolam === 'number' && cleanMA.luas_kolam > 0)) delete cleanMA.kuasa_kolam;
  if (cleanMA.terima_bansos !== 'ya') delete cleanMA.jenis_bansos;
  if (!cleanMA.bencana || cleanMA.bencana.length === 0 || cleanMA.bencana.includes('tidak_ada')) {
    delete cleanMA.dampak_bencana;
  }

  // Strip hidden fields in Modul B and separate PII
  const cleanPii: MemberPiiItem[] = [];
  const cleanMB: ModulBItem[] = modulB.map((rawM, idx) => {
    const pii = membersPii[idx] ?? { no_urut: idx + 1, nama: rawM.nama ?? '' };
    const nikVal = pii.nik?.trim() || undefined;
    const noKkVal = rawM.hubungan === 'kk' ? (pii.no_kk?.trim() || undefined) : undefined;
    cleanPii.push({
      no_urut: idx + 1,
      nama: (rawM.nama ?? pii.nama ?? '').trim(),
      ...(nikVal ? { nik: nikVal } : {}),
      ...(noKkVal ? { no_kk: noKkVal } : {}),
    });

    const m: ModulBItem = { ...rawM, no_urut: idx + 1 };
    m.usia = calculateAge(m.tgl_lahir);

    const optionalFields: (keyof ModulBItem)[] = [
      'asal_kab',
      'tahun_tinggal',
      'nik_aktif',
      'punya_ktp',
      'status_kawin',
      'buku_nikah',
      'tahun_nikah',
      'jumlah_anak',
      'partisipasi',
      'jenjang_sedang',
      'bantuan_pendidikan',
      'alasan_tidak_sekolah',
      'ijazah',
      'nonformal',
      'melek_latin',
      'agama',
      'baca_quran',
      'pekerjaan',
      'pekerjaan_lain',
      'jenis_usaha',
      'penghasilan',
      'keterampilan',
      'kerja_ln',
      'ln_sebagai',
      'ln_negara',
      'wg_lihat',
      'wg_dengar',
      'wg_jalan',
      'wg_ingat',
      'wg_urus_diri',
      'wg_komunikasi',
      'kb_aktif',
      'kb_metode',
      'hamil',
      'periksa_hamil',
      'posyandu_3bln',
      'imunisasi',
      'berat_badan',
      'tinggi_badan',
      'keanggotaan',
      'hadir_musyawarah',
      'punya_hp',
    ];

    for (const f of optionalFields) {
      if (!isModulBFieldRelevant(f, m, nikVal)) {
        delete m[f];
      }
    }
    return stripUndefined(m);
  });

  // Strip hidden fields in Modul C
  const cleanMC: ModulCData = { ...modulC };
  if (cleanMC.ormas_ya !== 'ya') delete cleanMC.ormas;
  if (cleanMC.lintas_agama !== 'ya') delete cleanMC.contoh_lintas;
  if (cleanMC.media_lokal !== 'ya') delete cleanMC.nama_media;

  return {
    modul0: stripUndefined(cleanM0),
    modulA: stripUndefined(cleanMA),
    modulB: cleanMB,
    modulC: stripUndefined(cleanMC),
    membersPii: cleanPii,
  };
}

export function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const res: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') {
      res[k] = v;
    }
  }
  return res as T;
}

export function validateCensusDraft(draft: CensusDraft): {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  memberCompleted: boolean[];
} {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const { modul0, modulA, modulB, modulC, membersPii } = draft;

  const addErr = (
    module: ValidationIssue['module'],
    fieldPath: string,
    message: string,
    memberIndex?: number
  ) => {
    errors.push({
      id: `err_${module}_${fieldPath}_${memberIndex ?? 'rt'}`,
      module,
      fieldPath,
      memberIndex,
      message,
      severity: 'error',
    });
  };

  const addWarn = (
    module: ValidationIssue['module'],
    fieldPath: string,
    message: string,
    memberIndex?: number
  ) => {
    warnings.push({
      id: `warn_${module}_${fieldPath}_${memberIndex ?? 'rt'}`,
      module,
      fieldPath,
      memberIndex,
      message,
      severity: 'warning',
    });
  };

  // --- MODUL 0 ---
  if (!modul0.lokasi || typeof modul0.lokasi.lat !== 'number' || typeof modul0.lokasi.lng !== 'number') {
    addErr('Modul 0', 'lokasi', 'Titik koordinat lokasi rumah wajib diambil atau ditandai di peta.');
  } else {
    if (modul0.lokasi.metode === 'manual' && !modul0.lokasi.alasan_manual?.trim()) {
      addErr('Modul 0', 'lokasi.alasan_manual', 'Alasan wajib diisi jika titik lokasi ditaruh secara manual.');
    }
    if (modul0.lokasi.metode === 'gps' && modul0.lokasi.akurasi > 20) {
      addWarn('Modul 0', 'lokasi', `Akurasi GPS saat ini ${Math.round(modul0.lokasi.akurasi)} m (> 20 m).`);
    } else if (modul0.lokasi.metode === 'gps' && modul0.lokasi.akurasi > 10) {
      addWarn('Modul 0', 'lokasi', `Akurasi GPS ${Math.round(modul0.lokasi.akurasi)} m (> 10 m, masih dalam batas toleransi 20 m).`);
    }
  }

  if (!modul0.status_kunjungan) {
    addErr('Modul 0', 'status_kunjungan', 'Hasil kunjungan wajib dipilih.');
  }

  if (modul0.status_kunjungan === 'tidak_ditemui') {
    if (modul0.kunjungan_ke === undefined || modul0.kunjungan_ke < 1 || modul0.kunjungan_ke > 3) {
      addErr('Modul 0', 'kunjungan_ke', 'Kunjungan ke- wajib diisi antara 1 sampai 3.');
    }
  }

  if (modul0.status_kunjungan === 'ditemui') {
    if (!modul0.persetujuan) {
      addErr('Modul 0', 'persetujuan', 'Persetujuan wawancara wajib diisi.');
    }
  }

  // Jika kunjungan bukan ditemui atau persetujuan tidak -> selesai di sini!
  if (modul0.status_kunjungan !== 'ditemui' || modul0.persetujuan !== 'ya') {
    return {
      errors,
      warnings,
      memberCompleted: [],
    };
  }

  // --- MODUL A ---
  const reqNum = (val: number | undefined, min: number, max: number, path: string, label: string, strictMin = false) => {
    if (val === undefined || Number.isNaN(val)) {
      addErr('Modul A', path, `${label} wajib diisi.`);
    } else if ((strictMin ? val <= min : val < min) || val > max) {
      addErr('Modul A', path, `${label} harus bernilai ${strictMin ? '>' : '≥'} ${min} dan ≤ ${max}.`);
    }
  };

  if (!modulA.nama_kk?.trim()) addErr('Modul A', 'nama_kk', 'Nama kepala rumah tangga wajib diisi.');
  reqNum(modulA.jumlah_art, 1, 30, 'jumlah_art', 'Jumlah anggota rumah tangga');
  reqNum(modulA.jumlah_kk, 1, 10, 'jumlah_kk', 'Jumlah Kartu Keluarga');

  const reqA: [keyof ModulAData, string][] = [
    ['status_rumah', 'Status kepemilikan rumah'],
    ['bukti_tanah', 'Bukti penguasaan tanah'],
    ['dinding', 'Bahan dinding terluas'],
    ['atap', 'Bahan atap terluas'],
    ['lantai', 'Bahan lantai terluas'],
    ['sumber_air', 'Sumber air mandi/mencuci'],
    ['air_minum', 'Sumber air minum utama'],
    ['olah_air', 'Cara mengolah air minum'],
    ['fasilitas_bab', 'Fasilitas buang air besar'],
    ['penerangan', 'Sumber penerangan utama'],
    ['bahan_bakar', 'Bahan bakar memasak'],
    ['tempat_sampah', 'Ketersediaan tempat sampah'],
    ['buang_sampah', 'Cara membuang sampah'],
    ['rawan_pangan', 'Kerawanan pangan 12 bulan terakhir'],
    ['terima_bansos', 'Penerimaan bantuan sosial'],
    ['televisi', 'Kepemilikan televisi'],
    ['sinyal', 'Kualitas sinyal seluler'],
    ['internet', 'Akses internet'],
  ];

  for (const [k, lbl] of reqA) {
    if (!modulA[k]) addErr('Modul A', k, `${lbl} wajib dipilih.`);
  }

  reqNum(modulA.luas_bangunan, 0, 2000, 'luas_bangunan', 'Luas bangunan rumah (m²)', true);
  reqNum(modulA.jendela, 0, 50, 'jendela', 'Jumlah jendela yang bisa dibuka');
  reqNum(modulA.keluar_pangan, 0, 100000000, 'keluar_pangan', 'Pengeluaran makanan sebulan (Rp)');
  reqNum(modulA.keluar_nonpangan, 0, 100000000, 'keluar_nonpangan', 'Pengeluaran bukan makanan sebulan (Rp)');
  reqNum(modulA.luas_sawah, 0, 1000000, 'luas_sawah', 'Luas sawah (m²)');
  reqNum(modulA.luas_kebun, 0, 1000000, 'luas_kebun', 'Luas kebun (m²)');
  reqNum(modulA.luas_pekarangan, 0, 1000000, 'luas_pekarangan', 'Luas pekarangan (m²)');
  reqNum(modulA.luas_kolam, 0, 1000000, 'luas_kolam', 'Luas kolam (m²)');
  reqNum(modulA.ternak_sapi, 0, 10000, 'ternak_sapi', 'Jumlah sapi/kerbau');
  reqNum(modulA.ternak_kambing, 0, 10000, 'ternak_kambing', 'Jumlah kambing/domba');
  reqNum(modulA.ternak_unggas, 0, 10000, 'ternak_unggas', 'Jumlah ayam/itik');
  reqNum(modulA.ternak_ikan_kolam, 0, 10000, 'ternak_ikan_kolam', 'Jumlah kolam ikan');
  reqNum(modulA.jumlah_motor, 0, 20, 'jumlah_motor', 'Jumlah sepeda motor');
  reqNum(modulA.jumlah_mobil, 0, 20, 'jumlah_mobil', 'Jumlah mobil');

  if ((modulA.fasilitas_bab === 'sendiri' || modulA.fasilitas_bab === 'bersama') && !modulA.lokasi_wc) {
    addErr('Modul A', 'lokasi_wc', 'Lokasi WC wajib dipilih.');
  }
  if (modulA.fasilitas_bab && modulA.fasilitas_bab !== 'tidak_ada') {
    if (!modulA.kloset) addErr('Modul A', 'kloset', 'Jenis kloset wajib dipilih.');
    if (!modulA.buang_tinja) addErr('Modul A', 'buang_tinja', 'Tempat pembuangan akhir tinja wajib dipilih.');
  }
  if (modulA.penerangan === 'pln_sendiri' && !modulA.daya) {
    addErr('Modul A', 'daya', 'Daya listrik terpasang wajib dipilih.');
  }
  if ((modulA.luas_sawah ?? 0) > 0 && !modulA.kuasa_sawah) addErr('Modul A', 'kuasa_sawah', 'Status penguasaan sawah wajib dipilih.');
  if ((modulA.luas_kebun ?? 0) > 0 && !modulA.kuasa_kebun) addErr('Modul A', 'kuasa_kebun', 'Status penguasaan kebun wajib dipilih.');
  if ((modulA.luas_pekarangan ?? 0) > 0 && !modulA.kuasa_pekarangan) addErr('Modul A', 'kuasa_pekarangan', 'Status penguasaan pekarangan wajib dipilih.');
  if ((modulA.luas_kolam ?? 0) > 0 && !modulA.kuasa_kolam) addErr('Modul A', 'kuasa_kolam', 'Status penguasaan kolam wajib dipilih.');

  // Pilih banyak Modul A
  if (!modulA.aset || modulA.aset.length === 0) addErr('Modul A', 'aset', 'Aset ekonomi keluarga wajib dipilih.');
  else if (hasExclusiveConflict(modulA.aset, ['tidak_ada'])) addErr('Modul A', 'aset', "Opsi 'Tidak ada' pada aset tidak boleh dipilih bersama opsi lain.");

  if (!modulA.pinjaman || modulA.pinjaman.length === 0) addErr('Modul A', 'pinjaman', 'Sumber pinjaman wajib dipilih.');
  else if (hasExclusiveConflict(modulA.pinjaman, ['tidak_pernah'])) addErr('Modul A', 'pinjaman', "Opsi 'Tidak pernah' pada pinjaman tidak boleh dipilih bersama opsi lain.");

  if (modulA.terima_bansos === 'ya' && (!modulA.jenis_bansos || modulA.jenis_bansos.length === 0)) {
    addErr('Modul A', 'jenis_bansos', 'Jenis bantuan sosial wajib dipilih.');
  }

  if (!modulA.bencana || modulA.bencana.length === 0) addErr('Modul A', 'bencana', 'Pengalaman bencana 5 tahun terakhir wajib dipilih.');
  else if (hasExclusiveConflict(modulA.bencana, ['tidak_ada'])) addErr('Modul A', 'bencana', "Opsi 'Tidak ada' pada bencana tidak boleh dipilih bersama opsi lain.");

  if (modulA.bencana && modulA.bencana.length > 0 && !modulA.bencana.includes('tidak_ada')) {
    if (!modulA.dampak_bencana || modulA.dampak_bencana.length === 0) {
      addErr('Modul A', 'dampak_bencana', 'Dampak bencana wajib dipilih.');
    }
  }

  // Warnings Modul A
  const lpk = calculateLuasPerKapita(modulA.luas_bangunan, modulA.jumlah_art);
  if (lpk !== undefined && lpk < 7.2) {
    addWarn('Silang', 'luas_per_kapita', `Luas bangunan per kapita ${lpk} m² (< 7,2 m²). Pastikan luas bangunan dan jumlah ART benar.`);
  }
  if (modulA.keluar_pangan === 0) {
    addWarn('Silang', 'keluar_pangan', 'Pengeluaran makanan bernilai 0 Rp. Pastikan sudah termasuk konsumsi dari kebun/ternak sendiri.');
  }

  // --- MODUL B ---
  if (typeof modulA.jumlah_art === 'number' && modulB.length !== modulA.jumlah_art) {
    addErr('Silang', 'jumlah_art', `Jumlah kartu anggota (${modulB.length}) tidak sama dengan jumlah_art (${modulA.jumlah_art}).`);
  }

  const kkCount = modulB.filter((m) => m.hubungan === 'kk').length;
  if (kkCount !== 1) {
    addErr('Silang', 'hubungan', `Harus ada tepat 1 Kepala Rumah Tangga (saat ini ditemukan ${kkCount}).`);
  }

  const todayStr = todayIsoDate();
  const memberCompleted: boolean[] = [];

  modulB.forEach((m, idx) => {
    const startErrCount = errors.length;
    const labelIdx = `Anggota #${idx + 1}${m.nama ? ` (${m.nama})` : ''}`;
    const pii = membersPii[idx];
    const nikVal = pii?.nik?.trim() || '';
    const noKkVal = pii?.no_kk?.trim() || '';

    if (!m.nama?.trim()) addErr('Modul B', 'nama', `${labelIdx}: Nama lengkap wajib diisi.`, idx);
    if (!m.hubungan) addErr('Modul B', 'hubungan', `${labelIdx}: Hubungan dengan KK wajib dipilih.`, idx);
    if (!m.jk) addErr('Modul B', 'jk', `${labelIdx}: Jenis kelamin wajib dipilih.`, idx);

    const usia = calculateAge(m.tgl_lahir);
    if (!m.tgl_lahir) {
      addErr('Modul B', 'tgl_lahir', `${labelIdx}: Tanggal lahir wajib diisi.`, idx);
    } else if (m.tgl_lahir > todayStr || m.tgl_lahir < '1900-01-01') {
      addErr('Modul B', 'tgl_lahir', `${labelIdx}: Tanggal lahir tidak valid (tidak boleh di masa depan atau sebelum 1900-01-01).`, idx);
    }

    if (!m.kewarganegaraan) addErr('Modul B', 'kewarganegaraan', `${labelIdx}: Kewarganegaraan wajib dipilih.`, idx);
    if (!m.status_penduduk) addErr('Modul B', 'status_penduduk', `${labelIdx}: Status kependudukan wajib dipilih.`, idx);

    if (m.status_penduduk && m.status_penduduk !== 'asli') {
      if (!m.asal_kab?.trim()) addErr('Modul B', 'asal_kab', `${labelIdx}: Kabupaten/kota asal wajib diisi.`, idx);
      if (m.tahun_tinggal === undefined || m.tahun_tinggal < 1940 || m.tahun_tinggal > 2026) {
        addErr('Modul B', 'tahun_tinggal', `${labelIdx}: Tahun mulai tinggal wajib antara 1940–2026.`, idx);
      }
    }

    if (nikVal) {
      if (!/^[0-9]{16}$/.test(nikVal)) {
        addErr('Modul B', 'nik', `${labelIdx}: NIK harus 16 digit angka.`, idx);
      } else if (!m.nik_aktif) {
        addErr('Modul B', 'nik_aktif', `${labelIdx}: Status keaktifan NIK di Dukcapil wajib dipilih.`, idx);
      }
    }
    if (m.hubungan === 'kk' && noKkVal && !/^[0-9]{16}$/.test(noKkVal)) {
      addErr('Modul B', 'no_kk', `${labelIdx}: Nomor KK harus 16 digit angka.`, idx);
    }

    if (usia !== undefined && usia >= 17 && !m.punya_ktp) {
      addErr('Modul B', 'punya_ktp', `${labelIdx}: Kepemilikan KTP-el wajib dipilih.`, idx);
    }
    if (!m.akta_lahir) addErr('Modul B', 'akta_lahir', `${labelIdx}: Kepemilikan akta kelahiran wajib dipilih.`, idx);

    if (usia !== undefined && usia >= 10) {
      if (!m.status_kawin) addErr('Modul B', 'status_kawin', `${labelIdx}: Status perkawinan wajib dipilih.`, idx);
      if (m.status_kawin === 'kawin' && !m.buku_nikah) {
        addErr('Modul B', 'buku_nikah', `${labelIdx}: Kepemilikan buku nikah wajib dipilih.`, idx);
      }
      if (m.buku_nikah === 'ya' && m.tahun_nikah !== undefined && (m.tahun_nikah < 1940 || m.tahun_nikah > 2026)) {
        addErr('Modul B', 'tahun_nikah', `${labelIdx}: Tahun menikah harus antara 1940–2026.`, idx);
      }
    }

    if ((m.hubungan === 'kk' || m.hubungan === 'pasangan') && (m.jumlah_anak === undefined || m.jumlah_anak < 0 || m.jumlah_anak > 20)) {
      addErr('Modul B', 'jumlah_anak', `${labelIdx}: Jumlah anak wajib diisi (0–20).`, idx);
    }

    if (usia !== undefined && usia >= 5) {
      if (!m.partisipasi) addErr('Modul B', 'partisipasi', `${labelIdx}: Partisipasi sekolah wajib dipilih.`, idx);
      if (m.partisipasi === 'masih') {
        if (!m.jenjang_sedang) addErr('Modul B', 'jenjang_sedang', `${labelIdx}: Jenjang yang sedang diikuti wajib dipilih.`, idx);
        if (!m.bantuan_pendidikan) addErr('Modul B', 'bantuan_pendidikan', `${labelIdx}: Status bantuan pendidikan wajib dipilih.`, idx);
      }
      if (m.partisipasi === 'tidak_lagi' && usia >= 7 && usia <= 18 && !m.alasan_tidak_sekolah) {
        addErr('Modul B', 'alasan_tidak_sekolah', `${labelIdx}: Alasan tidak sekolah lagi wajib dipilih.`, idx);
      }
      if (!m.ijazah) addErr('Modul B', 'ijazah', `${labelIdx}: Ijazah tertinggi wajib dipilih.`, idx);
      if (!m.nonformal || m.nonformal.length === 0) addErr('Modul B', 'nonformal', `${labelIdx}: Pendidikan nonformal wajib dipilih.`, idx);
      else if (hasExclusiveConflict(m.nonformal, ['tidak_ada'])) addErr('Modul B', 'nonformal', `${labelIdx}: Opsi 'Tidak ada' pada pendidikan nonformal tidak boleh dipilih bersama opsi lain.`, idx);

      if (usia >= 7 && !m.melek_latin) addErr('Modul B', 'melek_latin', `${labelIdx}: Kemampuan baca tulis Latin wajib dipilih.`, idx);
      if (!m.agama) addErr('Modul B', 'agama', `${labelIdx}: Agama wajib dipilih.`, idx);
      if (m.agama === 'islam' && !m.baca_quran) addErr('Modul B', 'baca_quran', `${labelIdx}: Kemampuan baca Al-Qur'an wajib dipilih.`, idx);
    }

    if (usia !== undefined && usia >= 15) {
      if (!m.pekerjaan) addErr('Modul B', 'pekerjaan', `${labelIdx}: Pekerjaan utama wajib dipilih.`, idx);
      if (m.pekerjaan === 'lainnya' && !m.pekerjaan_lain?.trim()) addErr('Modul B', 'pekerjaan_lain', `${labelIdx}: Pekerjaan lainnya wajib disebutkan.`, idx);
      if (m.pekerjaan === 'pedagang' && !m.jenis_usaha?.trim()) addErr('Modul B', 'jenis_usaha', `${labelIdx}: Jenis usaha wajib diisi.`, idx);
      if (m.pekerjaan && m.pekerjaan !== 'tidak_bekerja' && m.pekerjaan !== 'pelajar' && m.pekerjaan !== 'mengurus_rt' && !m.penghasilan) {
        addErr('Modul B', 'penghasilan', `${labelIdx}: Penghasilan per bulan wajib dipilih.`, idx);
      }
      if (!m.keterampilan || m.keterampilan.length === 0) addErr('Modul B', 'keterampilan', `${labelIdx}: Keterampilan usaha wajib dipilih.`, idx);
      else if (hasExclusiveConflict(m.keterampilan, ['tidak_ada'])) addErr('Modul B', 'keterampilan', `${labelIdx}: Opsi 'Tidak ada' pada keterampilan tidak boleh dipilih bersama opsi lain.`, idx);

      if (!m.kerja_ln) addErr('Modul B', 'kerja_ln', `${labelIdx}: Riwayat bekerja di luar negeri wajib dipilih.`, idx);
      if (m.kerja_ln === 'ya') {
        if (!m.ln_sebagai?.trim()) addErr('Modul B', 'ln_sebagai', `${labelIdx}: Pekerjaan di luar negeri wajib diisi.`, idx);
        if (!m.ln_negara?.trim()) addErr('Modul B', 'ln_negara', `${labelIdx}: Negara tempat bekerja wajib diisi.`, idx);
      }
    }

    if (!m.bpjs) addErr('Modul B', 'bpjs', `${labelIdx}: Status BPJS Kesehatan wajib dipilih.`, idx);
    if (m.penyakit && hasExclusiveConflict(m.penyakit, ['tidak_ada', 'tidak_bersedia'])) {
      addErr('Modul B', 'penyakit', `${labelIdx}: 'Tidak ada' atau 'Tidak bersedia menjawab' pada penyakit tidak boleh dipilih bersama opsi lain.`, idx);
    }

    if (usia !== undefined && usia >= 5) {
      const wgFields: (keyof ModulBItem)[] = ['wg_lihat', 'wg_dengar', 'wg_jalan', 'wg_ingat', 'wg_urus_diri', 'wg_komunikasi'];
      for (const wf of wgFields) {
        if (!m[wf]) addErr('Modul B', wf, `${labelIdx}: Pertanyaan fungsionalitas (${wf}) wajib dipilih.`, idx);
      }
    }

    if (m.jk === 'p' && usia !== undefined && usia >= 15 && usia <= 49 && m.status_kawin === 'kawin') {
      if (!m.kb_aktif) addErr('Modul B', 'kb_aktif', `${labelIdx}: Pemakaian alat/cara KB wajib dipilih.`, idx);
      if (m.kb_aktif === 'ya' && !m.kb_metode) addErr('Modul B', 'kb_metode', `${labelIdx}: Metode KB wajib dipilih.`, idx);
      if (!m.hamil) addErr('Modul B', 'hamil', `${labelIdx}: Status kehamilan wajib dipilih.`, idx);
      if (m.hamil === 'ya' && !m.periksa_hamil) addErr('Modul B', 'periksa_hamil', `${labelIdx}: Status pemeriksaan kehamilan wajib dipilih.`, idx);
    }

    if (usia !== undefined && usia < 5) {
      if (!m.posyandu_3bln) addErr('Modul B', 'posyandu_3bln', `${labelIdx}: Kunjungan posyandu 3 bulan terakhir wajib dipilih.`, idx);
      if (!m.imunisasi) addErr('Modul B', 'imunisasi', `${labelIdx}: Kelengkapan imunisasi balita wajib dipilih.`, idx);
      if (m.berat_badan !== undefined && (m.berat_badan <= 1 || m.berat_badan >= 40)) {
        addErr('Modul B', 'berat_badan', `${labelIdx}: Berat badan balita harus antara > 1 dan < 40 kg.`, idx);
      }
      if (m.tinggi_badan !== undefined && (m.tinggi_badan <= 30 || m.tinggi_badan >= 130)) {
        addErr('Modul B', 'tinggi_badan', `${labelIdx}: Tinggi badan balita harus antara > 30 dan < 130 cm.`, idx);
      }
    }

    if (usia !== undefined && usia >= 15) {
      if (!m.keanggotaan || m.keanggotaan.length === 0) addErr('Modul B', 'keanggotaan', `${labelIdx}: Keanggotaan lembaga wajib dipilih.`, idx);
      else if (hasExclusiveConflict(m.keanggotaan, ['tidak_ada'])) addErr('Modul B', 'keanggotaan', `${labelIdx}: Opsi 'Tidak ada' pada keanggotaan tidak boleh dipilih bersama opsi lain.`, idx);
      if (!m.hadir_musyawarah) addErr('Modul B', 'hadir_musyawarah', `${labelIdx}: Kehadiran musyawarah desa wajib dipilih.`, idx);
      if (!m.punya_hp) addErr('Modul B', 'punya_hp', `${labelIdx}: Kepemilikan HP wajib dipilih.`, idx);
    }

    // Peringatan Silang Modul B
    if (usia !== undefined) {
      if (usia < 15 && m.status_kawin === 'kawin') {
        addWarn('Silang', 'status_kawin', `${labelIdx}: Usia ${usia} tahun (< 15) berstatus Kawin.`, idx);
      }
      if (usia < 17 && (m.ijazah === 'd1_d3' || m.ijazah === 's1' || m.ijazah === 's2_s3')) {
        addWarn('Silang', 'ijazah', `${labelIdx}: Usia ${usia} tahun (< 17) dengan ijazah perguruan tinggi.`, idx);
      }
      if (m.hubungan === 'kk' && usia < 17) {
        addWarn('Silang', 'hubungan', `${labelIdx}: Kepala rumah tangga berusia ${usia} tahun (< 17).`, idx);
      }
      if (m.hamil === 'ya' && (usia < 15 || usia > 49)) {
        addWarn('Silang', 'hamil', `${labelIdx}: Ibu hamil berusia ${usia} tahun (< 15 atau > 49).`, idx);
      }
    }

    memberCompleted.push(errors.length === startErrCount);
  });

  // --- MODUL C ---
  if (!modulC.nama_resp_c?.trim()) addErr('Modul C', 'nama_resp_c', 'Nama responden Modul C wajib diisi.');
  const reqC: [keyof ModulCData, string][] = [
    ['k_selokan', 'Pernyataan sampah di selokan'],
    ['k_kesehatan', 'Pernyataan sampah memengaruhi kesehatan'],
    ['s_pilah', 'Kesediaan memilah sampah'],
    ['s_plastik', 'Dukungan aturan plastik sekali pakai'],
    ['s_guna_ulang', 'Penggunaan kembali barang bekas'],
    ['s_ajak', 'Mengajak menjaga kebersihan'],
    ['s_rancang', 'Kemampuan merancang pengelolaan sampah'],
    ['ormas_ya', 'Afiliasi ormas keagamaan'],
    ['hubungan_lembaga', 'Hubungan antarlembaga keagamaan'],
    ['lintas_agama', 'Kegiatan sosial lintas agama'],
    ['info_agama', 'Sumber informasi keagamaan'],
    ['media_lokal', 'Keberadaan media lokal lintas agama'],
    ['tempat_pertemuan', 'Tempat pertemuan keagamaan'],
  ];
  for (const [k, lbl] of reqC) {
    if (!modulC[k]) addErr('Modul C', k, `${lbl} wajib dipilih.`);
  }
  if (!modulC.lembaga_agama || modulC.lembaga_agama.length === 0) {
    addErr('Modul C', 'lembaga_agama', 'Lembaga keagamaan di wilayah wajib dipilih.');
  }
  if (modulC.ormas_ya === 'ya' && (!modulC.ormas || modulC.ormas.length === 0)) {
    addErr('Modul C', 'ormas', 'Organisasi kemasyarakatan keagamaan yang diikuti wajib dipilih.');
  }
  if (modulC.lintas_agama === 'ya' && !modulC.contoh_lintas?.trim()) {
    addErr('Modul C', 'contoh_lintas', 'Contoh kegiatan lintas agama wajib diisi.');
  }
  if (modulC.media_lokal === 'ya' && !modulC.nama_media?.trim()) {
    addErr('Modul C', 'nama_media', 'Nama atau bentuk media lokal wajib diisi.');
  }

  return { errors, warnings, memberCompleted };
}

export function computeJsonDiffs(
  prefix: string,
  oldObj: unknown,
  newObj: unknown
): { fieldPath: string; oldValue: string; newValue: string }[] {
  const diffs: { fieldPath: string; oldValue: string; newValue: string }[] = [];

  const stringifyVal = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  if (oldObj === newObj) return diffs;

  if (
    typeof oldObj !== 'object' ||
    typeof newObj !== 'object' ||
    oldObj === null ||
    newObj === null ||
    Array.isArray(oldObj) ||
    Array.isArray(newObj)
  ) {
    const oStr = stringifyVal(oldObj);
    const nStr = stringifyVal(newObj);
    if (oStr !== nStr) {
      diffs.push({
        fieldPath: prefix,
        oldValue: oStr.slice(0, 950) || '(kosong)',
        newValue: nStr.slice(0, 950) || '(kosong)',
      });
    }
    return diffs;
  }

  const keys = new Set([...Object.keys(oldObj as Record<string, unknown>), ...Object.keys(newObj as Record<string, unknown>)]);
  for (const key of keys) {
    const oVal = (oldObj as Record<string, unknown>)[key];
    const nVal = (newObj as Record<string, unknown>)[key];
    const nextPath = prefix ? `${prefix}.${key}` : key;
    diffs.push(...computeJsonDiffs(nextPath, oVal, nVal));
  }

  return diffs;
}
