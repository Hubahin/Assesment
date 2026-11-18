export type UserRole = 'admin' | 'koordinator' | 'enumerator';

export type DusunCode = 'D1' | 'D2' | 'D3' | 'D4' | 'D5';

export interface RwMapping {
  rw: string; // '01'..'19'
  dusun: DusunCode;
  jumlahRt: number;
}

export interface WilayahConfig {
  rwMappings: RwMapping[];
  totalRt: number;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface SpreadsheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  webhookUrl?: string;
  title: string;
  lastSyncedAt?: string;
  updatedBy: string;
  updatedAt?: unknown;
}

export interface StaffMember {
  email: string;
  name: string;
  role: UserRole;
  assignedRTs: string[]; // format: 'D2-07-03'
  koordinatorEmail?: string;
  active: boolean;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type SumberDaftar = 'listing_lapangan' | 'daftar_kk_rt' | 'data_desa' | 'temuan_lapangan';
export type StatusDaftar = 'aktif' | 'pindah' | 'ganda' | 'tidak_ada';
export type StatusCacah =
  | 'belum_dikunjungi'
  | 'draf'
  | 'tercacah'
  | 'menolak'
  | 'tidak_ditemui'
  | 'rumah_kosong';

export type VerifikasiStatus = 'belum' | 'terverifikasi' | 'dikembalikan';

export interface LokasiData {
  lat: number;
  lng: number;
  akurasi: number;
  waktu: string;
  metode: 'gps' | 'manual';
  alasan_manual?: string;
}

export interface Modul0Data {
  id_rt: string;
  dusun: DusunCode;
  rw: string;
  rt: string;
  no_bangunan: string;
  nama_kk_daftar: string;
  enumerator: string;
  lokasi?: LokasiData;
  status_kunjungan?: 'ditemui' | 'tidak_ditemui' | 'rumah_kosong';
  kunjungan_ke?: number;
  persetujuan?: 'ya' | 'tidak';
  persetujuan_waktu?: string;
  has_foto_rumah?: boolean;
}

export interface ModulAData {
  nama_kk?: string;
  jumlah_art?: number;
  jumlah_kk?: number;
  status_rumah?: string;
  bukti_tanah?: string;
  luas_bangunan?: number;
  luas_per_kapita?: number;
  dinding?: string;
  atap?: string;
  lantai?: string;
  jendela?: number;
  sumber_air?: string;
  air_minum?: string;
  olah_air?: string;
  fasilitas_bab?: string;
  lokasi_wc?: string;
  kloset?: string;
  buang_tinja?: string;
  penerangan?: string;
  daya?: string;
  bahan_bakar?: string;
  tempat_sampah?: string;
  buang_sampah?: string;
  keluar_pangan?: number;
  keluar_nonpangan?: number;
  rawan_pangan?: string;
  luas_sawah?: number;
  kuasa_sawah?: string;
  luas_kebun?: number;
  kuasa_kebun?: string;
  luas_pekarangan?: number;
  kuasa_pekarangan?: string;
  luas_kolam?: number;
  kuasa_kolam?: string;
  aset?: string[];
  ternak_sapi?: number;
  ternak_kambing?: number;
  ternak_unggas?: number;
  ternak_ikan_kolam?: number;
  pinjaman?: string[];
  terima_bansos?: string;
  jenis_bansos?: string[];
  televisi?: string;
  jumlah_motor?: number;
  jumlah_mobil?: number;
  sinyal?: string;
  internet?: string;
  bencana?: string[];
  dampak_bencana?: string[];
}

export interface ModulBItem {
  no_urut: number;
  nama?: string;
  hubungan?: string;
  jk?: string;
  tgl_lahir?: string;
  usia?: number;
  kewarganegaraan?: string;
  status_penduduk?: string;
  asal_kab?: string;
  tahun_tinggal?: number;
  nik_aktif?: string;
  punya_ktp?: string;
  akta_lahir?: string;
  status_kawin?: string;
  buku_nikah?: string;
  tahun_nikah?: number;
  jumlah_anak?: number;
  partisipasi?: string;
  jenjang_sedang?: string;
  bantuan_pendidikan?: string;
  alasan_tidak_sekolah?: string;
  ijazah?: string;
  nonformal?: string[];
  melek_latin?: string;
  agama?: string;
  baca_quran?: string;
  pekerjaan?: string;
  pekerjaan_lain?: string;
  jenis_usaha?: string;
  penghasilan?: string;
  keterampilan?: string[];
  kerja_ln?: string;
  ln_sebagai?: string;
  ln_negara?: string;
  bpjs?: string;
  penyakit?: string[];
  wg_lihat?: string;
  wg_dengar?: string;
  wg_jalan?: string;
  wg_ingat?: string;
  wg_urus_diri?: string;
  wg_komunikasi?: string;
  kb_aktif?: string;
  kb_metode?: string;
  hamil?: string;
  periksa_hamil?: string;
  posyandu_3bln?: string;
  imunisasi?: string;
  berat_badan?: number;
  tinggi_badan?: number;
  keanggotaan?: string[];
  hadir_musyawarah?: string;
  punya_hp?: string;
}

export interface MemberPiiItem {
  no_urut: number;
  nama: string;
  nik?: string;
  no_kk?: string;
}

export interface ModulCData {
  nama_resp_c?: string;
  k_selokan?: string;
  k_kesehatan?: string;
  s_pilah?: string;
  s_plastik?: string;
  s_guna_ulang?: string;
  s_ajak?: string;
  s_rancang?: string;
  lembaga_agama?: string[];
  ormas_ya?: string;
  ormas?: string[];
  tokoh_agama?: string;
  panggilan_tokoh?: string[];
  hubungan_lembaga?: string;
  lintas_agama?: string;
  contoh_lintas?: string;
  info_agama?: string;
  media_lokal?: string;
  nama_media?: string;
  tempat_pertemuan?: string;
  topik_pertemuan?: string;
  catatan_enumerator?: string;
}

export interface HouseholdRecord {
  id_rt: string;
  dusun: DusunCode;
  rw: string;
  rt: string;
  rtKey: string;
  urutan: number;
  no_bangunan: string;
  nama_kk_daftar: string;
  alamat: string;
  sumber: SumberDaftar;
  status_daftar: StatusDaftar;
  catatan_daftar?: string;
  status_cacah: StatusCacah;
  verifikasi_status: VerifikasiStatus;
  verifikasi_catatan?: string;
  verifikasi_oleh?: string;
  verifikasi_waktu?: string;
  modul0?: Modul0Data;
  modulA?: ModulAData;
  modulB?: ModulBItem[];
  modulC?: ModulCData;
  enumerator_email?: string;
  enumerator_name?: string;
  submittedAt?: string;
  sheetSynced?: boolean;
  sheetSyncedAt?: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface HouseholdPiiRecord {
  id_rt: string;
  rtKey: string;
  membersPii: MemberPiiItem[];
  updatedBy: string;
  updatedAt?: unknown;
}

export interface VisitRecord {
  visitId: string;
  id_rt: string;
  rtKey: string;
  dusun: DusunCode;
  rw: string;
  rt: string;
  enumerator_email: string;
  enumerator_name?: string;
  waktu: string;
  status_kunjungan: 'ditemui' | 'tidak_ditemui' | 'rumah_kosong';
  kunjungan_ke?: number;
  persetujuan?: 'ya' | 'tidak';
  lokasi: LokasiData;
  catatan?: string;
  createdAt?: unknown;
}

export interface RevisionLogRecord {
  logId: string;
  id_rt: string;
  rtKey: string;
  changedByEmail: string;
  changedByName: string;
  changedByRole: UserRole;
  changedAt?: unknown;
  fieldPath: string;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface ValidationIssue {
  id: string;
  module: 'Modul 0' | 'Modul A' | 'Modul B' | 'Modul C' | 'Silang';
  fieldPath: string;
  memberIndex?: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface CensusDraft {
  id_rt: string;
  modul0: Modul0Data;
  modulA: ModulAData;
  modulB: ModulBItem[];
  modulC: ModulCData;
  membersPii: MemberPiiItem[];
  fotoDataUrl?: string | null;
  updatedLocallyAt: string;
}
