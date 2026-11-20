import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ClipboardEdit,
  Plus,
  Search,
  Tag,
  Trash2,
  WifiOff,
} from 'lucide-react';
import {
  DUSUN_LIST,
  STATUS_CACAH_META,
  SUMBER_OPTIONS,
} from '../data/instrumentSpec';
import {
  createHouseholdListingTransactional,
  isOfflineOrTimeoutError,
  loadLocalDraft,
  queueOfflineListing,
  queueOfflineMasterStatus,
  updateHouseholdMasterStatus,
  withNetworkTimeout,
} from '../services/firestoreService';
import {
  DusunCode,
  HouseholdRecord,
  StaffMember,
  StatusCacah,
  StatusDaftar,
  SumberDaftar,
  WilayahConfig,
} from '../types/census';

interface HouseholdListViewProps {
  profile: StaffMember;
  wilayah: WilayahConfig;
  households: HouseholdRecord[];
  isOnline: boolean;
  hasFirebaseUser: boolean;
  pendingSyncIds: Set<string>;
  onOpenQuestionnaire: (h: HouseholdRecord) => void;
  onAdminDeleteHousehold?: (h: HouseholdRecord) => Promise<void>;
}

export const HouseholdListView: React.FC<HouseholdListViewProps> = ({
  profile,
  wilayah,
  households,
  isOnline,
  hasFirebaseUser,
  pendingSyncIds,
  onOpenQuestionnaire,
  onAdminDeleteHousehold,
}) => {
  const isAdmin = profile.role === 'admin';
  const isProvisionalOffline = profile.createdBy === 'offline-provisional';

  // Build available RT options filtered by wilayah & user's assignedRTs
  const availableRtOptions = useMemo(() => {
    const list: { rtKey: string; dusun: DusunCode; rw: string; rt: string }[] = [];
    for (const m of wilayah.rwMappings) {
      for (let i = 1; i <= (m.jumlahRt || 0); i++) {
        const rtStr = String(i).padStart(2, '0');
        const rtKey = `${m.dusun}-${m.rw}-${rtStr}`;
        if (isAdmin || isProvisionalOffline || profile.assignedRTs.includes(rtKey)) {
          list.push({ rtKey, dusun: m.dusun, rw: m.rw, rt: rtStr });
        }
      }
    }
    return list;
  }, [wilayah, isAdmin, isProvisionalOffline, profile.assignedRTs]);

  const [selectedDusun, setSelectedDusun] = useState<string>('');
  const [selectedRw, setSelectedRw] = useState<string>('');
  const [selectedRtKey, setSelectedRtKey] = useState<string>(
    availableRtOptions[0]?.rtKey || ''
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('semua');

  // Mode Listing State
  const [showListingModal, setShowListingModal] = useState(false);
  const [lastBuildingNo, setLastBuildingNo] = useState('B-001');
  const [listingNoBangunan, setListingNoBangunan] = useState('B-001');
  const [listingNamaKk, setListingNamaKk] = useState('');
  const [listingAlamat, setListingAlamat] = useState('');
  const [listingSumber, setListingSumber] = useState<SumberDaftar>('listing_lapangan');
  const [listingSaving, setListingSaving] = useState(false);
  const [listingError, setListingError] = useState<string | null>(null);

  // Status Daftar Modal (pindah / ganda / tidak_ada)
  const [statusModalTarget, setStatusModalTarget] = useState<HouseholdRecord | null>(null);
  const [editStatusDaftar, setEditStatusDaftar] = useState<StatusDaftar>('aktif');
  const [editCatatanDaftar, setEditCatatanDaftar] = useState('');
  const [savingMasterStatus, setSavingMasterStatus] = useState(false);

  // Admin Delete Single Household Modal
  const [deleteTarget, setDeleteTarget] = useState<HouseholdRecord | null>(null);
  const [deletingSingle, setDeletingSingle] = useState(false);
  const [deleteSingleErr, setDeleteSingleErr] = useState<string | null>(null);

  const dusunOptions = useMemo(() => {
    const set = new Set(availableRtOptions.map((o) => o.dusun));
    return DUSUN_LIST.filter((d) => set.has(d.code));
  }, [availableRtOptions]);

  const rwOptions = useMemo(() => {
    const filtered = selectedDusun
      ? availableRtOptions.filter((o) => o.dusun === selectedDusun)
      : availableRtOptions;
    return Array.from(new Set(filtered.map((o) => o.rw))).sort();
  }, [availableRtOptions, selectedDusun]);

  const rtOptionsForSelect = useMemo(() => {
    return availableRtOptions.filter((o) => {
      if (selectedDusun && o.dusun !== selectedDusun) return false;
      if (selectedRw && o.rw !== selectedRw) return false;
      return true;
    });
  }, [availableRtOptions, selectedDusun, selectedRw]);

  const activeRtKey = useMemo(() => {
    if (rtOptionsForSelect.some((r) => r.rtKey === selectedRtKey)) return selectedRtKey;
    return rtOptionsForSelect[0]?.rtKey || '';
  }, [rtOptionsForSelect, selectedRtKey]);

  const activeRtMeta = availableRtOptions.find((r) => r.rtKey === activeRtKey);

  const filteredHouseholds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return households.filter((h) => {
      if (activeRtKey && h.rtKey !== activeRtKey) return false;
      if (statusFilter === 'dikembalikan') {
        if (h.verifikasi_status !== 'dikembalikan') return false;
      } else if (statusFilter !== 'semua') {
        if (h.status_cacah !== statusFilter) return false;
      }
      if (q) {
        const hay = `${h.id_rt} ${h.no_bangunan} ${h.nama_kk_daftar} ${h.alamat}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [households, activeRtKey, statusFilter, searchQuery]);

  const openListingModal = () => {
    setListingError(null);
    // Suggest next building number based on highest B-xxx in this RT
    const rtHouseholds = households.filter((h) => h.rtKey === activeRtKey);
    let maxB = 0;
    let latestB = 'B-001';
    for (const h of rtHouseholds) {
      const match = /^B-(\d+)$/i.exec(h.no_bangunan);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n >= maxB) {
          maxB = n;
          latestB = h.no_bangunan;
        }
      }
    }
    setLastBuildingNo(maxB > 0 ? latestB : 'B-001');
    setListingNoBangunan(`B-${String(maxB + 1).padStart(3, '0')}`);
    setListingNamaKk('');
    setListingAlamat('');
    setListingSumber('listing_lapangan');
    setShowListingModal(true);
  };

  const handleSaveListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRtMeta) return;
    if (!listingNoBangunan.trim() || !listingNamaKk.trim()) {
      setListingError('Nomor bangunan dan nama kepala rumah tangga wajib diisi.');
      return;
    }

    const listingParams = {
      dusun: activeRtMeta.dusun,
      rw: activeRtMeta.rw,
      rt: activeRtMeta.rt,
      no_bangunan: listingNoBangunan,
      nama_kk_daftar: listingNamaKk,
      alamat: listingAlamat,
      sumber: listingSumber,
    };

    if (!isOnline || !hasFirebaseUser) {
      const createdLocal = queueOfflineListing(listingParams, profile.email);
      setLastBuildingNo(createdLocal.no_bangunan);
      setShowListingModal(false);
      return;
    }

    setListingSaving(true);
    setListingError(null);
    try {
      const created = await withNetworkTimeout(
        createHouseholdListingTransactional(listingParams, profile.email),
        10000
      );
      setLastBuildingNo(created.no_bangunan);
      setShowListingModal(false);
    } catch (err: any) {
      if (isOfflineOrTimeoutError(err)) {
        const createdLocal = queueOfflineListing(listingParams, profile.email);
        setLastBuildingNo(createdLocal.no_bangunan);
        setShowListingModal(false);
      } else {
        setListingError(err?.message || 'Gagal menambahkan rumah tangga baru.');
      }
    } finally {
      setListingSaving(false);
    }
  };

  const handleSaveMasterStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalTarget) return;
    if (!isOnline || !hasFirebaseUser || statusModalTarget.id_rt.startsWith('LOCAL-')) {
      queueOfflineMasterStatus(
        profile.email,
        statusModalTarget.id_rt,
        editStatusDaftar,
        editCatatanDaftar
      );
      setStatusModalTarget(null);
      return;
    }

    setSavingMasterStatus(true);
    try {
      await withNetworkTimeout(
        updateHouseholdMasterStatus(
          statusModalTarget.id_rt,
          editStatusDaftar,
          editCatatanDaftar
        ),
        6000
      );
      setStatusModalTarget(null);
    } catch (err) {
      if (isOfflineOrTimeoutError(err)) {
        queueOfflineMasterStatus(
          profile.email,
          statusModalTarget.id_rt,
          editStatusDaftar,
          editCatatanDaftar
        );
        setStatusModalTarget(null);
      }
    } finally {
      setSavingMasterStatus(false);
    }
  };

  if (availableRtOptions.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
        <h2 className="text-lg font-bold">Belum Ada Wilayah RT yang Ditugaskan</h2>
        <p className="mt-1.5 text-sm">
          Akun Anda belum memiliki penugasan RT. Hubungi Koordinator Enumerator atau Admin I&apos;ComDev
          untuk menugaskan wilayah RT Anda.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* RT Filter & Action Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Daftar Induk Rumah Tangga</h2>
            <p className="text-xs text-slate-600">
              {isProvisionalOffline
                ? 'Mode luring sementara: pilih RT tugas Anda di bawah. Penugasan resmi akan diverifikasi otomatis saat kembali online.'
                : 'Pilih RT tugas, lalu pilih rumah tangga untuk mulai mencacah atau tambah via Mode Listing.'}
            </p>
          </div>
          {activeRtMeta && (
            <button
              type="button"
              onClick={openListingModal}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900"
            >
              <Plus className="h-4 w-4" />
              <span>Tambah Rumah Tangga (Listing)</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold text-slate-600">Dusun</label>
            <select
              value={selectedDusun}
              onChange={(e) => {
                setSelectedDusun(e.target.value);
                setSelectedRw('');
              }}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
            >
              <option value="">Semua Dusun Tugas</option>
              {dusunOptions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} · {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600">RW</label>
            <select
              value={selectedRw}
              onChange={(e) => setSelectedRw(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
            >
              <option value="">Semua RW</option>
              {rwOptions.map((rw) => (
                <option key={rw} value={rw}>
                  RW {rw}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600">Pilih RT</label>
            <select
              value={activeRtKey}
              onChange={(e) => setSelectedRtKey(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm font-bold text-slate-900"
            >
              {rtOptionsForSelect.map((r) => (
                <option key={r.rtKey} value={r.rtKey}>
                  {r.dusun} · RW {r.rw} · RT {r.rt}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search & Status Filters */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama KK, nomor bangunan (B-001), atau ID..."
              className="min-h-[44px] w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['semua', 'Semua'],
                ['belum_dikunjungi', 'Belum'],
                ['draf', 'Draf'],
                ['tercacah', 'Tercacah'],
                ['tidak_ditemui', 'Tdk Ditemui'],
                ['menolak', 'Menolak'],
                ['rumah_kosong', 'Kosong'],
                ['dikembalikan', 'Dikembalikan'],
              ] as [string, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`min-h-[38px] rounded-lg px-2.5 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                  statusFilter === key
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Household Cards List */}
      {filteredHouseholds.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-bold text-slate-800">
            Belum ada rumah tangga terdaftar di RT ini atau tidak cocok dengan filter.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Gunakan tombol &ldquo;Tambah Rumah Tangga (Listing)&rdquo; untuk mendaftarkan rumah
            tangga baru secara berurutan.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredHouseholds.map((h) => {
            const hasLocalDraft = Boolean(loadLocalDraft(h.id_rt));
            const effectiveStatus: StatusCacah =
              h.status_cacah === 'belum_dikunjungi' && hasLocalDraft ? 'draf' : h.status_cacah;
            const meta = STATUS_CACAH_META[effectiveStatus];

            return (
              <div
                key={h.id_rt}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-emerald-900">{h.id_rt}</span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className="font-mono font-semibold text-slate-700">
                        {h.no_bangunan}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span
                        className={`rounded-md border px-2 py-0.5 text-[11px] font-bold ${meta.bg} ${meta.text} ${meta.border}`}
                      >
                        {meta.label}
                      </span>
                      {h.verifikasi_status === 'dikembalikan' && (
                        <span className="rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-900">
                          Dikembalikan Pengawas
                        </span>
                      )}
                      {h.verifikasi_status === 'terverifikasi' && (
                        <span className="rounded-md border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                          Terverifikasi
                        </span>
                      )}
                      {pendingSyncIds.has(h.id_rt) && (
                        <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-950">
                          Tersimpan Lokal · Menunggu Online
                        </span>
                      )}
                      {h.status_daftar !== 'aktif' && (
                        <span className="rounded-md border border-stone-300 bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-900 uppercase">
                          {h.status_daftar.replace('_', ' ')}
                        </span>
                      )}
                    </div>

                    <p className="text-base font-extrabold text-slate-950 truncate">
                      {h.nama_kk_daftar}
                    </p>
                    <p className="text-xs text-slate-600 truncate">
                      {h.alamat || 'Alamat belum dicatat'} ·{' '}
                      {SUMBER_OPTIONS.find((s) => s.code === h.sumber)?.label || h.sumber}
                    </p>

                    {h.verifikasi_status === 'dikembalikan' && h.verifikasi_catatan && (
                      <p className="mt-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-900">
                        Catatan Pengawas: {h.verifikasi_catatan}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setStatusModalTarget(h);
                        setEditStatusDaftar(h.status_daftar);
                        setEditCatatanDaftar(h.catatan_daftar || '');
                      }}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                      title="Tandai status daftar (pindah/ganda/tidak ada)"
                    >
                      <Tag className="h-4 w-4" />
                      <span>Status Daftar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenQuestionnaire(h)}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                    >
                      <ClipboardEdit className="h-4 w-4" />
                      <span>
                        {h.status_cacah === 'belum_dikunjungi' && !hasLocalDraft
                          ? 'Mulai Cacah'
                          : 'Buka Isian'}
                      </span>
                    </button>
                    {isAdmin && onAdminDeleteHousehold && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteSingleErr(null);
                          setDeleteTarget(h);
                        }}
                        title="Hapus permanen data rumah tangga ini (Admin)"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 hover:bg-rose-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Hapus</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mode Listing Modal */}
      {showListingModal && activeRtMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveListing}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4"
          >
            <div>
              <p className="font-mono text-xs font-bold text-emerald-800">
                Mode Listing · {activeRtMeta.dusun} / RW {activeRtMeta.rw} / RT {activeRtMeta.rt}
              </p>
              <h3 className="mt-1 text-lg font-extrabold text-slate-950">
                Tambah Rumah Tangga ke Daftar Induk
              </h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Nomor urut 3 digit ID rumah tangga diberikan otomatis oleh transaksi Firestore.
              </p>
            </div>

            {!isOnline && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Perangkat sedang luring. Rumah tangga akan disimpan dengan ID sementara (
                  <span className="font-mono font-bold">LOCAL-...</span>) agar langsung bisa
                  dicacah, lalu otomatis memperoleh ID resmi saat online.
                </span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-800">Nomor Bangunan</label>
                <button
                  type="button"
                  onClick={() => setListingNoBangunan(lastBuildingNo)}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Rumah tangga lain di bangunan yang sama ({lastBuildingNo})
                </button>
              </div>
              <input
                type="text"
                required
                value={listingNoBangunan}
                onChange={(e) => setListingNoBangunan(e.target.value)}
                placeholder="B-001"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 font-mono text-sm font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800">
                Nama Kepala Rumah Tangga <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                required
                value={listingNamaKk}
                onChange={(e) => setListingNamaKk(e.target.value)}
                placeholder="Nama lengkap kepala rumah tangga"
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800">Alamat / Gang</label>
              <input
                type="text"
                value={listingAlamat}
                onChange={(e) => setListingAlamat(e.target.value)}
                placeholder="Kp. / Jl. / Gang ..."
                className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800">Sumber Data</label>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                {SUMBER_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setListingSumber(opt.code)}
                    className={`min-h-[42px] rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                      listingSumber === opt.code
                        ? 'border-emerald-800 bg-emerald-800 text-white'
                        : 'border-slate-300 bg-slate-50 text-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {listingError && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{listingError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowListingModal(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={listingSaving}
                className="min-h-[44px] rounded-xl bg-emerald-800 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-900"
              >
                {listingSaving ? 'Membuat ID...' : 'Simpan ke Daftar Induk'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Ubah Status Daftar Induk (Tidak Menghapus ID) */}
      {statusModalTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSaveMasterStatus}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-4"
          >
            <div>
              <p className="font-mono text-xs font-bold text-emerald-800">
                {statusModalTarget.id_rt}
              </p>
              <h3 className="mt-1 text-lg font-extrabold text-slate-950">
                Status Keberadaan Daftar Induk
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                ID rumah tangga tidak pernah dihapus. Tandai status bila rumah tangga pindah, ganda,
                atau tidak ada.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['aktif', 'Aktif'],
                  ['pindah', 'Pindah'],
                  ['ganda', 'Ganda'],
                  ['tidak_ada', 'Tidak Ada'],
                ] as [StatusDaftar, string][]
              ).map(([st, lbl]) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setEditStatusDaftar(st)}
                  className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold ${
                    editStatusDaftar === st
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-slate-50 text-slate-800'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800">Catatan</label>
              <textarea
                rows={3}
                value={editCatatanDaftar}
                onChange={(e) => setEditCatatanDaftar(e.target.value)}
                placeholder="Tuliskan keterangan pindah/ganda/tidak ditemukan..."
                className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStatusModalTarget(null)}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingMasterStatus}
                className="min-h-[44px] rounded-xl bg-slate-900 px-5 py-2 text-sm font-bold text-white"
              >
                {savingMasterStatus ? 'Menyimpan...' : 'Simpan Status'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Data Rumah Tangga (Khusus Admin) */}
      {deleteTarget && onAdminDeleteHousehold && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-300 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700">
              <Trash2 className="h-5 w-5 shrink-0" />
              <h3 className="text-lg font-extrabold">Hapus Data Rumah Tangga?</h3>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">
              Data <span className="font-mono font-bold">{deleteTarget.id_rt}</span> (
              <strong>{deleteTarget.nama_kk_daftar}</strong>) beserta isian sensus, foto rumah,
              identitas, riwayat kunjungan, dan baris terkait di Google Spreadsheet akan dihapus
              permanen.
            </p>
            {deleteSingleErr && (
              <p className="text-xs font-semibold text-rose-700">{deleteSingleErr}</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deletingSingle}
                onClick={() => setDeleteTarget(null)}
                className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={deletingSingle}
                onClick={async () => {
                  setDeletingSingle(true);
                  setDeleteSingleErr(null);
                  try {
                    await onAdminDeleteHousehold(deleteTarget);
                    setDeleteTarget(null);
                  } catch (err: any) {
                    setDeleteSingleErr(err?.message || 'Gagal menghapus data rumah tangga.');
                  } finally {
                    setDeletingSingle(false);
                  }
                }}
                className="min-h-[44px] rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50"
              >
                {deletingSingle ? 'Menghapus...' : 'Ya, Hapus Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
