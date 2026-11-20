import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
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
import {
  appendSubmissionViaWebhook,
  fetchStaffFromWebhook,
  parseSpreadsheetStaffRows,
} from './googleSheetsService';
import {
  clearAllCensusLocalData,
  deleteOfflinePhoto,
  enqueueOfflineItem,
  getOfflinePhoto,
  loadOfflineQueue,
  loadOfflineSession,
  OfflineQueueItem,
  remapTempIdInQueue,
  removeHouseholdLocalData,
  removeOfflineQueueItem,
  saveOfflinePhoto,
  updateOfflineQueueItem,
} from './offlineStore';

export const BOOTSTRAP_ADMIN_EMAIL = 'arisriswanto057@gmail.com';

const DRAFT_STORAGE_PREFIX = 'cbw_census_draft_v1_';

export async function withNetworkTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 10000
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isOfflineOrTimeoutError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  return (
    lower.includes('network_timeout') ||
    lower.includes('unavailable') ||
    lower.includes('client is offline') ||
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('deadline-exceeded')
  );
}

export function saveLocalDraft(draft: CensusDraft): void {
  const payload = { ...draft, updatedLocallyAt: new Date().toISOString() };
  try {
    localStorage.setItem(`${DRAFT_STORAGE_PREFIX}${draft.id_rt}`, JSON.stringify(payload));
    if (draft.fotoDataUrl) {
      saveOfflinePhoto(draft.id_rt, draft.fotoDataUrl).catch(() => {});
    }
  } catch (e) {
    // Jika quota localStorage penuh karena foto, simpan foto ke IndexedDB lalu simpan teks draf tanpa foto
    if (draft.fotoDataUrl) {
      saveOfflinePhoto(draft.id_rt, draft.fotoDataUrl)
        .then(() => {
          try {
            localStorage.setItem(
              `${DRAFT_STORAGE_PREFIX}${draft.id_rt}`,
              JSON.stringify({ ...payload, fotoDataUrl: null })
            );
          } catch {
            // ignore
          }
        })
        .catch(() => {
          console.warn('Gagal menyimpan draf lokal:', e);
        });
    } else {
      console.warn('Gagal menyimpan draf lokal (kuota penyimpanan penuh?):', e);
    }
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
        // Saat offline / berasal dari cache lokal yang belum lengkap, pertahankan profil tersimpan jika ada
        const cachedSession = loadOfflineSession();
        const isOfflineCache = snap.metadata.fromCache || (typeof navigator !== 'undefined' && !navigator.onLine);
        if (isOfflineCache && cachedSession && cachedSession.email.toLowerCase() === emailLower) {
          onData(cachedSession.profile);
        } else {
          onData(null);
        }
      }
    },
    (err) => {
      if (isOfflineOrTimeoutError(err)) {
        const cachedSession = loadOfflineSession();
        if (cachedSession && cachedSession.email.toLowerCase() === emailLower) {
          onData(cachedSession.profile);
          return;
        }
      }
      handleFirestoreError(err, OperationType.GET, `staff_members/${emailLower}`);
    }
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
    (err) => {
      if (isOfflineOrTimeoutError(err)) return;
      handleFirestoreError(err, OperationType.GET, 'config/wilayah');
    }
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
    (err) => {
      if (isOfflineOrTimeoutError(err)) return;
      handleFirestoreError(err, OperationType.GET, 'config/spreadsheet');
    }
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

export function isEnumeratorUnderKoordinator(
  staff: Pick<StaffMember, 'role' | 'assignedRTs' | 'koordinatorEmail'>,
  koordinator: Pick<StaffMember, 'email' | 'assignedRTs'>
): boolean {
  if (staff.role !== 'enumerator') return false;
  const koorEmail = koordinator.email.trim().toLowerCase();
  const staffKoor = (staff.koordinatorEmail || '').trim().toLowerCase();
  if (staffKoor && staffKoor !== koorEmail) return false;

  const koorRts = new Set(koordinator.assignedRTs || []);
  const staffRts = staff.assignedRTs || [];
  if (staffRts.some((rt) => koorRts.has(rt))) return true;

  return Boolean(staffKoor && staffKoor === koorEmail && staffRts.length === 0);
}

export function subscribeStaffList(
  actor: Pick<StaffMember, 'email' | 'role' | 'assignedRTs'>,
  onData: (staff: StaffMember[]) => void
): Unsubscribe {
  if (actor.role === 'enumerator') {
    onData([]);
    return () => {};
  }
  const colRef = collection(db, 'staff_members');
  const q =
    actor.role === 'admin'
      ? colRef
      : query(colRef, where('role', '==', 'enumerator'));

  return onSnapshot(
    q,
    (snap) => {
      let list = snap.docs.map((d) => d.data() as StaffMember);
      if (actor.role === 'koordinator') {
        list = list.filter((s) => isEnumeratorUnderKoordinator(s, actor));
      }
      list.sort((a, b) => a.name.localeCompare(b.name, 'id'));
      onData(list);
    },
    (err) => {
      if (isOfflineOrTimeoutError(err)) return;
      handleFirestoreError(err, OperationType.LIST, 'staff_members');
    }
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
      (err) => {
        if (isOfflineOrTimeoutError(err)) return;
        handleFirestoreError(err, OperationType.LIST, collectionName);
      }
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
      (err) => {
        if (isOfflineOrTimeoutError(err)) return;
        handleFirestoreError(err, OperationType.LIST, collectionName);
      }
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
  const offlineUrl = await getOfflinePhoto(id_rt);
  if (offlineUrl) return offlineUrl;
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

async function ensurePhotoUnderLimit(dataUrl: string, maxChars = 420000): Promise<string> {
  if (!dataUrl || dataUrl.length <= maxChars || typeof document === 'undefined') {
    return dataUrl;
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let smallest = dataUrl;
        const trySizes = [1024, 800, 640, 480];
        const tryQualities = [0.6, 0.45, 0.35];
        for (const maxSide of trySizes) {
          let { width, height } = img;
          if (width > maxSide || height > maxSide) {
            if (width >= height) {
              height = Math.round((height / width) * maxSide);
              width = maxSide;
            } else {
              width = Math.round((width / height) * maxSide);
              height = maxSide;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) break;
          ctx.drawImage(img, 0, 0, width, height);
          for (const q of tryQualities) {
            const out = canvas.toDataURL('image/jpeg', q);
            if (out.length < smallest.length) {
              smallest = out;
            }
            if (out.length <= maxChars) {
              resolve(out);
              return;
            }
          }
        }
        resolve(smallest);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

export function buildSubmissionArtifacts(params: {
  existingHousehold: HouseholdRecord;
  draft: CensusDraft;
  actorEmail: string;
  actorName: string;
  visitId?: string;
}) {
  const { existingHousehold, draft, actorEmail, actorName } = params;
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

  const visitId =
    params.visitId || `vis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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
    ...(cleaned.modul0.kunjungan_ke !== undefined
      ? { kunjungan_ke: cleaned.modul0.kunjungan_ke }
      : {}),
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

  const cleanedPiiRecord: HouseholdPiiRecord = {
    id_rt: existingHousehold.id_rt,
    rtKey: existingHousehold.rtKey,
    membersPii: cleaned.membersPii,
    updatedBy: emailLower.slice(0, 200),
  };

  return {
    cleaned,
    nextStatusCacah,
    nextVerifikasiStatus,
    nowIso,
    visitId,
    visitData,
    updatedHousehold,
    cleanedPiiRecord,
  };
}

export async function submitHouseholdCensus(params: {
  existingHousehold: HouseholdRecord;
  draft: CensusDraft;
  actorEmail: string;
  actorName: string;
  actorRole: UserRole;
  revisionReason?: string;
  visitId?: string;
}): Promise<{ updatedHousehold: HouseholdRecord; visit: VisitRecord; cleanedPii: MemberPiiItem[] }> {
  const { existingHousehold, draft, actorEmail, actorName, actorRole, revisionReason } = params;
  const emailLower = actorEmail.toLowerCase();
  const artifacts = buildSubmissionArtifacts(params);
  const { cleaned, nextStatusCacah, nextVerifikasiStatus, nowIso, visitData, updatedHousehold } =
    artifacts;

  const isPostSubmitRevision = Boolean(existingHousehold.submittedAt);

  try {
    // 1. Update household analysis document
    const updatePayload: Record<string, unknown> = {
      status_cacah: nextStatusCacah,
      verifikasi_status: nextVerifikasiStatus,
      modul0: cleaned.modul0,
      enumerator_email: emailLower.slice(0, 200),
      enumerator_name: actorName.slice(0, 200),
      submittedAt: (existingHousehold.submittedAt || nowIso).slice(0, 100),
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
      const safePhotoUrl = await ensurePhotoUnderLimit(draft.fotoDataUrl, 420000);
      try {
        await setDoc(doc(db, 'household_photos', existingHousehold.id_rt), {
          id_rt: existingHousehold.id_rt,
          rtKey: existingHousehold.rtKey,
          dataUrl: safePhotoUrl,
          updatedBy: emailLower.slice(0, 200),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `household_photos/${existingHousehold.id_rt}`);
      }
    }

    // 4. Always record visit log (including failed visits)
    try {
      await setDoc(doc(db, 'visits', visitData.visitId), stripUndefined({
        ...visitData,
        createdAt: serverTimestamp(),
      }));
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `visits/${visitData.visitId}`);
    }

    // 5. Log post-submit revisions if previously submitted
    if (isPostSubmitRevision) {
      const reason = (revisionReason?.trim() || 'Perbaikan isian setelah dikirim').slice(0, 950);
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

    return { updatedHousehold, visit: visitData, cleanedPii: cleaned.membersPii };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('{')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `submit/${existingHousehold.id_rt}`);
  }
}

export function queueOfflineListing(
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
): HouseholdRecord {
  const rwPad = params.rw.padStart(2, '0');
  const rtPad = params.rt.padStart(2, '0');
  const rtKey = `${params.dusun}-${rwPad}-${rtPad}`;
  const tempId = `LOCAL-${rtKey}-${Date.now().toString(36).toUpperCase()}`;

  const tempHousehold: HouseholdRecord = {
    id_rt: tempId,
    dusun: params.dusun,
    rw: rwPad,
    rt: rtPad,
    rtKey,
    urutan: 0,
    no_bangunan: params.no_bangunan.trim().slice(0, 30),
    nama_kk_daftar: params.nama_kk_daftar.trim().slice(0, 150),
    alamat: params.alamat.trim().slice(0, 300),
    sumber: params.sumber,
    status_daftar: 'aktif',
    status_cacah: 'belum_dikunjungi',
    verifikasi_status: 'belum',
    createdBy: actorEmail.toLowerCase().slice(0, 200),
  };

  enqueueOfflineItem(actorEmail, {
    queueId: `q_list_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'create_listing',
    createdAt: new Date().toISOString(),
    tempId,
    params: { ...params, rw: rwPad, rt: rtPad },
    actorEmail: actorEmail.toLowerCase(),
    tempHousehold,
  });

  return tempHousehold;
}

export function queueOfflineMasterStatus(
  actorEmail: string,
  id_rt: string,
  status_daftar: StatusDaftar,
  catatan_daftar: string
): void {
  enqueueOfflineItem(actorEmail, {
    queueId: `q_stat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'master_status',
    createdAt: new Date().toISOString(),
    id_rt,
    status_daftar,
    catatan_daftar: catatan_daftar.trim(),
  });
}

export async function queueOfflineDraft(params: {
  existingHousehold: HouseholdRecord;
  draft: CensusDraft;
  actorEmail: string;
  actorName: string;
}): Promise<void> {
  const { existingHousehold, draft, actorEmail, actorName } = params;
  saveLocalDraft(draft);
  const hasOfflinePhoto = Boolean(draft.fotoDataUrl);
  if (draft.fotoDataUrl) {
    await saveOfflinePhoto(existingHousehold.id_rt, draft.fotoDataUrl);
  }
  enqueueOfflineItem(actorEmail, {
    queueId: `q_draft_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'save_draft',
    createdAt: new Date().toISOString(),
    id_rt: existingHousehold.id_rt,
    existingHousehold,
    draft: { ...draft, fotoDataUrl: null },
    hasOfflinePhoto,
    actorEmail: actorEmail.toLowerCase(),
    actorName,
  });
}

export async function queueOfflineSubmission(params: {
  existingHousehold: HouseholdRecord;
  draft: CensusDraft;
  actorEmail: string;
  actorName: string;
  actorRole: UserRole;
  revisionReason?: string;
  visitId?: string;
  firestoreSynced?: boolean;
  sheetSynced?: boolean;
}): Promise<{ updatedHousehold: HouseholdRecord; visit: VisitRecord; cleanedPii: MemberPiiItem[] }> {
  const {
    existingHousehold,
    draft,
    actorEmail,
    actorName,
    actorRole,
    revisionReason,
    firestoreSynced = false,
    sheetSynced = false,
  } = params;

  const artifacts = buildSubmissionArtifacts({
    existingHousehold,
    draft,
    actorEmail,
    actorName,
    visitId: params.visitId,
  });

  let hasOfflinePhoto = false;
  if (draft.fotoDataUrl) {
    const safePhoto = await ensurePhotoUnderLimit(draft.fotoDataUrl, 420000);
    await saveOfflinePhoto(existingHousehold.id_rt, safePhoto);
    hasOfflinePhoto = true;
  }

  enqueueOfflineItem(actorEmail, {
    queueId: `q_sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'submit_census',
    createdAt: new Date().toISOString(),
    id_rt: existingHousehold.id_rt,
    existingHousehold,
    draft: { ...draft, fotoDataUrl: null },
    hasOfflinePhoto,
    actorEmail: actorEmail.toLowerCase(),
    actorName,
    actorRole,
    revisionReason,
    visitId: artifacts.visitId,
    optimisticHousehold: artifacts.updatedHousehold,
    optimisticPii: artifacts.cleanedPiiRecord,
    optimisticVisit: artifacts.visitData,
    firestoreSynced,
    sheetSynced,
  });

  clearLocalDraft(existingHousehold.id_rt);

  return {
    updatedHousehold: artifacts.updatedHousehold,
    visit: artifacts.visitData,
    cleanedPii: artifacts.cleaned.membersPii,
  };
}

export async function flushOfflineSyncQueue(params: {
  actorEmail: string;
  actorRole: UserRole;
  hasFirebaseUser: boolean;
  spreadsheetConfig: SpreadsheetConfig | null;
  households: HouseholdRecord[];
  piiRecords: HouseholdPiiRecord[];
  visits: VisitRecord[];
  syncedSheetIdsInSession?: Set<string>;
}): Promise<{ firestoreSyncedCount: number; sheetSyncedCount: number; remainingCount: number }> {
  const {
    actorEmail,
    actorRole,
    hasFirebaseUser,
    spreadsheetConfig,
    households,
    piiRecords,
    visits,
    syncedSheetIdsInSession,
  } = params;

  const emailLower = actorEmail.toLowerCase();
  const initialQueue = loadOfflineQueue(emailLower);

  if (!hasFirebaseUser || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return {
      firestoreSyncedCount: 0,
      sheetSyncedCount: 0,
      remainingCount: initialQueue.length,
    };
  }

  let firestoreSyncedCount = 0;
  let sheetSyncedCount = 0;
  const failedTempIds = new Set<string>();
  const processedSheetIds = new Set<string>();

  for (const snapshotItem of initialQueue) {
    // Baca ulang item terbaru dari localStorage agar hasil remap tempId terbawa
    const liveQueue = loadOfflineQueue(emailLower);
    const item = liveQueue.find((q) => q.queueId === snapshotItem.queueId);
    if (!item) continue;

    if (item.type === 'create_listing') {
      try {
        const created = await withNetworkTimeout(
          createHouseholdListingTransactional(item.params, item.actorEmail),
          15000
        );
        await remapTempIdInQueue(emailLower, item.tempId, created);
        removeOfflineQueueItem(emailLower, item.queueId);
        firestoreSyncedCount++;
      } catch (err) {
        console.warn('Gagal menyinkronkan listing luring:', err);
        failedTempIds.add(item.tempId);
      }
      continue;
    }

    if (item.id_rt.startsWith('LOCAL-') || failedTempIds.has(item.id_rt)) {
      continue;
    }

    if (item.type === 'master_status') {
      try {
        await withNetworkTimeout(
          updateHouseholdMasterStatus(item.id_rt, item.status_daftar, item.catatan_daftar),
          12000
        );
        removeOfflineQueueItem(emailLower, item.queueId);
        firestoreSyncedCount++;
      } catch (err) {
        console.warn('Gagal menyinkronkan status daftar luring:', err);
      }
      continue;
    }

    if (item.type === 'save_draft') {
      try {
        await withNetworkTimeout(
          saveHouseholdDraftRemote(
            item.existingHousehold,
            item.draft,
            item.actorEmail,
            item.actorName
          ),
          12000
        );
        removeOfflineQueueItem(emailLower, item.queueId);
        firestoreSyncedCount++;
      } catch (err) {
        console.warn('Gagal menyinkronkan draf luring:', err);
      }
      continue;
    }

    if (item.type === 'submit_census') {
      let currentItem: OfflineQueueItem = item;
      let isFirestoreOk = item.firestoreSynced;
      let isSheetOk = item.sheetSynced;

      if (!isFirestoreOk) {
        try {
          const offlinePhoto = item.hasOfflinePhoto ? await getOfflinePhoto(item.id_rt) : null;
          await withNetworkTimeout(
            submitHouseholdCensus({
              existingHousehold: item.existingHousehold,
              draft: {
                ...item.draft,
                fotoDataUrl: offlinePhoto || item.draft.fotoDataUrl || null,
              },
              actorEmail: item.actorEmail,
              actorName: item.actorName,
              actorRole: item.actorRole,
              revisionReason: item.revisionReason,
              visitId: item.visitId,
            }),
            20000
          );
          isFirestoreOk = true;
          firestoreSyncedCount++;
          updateOfflineQueueItem(emailLower, item.queueId, (prev) =>
            prev.type === 'submit_census' ? { ...prev, firestoreSynced: true } : prev
          );
        } catch (err) {
          console.warn('Gagal menyinkronkan pengiriman sensus ke Firestore:', err);
          continue;
        }
      }

      if (isFirestoreOk && !isSheetOk && spreadsheetConfig?.webhookUrl) {
        try {
          await appendSubmissionViaWebhook({
            webhookUrl: spreadsheetConfig.webhookUrl,
            household: currentItem.optimisticHousehold,
            pii: currentItem.optimisticPii,
            visit: currentItem.optimisticVisit,
          });
          await markHouseholdSheetSynced(currentItem.id_rt);
          isSheetOk = true;
          sheetSyncedCount++;
          processedSheetIds.add(currentItem.id_rt);
          syncedSheetIdsInSession?.add(currentItem.id_rt);
          updateOfflineQueueItem(emailLower, item.queueId, (prev) =>
            prev.type === 'submit_census' ? { ...prev, sheetSynced: true } : prev
          );
        } catch (err) {
          console.warn('Gagal menyinkronkan ke Google Spreadsheet:', err);
        }
      }

      if (isFirestoreOk && (isSheetOk || !spreadsheetConfig?.webhookUrl)) {
        removeOfflineQueueItem(emailLower, item.queueId);
        await deleteOfflinePhoto(item.id_rt);
      }
    }
  }

  // Juga kirim data sensus milik petugas (atau semua untuk admin) yang sudah masuk Firestore namun sheetSynced === false
  if (spreadsheetConfig?.webhookUrl) {
    const unsyncedHouseholds = households.filter((h) => {
      if (!h.submittedAt || h.sheetSynced) return false;
      if (processedSheetIds.has(h.id_rt)) return false;
      if (syncedSheetIdsInSession?.has(h.id_rt)) return false;
      if (actorRole === 'admin') return true;
      return (
        h.enumerator_email?.toLowerCase() === emailLower ||
        h.createdBy?.toLowerCase() === emailLower
      );
    });

    for (const h of unsyncedHouseholds) {
      try {
        const pii = piiRecords.find((p) => p.id_rt === h.id_rt) || {
          id_rt: h.id_rt,
          rtKey: h.rtKey,
          membersPii: [],
          updatedBy: h.enumerator_email || emailLower,
        };
        const latestVisit = visits.find((v) => v.id_rt === h.id_rt) || {
          visitId: `vis_sync_${h.id_rt}`,
          id_rt: h.id_rt,
          rtKey: h.rtKey,
          dusun: h.dusun,
          rw: h.rw,
          rt: h.rt,
          enumerator_email: h.enumerator_email || emailLower,
          enumerator_name: h.enumerator_name || '',
          waktu: h.submittedAt || new Date().toISOString(),
          status_kunjungan: h.modul0?.status_kunjungan || 'ditemui',
          kunjungan_ke: h.modul0?.kunjungan_ke,
          persetujuan: h.modul0?.persetujuan,
          lokasi: h.modul0?.lokasi || {
            lat: 0,
            lng: 0,
            akurasi: 999,
            waktu: h.submittedAt || new Date().toISOString(),
            metode: 'manual',
          },
        };

        await appendSubmissionViaWebhook({
          webhookUrl: spreadsheetConfig.webhookUrl,
          household: h,
          pii,
          visit: latestVisit,
        });
        await markHouseholdSheetSynced(h.id_rt);
        syncedSheetIdsInSession?.add(h.id_rt);
        sheetSyncedCount++;
      } catch (err) {
        console.warn(`Gagal auto-sync Spreadsheet untuk ${h.id_rt}:`, err);
      }
    }
  }

  return {
    firestoreSyncedCount,
    sheetSyncedCount,
    remainingCount: loadOfflineQueue(emailLower).length,
  };
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

export async function deleteSingleHouseholdRecord(id_rt: string): Promise<void> {
  if (id_rt.startsWith('LOCAL-')) {
    await removeHouseholdLocalData(id_rt);
    return;
  }

  try {
    const refsToDelete = [
      doc(db, 'households', id_rt),
      doc(db, 'household_pii', id_rt),
      doc(db, 'household_photos', id_rt),
    ];

    const visitsSnap = await getDocs(
      query(collection(db, 'visits'), where('id_rt', '==', id_rt))
    );
    visitsSnap.docs.forEach((d) => refsToDelete.push(d.ref));

    const logsSnap = await getDocs(
      query(collection(db, 'revision_logs'), where('id_rt', '==', id_rt))
    );
    logsSnap.docs.forEach((d) => refsToDelete.push(d.ref));

    for (let i = 0; i < refsToDelete.length; i += 400) {
      const batch = writeBatch(db);
      for (const ref of refsToDelete.slice(i, i + 400)) {
        batch.delete(ref);
      }
      await batch.commit();
    }

    await removeHouseholdLocalData(id_rt);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `households/${id_rt}`);
  }
}

export async function resetAllCensusData(
  onProgress?: (label: string) => void
): Promise<{ deletedCount: number }> {
  const collectionsToClear = [
    { name: 'households', label: 'data rumah tangga' },
    { name: 'household_pii', label: 'identitas responden' },
    { name: 'household_photos', label: 'foto rumah' },
    { name: 'visits', label: 'riwayat kunjungan' },
    { name: 'revision_logs', label: 'log revisi' },
    { name: 'rt_counters', label: 'penomoran otomatis RT' },
  ];

  let deletedCount = 0;
  for (const colInfo of collectionsToClear) {
    onProgress?.(`Menghapus ${colInfo.label}...`);
    try {
      const snap = await getDocs(collection(db, colInfo.name));
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of docs.slice(i, i + 400)) {
          batch.delete(d.ref);
        }
        await batch.commit();
        deletedCount += docs.slice(i, i + 400).length;
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, colInfo.name);
    }
  }

  onProgress?.('Membersihkan cache & draf lokal...');
  await clearAllCensusLocalData();
  return { deletedCount };
}

export interface StaffSyncResult {
  created: number;
  updated: number;
  removed: number;
  unchanged: number;
  totalSheetRows: number;
  errors: string[];
  emptySheet: boolean;
}

export async function syncStaffMembersFromSpreadsheet(params: {
  webhookUrl: string;
  wilayah: WilayahConfig;
  actorEmail: string;
  actorRole: UserRole;
  actorAssignedRTs?: string[];
  replaceRemoved?: boolean;
}): Promise<StaffSyncResult> {
  const {
    webhookUrl,
    wilayah,
    actorEmail,
    actorRole,
    actorAssignedRTs = [],
    replaceRemoved = true,
  } = params;

  const rawRows = await fetchStaffFromWebhook(webhookUrl);
  const { validRows, errors } = parseSpreadsheetStaffRows(rawRows, wilayah);

  const actorLower = actorEmail.trim().toLowerCase();
  const actorRtSet = new Set(actorAssignedRTs);
  const scopedRows =
    actorRole === 'koordinator'
      ? validRows.filter((r) => {
          if (r.role !== 'enumerator') return false;
          const rowKoor = (r.koordinatorEmail || '').trim().toLowerCase();
          if (rowKoor && rowKoor !== actorLower) return false;
          return r.assignedRTs.length > 0 && r.assignedRTs.every((rt) => actorRtSet.has(rt));
        })
      : validRows;

  if (scopedRows.length === 0) {
    return {
      created: 0,
      updated: 0,
      removed: 0,
      unchanged: 0,
      totalSheetRows: 0,
      errors,
      emptySheet: true,
    };
  }

  const staffCol = collection(db, 'staff_members');
  const existingSnap = await getDocs(
    actorRole === 'admin' ? staffCol : query(staffCol, where('role', '==', 'enumerator'))
  );

  const existingMap = new Map<string, Record<string, any>>();
  for (const d of existingSnap.docs) {
    const data = d.data() as StaffMember;
    if (
      actorRole === 'koordinator' &&
      !isEnumeratorUnderKoordinator(data, {
        email: actorLower,
        assignedRTs: actorAssignedRTs,
      })
    ) {
      continue;
    }
    existingMap.set(d.id.toLowerCase(), data);
  }

  type BatchOp =
    | { kind: 'set'; email: string; payload: Record<string, any> }
    | { kind: 'delete'; email: string };
  const ops: BatchOp[] = [];

  let created = 0;
  let updated = 0;
  let removed = 0;
  let unchanged = 0;

  const targetEmailSet = new Set<string>();

  for (const row of scopedRows) {
    const emailLower = row.email.toLowerCase();
    targetEmailSet.add(emailLower);

    // Jangan pernah mencabut akses Admin Bootstrap utama secara tidak sengaja
    const effectiveRole: UserRole =
      emailLower === BOOTSTRAP_ADMIN_EMAIL ? 'admin' : row.role;
    const effectiveActive =
      emailLower === BOOTSTRAP_ADMIN_EMAIL ? true : row.active;
    const effectiveRts =
      effectiveRole === 'admin' ? [] : [...row.assignedRTs].slice(0, 120);

    const prev = existingMap.get(emailLower);
    const nextSortedRts = [...effectiveRts].sort().join(',');

    if (prev) {
      const prevRts = Array.isArray(prev.assignedRTs)
        ? [...prev.assignedRTs].sort().join(',')
        : '';
      const prevKoor = (prev.koordinatorEmail || '').toLowerCase();
      const nextKoor =
        row.koordinatorEmail ||
        (actorRole === 'koordinator' ? prevKoor || actorLower : '');

      const isSame =
        prev.name === row.name &&
        prev.role === effectiveRole &&
        Boolean(prev.active) === effectiveActive &&
        prevRts === nextSortedRts &&
        prevKoor === nextKoor;

      if (isSame) {
        unchanged++;
        continue;
      }

      const payload: Record<string, any> = {
        email: emailLower,
        name: row.name,
        role: effectiveRole,
        assignedRTs: effectiveRts,
        active: effectiveActive,
        createdBy: prev.createdBy || actorLower,
        createdAt: prev.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (nextKoor) payload.koordinatorEmail = nextKoor;

      ops.push({ kind: 'set', email: emailLower, payload });
      updated++;
    } else {
      const nextKoor =
        row.koordinatorEmail || (actorRole === 'koordinator' ? actorLower : '');
      const payload: Record<string, any> = {
        email: emailLower,
        name: row.name,
        role: effectiveRole,
        assignedRTs: effectiveRts,
        active: effectiveActive,
        createdBy: actorLower,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (nextKoor) payload.koordinatorEmail = nextKoor;

      ops.push({ kind: 'set', email: emailLower, payload });
      created++;
    }
  }

  if (actorRole === 'admin' && replaceRemoved) {
    for (const [existingEmail] of existingMap) {
      if (
        existingEmail !== BOOTSTRAP_ADMIN_EMAIL &&
        !targetEmailSet.has(existingEmail)
      ) {
        ops.push({ kind: 'delete', email: existingEmail });
        removed++;
      }
    }
  }

  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    for (const op of ops.slice(i, i + 400)) {
      const ref = doc(db, 'staff_members', op.email);
      if (op.kind === 'set') {
        batch.set(ref, op.payload);
      } else {
        batch.delete(ref);
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'staff_members');
    }
  }

  return {
    created,
    updated,
    removed,
    unchanged,
    totalSheetRows: scopedRows.length,
    errors,
    emptySheet: false,
  };
}
