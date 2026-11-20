import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { DUSUN_LIST } from '../data/instrumentSpec';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  deleteStaffMember,
  isEnumeratorUnderKoordinator,
  syncStaffMembersFromSpreadsheet,
  upsertStaffMember,
} from '../services/firestoreService';
import {
  fetchStaffFromWebhook,
  parseSpreadsheetStaffRows,
  pushStaffToWebhook,
  pushStaffUpsertSafeToWebhook,
} from '../services/googleSheetsService';
import { SpreadsheetConfig, StaffMember, UserRole, WilayahConfig } from '../types/census';

interface StaffManagementViewProps {
  profile: StaffMember;
  wilayah: WilayahConfig;
  staffList: StaffMember[];
  spreadsheetConfig: SpreadsheetConfig | null;
  isOnline: boolean;
  onStaffSyncedToSheet?: () => void;
}

export const StaffManagementView: React.FC<StaffManagementViewProps> = ({
  profile,
  wilayah,
  staffList,
  spreadsheetConfig,
  isOnline,
  onStaffSyncedToSheet,
}) => {
  const isAdmin = profile.role === 'admin';
  const [showModal, setShowModal] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editingKoordinatorEmail, setEditingKoordinatorEmail] = useState<string | undefined>(
    undefined
  );
  const [externalRtCount, setExternalRtCount] = useState(0);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('enumerator');
  const [assignedRTs, setAssignedRTs] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [rwPickerDusun, setRwPickerDusun] = useState<string>('D1');

  // Spreadsheet Bulk Staff Sync State
  const [sheetBusy, setSheetBusy] = useState<'pull' | 'push' | null>(null);
  const [sheetMsg, setSheetMsg] = useState<string | null>(null);
  const [sheetErr, setSheetErr] = useState<string | null>(null);
  const [sheetRowErrors, setSheetRowErrors] = useState<string[]>([]);

  const koorRtSet = useMemo(() => new Set(profile.assignedRTs || []), [profile.assignedRTs]);

  const allRtsByDusun = useMemo(() => {
    const map = new Map<string, { rw: string; rts: string[] }[]>();
    for (const d of DUSUN_LIST) {
      map.set(d.code, []);
    }
    for (const m of wilayah.rwMappings) {
      const rts = Array.from({ length: m.jumlahRt }, (_, i) => {
        const rtStr = String(i + 1).padStart(2, '0');
        return `${m.dusun}-${m.rw}-${rtStr}`;
      });
      const list = map.get(m.dusun) || [];
      list.push({ rw: m.rw, rts });
      map.set(m.dusun, list);
    }
    return map;
  }, [wilayah]);

  const pickerRtsByDusun = useMemo(() => {
    if (isAdmin) return allRtsByDusun;
    const map = new Map<string, { rw: string; rts: string[] }[]>();
    for (const d of DUSUN_LIST) {
      const rwList = (allRtsByDusun.get(d.code) || [])
        .map((rwItem) => ({
          rw: rwItem.rw,
          rts: rwItem.rts.filter((rt) => koorRtSet.has(rt)),
        }))
        .filter((rwItem) => rwItem.rts.length > 0);
      map.set(d.code, rwList);
    }
    return map;
  }, [isAdmin, allRtsByDusun, koorRtSet]);

  const pickerDusuns = useMemo(() => {
    if (isAdmin) return DUSUN_LIST;
    return DUSUN_LIST.filter((d) => (pickerRtsByDusun.get(d.code) || []).length > 0);
  }, [isAdmin, pickerRtsByDusun]);

  const koorTerritoryGroups = useMemo(() => {
    if (isAdmin) return [];
    const groups: { dusun: string; rw: string; rts: string[] }[] = [];
    for (const d of DUSUN_LIST) {
      for (const rwItem of pickerRtsByDusun.get(d.code) || []) {
        groups.push({ dusun: d.code, rw: rwItem.rw, rts: rwItem.rts });
      }
    }
    return groups;
  }, [isAdmin, pickerRtsByDusun]);

  const visibleStaff = useMemo(() => {
    if (isAdmin) return staffList;
    return staffList.filter((s) => isEnumeratorUnderKoordinator(s, profile));
  }, [isAdmin, staffList, profile]);

  const openCreate = () => {
    setEditingEmail(null);
    setEditingKoordinatorEmail(undefined);
    setExternalRtCount(0);
    setEmail('');
    setName('');
    setRole('enumerator');
    if (!isAdmin && (profile.assignedRTs || []).length === 1) {
      setAssignedRTs([...(profile.assignedRTs || [])]);
    } else {
      setAssignedRTs([]);
    }
    setRwPickerDusun(pickerDusuns[0]?.code || 'D1');
    setActive(true);
    setErrMsg(null);
    setShowModal(true);
  };

  const openEdit = (s: StaffMember) => {
    setEditingEmail(s.email);
    setEditingKoordinatorEmail(s.koordinatorEmail);
    setEmail(s.email);
    setName(s.name);
    setRole(s.role);
    if (!isAdmin) {
      const editableRts = (s.assignedRTs || []).filter((rt) => koorRtSet.has(rt));
      setExternalRtCount((s.assignedRTs || []).length - editableRts.length);
      setAssignedRTs(editableRts);
      setRwPickerDusun(editableRts[0]?.split('-')[0] || pickerDusuns[0]?.code || 'D1');
    } else {
      setExternalRtCount(0);
      setAssignedRTs(s.assignedRTs || []);
      setRwPickerDusun(s.assignedRTs?.[0]?.split('-')[0] || 'D1');
    }
    setActive(s.active);
    setErrMsg(null);
    setShowModal(true);
  };

  const toggleRt = (rtKey: string) => {
    if (!isAdmin && !koorRtSet.has(rtKey)) return;
    setAssignedRTs((prev) =>
      prev.includes(rtKey) ? prev.filter((x) => x !== rtKey) : [...prev, rtKey]
    );
  };

  const toggleRwAll = (rts: string[]) => {
    const allowedRts = isAdmin ? rts : rts.filter((r) => koorRtSet.has(r));
    if (allowedRts.length === 0) return;
    const allSelected = allowedRts.every((r) => assignedRTs.includes(r));
    if (allSelected) {
      setAssignedRTs((prev) => prev.filter((r) => !allowedRts.includes(r)));
    } else {
      setAssignedRTs((prev) => Array.from(new Set([...prev, ...allowedRts])));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !name.trim()) {
      setErrMsg('Email Google dan nama lengkap wajib diisi.');
      return;
    }
    if (!isAdmin && role !== 'enumerator') {
      setErrMsg('Koordinator hanya dapat mendaftarkan atau mengubah Enumerator.');
      return;
    }

    const effectiveRole: UserRole = isAdmin ? role : 'enumerator';
    const scopedSelectedRts = !isAdmin
      ? assignedRTs.filter((rt) => koorRtSet.has(rt))
      : assignedRTs;

    if (!isAdmin) {
      if (koorRtSet.size === 0) {
        setErrMsg(
          'Akun Koordinator Anda belum memiliki wilayah tugas (RW/RT). Hubungi Admin terlebih dahulu.'
        );
        return;
      }
      if (scopedSelectedRts.length === 0) {
        setErrMsg(
          'Pilih minimal 1 RT di dalam wilayah tugas Anda untuk Enumerator ini.'
        );
        return;
      }
    }

    const effectiveAssignedRTs = effectiveRole === 'admin' ? [] : scopedSelectedRts;
    const savedStaff: StaffMember = {
      email: cleanEmail,
      name: name.trim(),
      role: effectiveRole,
      assignedRTs: effectiveAssignedRTs,
      koordinatorEmail: !isAdmin
        ? profile.email.toLowerCase()
        : effectiveRole === 'enumerator'
        ? editingKoordinatorEmail
        : undefined,
      active,
      createdBy: profile.email,
    };

    setSaving(true);
    setErrMsg(null);
    setSheetMsg(null);
    setSheetErr(null);
    setSheetRowErrors([]);

    try {
      await upsertStaffMember(
        {
          email: savedStaff.email,
          name: savedStaff.name,
          role: savedStaff.role,
          assignedRTs: savedStaff.assignedRTs,
          koordinatorEmail: savedStaff.koordinatorEmail,
          active: savedStaff.active,
        },
        profile.email
      );

      if (spreadsheetConfig?.webhookUrl && isOnline) {
        try {
          const updatedAdminStaffList = isAdmin
            ? (() => {
                const exists = staffList.some(
                  (s) => s.email.toLowerCase() === savedStaff.email
                );
                const next = exists
                  ? staffList.map((s) =>
                      s.email.toLowerCase() === savedStaff.email
                        ? { ...s, ...savedStaff }
                        : s
                    )
                  : [...staffList, savedStaff];
                return [...next].sort((a, b) => a.name.localeCompare(b.name, 'id'));
              })()
            : undefined;

          await pushStaffUpsertSafeToWebhook({
            webhookUrl: spreadsheetConfig.webhookUrl,
            actorRole: profile.role,
            savedStaff,
            updatedAdminStaffList,
            wilayah,
          });
          onStaffSyncedToSheet?.();
          setSheetMsg(
            `Petugas "${savedStaff.name}" (${savedStaff.email} · role: ${savedStaff.role}) tersimpan di aplikasi dan otomatis dikirim ke tab "petugas" Google Spreadsheet.`
          );
        } catch (sheetPushErr: any) {
          setSheetErr(
            `Petugas tersimpan di aplikasi, namun gagal mengirim ke Google Spreadsheet: ${sheetPushErr?.message || 'Periksa koneksi atau URL Web App Apps Script.'}`
          );
        }
      } else if (spreadsheetConfig?.webhookUrl && !isOnline) {
        setSheetMsg(
          `Petugas "${savedStaff.name}" tersimpan di aplikasi (perangkat sedang luring). Klik "Kirim Daftar Petugas ke Tab \\"petugas\\"" saat daring agar Spreadsheet ikut terbarui.`
        );
      } else {
        setSheetMsg(
          `Petugas "${savedStaff.name}" tersimpan di aplikasi. Atur URL Web App Spreadsheet di menu Admin & Sheet jika ingin otomatis masuk ke tab "petugas".`
        );
      }

      setShowModal(false);
    } catch (err: any) {
      const rawMsg = String(err?.message || '');
      if (
        rawMsg.includes('Missing or insufficient permissions') ||
        rawMsg.includes('permission-denied')
      ) {
        setErrMsg(
          'Izin Firestore ditolak: pastikan email tersebut belum terdaftar di wilayah/peran lain dan seluruh RT yang dipilih berada di dalam wilayah tugas Anda.'
        );
      } else {
        setErrMsg(rawMsg || 'Gagal menyimpan data petugas.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetEmail: string) => {
    if (!isAdmin || targetEmail === BOOTSTRAP_ADMIN_EMAIL) return;
    setSheetMsg(null);
    setSheetErr(null);
    await deleteStaffMember(targetEmail);

    if (spreadsheetConfig?.webhookUrl && isOnline) {
      try {
        const remainingList = staffList.filter(
          (s) => s.email.toLowerCase() !== targetEmail.toLowerCase()
        );
        await pushStaffToWebhook(spreadsheetConfig.webhookUrl, remainingList);
        onStaffSyncedToSheet?.();
        setSheetMsg(
          `Petugas ${targetEmail} dihapus dari aplikasi dan tab "petugas" Google Spreadsheet telah diperbarui.`
        );
      } catch (sheetPushErr: any) {
        setSheetErr(
          `Petugas dihapus dari aplikasi, tetapi gagal memperbarui Spreadsheet: ${sheetPushErr?.message || 'Coba tekan Kirim Daftar Petugas secara manual.'}`
        );
      }
    }
  };

  const handlePullFromSpreadsheet = async () => {
    if (!spreadsheetConfig?.webhookUrl || !isOnline) return;
    setSheetBusy('pull');
    setSheetMsg(null);
    setSheetErr(null);
    setSheetRowErrors([]);
    try {
      const res = await syncStaffMembersFromSpreadsheet({
        webhookUrl: spreadsheetConfig.webhookUrl,
        wilayah,
        actorEmail: profile.email,
        actorRole: profile.role,
        actorAssignedRTs: profile.assignedRTs || [],
        replaceRemoved: isAdmin,
      });
      setSheetRowErrors(res.errors);
      if (res.emptySheet) {
        setSheetMsg(
          isAdmin
            ? 'Tab "petugas" di Google Spreadsheet masih kosong. Klik "Kirim Daftar Petugas ke Tab \\"petugas\\"" untuk membuat contoh kolom & mengisi daftar awal.'
            : 'Belum ada data Enumerator di tab "petugas" Spreadsheet yang termasuk wilayah tugas Anda.'
        );
      } else {
        setSheetMsg(
          `Sinkronisasi dari Spreadsheet selesai (${res.totalSheetRows} baris wilayah Anda dibaca): ${res.created} ditambahkan, ${res.updated} diperbarui, ${res.removed} dihapus/diganti emailnya, ${res.unchanged} sudah sesuai.`
        );
      }
    } catch (err: any) {
      setSheetErr(err?.message || 'Gagal mengambil daftar petugas dari Google Spreadsheet.');
    } finally {
      setSheetBusy(null);
    }
  };

  const handlePushToSpreadsheet = async () => {
    if (!spreadsheetConfig?.webhookUrl || !isOnline) return;
    setSheetBusy('push');
    setSheetMsg(null);
    setSheetErr(null);
    setSheetRowErrors([]);
    try {
      if (isAdmin) {
        await pushStaffToWebhook(spreadsheetConfig.webhookUrl, visibleStaff);
        onStaffSyncedToSheet?.();
        setSheetMsg(
          `Berhasil mengirim ${visibleStaff.length} data petugas ke tab "petugas" di Google Spreadsheet. Sekarang Anda dapat mengedit, menambah massal, atau mengubah email langsung di tab tersebut.`
        );
      } else {
        const rawRows = await fetchStaffFromWebhook(spreadsheetConfig.webhookUrl);
        const { validRows } = parseSpreadsheetStaffRows(rawRows, wilayah);
        const mergedMap = new Map<string, StaffMember>();
        for (const r of validRows) {
          const sheetMember: StaffMember = {
            email: r.email.toLowerCase(),
            name: r.name,
            role: r.role,
            assignedRTs: r.assignedRTs,
            koordinatorEmail: r.koordinatorEmail,
            active: r.active,
            createdBy: 'spreadsheet',
          };
          // Pertahankan Admin, Koordinator lain, dan Enumerator milik RW/Koordinator lain
          if (r.role !== 'enumerator' || !isEnumeratorUnderKoordinator(sheetMember, profile)) {
            mergedMap.set(sheetMember.email, sheetMember);
          }
        }
        for (const enumStaff of visibleStaff) {
          mergedMap.set(enumStaff.email.toLowerCase(), enumStaff);
        }
        const mergedList = Array.from(mergedMap.values()).sort((a, b) =>
          a.name.localeCompare(b.name, 'id')
        );
        await pushStaffToWebhook(spreadsheetConfig.webhookUrl, mergedList);
        onStaffSyncedToSheet?.();
        setSheetMsg(
          `Berhasil mengirim ${visibleStaff.length} data Enumerator wilayah Anda ke tab "petugas" Google Spreadsheet tanpa menghapus baris Admin, Koordinator, maupun RW lainnya.`
        );
      }
    } catch (err: any) {
      setSheetErr(
        err?.message ||
          'Gagal mengirim daftar petugas ke Google Spreadsheet. Jika masuk sebagai Koordinator, pastikan Apps Script sudah diperbarui agar mendukung fungsi baca (doGet) atau minta Admin mengirim daftar lengkap.'
      );
    } finally {
      setSheetBusy(null);
    }
  };

  const roleLabels: Record<UserRole, string> = {
    admin: 'Admin (I\'ComDev)',
    koordinator: 'Koordinator Enumerator',
    enumerator: 'Enumerator',
  };

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">
              {isAdmin ? 'Manajemen Petugas & Penugasan RT' : 'Kelola Enumerator Wilayah Anda'}
            </h2>
            <p className="text-xs text-slate-600">
              {isAdmin
                ? 'Admin dapat menambah/mengubah petugas langsung di aplikasi (email & role otomatis masuk ke tab "petugas" Spreadsheet) atau input massal lewat Google Spreadsheet.'
                : 'Anda hanya melihat dan mengelola Enumerator yang berada di bawah wilayah tugas Anda. Penambahan Enumerator dibatasi pada RW/RT tugas Anda.'}
            </p>
          </div>

          <button
            type="button"
            onClick={openCreate}
            disabled={!isAdmin && koorRtSet.size === 0}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>{isAdmin ? 'Tambah Petugas' : 'Tambah Enumerator'}</span>
          </button>
        </div>

        {!isAdmin && (
          <div
            className={`rounded-xl border px-3.5 py-2.5 text-xs ${
              koorRtSet.size === 0
                ? 'border-amber-300 bg-amber-50 text-amber-950'
                : 'border-sky-200 bg-sky-50 text-sky-950'
            }`}
          >
            {koorRtSet.size === 0 ? (
              <p className="font-semibold">
                Wilayah tugas Koordinator Anda masih kosong. Hubungi Admin untuk menugaskan RW/RT agar Anda dapat menambah dan mengelola Enumerator.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold">Wilayah Tugas Anda ({koorRtSet.size} RT):</span>
                {koorTerritoryGroups.map((g) => (
                  <span
                    key={`${g.dusun}-${g.rw}`}
                    className="rounded-lg border border-sky-300 bg-white px-2 py-0.5 font-mono text-[11px] font-bold text-sky-900"
                  >
                    {g.dusun} · RW {g.rw} ({g.rts.length} RT)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Google Spreadsheet Bulk Staff Management Card */}
      <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-950">
                Sinkronisasi Dua Arah Google Spreadsheet (Acuan Login)
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
                Petugas yang ditambahkan atau diubah di aplikasi otomatis dikirim ke tab{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono font-bold text-slate-900">
                  petugas
                </code>{' '}
                Spreadsheet. Anda juga tetap bisa input massal atau ganti email langsung di tab
                tersebut lalu menariknya ke aplikasi.
              </p>
            </div>
          </div>

          {spreadsheetConfig?.spreadsheetUrl && (
            <a
              href={spreadsheetConfig.spreadsheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>Buka Spreadsheet</span>
            </a>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-700 space-y-1">
          <p className="font-bold text-slate-900">
            Format Kolom Tab <span className="font-mono">petugas</span>:
          </p>
          <p className="font-mono text-slate-900">
            email | nama | role | rt_tugas | aktif | koordinator_email
          </p>
          <p>
            • <strong>role</strong>: <code>enumerator</code>, <code>koordinator</code>, atau{' '}
            <code>admin</code> · <strong>aktif</strong>: <code>ya</code> / <code>tidak</code>
          </p>
          <p>
            • <strong>rt_tugas</strong>: pisahkan dengan koma (mis.{' '}
            <code>D1-01-01, D1-01-02</code>) atau tulis kode RW untuk semua RT di RW tersebut (mis.{' '}
            <code>D1-01</code>).
          </p>
        </div>

        {!spreadsheetConfig?.webhookUrl ? (
          <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Tautan Google Spreadsheet belum diatur. Atur URL Web App Apps Script di menu{' '}
              <strong>Admin &amp; Sheet</strong> terlebih dahulu.
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!isOnline || sheetBusy !== null}
              onClick={handlePullFromSpreadsheet}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {sheetBusy === 'pull' ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>
                {sheetBusy === 'pull'
                  ? 'Menarik dari Spreadsheet...'
                  : 'Tarik & Sinkron dari Spreadsheet'}
              </span>
            </button>

            <button
              type="button"
              disabled={!isOnline || sheetBusy !== null}
              onClick={handlePushToSpreadsheet}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              <span>
                {sheetBusy === 'push'
                  ? 'Mengirim ke Spreadsheet...'
                  : 'Kirim Daftar Petugas ke Tab "petugas"'}
              </span>
            </button>
          </div>
        )}

        {sheetMsg && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <span>{sheetMsg}</span>
          </div>
        )}

        {sheetErr && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-semibold text-rose-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
            <span>{sheetErr}</span>
          </div>
        )}

        {sheetRowErrors.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
            <p className="font-bold">Catatan baris di Spreadsheet yang dilewati/perlu diperiksa:</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5">
              {sheetRowErrors.slice(0, 8).map((er, i) => (
                <li key={i}>{er}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        {visibleStaff.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            Belum ada petugas terdaftar pada daftar ini.
          </div>
        ) : (
          visibleStaff.map((s) => (
            <div
              key={s.email}
              className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded-md px-2 py-0.5 font-bold ${
                      s.role === 'admin'
                        ? 'bg-slate-900 text-white'
                        : s.role === 'koordinator'
                        ? 'bg-sky-100 text-sky-900'
                        : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    {roleLabels[s.role]}
                  </span>
                  <span>·</span>
                  <span className={s.active ? 'font-bold text-emerald-700' : 'font-bold text-rose-700'}>
                    {s.active ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>
                <p className="text-base font-bold text-slate-950">{s.name}</p>
                <p className="font-mono text-xs text-slate-600">{s.email}</p>
                <p className="text-xs text-slate-500">
                  {s.role === 'admin'
                    ? 'Akses seluruh 85 RT Desa Cibiru Wetan'
                    : s.assignedRTs && s.assignedRTs.length > 0
                    ? `Wilayah tugas (${s.assignedRTs.length} RT): ${s.assignedRTs.slice(0, 6).join(', ')}${
                        s.assignedRTs.length > 6 ? ` (+${s.assignedRTs.length - 6} lainnya)` : ''
                      }`
                    : 'Belum ada RT ditugaskan'}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEdit(s)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Ubah</span>
                </button>
                {isAdmin && s.email !== BOOTSTRAP_ADMIN_EMAIL && (
                  <button
                    type="button"
                    onClick={() => handleDelete(s.email)}
                    className="inline-flex min-h-[42px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-700 hover:bg-rose-100"
                    title="Hapus petugas"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Staff Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handleSave}
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="border-b border-slate-200 px-6 py-4">
              <div className="flex items-center gap-2 text-emerald-900">
                <Users className="h-5 w-5" />
                <h3 className="text-lg font-extrabold text-slate-950">
                  {editingEmail ? 'Ubah Data Petugas' : 'Daftarkan Petugas Baru'}
                </h3>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800">
                    Email Google <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    disabled={Boolean(editingEmail)}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@gmail.com"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 font-mono text-sm text-slate-900 disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800">
                    Nama Lengkap <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama enumerator / koordinator"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900"
                  />
                </div>
              </div>

              {isAdmin && (
                <div>
                  <label className="block text-xs font-bold text-slate-800">Peran (Role)</label>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(['enumerator', 'koordinator', 'admin'] as UserRole[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r)}
                        className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold ${
                          role === r
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-300 bg-slate-50 text-slate-800'
                        }`}
                      >
                        {roleLabels[r]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-900">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-4 w-4 accent-emerald-800"
                />
                <span>Status Petugas Aktif (dapat masuk ke aplikasi)</span>
              </label>

              {role !== 'admin' && (
                <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-extrabold text-slate-900">
                        Penugasan Wilayah RT ({assignedRTs.length} RT terpilih)
                      </p>
                      {!isAdmin && (
                        <p className="text-[11px] text-slate-500">
                          Hanya menampilkan RT dalam wilayah tugas Koordinator Anda.
                        </p>
                      )}
                    </div>
                    {pickerDusuns.length > 0 && (
                      <div className="flex gap-1">
                        {pickerDusuns.map((d) => (
                          <button
                            key={d.code}
                            type="button"
                            onClick={() => setRwPickerDusun(d.code)}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                              rwPickerDusun === d.code
                                ? 'bg-emerald-800 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {d.code}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {!isAdmin && externalRtCount > 0 && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-950">
                      Enumerator ini sebelumnya memiliki {externalRtCount} RT di luar wilayah Anda. Menyimpan lewat Koordinator hanya akan menugaskan RT di wilayah Anda.
                    </div>
                  )}

                  {(pickerRtsByDusun.get(rwPickerDusun) || []).length === 0 ? (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-950">
                      Belum ada wilayah RW/RT yang ditugaskan untuk akun Anda. Hubungi Admin.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {(pickerRtsByDusun.get(rwPickerDusun) || []).map((rwItem) => {
                        const allChecked = rwItem.rts.every((r) => assignedRTs.includes(r));
                        return (
                          <div key={rwItem.rw} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                            <div className="flex items-center justify-between gap-2 pb-2">
                              <span className="font-mono text-xs font-bold text-slate-900">
                                RW {rwItem.rw}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleRwAll(rwItem.rts)}
                                className="text-[11px] font-bold text-emerald-800 hover:underline"
                              >
                                {allChecked ? 'Batal Semua RW Ini' : 'Pilih Semua RW Ini'}
                              </button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {rwItem.rts.map((rtKey) => {
                                const checked = assignedRTs.includes(rtKey);
                                const rtNum = rtKey.split('-')[2];
                                return (
                                  <button
                                    key={rtKey}
                                    type="button"
                                    onClick={() => toggleRt(rtKey)}
                                    className={`min-h-[36px] min-w-[54px] rounded-lg border px-2 py-1 font-mono text-xs font-bold transition ${
                                      checked
                                        ? 'border-emerald-800 bg-emerald-800 text-white'
                                        : 'border-slate-300 bg-white text-slate-700'
                                    }`}
                                  >
                                    RT {rtNum}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {errMsg && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800">
                  {errMsg}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-800 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-900"
              >
                <UserCheck className="h-4 w-4" />
                {saving ? 'Menyimpan...' : 'Simpan Petugas'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
