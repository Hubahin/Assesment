import React, { useMemo, useState } from 'react';
import { CheckCircle2, Eye, History, RotateCcw, X } from 'lucide-react';
import { STATUS_CACAH_META } from '../data/instrumentSpec';
import { verifyHouseholdSubmission } from '../services/firestoreService';
import {
  HouseholdPiiRecord,
  HouseholdRecord,
  RevisionLogRecord,
  StaffMember,
} from '../types/census';
import { maskDigits } from '../utils/xlsformValidation';

interface VerificationViewProps {
  profile: StaffMember;
  households: HouseholdRecord[];
  piiRecords: HouseholdPiiRecord[];
  revisionLogs: RevisionLogRecord[];
  onEditHousehold: (h: HouseholdRecord) => void;
}

export const VerificationView: React.FC<VerificationViewProps> = ({
  profile,
  households,
  piiRecords,
  revisionLogs,
  onEditHousehold,
}) => {
  const isAdmin = profile.role === 'admin';
  const [filterVerif, setFilterVerif] = useState<'semua' | 'belum' | 'dikembalikan' | 'terverifikasi'>('belum');
  const [selected, setSelected] = useState<HouseholdRecord | null>(null);
  const [catatan, setCatatan] = useState('');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const submittedHouseholds = useMemo(() => {
    return households.filter((h) => {
      if (h.status_cacah === 'belum_dikunjungi' || h.status_cacah === 'draf') return false;
      if (filterVerif !== 'semua' && h.verifikasi_status !== filterVerif) return false;
      return true;
    });
  }, [households, filterVerif]);

  const piiMap = useMemo(() => {
    const map = new Map<string, HouseholdPiiRecord>();
    for (const p of piiRecords) map.set(p.id_rt, p);
    return map;
  }, [piiRecords]);

  const handleDecision = async (decision: 'terverifikasi' | 'dikembalikan') => {
    if (!selected) return;
    if (decision === 'dikembalikan' && !catatan.trim()) {
      setErrMsg('Catatan wajib diisi saat mengembalikan isian ke enumerator.');
      return;
    }
    setErrMsg(null);
    setSaving(true);
    try {
      await verifyHouseholdSubmission({
        household: selected,
        decision,
        catatan,
        actorEmail: profile.email,
        actorName: profile.name,
        actorRole: profile.role,
      });
      setSelected(null);
      setCatatan('');
    } catch (e: any) {
      setErrMsg(e?.message || 'Gagal menyimpan status verifikasi.');
    } finally {
      setSaving(false);
    }
  };

  const selectedPii = selected ? piiMap.get(selected.id_rt) : undefined;
  const selectedLogs = useMemo(() => {
    if (!selected) return [];
    return revisionLogs.filter((l) => l.id_rt === selected.id_rt);
  }, [selected, revisionLogs]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Verifikasi Isian Enumerator</h2>
            <p className="text-xs text-slate-600">
              Tinjau isian yang sudah dikirim enumerator oleh Admin, lalu tandai Terverifikasi atau
              Kembalikan dengan catatan.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['belum', 'Menunggu Verifikasi'],
                ['dikembalikan', 'Dikembalikan'],
                ['terverifikasi', 'Terverifikasi'],
                ['semua', 'Semua Kiriman'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilterVerif(k)}
                className={`min-h-[40px] rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  filterVerif === k
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {submittedHouseholds.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          Tidak ada isian pada kategori verifikasi ini.
        </div>
      ) : (
        <div className="space-y-2.5">
          {submittedHouseholds.map((h) => {
            const meta = STATUS_CACAH_META[h.status_cacah];
            return (
              <div
                key={h.id_rt}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-mono font-bold text-emerald-900">{h.id_rt}</span>
                    <span>·</span>
                    <span className={`rounded-md border px-2 py-0.5 font-bold ${meta.bg} ${meta.text} ${meta.border}`}>
                      {meta.label}
                    </span>
                    <span>·</span>
                    <span className="font-semibold text-slate-600">
                      Verifikasi: {h.verifikasi_status.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-base font-bold text-slate-950">
                    {h.modulA?.nama_kk || h.nama_kk_daftar}
                  </p>
                  <p className="text-xs text-slate-500">
                    Enumerator: {h.enumerator_name || h.enumerator_email || '-'} · Dikirim:{' '}
                    {h.submittedAt ? new Date(h.submittedAt).toLocaleString('id-ID') : '-'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onEditHousehold(h)}
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                  >
                    Ubah / Revisi
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(h);
                      setCatatan(h.verifikasi_catatan || '');
                      setErrMsg(null);
                    }}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                  >
                    <Eye className="h-4 w-4" />
                    Periksa &amp; Verifikasi
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Review & Verification Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <p className="font-mono text-xs font-bold text-emerald-800">{selected.id_rt}</p>
                <h3 className="text-lg font-extrabold text-slate-950">
                  {selected.modulA?.nama_kk || selected.nama_kk_daftar}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3.5 text-xs">
                <div>
                  <span className="text-slate-500">Status Kunjungan</span>
                  <p className="font-bold text-slate-900">{selected.modul0?.status_kunjungan || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Persetujuan</span>
                  <p className="font-bold text-slate-900">{selected.modul0?.persetujuan || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-500">Koordinat</span>
                  <p className="font-mono font-bold text-slate-900">
                    {selected.modul0?.lokasi
                      ? `${selected.modul0.lokasi.lat.toFixed(6)}, ${selected.modul0.lokasi.lng.toFixed(6)} (${selected.modul0.lokasi.metode})`
                      : '-'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">Jumlah ART / Luas per Kapita</span>
                  <p className="font-mono font-bold text-slate-900">
                    {selected.modulA?.jumlah_art ?? '-'} org ·{' '}
                    {selected.modulA?.luas_per_kapita ?? '-'} m²
                  </p>
                </div>
              </div>

              {selected.modulB && selected.modulB.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
                    Anggota Rumah Tangga ({selected.modulB.length})
                  </p>
                  <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
                    {selected.modulB.map((m, idx) => {
                      const pii = selectedPii?.membersPii?.[idx];
                      return (
                        <div key={idx} className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                          <div>
                            <p className="font-bold text-slate-900">
                              #{m.no_urut} {m.nama} ({m.hubungan}, {m.jk?.toUpperCase()}, {m.usia ?? '-'} th)
                            </p>
                            <p className="text-slate-500">
                              Pendidikan: {m.ijazah || '-'} · Pekerjaan: {m.pekerjaan || '-'}
                            </p>
                          </div>
                          <div className="text-right font-mono text-slate-700">
                            <p>NIK: {maskDigits(pii?.nik, isAdmin)}</p>
                            {m.hubungan === 'kk' && <p>KK: {maskDigits(pii?.no_kk, isAdmin)}</p>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selected.modulC && (
                <div className="rounded-xl border border-slate-200 p-3.5 text-xs space-y-1">
                  <p className="font-bold text-slate-900">
                    Modul C (Responden: {selected.modulC.nama_resp_c || '-'})
                  </p>
                  <p className="text-slate-600">
                    Hubungan antarlembaga keagamaan: {selected.modulC.hubungan_lembaga || '-'} ·
                    Catatan enumerator: {selected.modulC.catatan_enumerator || '-'}
                  </p>
                </div>
              )}

              {selectedLogs.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-500">
                    <History className="h-3.5 w-3.5" />
                    <span>Log Revisi ({selectedLogs.length})</span>
                  </div>
                  <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                    {selectedLogs.map((l) => (
                      <div key={l.logId} className="border-b border-slate-200 pb-1.5 last:border-0">
                        <p className="font-bold text-slate-800">
                          {l.fieldPath} · oleh {l.changedByName} ({l.changedByRole})
                        </p>
                        <p className="text-slate-600">
                          <span className="line-through text-rose-700">{l.oldValue}</span> →{' '}
                          <span className="font-semibold text-emerald-800">{l.newValue}</span> (
                          {l.reason})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800">
                  Catatan Verifikasi / Alasan Pengembalian
                </label>
                <textarea
                  rows={3}
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Wajib diisi bila mengembalikan isian ke enumerator..."
                  className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900"
                />
              </div>

              {errMsg && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                  {errMsg}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDecision('dikembalikan')}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-bold text-rose-900 hover:bg-rose-100"
              >
                <RotateCcw className="h-4 w-4" />
                Kembalikan dengan Catatan
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => handleDecision('terverifikasi')}
                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-800 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-900"
              >
                <CheckCircle2 className="h-4 w-4" />
                Tandai Terverifikasi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
