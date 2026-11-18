import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Trash2, UserCheck, Users } from 'lucide-react';
import { DUSUN_LIST } from '../data/instrumentSpec';
import { BOOTSTRAP_ADMIN_EMAIL, deleteStaffMember, upsertStaffMember } from '../services/firestoreService';
import { StaffMember, UserRole, WilayahConfig } from '../types/census';

interface StaffManagementViewProps {
  profile: StaffMember;
  wilayah: WilayahConfig;
  staffList: StaffMember[];
}

export const StaffManagementView: React.FC<StaffManagementViewProps> = ({
  profile,
  wilayah,
  staffList,
}) => {
  const isAdmin = profile.role === 'admin';
  const [showModal, setShowModal] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('enumerator');
  const [assignedRTs, setAssignedRTs] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [rwPickerDusun, setRwPickerDusun] = useState<string>('D1');

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

  const visibleStaff = useMemo(() => {
    if (isAdmin) return staffList;
    return staffList.filter((s) => s.role === 'enumerator');
  }, [isAdmin, staffList]);

  const openCreate = () => {
    setEditingEmail(null);
    setEmail('');
    setName('');
    setRole('enumerator');
    setAssignedRTs([]);
    setActive(true);
    setErrMsg(null);
    setShowModal(true);
  };

  const openEdit = (s: StaffMember) => {
    setEditingEmail(s.email);
    setEmail(s.email);
    setName(s.name);
    setRole(s.role);
    setAssignedRTs(s.assignedRTs || []);
    setActive(s.active);
    setErrMsg(null);
    setShowModal(true);
  };

  const toggleRt = (rtKey: string) => {
    setAssignedRTs((prev) =>
      prev.includes(rtKey) ? prev.filter((x) => x !== rtKey) : [...prev, rtKey]
    );
  };

  const toggleRwAll = (rts: string[]) => {
    const allSelected = rts.every((r) => assignedRTs.includes(r));
    if (allSelected) {
      setAssignedRTs((prev) => prev.filter((r) => !rts.includes(r)));
    } else {
      setAssignedRTs((prev) => Array.from(new Set([...prev, ...rts])));
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
    setSaving(true);
    setErrMsg(null);
    try {
      await upsertStaffMember(
        {
          email: cleanEmail,
          name: name.trim(),
          role: isAdmin ? role : 'enumerator',
          assignedRTs,
          koordinatorEmail: !isAdmin ? profile.email : undefined,
          active,
        },
        profile.email
      );
      setShowModal(false);
    } catch (err: any) {
      setErrMsg(err?.message || 'Gagal menyimpan data petugas.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (targetEmail: string) => {
    if (!isAdmin || targetEmail === BOOTSTRAP_ADMIN_EMAIL) return;
    await deleteStaffMember(targetEmail);
  };

  const roleLabels: Record<UserRole, string> = {
    admin: 'Admin (I\'ComDev)',
    koordinator: 'Koordinator Enumerator',
    enumerator: 'Enumerator',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-extrabold text-slate-950">
            {isAdmin ? 'Manajemen Petugas & Penugasan RT' : 'Kelola Enumerator'}
          </h2>
          <p className="text-xs text-slate-600">
            {isAdmin
              ? 'Admin dapat mendaftarkan Admin, Koordinator Enumerator, dan Enumerator serta mengatur RT tugas.'
              : 'Koordinator Enumerator dapat mendaftarkan, mengubah, dan menugaskan Enumerator ke RT.'}
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-900"
        >
          <Plus className="h-4 w-4" />
          <span>{isAdmin ? 'Tambah Petugas' : 'Tambah Enumerator'}</span>
        </button>
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
                    <p className="text-xs font-extrabold text-slate-900">
                      Penugasan Wilayah RT ({assignedRTs.length} RT terpilih)
                    </p>
                    <div className="flex gap-1">
                      {DUSUN_LIST.map((d) => (
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
                  </div>

                  <div className="space-y-2.5">
                    {(allRtsByDusun.get(rwPickerDusun) || []).map((rwItem) => {
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
