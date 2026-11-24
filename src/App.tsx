import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  CloudOff,
  FileCheck2,
  LogOut,
  Map as MapIcon,
  RefreshCw,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { AdminSettingsAndExportView } from './components/AdminSettingsAndExportView';
import { CensusMapView } from './components/CensusMapView';
import { CoverageDashboardView } from './components/CoverageDashboardView';
import { HouseholdListView } from './components/HouseholdListView';
import { LoginView } from './components/LoginView';
import { PWAInstallButton } from './components/PWAInstallButton';
import { StaffManagementView } from './components/StaffManagementView';
import { VerificationView } from './components/VerificationView';
import { QuestionnaireWizard } from './components/questionnaire/QuestionnaireWizard';
import { DEFAULT_RW_MAPPINGS_85 } from './data/instrumentSpec';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { googleSignIn, initAuth, logout, testConnection } from './lib/firebase';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  deleteSingleHouseholdRecord,
  ensureBootstrapSetup,
  flushOfflineSyncQueue,
  isEnumeratorUnderKoordinator,
  saveSpreadsheetConfig,
  subscribeHouseholdPii,
  subscribeHouseholds,
  subscribeMyStaffProfile,
  subscribeRevisionLogs,
  subscribeSpreadsheetConfig,
  subscribeStaffList,
  subscribeVisits,
  subscribeWilayahConfig,
  syncStaffMembersFromSpreadsheet,
} from './services/firestoreService';
import {
  isHouseholdSubmittedForSheet,
  syncAllDataViaWebhook,
} from './services/googleSheetsService';
import {
  applyOfflineQueueOverlay,
  clearOfflineSession,
  createOfflineAuthSessionForEmail,
  KnownAccountRecord,
  loadGlobalCacheSlice,
  loadKnownAccounts,
  loadOfflineQueue,
  loadOfflineSession,
  loadUserCacheSlice,
  OfflineAuthSession,
  OfflineQueueItem,
  saveGlobalCacheSlice,
  saveKnownAccount,
  saveOfflineSession,
  saveUserCacheSlice,
} from './services/offlineStore';
import {
  HouseholdPiiRecord,
  HouseholdRecord,
  RevisionLogRecord,
  SpreadsheetConfig,
  StaffMember,
  UserRole,
  VisitRecord,
  WilayahConfig,
} from './types/census';

type NavTabId = 'pendataan' | 'verifikasi' | 'cakupan' | 'peta' | 'petugas' | 'admin';

interface NavTabItem {
  id: NavTabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
}

const NAV_TABS: NavTabItem[] = [
  { id: 'pendataan', label: 'Pendataan', icon: ClipboardList, roles: ['admin', 'koordinator', 'enumerator'] },
  { id: 'verifikasi', label: 'Verifikasi', icon: FileCheck2, roles: ['admin'] },
  { id: 'cakupan', label: 'Cakupan', icon: BarChart3, roles: ['admin', 'koordinator'] },
  { id: 'peta', label: 'Peta', icon: MapIcon, roles: ['admin', 'koordinator', 'enumerator'] },
  { id: 'petugas', label: 'Petugas', icon: Users, roles: ['admin', 'koordinator'] },
  { id: 'admin', label: 'Admin & Sheet', icon: Settings, roles: ['admin'] },
];

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin I\'ComDev',
  koordinator: 'Koordinator / DPL',
  enumerator: 'Enumerator',
};

export default function App() {
  const isOnline = useOnlineStatus();
  const [offlineSession, setOfflineSession] = useState<OfflineAuthSession | null>(() =>
    loadOfflineSession()
  );
  const [knownAccounts, setKnownAccounts] = useState<KnownAccountRecord[]>(() =>
    loadKnownAccounts()
  );

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<StaffMember | null>(
    () => loadOfflineSession()?.profile ?? null
  );
  const [profileLoading, setProfileLoading] = useState(true);

  const [wilayah, setWilayah] = useState<WilayahConfig>({
    rwMappings: DEFAULT_RW_MAPPINGS_85,
    totalRt: 85,
    updatedBy: 'default',
  });
  const [spreadsheetConfig, setSpreadsheetConfig] = useState<SpreadsheetConfig | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [households, setHouseholds] = useState<HouseholdRecord[]>([]);
  const [piiRecords, setPiiRecords] = useState<HouseholdPiiRecord[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [revisionLogs, setRevisionLogs] = useState<RevisionLogRecord[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<OfflineQueueItem[]>(() => {
    const sess = loadOfflineSession();
    return sess?.email ? loadOfflineQueue(sess.email) : [];
  });

  const [activeTab, setActiveTab] = useState<NavTabId>('pendataan');
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [quotaLimitedNotice, setQuotaLimitedNotice] = useState(false);

  const isSyncingRef = useRef(false);
  const quotaCooldownUntilRef = useRef<number>(0);
  const syncedSheetIdsInSessionRef = useRef<Set<string>>(new Set());
  const lastAutoStaffSyncAtRef = useRef<number>(0);
  const isStaffSyncingRef = useRef<boolean>(false);

  const activeEmail = useMemo(() => {
    return (user?.email || offlineSession?.email || '').toLowerCase();
  }, [user, offlineSession]);

  // Listen for offline queue mutations from any view
  useEffect(() => {
    const refreshQueue = () => {
      if (activeEmail) {
        setOfflineQueue(loadOfflineQueue(activeEmail));
      } else {
        setOfflineQueue([]);
      }
    };
    refreshQueue();
    window.addEventListener('cbw-offline-queue-changed', refreshQueue);
    window.addEventListener('storage', refreshQueue);
    return () => {
      window.removeEventListener('cbw-offline-queue-changed', refreshQueue);
      window.removeEventListener('storage', refreshQueue);
    };
  }, [activeEmail]);

  useEffect(() => {
    if (isOnline) {
      testConnection();
    }
    const unsub = initAuth((authUser) => {
      setUser(authUser);
      setAuthReady(true);
      if (!authUser) {
        const cached = loadOfflineSession();
        if (cached) {
          setOfflineSession(cached);
          setProfile(cached.profile);
          setProfileLoading(false);
        } else {
          setProfile(null);
          setProfileLoading(false);
          setActiveHouseholdId(null);
        }
      }
    });
    return () => unsub();
  }, []);

  // Hydrate cached datasets immediately when activeEmail is available
  useEffect(() => {
    if (!activeEmail) return;
    const cachedWilayah =
      loadUserCacheSlice(activeEmail, 'wilayah') ||
      loadGlobalCacheSlice<WilayahConfig>('wilayah');
    if (cachedWilayah) setWilayah(cachedWilayah);

    const cachedSheet =
      loadUserCacheSlice(activeEmail, 'spreadsheetConfig') ??
      loadGlobalCacheSlice<SpreadsheetConfig | null>('spreadsheetConfig');
    if (cachedSheet) setSpreadsheetConfig(cachedSheet);

    const cachedStaff = loadUserCacheSlice(activeEmail, 'staffList');
    if (cachedStaff) {
      setStaffList(
        profile?.role === 'koordinator'
          ? cachedStaff.filter((s) => isEnumeratorUnderKoordinator(s, profile))
          : cachedStaff
      );
    }

    const cachedHh = loadUserCacheSlice(activeEmail, 'households');
    if (cachedHh) setHouseholds(cachedHh);

    const cachedPii = loadUserCacheSlice(activeEmail, 'piiRecords');
    if (cachedPii) setPiiRecords(cachedPii);

    const cachedVisits = loadUserCacheSlice(activeEmail, 'visits');
    if (cachedVisits) setVisits(cachedVisits);

    const cachedLogs = loadUserCacheSlice(activeEmail, 'revisionLogs');
    if (cachedLogs) setRevisionLogs(cachedLogs);
  }, [activeEmail]);

  useEffect(() => {
    if (!user?.email) {
      const cached = loadOfflineSession();
      if (cached) {
        setProfile(cached.profile);
        setProfileLoading(false);
      } else {
        setProfile(null);
        setProfileLoading(false);
      }
      return;
    }

    const email = user.email.toLowerCase();
    const cached = loadOfflineSession();
    if (cached && cached.email.toLowerCase() === email) {
      setProfile(cached.profile);
      setProfileLoading(false);
    } else {
      setProfileLoading(true);
    }

    if (email === BOOTSTRAP_ADMIN_EMAIL && isOnline) {
      ensureBootstrapSetup(email, user.displayName || 'Admin I\'ComDev').catch((err) =>
        console.warn('Bootstrap admin notice:', err)
      );
    }

    const unsub = subscribeMyStaffProfile(email, (staff) => {
      setProfile(staff);
      setProfileLoading(false);
      if (staff && staff.active) {
        const nextSession: OfflineAuthSession = {
          email,
          displayName: user.displayName || staff.name,
          uid: user.uid,
          profile: staff,
          savedAt: new Date().toISOString(),
          isProvisionalOffline: false,
        };
        saveOfflineSession(nextSession);
        saveKnownAccount({
          email,
          displayName: user.displayName || staff.name,
          uid: user.uid,
          profile: staff,
          lastSignedInAt: new Date().toISOString(),
        });
        setOfflineSession(nextSession);
        setKnownAccounts(loadKnownAccounts());
      } else if (staff === null && isOnline) {
        // Server mengonfirmasi akun dihapus/belum terdaftar saat online
        clearOfflineSession();
        setOfflineSession(null);
      } else if (staff && !staff.active && isOnline) {
        const deactivatedSession: OfflineAuthSession = {
          email,
          displayName: user.displayName || staff.name,
          uid: user.uid,
          profile: staff,
          savedAt: new Date().toISOString(),
        };
        saveOfflineSession(deactivatedSession);
        saveKnownAccount({
          email,
          displayName: user.displayName || staff.name,
          uid: user.uid,
          profile: staff,
          lastSignedInAt: new Date().toISOString(),
        });
        setKnownAccounts(loadKnownAccounts());
      }
    });

    return () => unsub();
  }, [user, isOnline]);

  useEffect(() => {
    if (!user || !profile || !profile.active) {
      return;
    }
    const emailLower = (user.email || profile.email).toLowerCase();

    const unsubs = [
      subscribeWilayahConfig((cfg) => {
        setWilayah(cfg);
        saveUserCacheSlice(emailLower, 'wilayah', cfg);
        saveGlobalCacheSlice('wilayah', cfg);
      }),
      subscribeSpreadsheetConfig((cfg) => {
        setSpreadsheetConfig(cfg);
        saveUserCacheSlice(emailLower, 'spreadsheetConfig', cfg);
        saveGlobalCacheSlice('spreadsheetConfig', cfg);
      }),
      subscribeStaffList(profile, (list) => {
        setStaffList(list);
        saveUserCacheSlice(emailLower, 'staffList', list);
        if (profile.role === 'admin' && list.length > 0) {
          saveGlobalCacheSlice('staffList', list);
        }
      }),
      subscribeHouseholds(profile.role, profile.assignedRTs || [], (list) => {
        setHouseholds(list);
        saveUserCacheSlice(emailLower, 'households', list);
      }),
      subscribeHouseholdPii(profile.role, profile.assignedRTs || [], (list) => {
        setPiiRecords(list);
        saveUserCacheSlice(emailLower, 'piiRecords', list);
      }),
      subscribeVisits(profile.role, profile.assignedRTs || [], (list) => {
        setVisits(list);
        saveUserCacheSlice(emailLower, 'visits', list);
      }),
      subscribeRevisionLogs(profile.role, profile.assignedRTs || [], (list) => {
        setRevisionLogs(list);
        saveUserCacheSlice(emailLower, 'revisionLogs', list);
      }),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, profile]);

  // Overlay offline mutations onto cached/Firestore data so the UI reflects offline submissions immediately
  const overlayed = useMemo(() => {
    return applyOfflineQueueOverlay({
      households,
      piiRecords,
      visits,
      queue: offlineQueue,
    });
  }, [households, piiRecords, visits, offlineQueue]);

  const effectiveHouseholds = overlayed.households;
  const effectivePii = overlayed.piiRecords;
  const effectiveVisits = overlayed.visits;
  const pendingSyncIds = overlayed.pendingSyncIds;

  const pendingSheetCount = useMemo(() => {
    return effectiveHouseholds.filter((h) => isHouseholdSubmittedForSheet(h) && !h.sheetSynced)
      .length;
  }, [effectiveHouseholds]);

  const runSyncNow = useCallback(
    async (manual = false) => {
      if (!isOnline || !user || !profile || !profile.active || isSyncingRef.current) {
        return;
      }
      if (!manual && Date.now() < quotaCooldownUntilRef.current) {
        return;
      }
      const emailLower = (user.email || profile.email).toLowerCase();
      const currentQueue = loadOfflineQueue(emailLower);
      const hasUnsyncedSheet =
        Boolean(spreadsheetConfig?.webhookUrl) &&
        households.some(
          (h) =>
            isHouseholdSubmittedForSheet(h) &&
            !h.sheetSynced &&
            !syncedSheetIdsInSessionRef.current.has(h.id_rt) &&
            (profile.role === 'admin' ||
              h.enumerator_email?.toLowerCase() === emailLower ||
              h.createdBy?.toLowerCase() === emailLower)
        );

      if (currentQueue.length === 0 && !hasUnsyncedSheet) {
        if (manual) {
          setToastMessage('Seluruh data sensus sudah sinkron dengan server & Spreadsheet.');
        }
        return;
      }

      isSyncingRef.current = true;
      setIsSyncingQueue(true);
      try {
        const res = await flushOfflineSyncQueue({
          actorEmail: emailLower,
          actorRole: profile.role,
          hasFirebaseUser: Boolean(user),
          spreadsheetConfig,
          households,
          piiRecords,
          visits,
          syncedSheetIdsInSession: syncedSheetIdsInSessionRef.current,
        });
        setOfflineQueue(loadOfflineQueue(emailLower));

        if (res.quotaExceeded) {
          quotaCooldownUntilRef.current = Date.now() + 15 * 60 * 1000;
          setQuotaLimitedNotice(true);
          if (manual) {
            setToastMessage(
              'Kuota tulis harian server Firestore sedang penuh (reset otomatis besok). Enumerator tetap bisa mengisi formulir; data disimpan aman di perangkat.'
            );
          }
        } else if (res.firestoreSyncedCount > 0 || res.sheetSyncedCount > 0) {
          if (res.firestoreSyncedCount > 0) {
            quotaCooldownUntilRef.current = 0;
            setQuotaLimitedNotice(false);
          }
          const parts: string[] = [];
          if (res.firestoreSyncedCount > 0) {
            parts.push(`${res.firestoreSyncedCount} data masuk ke database`);
          }
          if (res.sheetSyncedCount > 0) {
            parts.push(`${res.sheetSyncedCount} data terkirim ke Google Spreadsheet`);
          }
          setToastMessage(`Sinkronisasi otomatis selesai: ${parts.join(' & ')}.`);
        } else if (manual && res.remainingCount > 0) {
          setToastMessage(
            `${res.remainingCount} data masih menunggu sinkronisasi. Pastikan jaringan stabil.`
          );
        }
      } finally {
        isSyncingRef.current = false;
        setIsSyncingQueue(false);
      }
    },
    [isOnline, user, profile, spreadsheetConfig, households, piiRecords, visits]
  );

  // Trigger automatic background sync whenever online & authenticated with pending items
  useEffect(() => {
    if (!isOnline || !user || !profile || !profile.active) return;

    const emailLower = (user.email || profile.email).toLowerCase();
    const hasQueue = offlineQueue.length > 0;
    const hasUnsyncedSheet =
      Boolean(spreadsheetConfig?.webhookUrl) &&
      households.some(
        (h) =>
          isHouseholdSubmittedForSheet(h) &&
          !h.sheetSynced &&
          !syncedSheetIdsInSessionRef.current.has(h.id_rt) &&
          (profile.role === 'admin' ||
            h.enumerator_email?.toLowerCase() === emailLower ||
            h.createdBy?.toLowerCase() === emailLower)
      );

    if (!hasQueue && !hasUnsyncedSheet) return;

    const timer = setTimeout(() => {
      runSyncNow(false);
    }, 650);

    return () => clearTimeout(timer);
  }, [isOnline, user, profile, offlineQueue.length, spreadsheetConfig?.webhookUrl, households, runSyncNow]);

  // Auto-pull daftar petugas dari tab "petugas" Google Spreadsheet saat Admin online / kembali ke aplikasi
  useEffect(() => {
    const webhookUrl = spreadsheetConfig?.webhookUrl;
    if (!isOnline || !user || !profile || !profile.active || !webhookUrl) return;
    if (profile.role !== 'admin') return;

    const runAutoStaffSync = async () => {
      const now = Date.now();
      if (isStaffSyncingRef.current || now - lastAutoStaffSyncAtRef.current < 45000) return;
      isStaffSyncingRef.current = true;
      lastAutoStaffSyncAtRef.current = now;
      try {
        const res = await syncStaffMembersFromSpreadsheet({
          webhookUrl,
          wilayah,
          actorEmail: profile.email,
          actorRole: profile.role,
          replaceRemoved: false,
          preserveBlankRt: true,
        });
        const totalChanges = res.created + res.updated;
        if (!res.emptySheet && totalChanges > 0) {
          setToastMessage(
            `Daftar petugas otomatis disinkronkan dari Spreadsheet (${res.created} baru, ${res.updated} diperbarui).`
          );
        }
      } catch {
        // Diamkan jika Apps Script versi lama belum mendukung doGet; info lengkap ada di menu Petugas
      } finally {
        isStaffSyncingRef.current = false;
      }
    };

    const timer = setTimeout(runAutoStaffSync, 1200);
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        runAutoStaffSync();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [isOnline, user, profile, spreadsheetConfig?.webhookUrl, wilayah]);

  const allowedTabs = useMemo(() => {
    if (!profile) return [];
    return NAV_TABS.filter((t) => t.roles.includes(profile.role));
  }, [profile]);

  const effectiveTab = useMemo<NavTabId>(() => {
    if (allowedTabs.some((t) => t.id === activeTab)) return activeTab;
    return allowedTabs[0]?.id || 'pendataan';
  }, [allowedTabs, activeTab]);

  const activeHousehold = useMemo(() => {
    if (!activeHouseholdId) return null;
    return effectiveHouseholds.find((h) => h.id_rt === activeHouseholdId) || null;
  }, [effectiveHouseholds, activeHouseholdId]);

  const activePii = useMemo(() => {
    if (!activeHouseholdId) return undefined;
    return effectivePii.find((p) => p.id_rt === activeHouseholdId);
  }, [effectivePii, activeHouseholdId]);

  const handleSignIn = async () => {
    const res = await googleSignIn();
    if (res.user) {
      setUser(res.user);
    }
  };

  const handleOfflineSignIn = (params: { email: string }) => {
    const sess = createOfflineAuthSessionForEmail({
      email: params.email,
      bootstrapAdminEmail: BOOTSTRAP_ADMIN_EMAIL,
    });
    setOfflineSession(sess);
    setProfile(sess.profile);
    setProfileLoading(false);
    setToastMessage(
      sess.isProvisionalOffline
        ? `Masuk Mode Luring sebagai ${sess.email}. Data disimpan di perangkat dan akan dikirim setelah verifikasi Google saat online.`
        : `Masuk Mode Luring dengan akun terdaftar (${sess.email}).`
    );
  };

  const handleSignOut = async () => {
    clearOfflineSession();
    setOfflineSession(null);
    setActiveHouseholdId(null);
    setHouseholds([]);
    setPiiRecords([]);
    setVisits([]);
    setRevisionLogs([]);
    setStaffList([]);
    setProfile(null);
    await logout();
  };

  const handleAdminDeleteHousehold = async (target: HouseholdRecord) => {
    if (!profile || profile.role !== 'admin') return;
    await deleteSingleHouseholdRecord(target.id_rt);
    syncedSheetIdsInSessionRef.current.delete(target.id_rt);
    if (activeHouseholdId === target.id_rt) {
      setActiveHouseholdId(null);
    }

    if (isOnline && spreadsheetConfig?.webhookUrl) {
      const remainingHouseholds = effectiveHouseholds.filter((x) => x.id_rt !== target.id_rt);
      const remainingPii = effectivePii.filter((x) => x.id_rt !== target.id_rt);
      const remainingVisits = effectiveVisits.filter((x) => x.id_rt !== target.id_rt);
      const remainingLogs = revisionLogs.filter((x) => x.id_rt !== target.id_rt);

      await syncAllDataViaWebhook({
        webhookUrl: spreadsheetConfig.webhookUrl,
        households: remainingHouseholds,
        piiRecords: remainingPii,
        visits: remainingVisits,
        revisionLogs: remainingLogs,
      });
      await saveSpreadsheetConfig({
        spreadsheetId: spreadsheetConfig.spreadsheetId,
        spreadsheetUrl: spreadsheetConfig.spreadsheetUrl,
        webhookUrl: spreadsheetConfig.webhookUrl,
        title: spreadsheetConfig.title,
        lastSyncedAt: new Date().toISOString(),
        updatedBy: profile.email,
      });
    }

    setToastMessage(
      spreadsheetConfig?.webhookUrl
        ? `Data ${target.id_rt} berhasil dihapus dari aplikasi & Google Spreadsheet.`
        : `Data ${target.id_rt} berhasil dihapus dari aplikasi.`
    );
  };

  const handleAfterReset = (msg: string) => {
    syncedSheetIdsInSessionRef.current.clear();
    setActiveHouseholdId(null);
    setOfflineQueue([]);
    setHouseholds([]);
    setPiiRecords([]);
    setVisits([]);
    setRevisionLogs([]);
    setToastMessage(msg);
  };

  const isOfflineFallbackAuth = !user && Boolean(offlineSession && profile && profile.active);
  const canStayLoggedInOffline = isOfflineFallbackAuth;
  const isAuthenticatedSession = Boolean((user || canStayLoggedInOffline) && profile && profile.active);

  if (!authReady && !isOfflineFallbackAuth) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-900 text-white shadow-sm">
          <ClipboardCheck className="h-6 w-6 animate-pulse" />
        </div>
        <p className="mt-4 text-sm font-bold text-slate-900">Memuat Sensus Cibiru Wetan 2026...</p>
        <p className="mt-1 text-xs text-slate-500">Menyiapkan basis data luring &amp; profil petugas</p>
      </div>
    );
  }

  if (user && profileLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-900 text-white shadow-sm">
          <ClipboardCheck className="h-6 w-6 animate-pulse" />
        </div>
        <p className="mt-4 text-sm font-bold text-slate-900">Memuat Sensus Cibiru Wetan 2026...</p>
        <p className="mt-1 text-xs text-slate-500">Menyiapkan basis data luring &amp; profil petugas</p>
      </div>
    );
  }

  if (!isAuthenticatedSession || !profile) {
    return (
      <LoginView
        user={user}
        unregisteredEmail={user ? user.email || '' : null}
        inactiveMessage={Boolean(profile && !profile.active)}
        knownAccounts={knownAccounts}
        bootstrapAdminEmail={BOOTSTRAP_ADMIN_EMAIL}
        onSignIn={handleSignIn}
        onOfflineSignIn={handleOfflineSignIn}
        onSignOut={handleSignOut}
        onKnownAccountsChanged={() => setKnownAccounts(loadKnownAccounts())}
        isOnline={isOnline}
      />
    );
  }

  const totalPendingLocalCount = offlineQueue.length;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Compact Sticky Top App Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-900 text-white">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold tracking-tight text-slate-950">
                Sensus Cibiru Wetan 2026
              </p>
              <p className="truncate text-[11px] font-semibold text-slate-500">
                {profile.name} · {ROLE_LABELS[profile.role]}
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs */}
          {!activeHousehold && (
            <nav aria-label="Navigasi utama" className="hidden items-center gap-1 md:flex">
              {allowedTabs.map((tab) => {
                const Icon = tab.icon;
                const active = effectiveTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition whitespace-nowrap ${
                      active
                        ? 'bg-emerald-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          )}

          {/* Right Status + PWA + Sign Out */}
          <div className="flex shrink-0 items-center gap-2">
            {!isOnline ? (
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-900">
                <CloudOff className="h-3.5 w-3.5" />
                <span>
                  {totalPendingLocalCount > 0
                    ? `Luring · ${totalPendingLocalCount} lokal`
                    : 'Mode Luring'}
                </span>
              </span>
            ) : isSyncingQueue ? (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-900">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Menyinkronkan...</span>
              </span>
            ) : totalPendingLocalCount > 0 || (pendingSheetCount > 0 && spreadsheetConfig?.webhookUrl) ? (
              <button
                type="button"
                onClick={() => (user ? runSyncNow(true) : handleSignIn())}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-900 hover:bg-emerald-100"
                title="Kirim antrean data lokal & sinkronkan ke Google Spreadsheet"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>
                  Sinkron ({totalPendingLocalCount > 0 ? totalPendingLocalCount : pendingSheetCount})
                </span>
              </button>
            ) : null}

            <PWAInstallButton />

            <button
              type="button"
              onClick={handleSignOut}
              title="Keluar akun"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className={`mx-auto max-w-6xl px-4 py-4 ${!activeHousehold ? 'pb-24 md:pb-8' : ''}`}>
        {/* Re-auth prompt only if offline fallback session regained internet without live Firebase Auth */}
        {isOfflineFallbackAuth && isOnline && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
            <span>
              Koneksi internet kembali aktif. Hubungkan akun Google ({profile.email}) untuk
              verifikasi &amp; menyinkronkan{' '}
              {totalPendingLocalCount > 0
                ? `${totalPendingLocalCount} data yang tersimpan lokal`
                : 'data'}{' '}
              ke server &amp; Google Spreadsheet.
            </span>
            <button
              type="button"
              onClick={() => {
                handleSignIn().catch(() => {});
              }}
              className="min-h-[36px] rounded-lg bg-emerald-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-900"
            >
              Hubungkan Google &amp; Sinkronkan
            </button>
          </div>
        )}

        {quotaLimitedNotice && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-950">
            <span>
              Kuota tulis harian server Firestore sedang penuh (reset otomatis besok). Anda{' '}
              <strong>tetap dapat menambah rumah tangga dan mengisi formulir</strong>—data disimpan
              aman di perangkat dan akan tersinkron otomatis setelah kuota harian pulih.
            </span>
            <button
              type="button"
              onClick={() => setQuotaLimitedNotice(false)}
              className="rounded-md p-1 text-amber-800 hover:bg-amber-100"
              aria-label="Tutup pemberitahuan kuota"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {toastMessage && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-950 shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>{toastMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastMessage(null)}
              className="rounded-md p-1 text-emerald-800 hover:bg-emerald-100"
              aria-label="Tutup pemberitahuan"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {activeHousehold ? (
          <QuestionnaireWizard
            household={activeHousehold}
            existingPii={activePii}
            actorEmail={profile.email}
            actorName={profile.name}
            actorRole={profile.role}
            isOnline={isOnline}
            hasFirebaseUser={Boolean(user)}
            spreadsheetConfig={spreadsheetConfig}
            onClose={() => setActiveHouseholdId(null)}
            onSubmittedMessage={(msg) => setToastMessage(msg)}
          />
        ) : (
          <>
            {effectiveTab === 'pendataan' && (
              <HouseholdListView
                profile={profile}
                wilayah={wilayah}
                households={effectiveHouseholds}
                isOnline={isOnline}
                hasFirebaseUser={Boolean(user)}
                pendingSyncIds={pendingSyncIds}
                onOpenQuestionnaire={(h) => setActiveHouseholdId(h.id_rt)}
                onAdminDeleteHousehold={
                  profile.role === 'admin' && isOnline ? handleAdminDeleteHousehold : undefined
                }
                onNotice={(msg) => setToastMessage(msg)}
              />
            )}

            {effectiveTab === 'verifikasi' && profile.role === 'admin' && (
              <VerificationView
                profile={profile}
                households={effectiveHouseholds}
                piiRecords={effectivePii}
                revisionLogs={revisionLogs}
                onEditHousehold={(h) => setActiveHouseholdId(h.id_rt)}
                onAdminDeleteHousehold={isOnline ? handleAdminDeleteHousehold : undefined}
              />
            )}

            {effectiveTab === 'cakupan' &&
              (profile.role === 'admin' || profile.role === 'koordinator') && (
                <CoverageDashboardView
                  wilayah={wilayah}
                  households={effectiveHouseholds}
                  visits={effectiveVisits}
                />
              )}

            {effectiveTab === 'peta' && (
              <CensusMapView
                role={profile.role}
                wilayah={wilayah}
                households={effectiveHouseholds}
              />
            )}

            {effectiveTab === 'petugas' &&
              (profile.role === 'admin' || profile.role === 'koordinator') && (
                <StaffManagementView
                  profile={profile}
                  wilayah={wilayah}
                  staffList={staffList}
                  spreadsheetConfig={spreadsheetConfig}
                  isOnline={isOnline}
                  onStaffSyncedToSheet={() => {
                    lastAutoStaffSyncAtRef.current = Date.now();
                  }}
                />
              )}

            {effectiveTab === 'admin' && profile.role === 'admin' && (
              <AdminSettingsAndExportView
                adminEmail={profile.email}
                wilayah={wilayah}
                spreadsheetConfig={spreadsheetConfig}
                households={effectiveHouseholds}
                piiRecords={effectivePii}
                visits={effectiveVisits}
                revisionLogs={revisionLogs}
                isOnline={isOnline}
                onAfterReset={handleAfterReset}
              />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar */}
      {!activeHousehold && (
        <nav
          aria-label="Navigasi seluler"
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur pb-safe md:hidden"
        >
          <div
            className="grid gap-1 px-1.5 pt-1.5"
            style={{ gridTemplateColumns: `repeat(${allowedTabs.length}, minmax(0, 1fr))` }}
          >
            {allowedTabs.map((tab) => {
              const Icon = tab.icon;
              const active = effectiveTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-bold transition ${
                    active
                      ? 'bg-emerald-50 text-emerald-900'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate max-w-full">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
