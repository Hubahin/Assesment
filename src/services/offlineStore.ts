import {
  CensusDraft,
  DusunCode,
  HouseholdPiiRecord,
  HouseholdRecord,
  RevisionLogRecord,
  SpreadsheetConfig,
  StaffMember,
  StatusDaftar,
  SumberDaftar,
  UserRole,
  VisitRecord,
  WilayahConfig,
} from '../types/census';

const OFFLINE_SESSION_KEY = 'cbw_offline_session_v1';
const KNOWN_ACCOUNTS_KEY = 'cbw_known_accounts_v1';
const GLOBAL_CACHE_PREFIX = 'cbw_global_cache_v1_';
const CACHE_PREFIX = 'cbw_user_cache_v1_';
const QUEUE_PREFIX = 'cbw_offline_queue_v1_';
const MEDIA_DB_NAME = 'cbw_offline_media_v1';
const MEDIA_STORE_NAME = 'photos';

export interface OfflineAuthSession {
  email: string;
  displayName: string;
  uid: string;
  profile: StaffMember;
  savedAt: string;
  isProvisionalOffline?: boolean;
}

export interface KnownAccountRecord {
  email: string;
  displayName: string;
  uid: string;
  profile: StaffMember;
  lastSignedInAt: string;
}

export interface CreateListingQueueItem {
  queueId: string;
  type: 'create_listing';
  createdAt: string;
  tempId: string;
  params: {
    dusun: DusunCode;
    rw: string;
    rt: string;
    no_bangunan: string;
    nama_kk_daftar: string;
    alamat: string;
    sumber: SumberDaftar;
  };
  actorEmail: string;
  tempHousehold: HouseholdRecord;
}

export interface MasterStatusQueueItem {
  queueId: string;
  type: 'master_status';
  createdAt: string;
  id_rt: string;
  status_daftar: StatusDaftar;
  catatan_daftar: string;
}

export interface SaveDraftQueueItem {
  queueId: string;
  type: 'save_draft';
  createdAt: string;
  id_rt: string;
  existingHousehold: HouseholdRecord;
  draft: CensusDraft;
  hasOfflinePhoto: boolean;
  actorEmail: string;
  actorName: string;
}

export interface SubmitCensusQueueItem {
  queueId: string;
  type: 'submit_census';
  createdAt: string;
  id_rt: string;
  existingHousehold: HouseholdRecord;
  draft: CensusDraft;
  hasOfflinePhoto: boolean;
  actorEmail: string;
  actorName: string;
  actorRole: UserRole;
  revisionReason?: string;
  visitId: string;
  optimisticHousehold: HouseholdRecord;
  optimisticPii: HouseholdPiiRecord;
  optimisticVisit: VisitRecord;
  firestoreSynced: boolean;
  sheetSynced: boolean;
}

export type OfflineQueueItem =
  | CreateListingQueueItem
  | MasterStatusQueueItem
  | SaveDraftQueueItem
  | SubmitCensusQueueItem;

// --- Safe LocalStorage Helpers ---
function safeReadJson<T>(key: string): T | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWriteJson(key: string, value: unknown): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`Gagal menulis localStorage (${key}):`, err);
    return false;
  }
}

// --- Offline Auth Session ---
export function saveOfflineSession(session: OfflineAuthSession): void {
  safeWriteJson(OFFLINE_SESSION_KEY, session);
}

export function loadOfflineSession(): OfflineAuthSession | null {
  return safeReadJson<OfflineAuthSession>(OFFLINE_SESSION_KEY);
}

export function clearOfflineSession(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(OFFLINE_SESSION_KEY);
  } catch {
    // ignore
  }
}

// --- Known Google Accounts Vault (Survives Logout for Offline Re-login) ---
export function loadKnownAccounts(): KnownAccountRecord[] {
  return safeReadJson<KnownAccountRecord[]>(KNOWN_ACCOUNTS_KEY) ?? [];
}

export function saveKnownAccount(account: KnownAccountRecord): void {
  const emailLower = account.email.toLowerCase();
  const current = loadKnownAccounts().filter((a) => a.email.toLowerCase() !== emailLower);
  const next = [{ ...account, email: emailLower }, ...current].slice(0, 15);
  safeWriteJson(KNOWN_ACCOUNTS_KEY, next);
}

export function removeKnownAccount(email: string): void {
  const emailLower = email.toLowerCase();
  const next = loadKnownAccounts().filter((a) => a.email.toLowerCase() !== emailLower);
  safeWriteJson(KNOWN_ACCOUNTS_KEY, next);
}

export function findRegisteredOfflineAccount(email: string): StaffMember | null {
  const emailLower = email.trim().toLowerCase();
  if (!emailLower) return null;

  const known = loadKnownAccounts().find((a) => a.email.toLowerCase() === emailLower);
  if (known) return known.profile;

  const globalStaffList = loadGlobalCacheSlice<StaffMember[]>('staffList');
  const globalMatch = globalStaffList?.find((s) => s.email.toLowerCase() === emailLower);
  if (globalMatch) return globalMatch;

  for (const ka of loadKnownAccounts()) {
    const cachedStaffList = loadUserCacheSlice(ka.email, 'staffList');
    const matched = cachedStaffList?.find((s) => s.email.toLowerCase() === emailLower);
    if (matched) return matched;
  }

  return null;
}

export function createOfflineAuthSessionForEmail(params: {
  email: string;
  bootstrapAdminEmail?: string;
}): OfflineAuthSession {
  const emailLower = params.email.trim().toLowerCase();
  const known = loadKnownAccounts().find((a) => a.email.toLowerCase() === emailLower);
  if (known) {
    if (!known.profile.active) {
      throw new Error('Akun petugas ini berstatus nonaktif. Hubungi Admin atau Koordinator.');
    }
    const sess: OfflineAuthSession = {
      email: emailLower,
      displayName: known.displayName || known.profile.name,
      uid: known.uid || `offline_${emailLower}`,
      profile: known.profile,
      savedAt: new Date().toISOString(),
      isProvisionalOffline: false,
    };
    saveOfflineSession(sess);
    return sess;
  }

  const cachedStaff = findRegisteredOfflineAccount(emailLower);
  if (cachedStaff) {
    if (!cachedStaff.active) {
      throw new Error('Akun petugas ini berstatus nonaktif. Hubungi Admin atau Koordinator.');
    }
    const sess: OfflineAuthSession = {
      email: emailLower,
      displayName: cachedStaff.name,
      uid: `offline_${emailLower}`,
      profile: cachedStaff,
      savedAt: new Date().toISOString(),
      isProvisionalOffline: false,
    };
    saveOfflineSession(sess);
    return sess;
  }

  const isBootstrapAdmin =
    params.bootstrapAdminEmail &&
    emailLower === params.bootstrapAdminEmail.toLowerCase();

  const fallbackName = emailLower.split('@')[0] || 'Petugas Luring';

  const profile: StaffMember = isBootstrapAdmin
    ? {
        email: emailLower,
        name: fallbackName,
        role: 'admin',
        assignedRTs: [],
        active: true,
        createdBy: emailLower,
      }
    : {
        email: emailLower,
        name: fallbackName,
        role: 'enumerator',
        assignedRTs: [],
        active: true,
        createdBy: 'offline-provisional',
      };

  const sess: OfflineAuthSession = {
    email: emailLower,
    displayName: fallbackName,
    uid: `offline_${emailLower}`,
    profile,
    savedAt: new Date().toISOString(),
    isProvisionalOffline: !isBootstrapAdmin,
  };
  saveOfflineSession(sess);
  return sess;
}

export function saveGlobalCacheSlice(
  key: 'wilayah' | 'spreadsheetConfig' | 'staffList',
  data: unknown
): void {
  safeWriteJson(`${GLOBAL_CACHE_PREFIX}${key}`, data);
}

export function loadGlobalCacheSlice<T>(
  key: 'wilayah' | 'spreadsheetConfig' | 'staffList'
): T | null {
  return safeReadJson<T>(`${GLOBAL_CACHE_PREFIX}${key}`);
}

// --- Per-User Dataset Cache (Households, PII, Visits, Config) ---
export interface CachedUserData {
  wilayah?: WilayahConfig;
  spreadsheetConfig?: SpreadsheetConfig | null;
  staffList?: StaffMember[];
  households?: HouseholdRecord[];
  piiRecords?: HouseholdPiiRecord[];
  visits?: VisitRecord[];
  revisionLogs?: RevisionLogRecord[];
}

export function saveUserCacheSlice<K extends keyof CachedUserData>(
  email: string,
  sliceKey: K,
  data: CachedUserData[K]
): void {
  const key = `${CACHE_PREFIX}${email.toLowerCase()}_${String(sliceKey)}`;
  safeWriteJson(key, data);
}

export function loadUserCacheSlice<K extends keyof CachedUserData>(
  email: string,
  sliceKey: K
): CachedUserData[K] | null {
  const key = `${CACHE_PREFIX}${email.toLowerCase()}_${String(sliceKey)}`;
  return safeReadJson<CachedUserData[K]>(key);
}

// --- IndexedDB Offline Photo Storage (Avoids 5MB LocalStorage Quota Limit) ---
function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB tidak tersedia'));
      return;
    }
    const req = indexedDB.open(MEDIA_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        db.createObjectStore(MEDIA_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Gagal membuka IndexedDB'));
  });
}

export async function saveOfflinePhoto(id_rt: string, dataUrl: string): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
      tx.objectStore(MEDIA_STORE_NAME).put(dataUrl, id_rt);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    safeWriteJson(`cbw_photo_fallback_${id_rt}`, dataUrl);
  }
}

export async function getOfflinePhoto(id_rt: string): Promise<string | null> {
  try {
    const db = await openMediaDb();
    const res = await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readonly');
      const req = tx.objectStore(MEDIA_STORE_NAME).get(id_rt);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (res) return res;
  } catch {
    // fallback below
  }
  return safeReadJson<string>(`cbw_photo_fallback_${id_rt}`);
}

export async function deleteOfflinePhoto(id_rt: string): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
      tx.objectStore(MEDIA_STORE_NAME).delete(id_rt);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`cbw_photo_fallback_${id_rt}`);
    }
  } catch {
    // ignore
  }
}

// --- Offline Mutation Queue ---
function queueKey(email: string): string {
  return `${QUEUE_PREFIX}${email.toLowerCase()}`;
}

export function loadOfflineQueue(email: string): OfflineQueueItem[] {
  if (!email) return [];
  return safeReadJson<OfflineQueueItem[]>(queueKey(email)) ?? [];
}

export function saveOfflineQueue(email: string, items: OfflineQueueItem[]): void {
  if (!email) return;
  safeWriteJson(queueKey(email), items);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cbw-offline-queue-changed'));
  }
}

export function enqueueOfflineItem(email: string, item: OfflineQueueItem): OfflineQueueItem[] {
  const current = loadOfflineQueue(email);
  let next = [...current];

  if (item.type === 'save_draft') {
    next = next.filter((q) => !(q.type === 'save_draft' && q.id_rt === item.id_rt));
  } else if (item.type === 'master_status') {
    next = next.filter((q) => !(q.type === 'master_status' && q.id_rt === item.id_rt));
  } else if (item.type === 'submit_census') {
    next = next.filter(
      (q) =>
        !(
          (q.type === 'save_draft' || q.type === 'submit_census') &&
          q.id_rt === item.id_rt
        )
    );
  }

  next.push(item);
  saveOfflineQueue(email, next);
  return next;
}

export function updateOfflineQueueItem(
  email: string,
  queueId: string,
  updater: (item: OfflineQueueItem) => OfflineQueueItem
): OfflineQueueItem[] {
  const current = loadOfflineQueue(email);
  const next = current.map((q) => (q.queueId === queueId ? updater(q) : q));
  saveOfflineQueue(email, next);
  return next;
}

export function removeOfflineQueueItem(email: string, queueId: string): OfflineQueueItem[] {
  const current = loadOfflineQueue(email);
  const next = current.filter((q) => q.queueId !== queueId);
  saveOfflineQueue(email, next);
  return next;
}

export async function remapTempIdInQueue(
  email: string,
  tempId: string,
  realHousehold: HouseholdRecord
): Promise<OfflineQueueItem[]> {
  const realId = realHousehold.id_rt;
  const existingPhoto = await getOfflinePhoto(tempId);
  if (existingPhoto) {
    await saveOfflinePhoto(realId, existingPhoto);
    await deleteOfflinePhoto(tempId);
  }

  // Remap any local draft stored under tempId
  try {
    if (typeof localStorage !== 'undefined') {
      const tempDraftKey = `cbw_census_draft_v1_${tempId}`;
      const raw = localStorage.getItem(tempDraftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CensusDraft;
        parsed.id_rt = realId;
        parsed.modul0 = { ...parsed.modul0, id_rt: realId };
        localStorage.setItem(`cbw_census_draft_v1_${realId}`, JSON.stringify(parsed));
        localStorage.removeItem(tempDraftKey);
      }
    }
  } catch {
    // ignore
  }

  const current = loadOfflineQueue(email);
  const next: OfflineQueueItem[] = current.map((item): OfflineQueueItem => {
    if (item.type === 'master_status' && item.id_rt === tempId) {
      return { ...item, id_rt: realId };
    }
    if (item.type === 'save_draft' && item.id_rt === tempId) {
      return {
        ...item,
        id_rt: realId,
        existingHousehold: { ...realHousehold },
        draft: {
          ...item.draft,
          id_rt: realId,
          modul0: { ...item.draft.modul0, id_rt: realId },
        },
      };
    }
    if (item.type === 'submit_census' && item.id_rt === tempId) {
      return {
        ...item,
        id_rt: realId,
        existingHousehold: { ...realHousehold },
        draft: {
          ...item.draft,
          id_rt: realId,
          modul0: { ...item.draft.modul0, id_rt: realId },
        },
        optimisticHousehold: {
          ...item.optimisticHousehold,
          id_rt: realId,
          urutan: realHousehold.urutan,
          ...(item.optimisticHousehold.modul0
            ? { modul0: { ...item.optimisticHousehold.modul0, id_rt: realId } }
            : {}),
        },
        optimisticPii: {
          ...item.optimisticPii,
          id_rt: realId,
        },
        optimisticVisit: {
          ...item.optimisticVisit,
          id_rt: realId,
        },
      };
    }
    return item;
  });

  saveOfflineQueue(email, next);
  return next;
}

// --- Overlay Queue onto Cached/Firestore State for Instant Offline UI ---
export function applyOfflineQueueOverlay(params: {
  households: HouseholdRecord[];
  piiRecords: HouseholdPiiRecord[];
  visits: VisitRecord[];
  queue: OfflineQueueItem[];
}): {
  households: HouseholdRecord[];
  piiRecords: HouseholdPiiRecord[];
  visits: VisitRecord[];
  pendingSyncIds: Set<string>;
} {
  const hhMap = new Map<string, HouseholdRecord>();
  for (const h of params.households) {
    hhMap.set(h.id_rt, h);
  }

  const piiMap = new Map<string, HouseholdPiiRecord>();
  for (const p of params.piiRecords) {
    piiMap.set(p.id_rt, p);
  }

  const visitMap = new Map<string, VisitRecord>();
  for (const v of params.visits) {
    visitMap.set(v.visitId, v);
  }

  const pendingSyncIds = new Set<string>();

  for (const item of params.queue) {
    if (item.type === 'create_listing') {
      if (!hhMap.has(item.tempId)) {
        hhMap.set(item.tempId, item.tempHousehold);
      }
      pendingSyncIds.add(item.tempId);
    } else if (item.type === 'master_status') {
      const prev = hhMap.get(item.id_rt);
      if (prev) {
        hhMap.set(item.id_rt, {
          ...prev,
          status_daftar: item.status_daftar,
          catatan_daftar: item.catatan_daftar,
        });
      }
      pendingSyncIds.add(item.id_rt);
    } else if (item.type === 'save_draft') {
      const prev = hhMap.get(item.id_rt) || item.existingHousehold;
      hhMap.set(item.id_rt, {
        ...prev,
        status_cacah: prev.status_cacah === 'belum_dikunjungi' ? 'draf' : prev.status_cacah,
        modul0: item.draft.modul0,
        modulA: item.draft.modulA,
        modulB: item.draft.modulB,
        modulC: item.draft.modulC,
        enumerator_email: item.actorEmail,
        enumerator_name: item.actorName,
      });
      pendingSyncIds.add(item.id_rt);
    } else if (item.type === 'submit_census') {
      hhMap.set(item.id_rt, item.optimisticHousehold);
      piiMap.set(item.id_rt, item.optimisticPii);
      visitMap.set(item.optimisticVisit.visitId, item.optimisticVisit);
      pendingSyncIds.add(item.id_rt);
    }
  }

  const households = Array.from(hhMap.values()).sort((a, b) =>
    a.id_rt.localeCompare(b.id_rt)
  );
  const piiRecords = Array.from(piiMap.values());
  const visits = Array.from(visitMap.values()).sort((a, b) =>
    b.waktu.localeCompare(a.waktu)
  );

  return { households, piiRecords, visits, pendingSyncIds };
}

export async function clearAllCensusLocalData(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        if (
          key.startsWith('cbw_census_draft_v1_') ||
          key.startsWith(QUEUE_PREFIX) ||
          key.startsWith('cbw_photo_fallback_') ||
          (key.startsWith(CACHE_PREFIX) &&
            (key.endsWith('_households') ||
              key.endsWith('_piiRecords') ||
              key.endsWith('_visits') ||
              key.endsWith('_revisionLogs')))
        ) {
          keysToRemove.push(key);
        }
      }
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }

  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(MEDIA_STORE_NAME, 'readwrite');
      tx.objectStore(MEDIA_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cbw-offline-queue-changed'));
  }
}

export async function removeHouseholdLocalData(id_rt: string): Promise<void> {
  await deleteOfflinePhoto(id_rt);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`cbw_census_draft_v1_${id_rt}`);

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(QUEUE_PREFIX)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        try {
          const items = JSON.parse(raw) as OfflineQueueItem[];
          const filtered = items.filter((q) => {
            if (q.type === 'create_listing') return q.tempId !== id_rt;
            return q.id_rt !== id_rt;
          });
          if (filtered.length !== items.length) {
            localStorage.setItem(key, JSON.stringify(filtered));
          }
        } catch {
          // ignore malformed queue
        }
      }
    }
  } catch {
    // ignore
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cbw-offline-queue-changed'));
  }
}
