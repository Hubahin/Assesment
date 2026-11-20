import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Lock,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { DUSUN_LIST } from '../data/instrumentSpec';
import {
  downloadAnggotaCsv,
  downloadGeoJson,
  downloadIdentitasCsv,
  downloadKamusDataCsv,
  downloadKunjunganCsv,
  downloadLogRevisiCsv,
  downloadRumahTanggaCsv,
  parseCsvMasterList,
} from '../services/exportService';
import {
  importHouseholdsCsvBatch,
  markHouseholdSheetSynced,
  resetAllCensusData,
  saveSpreadsheetConfig,
  saveWilayahConfig,
} from '../services/firestoreService';
import {
  APPS_SCRIPT_TEMPLATE,
  clearAllDataViaWebhook,
  isValidAppsScriptUrl,
  syncAllDataViaWebhook,
} from '../services/googleSheetsService';
import {
  DusunCode,
  HouseholdPiiRecord,
  HouseholdRecord,
  RevisionLogRecord,
  RwMapping,
  SpreadsheetConfig,
  VisitRecord,
  WilayahConfig,
} from '../types/census';

interface AdminSettingsAndExportViewProps {
  adminEmail: string;
  wilayah: WilayahConfig;
  spreadsheetConfig: SpreadsheetConfig | null;
  households: HouseholdRecord[];
  piiRecords: HouseholdPiiRecord[];
  visits: VisitRecord[];
  revisionLogs: RevisionLogRecord[];
  isOnline: boolean;
  onAfterReset?: (message: string) => void;
}

export const AdminSettingsAndExportView: React.FC<AdminSettingsAndExportViewProps> = ({
  adminEmail,
  wilayah,
  spreadsheetConfig,
  households,
  piiRecords,
  visits,
  revisionLogs,
  isOnline,
  onAfterReset,
}) => {
  const [subTab, setSubTab] = useState<'sheets' | 'ekspor' | 'impor' | 'wilayah' | 'reset'>('sheets');

  // Wilayah State
  const [rwMappings, setRwMappings] = useState<RwMapping[]>(wilayah.rwMappings);
  const [savingWilayah, setSavingWilayah] = useState(false);
  const [wilayahNotice, setWilayahNotice] = useState<string | null>(null);

  const totalRt = rwMappings.reduce((sum, m) => sum + (Number(m.jumlahRt) || 0), 0);

  // CSV Import State
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvPreviewCount, setCsvPreviewCount] = useState(0);
  const [parsedCsvRows, setParsedCsvRows] = useState<
    ReturnType<typeof parseCsvMasterList>['rows']
  >([]);
  const [importingCsv, setImportingCsv] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  // Identitas restricted warning modal
  const [confirmIdentitasModal, setConfirmIdentitasModal] = useState(false);

  // Google Sheets via Apps Script Webhook (Tanpa Google Cloud Project)
  const [sheetTitleInput, setSheetTitleInput] = useState(
    spreadsheetConfig?.title || 'Sensus Rumah Tangga Desa Cibiru Wetan 2026'
  );
  const [sheetUrlInput, setSheetUrlInput] = useState(spreadsheetConfig?.spreadsheetUrl || '');
  const [webhookUrlInput, setWebhookUrlInput] = useState(spreadsheetConfig?.webhookUrl || '');
  const [copiedScript, setCopiedScript] = useState(false);
  const [sheetsBusy, setSheetsBusy] = useState(false);
  const [sheetsMsg, setSheetsMsg] = useState<string | null>(null);
  const [sheetsErr, setSheetsErr] = useState<string | null>(null);
  const [confirmSyncAll, setConfirmSyncAll] = useState(false);

  // Reset All Data State
  const [confirmResetModal, setConfirmResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetProgress, setResetProgress] = useState<string | null>(null);
  const [resetResultMsg, setResetResultMsg] = useState<string | null>(null);
  const [resetErrMsg, setResetErrMsg] = useState<string | null>(null);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(APPS_SCRIPT_TEMPLATE);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      setSheetsErr('Gagal menyalin otomatis. Silakan salin kode secara manual dari kotak di bawah.');
    }
  };

  const handleSaveSheetWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSheetsErr(null);
    setSheetsMsg(null);

    const webhookTrimmed = webhookUrlInput.trim();
    if (!isValidAppsScriptUrl(webhookTrimmed)) {
      setSheetsErr(
        'URL Web App Apps Script harus berawalan https://script.google.com/macros/s/... dan berakhiran /exec.'
      );
      return;
    }

    const sheetUrlTrimmed = sheetUrlInput.trim();
    const idMatch = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(sheetUrlTrimmed);
    const spreadsheetId = idMatch ? idMatch[1] : 'apps-script';

    setSheetsBusy(true);
    try {
      await saveSpreadsheetConfig({
        spreadsheetId,
        spreadsheetUrl: sheetUrlTrimmed,
        webhookUrl: webhookTrimmed,
        title: sheetTitleInput.trim() || 'Sensus Rumah Tangga Desa Cibiru Wetan 2026',
        updatedBy: adminEmail,
      });
      setSheetsMsg('Tautan Google Spreadsheet (Apps Script) berhasil disimpan.');
    } catch (err: any) {
      setSheetsErr(err?.message || 'Gagal menyimpan konfigurasi Spreadsheet.');
    } finally {
      setSheetsBusy(false);
    }
  };

  const handleSyncAllConfirmed = async () => {
    setConfirmSyncAll(false);
    if (!spreadsheetConfig?.webhookUrl) return;
    setSheetsErr(null);
    setSheetsMsg(null);
    setSheetsBusy(true);
    try {
      await syncAllDataViaWebhook({
        webhookUrl: spreadsheetConfig.webhookUrl,
        households,
        piiRecords,
        visits,
        revisionLogs,
      });

      const unsynced = households.filter((h) => h.submittedAt && !h.sheetSynced);
      for (const h of unsynced) {
        await markHouseholdSheetSynced(h.id_rt);
      }

      await saveSpreadsheetConfig({
        spreadsheetId: spreadsheetConfig.spreadsheetId,
        spreadsheetUrl: spreadsheetConfig.spreadsheetUrl,
        webhookUrl: spreadsheetConfig.webhookUrl,
        title: spreadsheetConfig.title,
        lastSyncedAt: new Date().toISOString(),
        updatedBy: adminEmail,
      });

      setSheetsMsg(
        `Berhasil mengirim ${households.length} rumah tangga, ${visits.length} kunjungan, dan ${revisionLogs.length} log revisi ke Google Spreadsheet.`
      );
    } catch (e: any) {
      setSheetsErr(e?.message || 'Gagal menyinkronkan data ke Google Spreadsheet.');
    } finally {
      setSheetsBusy(false);
    }
  };

  const handleWilayahChange = (idx: number, patch: Partial<RwMapping>) => {
    setRwMappings((prev) => prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  };

  const handleSaveWilayah = async () => {
    setSavingWilayah(true);
    setWilayahNotice(null);
    try {
      await saveWilayahConfig(rwMappings, adminEmail);
      setWilayahNotice(
        totalRt === 85
          ? 'Pemetaan 19 RW dan 85 RT berhasil disimpan.'
          : `Pemetaan disimpan (Total saat ini ${totalRt} RT — harap sesuaikan menjadi 85 RT).`
      );
    } finally {
      setSavingWilayah(false);
    }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    const reader = new FileReader();
    reader.onload = () => {
      const res = parseCsvMasterList(String(reader.result || ''));
      setCsvErrors(res.errors);
      setParsedCsvRows(res.rows);
      setCsvPreviewCount(res.rows.length);
    };
    reader.readAsText(file);
  };

  const handleRunCsvImport = async () => {
    if (parsedCsvRows.length === 0) return;
    setImportingCsv(true);
    try {
      const res = await importHouseholdsCsvBatch(parsedCsvRows, adminEmail);
      setImportResult(
        `Berhasil mengimpor ${res.imported} rumah tangga dengan ID berurutan otomatis (${res.ids[0]} s.d. ${res.ids[res.ids.length - 1]}).`
      );
      setParsedCsvRows([]);
      setCsvPreviewCount(0);
    } finally {
      setImportingCsv(false);
    }
  };

  const handleConfirmResetAll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setResetErrMsg('Perangkat sedang luring. Hubungkan internet terlebih dahulu.');
      return;
    }
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
      setResetErrMsg('Ketik kata RESET dengan benar untuk mengonfirmasi penghapusan.');
      return;
    }

    setResetBusy(true);
    setResetErrMsg(null);
    setResetResultMsg(null);
    try {
      const { deletedCount } = await resetAllCensusData((msg) => setResetProgress(msg));

      let sheetCleared = false;
      if (spreadsheetConfig?.webhookUrl) {
        setResetProgress('Mengosongkan data di 5 tab Google Spreadsheet...');
        await clearAllDataViaWebhook(spreadsheetConfig.webhookUrl);
        await saveSpreadsheetConfig({
          spreadsheetId: spreadsheetConfig.spreadsheetId,
          spreadsheetUrl: spreadsheetConfig.spreadsheetUrl,
          webhookUrl: spreadsheetConfig.webhookUrl,
          title: spreadsheetConfig.title,
          lastSyncedAt: new Date().toISOString(),
          updatedBy: adminEmail,
        });
        sheetCleared = true;
      }

      const finalMsg = sheetCleared
        ? `Berhasil menghapus ${deletedCount} dokumen sensus dari aplikasi serta mengosongkan seluruh data di Google Spreadsheet. Aplikasi siap dimulai kembali dari nol.`
        : `Berhasil menghapus ${deletedCount} dokumen sensus dari aplikasi. Aplikasi siap dimulai kembali dari nol.`;

      setConfirmResetModal(false);
      setResetConfirmText('');
      setResetResultMsg(finalMsg);
      onAfterReset?.(finalMsg);
    } catch (err: any) {
      setResetErrMsg(err?.message || 'Gagal menghapus seluruh data sensus.');
    } finally {
      setResetBusy(false);
      setResetProgress(null);
    }
  };

  const pendingSyncCount = households.filter((h) => h.submittedAt && !h.sheetSynced).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {(
          [
            ['sheets', 'Google Spreadsheet'],
            ['ekspor', 'Ekspor Data (CSV & GeoJSON)'],
            ['impor', 'Impor Daftar Induk CSV'],
            ['wilayah', 'Pemetaan Wilayah (19 RW / 85 RT)'],
            ['reset', 'Reset Data (Mulai dari Nol)'],
          ] as const
        ).map(([id, lbl]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSubTab(id)}
            className={`min-h-[42px] rounded-xl px-4 py-2 text-xs font-bold transition ${
              subTab === id
                ? id === 'reset'
                  ? 'bg-rose-700 text-white'
                  : 'bg-slate-900 text-white'
                : id === 'reset'
                ? 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {lbl}
          </button>
        ))}
      </div>

      {/* TAB 1: GOOGLE SPREADSHEET (APPS SCRIPT TANPA PROJECT GOOGLE CLOUD) */}
      {subTab === 'sheets' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                Integrasi Google Spreadsheet (Tanpa Project Google Cloud)
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Sinkronisasi memakai <strong>Google Apps Script Web App</strong> langsung pada
                Spreadsheet desa sehingga aplikasi dapat dipublikasikan bebas tanpa project Google
                Cloud, tanpa verifikasi OAuth, dan bekerja otomatis untuk seluruh enumerator.
              </p>
            </div>

            {spreadsheetConfig?.webhookUrl && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-800">Spreadsheet Terhubung</p>
                    <p className="text-base font-extrabold text-slate-950 truncate">
                      {spreadsheetConfig.title}
                    </p>
                    {spreadsheetConfig.lastSyncedAt && (
                      <p className="mt-1 text-xs text-slate-600">
                        Sinkron penuh terakhir:{' '}
                        {new Date(spreadsheetConfig.lastSyncedAt).toLocaleString('id-ID')}
                      </p>
                    )}
                  </div>

                  {spreadsheetConfig.spreadsheetUrl && (
                    <a
                      href={spreadsheetConfig.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Buka Google Spreadsheet
                    </a>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-emerald-200 pt-3">
                  <p className="text-xs font-semibold text-emerald-950">
                    {pendingSyncCount > 0
                      ? `${pendingSyncCount} data sensus terbaru menunggu sinkron ke Spreadsheet.`
                      : 'Semua data sensus terkirim sudah sinkron dengan Spreadsheet.'}
                  </p>
                  <button
                    type="button"
                    disabled={sheetsBusy}
                    onClick={() => setConfirmSyncAll(true)}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    <RefreshCw className={`h-4 w-4 ${sheetsBusy ? 'animate-spin' : ''}`} />
                    {sheetsBusy ? 'Menyinkronkan...' : 'Sinkronkan Semua Data ke Spreadsheet'}
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveSheetWebhook} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-slate-900">
                <FileSpreadsheet className="h-4 w-4 text-emerald-800" />
                <h3 className="text-sm font-extrabold">Pengaturan Tautan Google Spreadsheet</h3>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  Nama Spreadsheet (Label)
                </label>
                <input
                  type="text"
                  value={sheetTitleInput}
                  onChange={(e) => setSheetTitleInput(e.target.value)}
                  placeholder="Sensus Rumah Tangga Desa Cibiru Wetan 2026"
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  URL Web App Google Apps Script <span className="text-rose-600">*</span>
                </label>
                <input
                  type="url"
                  required
                  value={webhookUrlInput}
                  onChange={(e) => setWebhookUrlInput(e.target.value)}
                  placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700">
                  URL Google Spreadsheet (Opsional — untuk tombol Buka Spreadsheet)
                </label>
                <input
                  type="url"
                  value={sheetUrlInput}
                  onChange={(e) => setSheetUrlInput(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                  className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={sheetsBusy}
                className="min-h-[44px] rounded-xl bg-emerald-800 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-900"
              >
                {sheetsBusy ? 'Menyimpan...' : 'Simpan Pengaturan Spreadsheet'}
              </button>
            </form>

            {sheetsMsg && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{sheetsMsg}</span>
              </div>
            )}
            {sheetsErr && (
              <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{sheetsErr}</span>
              </div>
            )}

            {/* Panduan 3 Langkah Apps Script */}
            <div className="rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-extrabold text-slate-950">
                  Cara Pasang / Perbarui Kode di Google Sheets (1 Menit, Tanpa Google Cloud)
                </h3>
                <button
                  type="button"
                  onClick={handleCopyScript}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  {copiedScript ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedScript ? 'Tersalin!' : 'Salin Kode Apps Script'}
                </button>
              </div>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-700">
                <li>
                  Buka Google Spreadsheet desa, lalu klik menu <strong>Ekstensi → Apps Script</strong>.
                </li>
                <li>
                  Hapus isi editor, tempel kode terbaru di bawah ini (mendukung sinkronisasi data
                  sensus &amp; baca/tulis daftar <code>petugas</code>), lalu klik{' '}
                  <strong>Terapkan (Deploy) → Deployment baru</strong> (atau Kelola deployment →
                  Edit → Versi baru).
                </li>
                <li>
                  Pilih jenis <strong>Aplikasi web</strong>, atur <em>Yang memiliki akses</em> menjadi{' '}
                  <strong>Siapa saja (Anyone)</strong>, salin URL berakhiran <code>/exec</code>, dan
                  tempel di kolom di atas.
                </li>
              </ol>
              <pre className="max-h-48 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
                {APPS_SCRIPT_TEMPLATE}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EKSPOR */}
      {subTab === 'ekspor' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">
              Ekspor Berkas Analisis &amp; Spasial (Admin)
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Seluruh nama kolom menggunakan kode field &amp; kode opsi XLSForm. Pertanyaan pilihan
              banyak diekspor sebagai kolom biner 0/1 per opsi untuk Looker Studio dan spreadsheet.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => downloadRumahTanggaCsv(households)}
              className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100"
            >
              <div>
                <p className="font-mono text-sm font-bold text-slate-950">rumah_tangga.csv</p>
                <p className="text-xs text-slate-600">
                  Daftar induk, Modul 0, A, C (tanpa nama &amp; nomor identitas)
                </p>
              </div>
              <Download className="h-5 w-5 shrink-0 text-emerald-800" />
            </button>

            <button
              type="button"
              onClick={() => downloadAnggotaCsv(households)}
              className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100"
            >
              <div>
                <p className="font-mono text-sm font-bold text-slate-950">anggota.csv</p>
                <p className="text-xs text-slate-600">
                  1 baris per anggota (id_rt + no_urut, tanpa nama, NIK, No KK)
                </p>
              </div>
              <Download className="h-5 w-5 shrink-0 text-emerald-800" />
            </button>

            <button
              type="button"
              onClick={() => setConfirmIdentitasModal(true)}
              className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-left hover:bg-rose-100"
            >
              <div>
                <p className="flex items-center gap-1.5 font-mono text-sm font-bold text-rose-950">
                  <Lock className="h-3.5 w-3.5" />
                  identitas.csv
                </p>
                <p className="text-xs text-rose-800">
                  Data pribadi terbatas (id_rt, no_urut, nama, NIK, No KK)
                </p>
              </div>
              <Download className="h-5 w-5 shrink-0 text-rose-800" />
            </button>

            <button
              type="button"
              onClick={() => downloadKunjunganCsv(visits)}
              className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100"
            >
              <div>
                <p className="font-mono text-sm font-bold text-slate-950">kunjungan.csv</p>
                <p className="text-xs text-slate-600">
                  Semua catatan kunjungan termasuk kunjungan gagal ({visits.length} baris)
                </p>
              </div>
              <Download className="h-5 w-5 shrink-0 text-emerald-800" />
            </button>

            <button
              type="button"
              onClick={() => downloadLogRevisiCsv(revisionLogs)}
              className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100"
            >
              <div>
                <p className="font-mono text-sm font-bold text-slate-950">log_revisi.csv</p>
                <p className="text-xs text-slate-600">
                  Jejak revisi pasca-kirim ({revisionLogs.length} catatan)
                </p>
              </div>
              <Download className="h-5 w-5 shrink-0 text-emerald-800" />
            </button>

            <button
              type="button"
              onClick={() => downloadGeoJson(households)}
              className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100"
            >
              <div>
                <p className="font-mono text-sm font-bold text-slate-950">
                  titik_rumah_tangga.geojson
                </p>
                <p className="text-xs text-slate-600">
                  Koordinat WGS84 EPSG:4326 siap dibuka di QGIS
                </p>
              </div>
              <Download className="h-5 w-5 shrink-0 text-emerald-800" />
            </button>

            <button
              type="button"
              onClick={() => downloadKamusDataCsv()}
              className="flex min-h-[64px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100 sm:col-span-2"
            >
              <div>
                <p className="font-mono text-sm font-bold text-slate-950">kamus_data.csv</p>
                <p className="text-xs text-slate-600">
                  Daftar lengkap kode field, label, tipe, dan seluruh kode opsi dengan labelnya
                </p>
              </div>
              <Download className="h-5 w-5 shrink-0 text-emerald-800" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: IMPOR CSV */}
      {subTab === 'impor' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Impor Daftar Induk dari CSV</h2>
            <p className="mt-1 text-xs text-slate-600">
              Format kolom wajib:{' '}
              <span className="font-mono font-bold text-slate-900">
                kode_dusun, rw, rt, no_bangunan, nama_kk, alamat, sumber
              </span>
              . Nomor urut 3 digit &amp; ID <span className="font-mono">CBW-...</span> dibuat
              otomatis via transaksi Firestore.
            </p>
          </div>

          <label className="flex min-h-[56px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800 hover:border-emerald-700 hover:bg-emerald-50">
            <Upload className="h-5 w-5 text-emerald-800" />
            <span>Pilih Berkas CSV Daftar Induk</span>
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
          </label>

          {csvErrors.length > 0 && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-900">
              <p className="font-bold">Ditemukan galat pada berkas CSV:</p>
              <ul className="mt-1.5 list-disc pl-4 space-y-1">
                {csvErrors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {csvPreviewCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-bold text-emerald-950">
                {csvPreviewCount} baris valid siap diimpor ke Daftar Induk.
              </p>
              <button
                type="button"
                disabled={importingCsv}
                onClick={handleRunCsvImport}
                className="min-h-[44px] rounded-xl bg-emerald-800 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-900"
              >
                {importingCsv ? 'Mengimpor...' : 'Jalankan Impor CSV'}
              </button>
            </div>
          )}

          {importResult && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-900">
              {importResult}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PEMETAAN WILAYAH */}
      {subTab === 'wilayah' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-slate-950">
                Pemetaan Wilayah RW 01–19 Desa Cibiru Wetan
              </h2>
              <p className="text-xs text-slate-600">
                Tetapkan dusun (D1–D5) dan jumlah RT untuk setiap RW. Total target Desa Cibiru
                Wetan adalah 85 RT.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div
                className={`rounded-xl border px-3.5 py-2 font-mono text-sm font-extrabold tabular-nums ${
                  totalRt === 85
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    : 'border-rose-400 bg-rose-100 text-rose-900'
                }`}
              >
                Total RT: {totalRt} / 85
              </div>
              <button
                type="button"
                disabled={savingWilayah}
                onClick={handleSaveWilayah}
                className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                {savingWilayah ? 'Menyimpan...' : 'Simpan Pemetaan'}
              </button>
            </div>
          </div>

          {totalRt !== 85 && (
            <div className="flex items-center gap-2.5 rounded-xl border-2 border-rose-500 bg-rose-50 p-3.5 text-sm font-bold text-rose-900">
              <AlertTriangle className="h-5 w-5 shrink-0 text-rose-700" />
              <span>
                Peringatan: Total RT hasil pemetaan adalah {totalRt}, tidak sama dengan 85 RT!
                Periksa kembali jumlah RT tiap RW.
              </span>
            </div>
          )}

          {wilayahNotice && (
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-900">
              {wilayahNotice}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5 font-bold">RW</th>
                  <th className="px-4 py-2.5 font-bold">Kode Dusun</th>
                  <th className="px-4 py-2.5 font-bold">Jumlah RT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rwMappings.map((m, idx) => (
                  <tr key={m.rw}>
                    <td className="px-4 py-2 font-mono font-bold text-slate-900">RW {m.rw}</td>
                    <td className="px-4 py-2">
                      <select
                        value={m.dusun}
                        onChange={(e) =>
                          handleWilayahChange(idx, { dusun: e.target.value as DusunCode })
                        }
                        className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 font-semibold text-slate-900"
                      >
                        {DUSUN_LIST.map((d) => (
                          <option key={d.code} value={d.code}>
                            {d.code} · {d.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={m.jumlahRt}
                        onChange={(e) =>
                          handleWilayahChange(idx, {
                            jumlahRt: Math.max(0, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="min-h-[38px] w-24 rounded-lg border border-slate-300 px-2.5 font-mono font-bold tabular-nums text-slate-900"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 5: RESET DATA (MULAI DARI NOL) */}
      {subTab === 'reset' && (
        <div className="rounded-2xl border border-rose-300 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-rose-950">
                Hapus Semua Data Sensus (Mulai dari Nol)
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Fitur khusus Admin untuk menghapus seluruh data uji coba atau data sensus yang sudah
                terinput di aplikasi web dan secara otomatis ikut mengosongkan data di Google
                Spreadsheet.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Rumah Tangga</p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-slate-950 tabular-nums">
                {households.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Riwayat Kunjungan</p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-slate-950 tabular-nums">
                {visits.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase">Log Revisi</p>
              <p className="mt-1 font-mono text-2xl font-extrabold text-slate-950 tabular-nums">
                {revisionLogs.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-950 space-y-1.5">
              <p className="font-extrabold">Yang Akan Dihapus Permanen:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Seluruh daftar &amp; isian Rumah Tangga, Identitas (NIK/KK), dan Foto Rumah.</li>
                <li>Seluruh riwayat kunjungan, log revisi, serta penghitung nomor urut RT (kembali dari 001).</li>
                <li>Seluruh draf &amp; antrean luring di perangkat ini.</li>
                <li>
                  {spreadsheetConfig?.webhookUrl
                    ? `Seluruh baris data di 5 tab Google Spreadsheet "${spreadsheetConfig.title}" (header kolom tetap dipertahankan).`
                    : 'Google Spreadsheet belum ditautkan (hanya data web yang dihapus).'}
                </li>
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950 space-y-1.5">
              <p className="font-extrabold">Yang Tetap Dipertahankan:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Akun Admin, Koordinator, Enumerator, dan penugasan RT petugas.</li>
                <li>Pemetaan Wilayah 19 RW / 85 RT Desa Cibiru Wetan.</li>
                <li>Tautan dan pengaturan Web App Google Spreadsheet.</li>
              </ul>
            </div>
          </div>

          {!isOnline && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Perangkat sedang luring. Penghapusan massal wajib dilakukan saat terhubung internet
                agar server dan Google Spreadsheet bersih bersamaan.
              </span>
            </div>
          )}

          {resetResultMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-900">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{resetResultMsg}</span>
            </div>
          )}

          {resetErrMsg && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-bold text-rose-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{resetErrMsg}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rose-200 pt-4">
            <p className="text-xs text-slate-600">
              Disarankan ekspor CSV terlebih dahulu di tab <strong>Ekspor Data</strong> bila masih
              membutuhkan salinan arsip.
            </p>
            <button
              type="button"
              disabled={!isOnline || resetBusy}
              onClick={() => {
                setResetConfirmText('');
                setResetErrMsg(null);
                setConfirmResetModal(true);
              }}
              className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-rose-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              <span>Hapus Semua Data &amp; Kosongkan Spreadsheet</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Reset All Census Data */}
      {confirmResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleConfirmResetAll}
            className="w-full max-w-md rounded-2xl border border-rose-300 bg-white p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="text-lg font-extrabold">Konfirmasi Hapus Semua Data</h3>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">
              Tindakan ini akan menghapus permanen{' '}
              <strong>{households.length} data rumah tangga</strong> beserta foto, NIK/KK, kunjungan,
              log revisi, nomor urut RT,{' '}
              {spreadsheetConfig?.webhookUrl
                ? 'serta mengosongkan seluruh data di Google Spreadsheet.'
                : 'di database aplikasi.'}
            </p>
            <div>
              <label className="block text-xs font-bold text-slate-800">
                Ketik <span className="font-mono text-rose-700">RESET</span> untuk melanjutkan:
              </label>
              <input
                type="text"
                autoFocus
                required
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 font-mono text-sm font-bold uppercase text-slate-900"
              />
            </div>

            {resetProgress && (
              <p className="text-xs font-semibold text-emerald-800">{resetProgress}</p>
            )}
            {resetErrMsg && (
              <p className="text-xs font-semibold text-rose-700">{resetErrMsg}</p>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={resetBusy}
                onClick={() => setConfirmResetModal(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={resetBusy || resetConfirmText.trim().toUpperCase() !== 'RESET'}
                className="min-h-[44px] rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetBusy ? 'Menghapus...' : 'Ya, Hapus & Mulai dari Nol'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmation Modal for Restricted Identitas Export */}
      {confirmIdentitasModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-300 bg-white p-6 shadow-xl">
            <div className="flex items-center gap-2 text-rose-700">
              <Lock className="h-5 w-5" />
              <h3 className="text-lg font-extrabold">Peringatan Data Pribadi Terbatas</h3>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Berkas <span className="font-mono font-bold">identitas.csv</span> berisi nama lengkap,
              NIK, dan Nomor KK responden. <strong>Data pribadi — simpan terbatas</strong> dan
              jangan dibagikan ke pihak yang tidak berwenang.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmIdentitasModal(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmIdentitasModal(false);
                  downloadIdentitasCsv(piiRecords);
                }}
                className="min-h-[44px] rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800"
              >
                Unduh identitas.csv
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Sync All */}
      {confirmSyncAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-extrabold text-slate-950">
              Sinkronkan Semua Data ke Google Spreadsheet?
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Operasi ini akan memperbarui 5 tab pada &ldquo;{spreadsheetConfig?.title}&rdquo;
              dengan {households.length} baris rumah tangga, {visits.length} baris kunjungan, dan{' '}
              {revisionLogs.length} baris log revisi terbaru.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmSyncAll(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSyncAllConfirmed}
                className="min-h-[44px] rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900"
              >
                Ya, Sinkronkan Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
