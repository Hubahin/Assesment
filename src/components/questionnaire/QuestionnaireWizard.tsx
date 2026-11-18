import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  FileWarning,
  Save,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { CHOICES, TEKS_PERSETUJUAN } from '../../data/instrumentSpec';
import {
  getHouseholdPhoto,
  loadLocalDraft,
  markHouseholdSheetSynced,
  saveHouseholdDraftRemote,
  saveLocalDraft,
  submitHouseholdCensus,
} from '../../services/firestoreService';
import { appendSubmissionViaWebhook } from '../../services/googleSheetsService';
import {
  CensusDraft,
  HouseholdPiiRecord,
  HouseholdRecord,
  MemberPiiItem,
  Modul0Data,
  ModulAData,
  ModulBItem,
  ModulCData,
  SpreadsheetConfig,
  UserRole,
} from '../../types/census';
import { validateCensusDraft } from '../../utils/xlsformValidation';
import { BigChoiceButtons, FieldWrapper, NoteCallout } from '../FormControls';
import { LocationPicker } from '../LocationPicker';
import { PhotoCapture } from '../PhotoCapture';
import { ModulASection } from './ModulASection';
import { ModulBSection } from './ModulBSection';
import { ModulCSection } from './ModulCSection';

type StepId = 'modul0' | 'modulA' | 'modulB' | 'modulC' | 'penutup' | 'ringkasan';

const STEPS: { id: StepId; label: string }[] = [
  { id: 'modul0', label: 'Modul 0' },
  { id: 'modulA', label: 'Modul A' },
  { id: 'modulB', label: 'Modul B' },
  { id: 'modulC', label: 'Modul C' },
  { id: 'penutup', label: 'Penutup' },
  { id: 'ringkasan', label: 'Ringkasan' },
];

interface QuestionnaireWizardProps {
  household: HouseholdRecord;
  existingPii?: HouseholdPiiRecord;
  actorEmail: string;
  actorName: string;
  actorRole: UserRole;
  isOnline: boolean;
  spreadsheetConfig: SpreadsheetConfig | null;
  onClose: () => void;
  onSubmittedMessage: (msg: string) => void;
}

export const QuestionnaireWizard: React.FC<QuestionnaireWizardProps> = ({
  household,
  existingPii,
  actorEmail,
  actorName,
  actorRole,
  isOnline,
  spreadsheetConfig,
  onClose,
  onSubmittedMessage,
}) => {
  const [step, setStep] = useState<StepId>('modul0');
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmWarnings, setConfirmWarnings] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const initialDraft = useMemo<CensusDraft>(() => {
    const local = loadLocalDraft(household.id_rt);
    if (local) return local;

    const baseM0: Modul0Data = household.modul0 || {
      id_rt: household.id_rt,
      dusun: household.dusun,
      rw: household.rw,
      rt: household.rt,
      no_bangunan: household.no_bangunan,
      nama_kk_daftar: household.nama_kk_daftar,
      enumerator: actorEmail.toLowerCase(),
    };

    const baseMA: ModulAData = household.modulA || {
      nama_kk: household.nama_kk_daftar,
      jumlah_art: 1,
      jumlah_kk: 1,
      luas_sawah: 0,
      luas_kebun: 0,
      luas_pekarangan: 0,
      luas_kolam: 0,
      ternak_sapi: 0,
      ternak_kambing: 0,
      ternak_unggas: 0,
      ternak_ikan_kolam: 0,
      jumlah_motor: 0,
      jumlah_mobil: 0,
    };

    const baseMB: ModulBItem[] =
      household.modulB && household.modulB.length > 0
        ? household.modulB
        : [{ no_urut: 1, nama: household.nama_kk_daftar, hubungan: 'kk' }];

    const basePii: MemberPiiItem[] =
      existingPii?.membersPii && existingPii.membersPii.length > 0
        ? existingPii.membersPii
        : baseMB.map((m, idx) => ({ no_urut: idx + 1, nama: m.nama || '' }));

    return {
      id_rt: household.id_rt,
      modul0: baseM0,
      modulA: baseMA,
      modulB: baseMB,
      modulC: household.modulC || {},
      membersPii: basePii,
      fotoDataUrl: null,
      updatedLocallyAt: new Date().toISOString(),
    };
  }, [household, existingPii, actorEmail]);

  const [draft, setDraft] = useState<CensusDraft>(initialDraft);

  // Load existing photo from separate collection if present and not in local draft
  useEffect(() => {
    let active = true;
    if (household.modul0?.has_foto_rumah && !draft.fotoDataUrl) {
      getHouseholdPhoto(household.id_rt).then((url) => {
        if (active && url) {
          setDraft((prev) => ({ ...prev, fotoDataUrl: url }));
        }
      });
    }
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household.id_rt]);

  // Auto-save to device localStorage whenever draft changes
  useEffect(() => {
    saveLocalDraft(draft);
  }, [draft]);

  // Sync Modul B card count whenever jumlah_art changes
  const syncMemberCount = (count: number | undefined, kkName?: string) => {
    const target = Math.max(1, Math.min(30, count || 1));
    setDraft((prev) => {
      const nextMB = [...prev.modulB];
      const nextPii = [...prev.membersPii];

      while (nextMB.length < target) {
        const idx = nextMB.length;
        nextMB.push({
          no_urut: idx + 1,
          ...(idx === 0 ? { hubungan: 'kk', nama: kkName || prev.modulA.nama_kk } : {}),
        });
      }
      if (nextMB.length > target) {
        nextMB.length = target;
      }

      while (nextPii.length < target) {
        const idx = nextPii.length;
        nextPii.push({
          no_urut: idx + 1,
          nama: nextMB[idx]?.nama || '',
        });
      }
      if (nextPii.length > target) {
        nextPii.length = target;
      }

      return { ...prev, modulB: nextMB, membersPii: nextPii };
    });
  };

  const updateM0 = (patch: Partial<Modul0Data>) => {
    setDraft((prev) => ({
      ...prev,
      modul0: { ...prev.modul0, ...patch },
    }));
  };

  const updateMA = (nextMA: ModulAData) => {
    const prevArt = draft.modulA.jumlah_art;
    setDraft((prev) => ({ ...prev, modulA: nextMA }));
    if (nextMA.jumlah_art !== prevArt) {
      syncMemberCount(nextMA.jumlah_art, nextMA.nama_kk);
    }
  };

  const earlyStop =
    draft.modul0.status_kunjungan !== 'ditemui' || draft.modul0.persetujuan !== 'ya';

  const validation = useMemo(() => validateCensusDraft(draft), [draft]);
  const isAlreadySubmitted = Boolean(household.submittedAt);

  const visibleSteps = earlyStop
    ? [STEPS[0], STEPS[5]]
    : STEPS;

  const currentStepIdx = visibleSteps.findIndex((s) => s.id === step);

  const goNext = () => {
    if (step === 'modul0' && earlyStop) {
      setStep('ringkasan');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (currentStepIdx < visibleSteps.length - 1) {
      setStep(visibleSteps[currentStepIdx + 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goPrev = () => {
    if (currentStepIdx > 0) {
      setStep(visibleSteps[currentStepIdx - 1].id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSaveDraftOnly = async () => {
    setSavingDraft(true);
    try {
      saveLocalDraft(draft);
      await saveHouseholdDraftRemote(household, draft, actorEmail, actorName);
      onSubmittedMessage(`Draf ${household.id_rt} tersimpan di perangkat & antrean sinkronisasi.`);
    } finally {
      setSavingDraft(false);
    }
  };

  const canSubmit =
    validation.errors.length === 0 &&
    (validation.warnings.length === 0 || confirmWarnings) &&
    (!isAlreadySubmitted || revisionReason.trim().length > 0);

  const executeSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const { updatedHousehold, visit, cleanedPii } = await submitHouseholdCensus({
        existingHousehold: household,
        draft,
        actorEmail,
        actorName,
        actorRole,
        revisionReason: isAlreadySubmitted ? revisionReason : undefined,
      });

      let sheetMsg = 'Data tersimpan di database.';
      if (isOnline && spreadsheetConfig?.webhookUrl) {
        try {
          await appendSubmissionViaWebhook({
            webhookUrl: spreadsheetConfig.webhookUrl,
            household: updatedHousehold,
            pii: {
              id_rt: updatedHousehold.id_rt,
              rtKey: updatedHousehold.rtKey,
              membersPii: cleanedPii,
              updatedBy: actorEmail,
            },
            visit,
          });
          await markHouseholdSheetSynced(updatedHousehold.id_rt);
          sheetMsg = 'Data tersimpan & langsung dikirim ke Google Spreadsheet.';
        } catch (sheetErr: any) {
          sheetMsg = `Data tersimpan di Firestore (menunggu sinkron Spreadsheet: ${sheetErr?.message || 'gagal kirim'}).`;
        }
      } else if (!isOnline) {
        sheetMsg = 'Data tersimpan luring di perangkat dan akan tersinkron otomatis saat online.';
      }

      setShowSubmitConfirm(false);
      onSubmittedMessage(`${household.id_rt} berhasil dikirim. ${sheetMsg}`);
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || 'Gagal menyimpan data sensus.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24">
      {/* Top Wizard Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-100"
          >
            <ArrowLeft className="h-4 w-4" />
            Daftar Rumah Tangga
          </button>

          <button
            type="button"
            disabled={savingDraft}
            onClick={handleSaveDraftOnly}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-100"
          >
            <Save className="h-4 w-4" />
            {savingDraft ? 'Menyimpan...' : 'Simpan Draf'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <div>
            <p className="font-mono text-sm font-extrabold text-emerald-900">{household.id_rt}</p>
            <p className="text-xs text-slate-600">
              Bangunan {household.no_bangunan} · {household.nama_kk_daftar}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            {!isOnline && <CloudOff className="h-3.5 w-3.5 text-amber-700" />}
            <span>Draf tersimpan otomatis di perangkat</span>
          </div>
        </div>

        {/* Bilah Kemajuan */}
        <div className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {STEPS.map((s) => {
            const disabled = earlyStop && s.id !== 'modul0' && s.id !== 'ringkasan';
            const active = s.id === step;
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => setStep(s.id)}
                className={`min-h-[38px] rounded-lg px-2 py-1.5 text-xs font-bold transition ${
                  active
                    ? 'bg-emerald-800 text-white'
                    : disabled
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Catatan Pengembalian dari Koordinator */}
      {household.verifikasi_status === 'dikembalikan' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950">
          <div className="flex items-start gap-2.5">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
            <div>
              <p className="text-sm font-bold">Dikembalikan oleh Koordinator Enumerator</p>
              <p className="mt-1 text-sm">{household.verifikasi_catatan || 'Harap periksa kembali isian.'}</p>
            </div>
          </div>
        </div>
      )}

      {/* STEP: MODUL 0 */}
      {step === 'modul0' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-950 px-4 py-3 text-white">
            <p className="text-xs font-semibold text-emerald-300">Modul 0</p>
            <h2 className="text-lg font-bold">Identitas Pencacahan &amp; Persetujuan</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs sm:grid-cols-3">
            <div>
              <span className="text-slate-500">ID Rumah Tangga</span>
              <p className="mt-0.5 font-mono font-bold text-slate-900">{draft.modul0.id_rt}</p>
            </div>
            <div>
              <span className="text-slate-500">Wilayah</span>
              <p className="mt-0.5 font-mono font-bold text-slate-900">
                {draft.modul0.dusun} / RW {draft.modul0.rw} / RT {draft.modul0.rt}
              </p>
            </div>
            <div>
              <span className="text-slate-500">No. Bangunan</span>
              <p className="mt-0.5 font-mono font-bold text-slate-900">{draft.modul0.no_bangunan}</p>
            </div>
            <div>
              <span className="text-slate-500">Kepala RT (Daftar)</span>
              <p className="mt-0.5 font-bold text-slate-900">{draft.modul0.nama_kk_daftar}</p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500">Enumerator</span>
              <p className="mt-0.5 font-mono text-slate-900">{draft.modul0.enumerator}</p>
            </div>
          </div>

          <LocationPicker
            value={draft.modul0.lokasi}
            onChange={(lokasi) => updateM0({ lokasi })}
          />

          <FieldWrapper label="Hasil kunjungan" code="status_kunjungan" required>
            <BigChoiceButtons
              options={CHOICES.kunjungan}
              value={draft.modul0.status_kunjungan}
              onChange={(v) =>
                updateM0({
                  status_kunjungan: v as Modul0Data['status_kunjungan'],
                })
              }
            />
          </FieldWrapper>

          {draft.modul0.status_kunjungan === 'tidak_ditemui' && (
            <FieldWrapper
              label="Kunjungan ke-"
              code="kunjungan_ke"
              required
              hint="Maksimal tiga kali kunjungan (1–3)"
            >
              <BigChoiceButtons
                options={[
                  { code: '1', label: 'Kunjungan ke-1' },
                  { code: '2', label: 'Kunjungan ke-2' },
                  { code: '3', label: 'Kunjungan ke-3' },
                ]}
                value={draft.modul0.kunjungan_ke ? String(draft.modul0.kunjungan_ke) : undefined}
                onChange={(v) => updateM0({ kunjungan_ke: Number(v) })}
              />
            </FieldWrapper>
          )}

          {draft.modul0.status_kunjungan === 'ditemui' && (
            <>
              <NoteCallout
                title="Bacakan kepada Responden (Persetujuan)"
                text={TEKS_PERSETUJUAN}
                tone="consent"
              />

              <FieldWrapper
                label="Apakah Bapak/Ibu bersedia diwawancarai?"
                code="persetujuan"
                required
              >
                <BigChoiceButtons
                  options={CHOICES.ya_tidak}
                  value={draft.modul0.persetujuan}
                  onChange={(v) =>
                    updateM0({
                      persetujuan: v as 'ya' | 'tidak',
                      persetujuan_waktu: new Date().toISOString(),
                    })
                  }
                  columns={2}
                />
              </FieldWrapper>

              {draft.modul0.persetujuan === 'ya' && (
                <PhotoCapture
                  value={draft.fotoDataUrl}
                  onChange={(url) =>
                    setDraft((prev) => ({
                      ...prev,
                      fotoDataUrl: url,
                      modul0: { ...prev.modul0, has_foto_rumah: Boolean(url) },
                    }))
                  }
                />
              )}
            </>
          )}

          {earlyStop && draft.modul0.status_kunjungan && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              <p className="font-bold">Wawancara Berhenti di Modul 0</p>
              <p className="mt-1 text-xs leading-relaxed">
                Karena status kunjungan bukan &ldquo;Ditemui&rdquo; atau responden menolak
                wawancara, klik Lanjut untuk mencatat kunjungan ini ke layar Ringkasan &amp; Simpan.
              </p>
            </div>
          )}
        </div>
      )}

      {/* STEP: MODUL A */}
      {step === 'modulA' && <ModulASection value={draft.modulA} onChange={updateMA} />}

      {/* STEP: MODUL B */}
      {step === 'modulB' && (
        <ModulBSection
          jumlahArt={draft.modulA.jumlah_art || 1}
          members={draft.modulB}
          membersPii={draft.membersPii}
          memberCompleted={validation.memberCompleted}
          isAdmin={actorRole === 'admin'}
          onChange={(modulB, membersPii) =>
            setDraft((prev) => ({ ...prev, modulB, membersPii }))
          }
        />
      )}

      {/* STEP: MODUL C */}
      {step === 'modulC' && (
        <ModulCSection
          value={draft.modulC}
          members={draft.modulB}
          onChange={(modulC) => setDraft((prev) => ({ ...prev, modulC }))}
        />
      )}

      {/* STEP: PENUTUP */}
      {step === 'penutup' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-950 px-4 py-3 text-white">
            <p className="text-xs font-semibold text-emerald-300">Penutup</p>
            <h2 className="text-lg font-bold">Penyelesaian Wawancara</h2>
          </div>

          <NoteCallout
            title="Ucapan Terima Kasih"
            tone="consent"
            text="Terima kasih Bapak/Ibu atas kesediaan dan waktu yang diberikan. Seluruh informasi yang disampaikan dijaga kerahasiaannya dan hanya dimanfaatkan untuk perencanaan pembangunan Desa Cibiru Wetan."
          />

          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 text-sm">
            <p className="font-bold text-slate-900">Ringkasan Cepat Sebelum Validasi</p>
            <p className="text-slate-700">
              Kepala Rumah Tangga: <strong>{draft.modulA.nama_kk || '-'}</strong>
            </p>
            <p className="text-slate-700">
              Jumlah Anggota Tercatat: <strong className="font-mono">{draft.modulB.length}</strong>{' '}
              (Isian jumlah_art: <strong className="font-mono">{draft.modulA.jumlah_art}</strong>)
            </p>
            <p className="text-slate-700">
              Responden Modul C: <strong>{draft.modulC.nama_resp_c || '-'}</strong>
            </p>
          </div>
        </div>
      )}

      {/* STEP: RINGKASAN */}
      {step === 'ringkasan' && (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-900 px-4 py-3 text-white">
            <p className="text-xs font-semibold text-slate-300">Ringkasan &amp; Validasi</p>
            <h2 className="text-lg font-bold">Pemeriksaan Akhir Sebelum Kirim</h2>
          </div>

          {validation.errors.length > 0 ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
              <div className="flex items-center gap-2 text-rose-900">
                <FileWarning className="h-5 w-5 shrink-0" />
                <h3 className="text-sm font-bold">
                  {validation.errors.length} Galat Wajib Diperbaiki (Memblokir Kirim)
                </h3>
              </div>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs text-rose-900">
                {validation.errors.map((e) => (
                  <li key={e.id}>
                    <strong>[{e.module}]</strong> {e.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span>Tidak ada galat yang memblokir. Data siap dikirim.</span>
            </div>
          )}

          {validation.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-amber-950">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <h3 className="text-sm font-bold">
                  {validation.warnings.length} Peringatan Pemeriksaan Silang
                </h3>
              </div>
              <ul className="list-disc space-y-1.5 pl-5 text-xs text-amber-950">
                {validation.warnings.map((w) => (
                  <li key={w.id}>
                    <strong>[{w.module}]</strong> {w.message}
                  </li>
                ))}
              </ul>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-slate-900">
                <input
                  type="checkbox"
                  checked={confirmWarnings}
                  onChange={(e) => setConfirmWarnings(e.target.checked)}
                  className="h-5 w-5 accent-emerald-800"
                />
                <span>Saya telah memeriksa peringatan di atas dan memastikan data sesuai kondisi lapangan.</span>
              </label>
            </div>
          )}

          {isAlreadySubmitted && (
            <FieldWrapper
              label="Alasan Revisi Data Pasca-Kirim"
              required
              hint="Setiap perubahan setelah kirim dicatat permanen di log revisi."
            >
              <input
                type="text"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
                placeholder="Contoh: Koreksi tanggal lahir & pekerjaan sesuai catatan pengawas"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
              />
            </FieldWrapper>
          )}

          {submitError && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-900">
              {submitError}
            </div>
          )}

          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => setShowSubmitConfirm(true)}
            className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-extrabold transition ${
              canSubmit
                ? 'bg-emerald-800 text-white hover:bg-emerald-900 shadow-sm'
                : 'bg-slate-200 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Send className="h-5 w-5" />
            <span>{submitting ? 'Mengirim Data...' : 'Kirim Data Sensus'}</span>
          </button>
        </div>
      )}

      {/* Bottom Sticky Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <button
            type="button"
            disabled={currentStepIdx <= 0}
            onClick={goPrev}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" />
            Sebelumnya
          </button>

          <span className="text-xs font-bold text-slate-500 tabular-nums">
            Langkah {currentStepIdx + 1} / {visibleSteps.length}
          </span>

          {currentStepIdx < visibleSteps.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              <span>Lanjut</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={() => setShowSubmitConfirm(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-800 px-5 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
              <span>Kirim</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-950">Konfirmasi Pengiriman Data</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Data rumah tangga <span className="font-mono font-bold">{household.id_rt}</span> akan
              disimpan ke Cloud Firestore{spreadsheetConfig?.webhookUrl ? ' dan dikirim ke Google Spreadsheet' : ''}.
              Pastikan seluruh jawaban sudah sesuai.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowSubmitConfirm(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={executeSubmit}
                className="min-h-[44px] rounded-xl bg-emerald-800 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-900"
              >
                {submitting ? 'Menyimpan...' : 'Ya, Kirim Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
