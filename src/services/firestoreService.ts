import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { DEFAULT_RW_MAPPINGS_85 } from '../data/instrumentSpec';
import {
  CensusDraft,
  DusunCode,
  HouseholdPiiRecord,
  HouseholdRecord,
  MemberPiiItem,
  RevisionLogRecord,
  RwMapping,
  SpreadsheetConfig,
  StaffMember,
  StatusDaftar,
  SumberDaftar,
  UserRole,
  VerifikasiStatus,
  VisitRecord,
  WilayahConfig,
} from '../types/census';
import { cleanCensusData, computeJsonDiffs, stripUndefined } from '../utils/xlsformValidation';

export const BOOTSTRAP_ADMIN_EMAIL = 'arisriswanto057@gmail.com';

const DRAFT_STORAGE_PREFIX = 'cbw_census_draft_v1_';

export function saveLocalDraft(draft: CensusDraft): void {
  try {
    localStorage.setItem(
      `${DRAFT_STORAGE_PREFIX}${draft.id_rt}`,
      JSON.stringify({ ...draft, updatedLocallyAt: new Date().toISOString() })
    );
  } catch (e) {
    console.warn('Gagal menyimpan draf lokal (kuota penyimpanan penuh?):', e);
  }
}

export function loadLocalDraft(id_rt: string): CensusDraft | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_STORAGE_PREFIX}${id_rt}`);
    if (!raw) return null;
    return JSON.parse(raw) as CensusDraft;
  } catch {
    return null;
  }
}

export function clearLocalDraft(id_rt: string): void {
  try {
    localStorage.removeItem(`${DRAFT_STORAGE_PREFIX}${id_rt}`);
  } catch {
    // ignore
  }
}

export async function ensureBootstrapSetup(userEmail: string, userName: string): Promise<void> {
  const emailLower = userEmail.toLowerCase();
  if (emailLower !== BOOTSTRAP_ADMIN_EMAIL) return;

  try {
    const staffRef = doc(db, 'staff_members', emailLower);
    const staffSnap = await getDoc(staffRef);
    if (!staffSnap.exists()) {
      await setDoc(staffRef, {
        email: emailLower,
        name: userName || 'Admin I\'ComDev',
        role: 'admin',
        assignedRTs: [],
        active: true,
        createdBy: emailLower,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    const wilayahRef = doc(db, 'config', 'wilayah');
    const wilayahSnap = await getDoc(wilayahRef);
    if (!wilayahSnap.exists()) {
      const totalRt = DEFAULT_RW_MAPPINGS_85.reduce((sum, m) => sum + m.jumlahRt, 0);
      await setDoc(wilayahRef, {
        rwMappings: DEFAULT_RW_MAPPINGS_85,
        totalRt,
        updatedBy: emailLower,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'bootstrap');
  }
}

export function subscribeMyStaffProfile(
  email: string,
  onData: (staff: StaffMember | null) => void
): Unsubscribe {
  const emailLower = email.toLowerCase();
  const ref = doc(db, 'staff_members', emailLower);
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as StaffMember);
      } else if (emailLower === BOOTSTRAP_ADMIN_EMAIL) {
        onData({
          email: emailLower,
          name: 'Admin I\'ComDev',
          role: 'admin',
          assignedRTs: [],
          active: true,
          createdBy: emailLower,
        });
      } else {
        onData(null);
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, `staff_members/${emailLower}`)
  );
}

export function subscribeWilayahConfig(onData: (cfg: WilayahConfig) => void): Unsubscribe {
  const ref = doc(db, 'config', 'wilayah');
  return onSnapshot(
    ref,
    (snap) => {
      if (snap.exists()) {
        onData(snap.data() as WilayahConfig);
      } else {
        onData({
          rwMappings: DEFAULT_RW_MAPPINGS_85,
          totalRt: 85,
          updatedBy: 'default',
        });
      }
    },
    (err) => handleFirestoreError(err, OperationType.GET, 'config/wilayah')
  );
}

export async function saveWilayahConfig(
  rwMappings: RwMapping[],
  updatedBy: string
): Promise<void> {
  const totalRt = rwMappings.reduce((acc, item) => acc + (Number(item.jumlahRt) || 0), 0);
  try {
    await setDoc(doc(db, 'config', 'wilayah'), {
      rwMappings,
      totalRt,
      updatedBy: updatedBy.toLowerCase(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'config/wilayah');
  }
}

export function subscribeSpreadsheetConfig(
  onData: (cfg: SpreadsheetConfig | null) => void
): Unsubscribe {
  const ref = doc(db, 'config', 'spreadsheet');
  return onSnapshot(
    ref,
    (snap) => {
      onData(snap.exists() ? (snap.data() as SpreadsheetConfig) : null);
    },
    (err) => handleFirestoreError(err, OperationType.GET, 'config/spreadsheet')
  );
}

export async function saveSpreadsheetConfig(
  cfg: Omit<SpreadsheetConfig, 'updatedAt'>
): Promise<void> {
  try {
    await setDoc(
      doc(db, 'config', 'spreadsheet'),
      stripUndefined({
        ...cfg,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'config/spreadsheet');
  }
}

export function subscribeStaffList(
  role: UserRole,
  onData: (staff: StaffMember[]) => void
): Unsubscribe {
  if (role === 'enumerator') {
    onData([]);
    return () => {};
  }
  const colRef = collection(db, 'staff_members');
  const q =
    role === 'admin'
      ? colRef
      : query(colRef, where('role', '==', 'enumerator'));

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as StaffMember);
      list.sort((a, b) => a.name.localeCompare(b.name, 'id'));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'staff_members')
  );
}

export async function upsertStaffMember(
  staff: {
    email: string;
    name: string;
    role: UserRole;
    assignedRTs: string[];
    koordinatorEmail?: string;
    active: boolean;
  },
  actorEmail: string
): Promise<void> {
  const emailLower = staff.email.trim().toLowerCase();
  const ref = doc(db, 'staff_members', emailLower);
  try {
    const existingSnap = await getDoc(ref);
    const basePayload = {
      email: emailLower,
      name: staff.name.trim(),
      role: staff.role,
      assignedRTs: Array.from(new Set(staff.assignedRTs)).slice(0, 120),
      ...(staff.koordinatorEmail ? { koordinatorEmail: staff.koordinatorEmail.trim().toLowerCase() } : {}),
      active: staff.active,
      updatedAt: serverTimestamp(),
    };
    if (existingSnap.exists()) {
      const prev = existingSnap.data();
      await setDoc(ref, {
        ...basePayload,
        createdBy: prev.createdBy || actorEmail.toLowerCase(),
        createdAt: prev.createdAt || serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        ...basePayload,
        createdBy: actorEmail.toLowerCase(),
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `staff_members/${emailLower}`);
  }
}

export async function deleteStaffMember(email: string): Promise<void> {
  const emailLower = email.trim().toLowerCase();
  if (emailLower === BOOTSTRAP_ADMIN_EMAIL) return;
  try {
    await deleteDoc(doc(db, 'staff_members', emailLower));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `staff_members/${emailLower}`);
  }
}

function subscribeChunkedByRt<T>(
  collectionName: string,
  role: UserRole,
  assignedRTs: string[],
  onData: (items: T[]) => void
): Unsubscribe {
  if (role === 'admin') {
    return onSnapshot(
      collection(db, collectionName),
      (snap) => {
        onData(snap.docs.map((d) => d.data() as T));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, collectionName)
    );
  }

  if (!assignedRTs || assignedRTs.length === 0) {
    onData([]);
    return () => {};
  }

  const chunks: string[][] = [];
  for (let i = 0; i < assignedRTs.length; i += 30) {
    chunks.push(assignedRTs.slice(i, i + 30));
  }

  const chunkResults = new Map<number, T[]>();
  const unsubs = chunks.map((chunk, idx) => {
    const q = query(collection(db, collectionName), where('rtKey', 'in', chunk));
    return onSnapshot(
      q,
      (snap) => {
        chunkResults.set(
          idx,
          snap.docs.map((d) => d.data() as T)
        );
        const merged: T[] = [];
        chunkResults.forEach((arr) => merged.push(...arr));
        onData(merged);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, collectionName)
    );
  });

  return () => {
    unsubs.forEach((u) => u());
  };
}

export function subscribeHouseholds(
  role: UserRole,
  assignedRTs: string[],
  onData: (items: HouseholdRecord[]) => void
): Unsubscribe {
  return subscribeChunkedByRt<HouseholdRecord>('households', role, assignedRTs, (list) => {
    list.sort((a, b) => a.id_rt.localeCompare(b.id_rt));
    onData(list);
  });
}

export function subscribeHouseholdPii(
  role: UserRole,
  assignedRTs: string[],
  onData: (items: HouseholdPiiRecord[]) => void
): Unsubscribe {
  return subscribeChunkedByRt<HouseholdPiiRecord>('household_pii', role, assignedRTs, onData);
}

export function subscribeVisits(
  role: UserRole,
  assignedRTs: string[],
  onData: (items: VisitRecord[]) => void
): Unsubscribe {
  return subscribeChunkedByRt<VisitRecord>('visits', role, assignedRTs, (list) => {
    list.sort((a, b) => b.waktu.localeCompare(a.waktu));
    onData(list);
  });
}

export function subscribeRevisionLogs(
  role: UserRole,
  assignedRTs: string[],
  onData: (items: RevisionLogRecord[]) => void
): Unsubscribe {
  return subscribeChunkedByRt<RevisionLogRecord>('revision_logs', role, assignedRTs, onData);
}

export async function getHouseholdPhoto(id_rt: string): Promise<string | null> {
  try {
    const snap = await getDoc(doc(db, 'household_photos', id_rt));
    if (snap.exists()) {
      return (snap.data() as { dataUrl?: string }).dataUrl ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export async function createHouseholdListingTransactional(
  params: {
    dusun: DusunCode;
    rw: string;
    rt: string;
    no_bangunan: string;
    nama_kk_daftar: string;
    alamat: string;
    sumber: SumberDaftar;
  },
  actorEmail: string
): Promise<HouseholdRecord> {
  const rwPad = params.rw.padStart(2, '0');
  const rtPad = params.rt.padStart(2, '0');
  const rtKey = `${params.dusun}-${rwPad}-${rtPad}`;
  const counterRef = doc(db, 'rt_counters', rtKey);

  try {
    const created = await runTransaction(db, async (tx) => {
      const counterSnap = await tx.get(counterRef);
      const prevNumber = counterSnap.exists() ? (counterSnap.data().lastNumber as number) : 0;
      const nextNumber = prevNumber + 1;
      if (nextNumber > 999) {
        throw new Error(`Nomor urut RT ${rtKey} melebihi batas 999.`);
      }
      const urutanStr = String(nextNumber).padStart(3, '0');
      const id_rt = `CBW-${rtKey}-${urutanStr}`;
      const hhRef = doc(db, 'households', id_rt);

      const record: HouseholdRecord = {
        id_rt,
        dusun: params.dusun,
        rw: rwPad,
        rt: rtPad,
        rtKey,
        urutan: nextNumber,
        no_bangunan: params.no_bangunan.trim().slice(0, 30),
        nama_kk_daftar: params.nama_kk_daftar.trim().slice(0, 150),
        alamat: params.alamat.trim().slice(0, 300),
        sumber: params.sumber,
        status_daftar: 'aktif',
        status_cacah: 'belum_dikunjungi',
        verifikasi_status: 'belum',
        createdBy: actorEmail.toLowerCase().slice(0, 200),
      };

      tx.set(counterRef, {
        rtKey,
        lastNumber: nextNumber,
        updatedAt: serverTimestamp(),
      });

      tx.set(hhRef, {
        ...record,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return record;
    });

    return created;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `households/${rtKey}`);
  }
}

export async function importHouseholdsCsvBatch(
  rows: {
    dusun: DusunCode;
    rw: string;
    rt: string;
    no_bangunan: string;
    nama_kk: string;
    alamat: string;
    sumber: SumberDaftar;
  }[],
  actorEmail: string
): Promise<{ imported: number; ids: string[] }> {
  const byRt = new Map<string, typeof rows>();
  for (const r of rows) {
    const rwPad = r.rw.padStart(2, '0');
    const rtPad = r.rt.padStart(2, '0');
    const rtKey = `${r.dusun}-${rwPad}-${rtPad}`;
    const list = byRt.get(rtKey) ?? [];
    list.push({ ...r, rw: rwPad, rt: rtPad });
    byRt.set(rtKey, list);
  }

  const createdIds: string[] = [];
  for (const [rtKey, group] of byRt.entries()) {
    const counterRef = doc(db, 'rt_counters', rtKey);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(counterRef);
        let current = snap.exists() ? (snap.data().lastNumber as number) : 0;

        for (const item of group) {
          current += 1;
          if (current > 999) {
            throw new Error(`Nomor urut pada RT ${rtKey} melebihi 999.`);
          }
          const id_rt = `CBW-${rtKey}-${String(current).padStart(3, '0')}`;
          const hhRef = doc(db, 'households', id_rt);
          tx.set(hhRef, {
            id_rt,
            dusun: item.dusun,
            rw: item.rw,
            rt: item.rt,
            rtKey,
            urutan: current,
            no_bangunan: item.no_bangunan.trim().slice(0, 30),
            nama_kk_daftar: item.nama_kk.trim().slice(0, 150),
            alamat: item.alamat.trim().slice(0, 300),
            sumber: item.sumber,
            status_daftar: 'aktif',
            status_cacah: 'belum_dikunjungi',
            verifikasi_status: 'belum',
            createdBy: actorEmail.toLowerCase().slice(0, 200),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          createdIds.push(id_rt);
        }

        tx.set(counterRef, {
          rtKey,
          lastNumber: current,
          updatedAt: serverTimestamp(),
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `import/${rtKey}`);
    }
  }

  return { imported: createdIds.length, ids: createdIds };
}

export async function updateHouseholdMasterStatus(
  id_rt: string,
  status_daftar: StatusDaftar,
  catatan_daftar: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'households', id_rt), {
      status_daftar,
      catatan_daftar: catatan_daftar.trim(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `households/${id_rt}`);
  }
}

export async function saveHouseholdDraftRemote(
  existingHousehold: HouseholdRecord,
  draft: CensusDraft,
  actorEmail: string,
  actorName: string
): Promise<void> {
  const cleaned = cleanCensusData(
    draft.modul0,
    draft.modulA,
    draft.modulB,
    draft.modulC,
    draft.membersPii
  );

  try {
    await updateDoc(
      doc(db, 'households', existingHousehold.id_rt),
      stripUndefined({
        status_cacah:
          existingHousehold.status_cacah === 'belum_dikunjungi'
            ? 'draf'
            : existingHousehold.status_cacah,
        modul0: cleaned.modul0,
        modulA: cleaned.modulA,
        modulB: cleaned.modulB,
        modulC: cleaned.modulC,
        enumerator_email: actorEmail.toLowerCase(),
        enumerator_name: actorName,
        updatedAt: serverTimestamp(),
      })
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `households/${existingHousehold.id_rt}`);
  }
}

export async function submitHouseholdCensus(params: {
  existingHousehold: HouseholdRecord;
  draft: CensusDraft;
  actorEmail: string;
  actorName: string;
  actorRole: UserRole;
  revisionReason?: string;
}): Promise<{ updatedHousehold: HouseholdRecord; visit: VisitRecord; cleanedPii: MemberPiiItem[] }> {
  const { existingHousehold, draft, actorEmail, actorName, actorRole, revisionReason } = params;
  const emailLower = actorEmail.toLowerCase();
  const nowIso = new Date().toISOString();

  const cleaned = cleanCensusData(
    {
      ...draft.modul0,
      has_foto_rumah: Boolean(draft.fotoDataUrl || draft.modul0.has_foto_rumah),
    },
    draft.modulA,
    draft.modulB,
    draft.modulC,
    draft.membersPii
  );

  let nextStatusCacah: HouseholdRecord['status_cacah'] = 'tercacah';
  if (cleaned.modul0.status_kunjungan === 'tidak_ditemui') {
    nextStatusCacah = 'tidak_ditemui';
  } else if (cleaned.modul0.status_kunjungan === 'rumah_kosong') {
    nextStatusCacah = 'rumah_kosong';
  } else if (cleaned.modul0.persetujuan === 'tidak') {
    nextStatusCacah = 'menolak';
  }

  const nextVerifikasiStatus: VerifikasiStatus =
    existingHousehold.verifikasi_status === 'dikembalikan'
      ? 'belum'
      : existingHousehold.verifikasi_status;

  const isPostSubmitRevision = Boolean(existingHousehold.submittedAt);

  try {
    // 1. Update household analysis document
    const updatePayload: Record<string, unknown> = {
      status_cacah: nextStatusCacah,
      verifikasi_status: nextVerifikasiStatus,
      modul0: cleaned.modul0,
      enumerator_email: emailLower.slice(0, 200),
      enumerator_name: actorName.slice(0, 150),
      submittedAt: (existingHousehold.submittedAt || nowIso).slice(0, 60),
      sheetSynced: false,
      updatedAt: serverTimestamp(),
    };
    if (cleaned.modulA) updatePayload.modulA = cleaned.modulA;
    if (cleaned.modulB) updatePayload.modulB = cleaned.modulB;
    if (cleaned.modulC) updatePayload.modulC = cleaned.modulC;

    try {
      await updateDoc(doc(db, 'households', existingHousehold.id_rt), stripUndefined(updatePayload));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `households/${existingHousehold.id_rt}`);
    }

    // 2. Write separated PII document (NIK & No KK)
    try {
      await setDoc(doc(db, 'household_pii', existingHousehold.id_rt), stripUndefined({
        id_rt: existingHousehold.id_rt,
        rtKey: existingHousehold.rtKey,
        membersPii: cleaned.membersPii,
        updatedBy: emailLower.slice(0, 200),
        updatedAt: serverTimestamp(),
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `household_pii/${existingHousehold.id_rt}`);
    }

    // 3. Write compressed photo if present
    if (draft.fotoDataUrl) {
      try {
        await setDoc(doc(db, 'household_photos', existingHousehold.id_rt), {
          id_rt: existingHousehold.id_rt,
          rtKey: existingHousehold.rtKey,
          dataUrl: draft.fotoDataUrl,
          updatedBy: emailLower.slice(0, 200),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `household_photos/${existingHousehold.id_rt}`);
      }
    }

    // 4. Always record visit log (including failed visits)
    const visitId = `vis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const visitData: VisitRecord = {
      visitId,
      id_rt: existingHousehold.id_rt,
      rtKey: existingHousehold.rtKey,
      dusun: existingHousehold.dusun,
      rw: existingHousehold.rw,
      rt: existingHousehold.rt,
      enumerator_email: emailLower.slice(0, 200),
      enumerator_name: actorName.slice(0, 150),
      waktu: nowIso,
      status_kunjungan: cleaned.modul0.status_kunjungan || 'ditemui',
      ...(cleaned.modul0.kunjungan_ke !== undefined ? { kunjungan_ke: cleaned.modul0.kunjungan_ke } : {}),
      ...(cleaned.modul0.persetujuan ? { persetujuan: cleaned.modul0.persetujuan } : {}),
      lokasi: cleaned.modul0.lokasi || {
        lat: 0,
        lng: 0,
        akurasi: 999,
        waktu: nowIso,
        metode: 'manual',
        alasan_manual: 'Tidak tersedia',
      },
      ...(cleaned.modulC?.catatan_enumerator
        ? { catatan: cleaned.modulC.catatan_enumerator.slice(0, 500) }
        : {}),
    };
    try {
      await setDoc(doc(db, 'visits', visitId), stripUndefined({
        ...visitData,
        createdAt: serverTimestamp(),
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `visits/${visitId}`);
    }

    // 5. Log post-submit revisions if previously submitted
    if (isPostSubmitRevision) {
      const reason = (revisionReason || 'Perbaikan isian setelah dikirim').trim().slice(0, 500);
      const diffs = [
        ...computeJsonDiffs('modul0', existingHousehold.modul0 || {}, cleaned.modul0),
        ...computeJsonDiffs('modulA', existingHousehold.modulA || {}, cleaned.modulA || {}),
        ...computeJsonDiffs('modulB', existingHousehold.modulB || [], cleaned.modulB || []),
        ...computeJsonDiffs('modulC', existingHousehold.modulC || {}, cleaned.modulC || {}),
      ];
      const limitedDiffs = diffs.slice(0, 40);
      for (let i = 0; i < limitedDiffs.length; i++) {
        const d = limitedDiffs[i];
        const logId = `rev_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        try {
          await setDoc(doc(db, 'revision_logs', logId), {
            logId,
            id_rt: existingHousehold.id_rt,
            rtKey: existingHousehold.rtKey,
            changedByEmail: emailLower.slice(0, 200),
            changedByName: actorName.slice(0, 150),
            changedByRole: actorRole,
            changedAt: serverTimestamp(),
            fieldPath: d.fieldPath.slice(0, 200),
            oldValue: d.oldValue.slice(0, 1000),
            newValue: d.newValue.slice(0, 1000),
            reason,
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `revision_logs/${logId}`);
        }
      }
    }

    clearLocalDraft(existingHousehold.id_rt);

    const updatedHousehold: HouseholdRecord = {
      ...existingHousehold,
      status_cacah: nextStatusCacah,
      verifikasi_status: nextVerifikasiStatus,
      modul0: cleaned.modul0,
      ...(cleaned.modulA ? { modulA: cleaned.modulA } : {}),
      ...(cleaned.modulB ? { modulB: cleaned.modulB } : {}),
      ...(cleaned.modulC ? { modulC: cleaned.modulC } : {}),
      enumerator_email: emailLower,
      enumerator_name: actorName,
      submittedAt: existingHousehold.submittedAt || nowIso,
      sheetSynced: false,
    };

    return { updatedHousehold, visit: visitData, cleanedPii: cleaned.membersPii };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('{')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `submit/${existingHousehold.id_rt}`);
  }
}

export async function markHouseholdSheetSynced(id_rt: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'households', id_rt), {
      sheetSynced: true,
      sheetSyncedAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Gagal menandai sheetSynced:', err);
  }
}

export async function verifyHouseholdSubmission(params: {
  household: HouseholdRecord;
  decision: 'terverifikasi' | 'dikembalikan';
  catatan: string;
  actorEmail: string;
  actorName: string;
  actorRole: UserRole;
}): Promise<void> {
  const { household, decision, catatan, actorEmail, actorName, actorRole } = params;
  const emailLower = actorEmail.toLowerCase();
  const nowIso = new Date().toISOString();

  const cleanCatatan = catatan.trim().slice(0, 500);
  try {
    await updateDoc(doc(db, 'households', household.id_rt), {
      verifikasi_status: decision,
      verifikasi_catatan: cleanCatatan,
      verifikasi_oleh: emailLower.slice(0, 200),
      verifikasi_waktu: nowIso,
      sheetSynced: false,
      updatedAt: serverTimestamp(),
    });

    const logId = `rev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setDoc(doc(db, 'revision_logs', logId), {
      logId,
      id_rt: household.id_rt,
      rtKey: household.rtKey,
      changedByEmail: emailLower.slice(0, 200),
      changedByName: actorName.slice(0, 150),
      changedByRole: actorRole,
      changedAt: serverTimestamp(),
      fieldPath: 'verifikasi_status',
      oldValue: household.verifikasi_status || 'belum',
      newValue: decision,
      reason: cleanCatatan || (decision === 'terverifikasi' ? 'Lolos verifikasi' : 'Dikembalikan'),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `verify/${household.id_rt}`);
  }
}
