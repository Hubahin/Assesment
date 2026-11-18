import React, { useEffect, useMemo, useState } from 'react';
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
  ensureBootstrapSetup,
  subscribeHouseholdPii,
  subscribeHouseholds,
  subscribeMyStaffProfile,
  subscribeRevisionLogs,
  subscribeSpreadsheetConfig,
  subscribeStaffList,
  subscribeVisits,
  subscribeWilayahConfig,
} from './services/firestoreService';
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
  { id: 'verifikasi', label: 'Verifikasi', icon: FileCheck2, roles: ['admin', 'koordinator'] },
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<StaffMember | null>(null);
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

  const [activeTab, setActiveTab] = useState<NavTabId>('pendataan');
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    testConnection();
    const unsub = initAuth((authUser) => {
      setUser(authUser);
      setAuthReady(true);
      if (!authUser) {
        setProfile(null);
        setProfileLoading(false);
        setActiveHouseholdId(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.email) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    const email = user.email.toLowerCase();
    setProfileLoading(true);

    if (email === BOOTSTRAP_ADMIN_EMAIL) {
      ensureBootstrapSetup(email, user.displayName || 'Admin I\'ComDev').catch((err) =>
        console.warn('Bootstrap admin notice:', err)
      );
    }

    const unsub = subscribeMyStaffProfile(email, (staff) => {
      setProfile(staff);
      setProfileLoading(false);
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user || !profile || !profile.active) {
      setStaffList([]);
      setHouseholds([]);
      setPiiRecords([]);
      setVisits([]);
      setRevisionLogs([]);
      return;
    }

    const unsubs = [
      subscribeWilayahConfig(setWilayah),
      subscribeSpreadsheetConfig(setSpreadsheetConfig),
      subscribeStaffList(profile.role, setStaffList),
      subscribeHouseholds(profile.role, profile.assignedRTs || [], setHouseholds),
      subscribeHouseholdPii(profile.role, profile.assignedRTs || [], setPiiRecords),
      subscribeVisits(profile.role, profile.assignedRTs || [], setVisits),
      subscribeRevisionLogs(profile.role, profile.assignedRTs || [], setRevisionLogs),
    ];

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, profile]);

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
    return households.find((h) => h.id_rt === activeHouseholdId) || null;
  }, [households, activeHouseholdId]);

  const activePii = useMemo(() => {
    if (!activeHouseholdId) return undefined;
    return piiRecords.find((p) => p.id_rt === activeHouseholdId);
  }, [piiRecords, activeHouseholdId]);

  const pendingSheetCount = useMemo(() => {
    return households.filter((h) => h.submittedAt && !h.sheetSynced).length;
  }, [households]);

  const handleSignIn = async () => {
    const res = await googleSignIn();
    if (res.user) {
      setUser(res.user);
    }
  };

  const handleSignOut = async () => {
    setActiveHouseholdId(null);
    await logout();
  };

  if (!authReady || (user && profileLoading)) {
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

  if (!user || !profile || !profile.active) {
    return (
      <LoginView
        user={user}
        unregisteredEmail={user ? user.email || '' : null}
        inactiveMessage={Boolean(profile && !profile.active)}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        isOnline={isOnline}
      />
    );
  }

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
                <span className="hidden sm:inline">Mode Luring</span>
              </span>
            ) : pendingSheetCount > 0 && spreadsheetConfig?.webhookUrl ? (
              <span className="hidden items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-900 sm:inline-flex">
                <span>{pendingSheetCount} antre Sheet</span>
              </span>
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
                households={households}
                isOnline={isOnline}
                onOpenQuestionnaire={(h) => setActiveHouseholdId(h.id_rt)}
              />
            )}

            {effectiveTab === 'verifikasi' &&
              (profile.role === 'admin' || profile.role === 'koordinator') && (
                <VerificationView
                  profile={profile}
                  households={households}
                  piiRecords={piiRecords}
                  revisionLogs={revisionLogs}
                  onEditHousehold={(h) => setActiveHouseholdId(h.id_rt)}
                />
              )}

            {effectiveTab === 'cakupan' &&
              (profile.role === 'admin' || profile.role === 'koordinator') && (
                <CoverageDashboardView
                  wilayah={wilayah}
                  households={households}
                  visits={visits}
                />
              )}

            {effectiveTab === 'peta' && (
              <CensusMapView
                role={profile.role}
                wilayah={wilayah}
                households={households}
              />
            )}

            {effectiveTab === 'petugas' &&
              (profile.role === 'admin' || profile.role === 'koordinator') && (
                <StaffManagementView
                  profile={profile}
                  wilayah={wilayah}
                  staffList={staffList}
                />
              )}

            {effectiveTab === 'admin' && profile.role === 'admin' && (
              <AdminSettingsAndExportView
                adminEmail={profile.email}
                wilayah={wilayah}
                spreadsheetConfig={spreadsheetConfig}
                households={households}
                piiRecords={piiRecords}
                visits={visits}
                revisionLogs={revisionLogs}
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
