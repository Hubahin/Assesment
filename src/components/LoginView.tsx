import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  LogOut,
  ShieldAlert,
  UserCheck,
  WifiOff,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  findRegisteredOfflineAccount,
  KnownAccountRecord,
  removeKnownAccount,
} from '../services/offlineStore';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginViewProps {
  user: User | null;
  unregisteredEmail?: string | null;
  inactiveMessage?: boolean;
  knownAccounts: KnownAccountRecord[];
  bootstrapAdminEmail: string;
  onSignIn: () => Promise<void>;
  onOfflineSignIn: (params: { email: string }) => void;
  onSignOut: () => Promise<void>;
  onKnownAccountsChanged: () => void;
  isOnline: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  koordinator: 'Koordinator',
  enumerator: 'Enumerator',
};

export const LoginView: React.FC<LoginViewProps> = ({
  user,
  unregisteredEmail,
  inactiveMessage,
  knownAccounts,
  bootstrapAdminEmail,
  onSignIn,
  onOfflineSignIn,
  onSignOut,
  onKnownAccountsChanged,
  isOnline,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [unauthorizedHost, setUnauthorizedHost] = useState<string | null>(null);

  const activeKnownAccounts = useMemo(
    () => knownAccounts.filter((a) => a.profile.active),
    [knownAccounts]
  );

  const [showOfflineForm, setShowOfflineForm] = useState(!isOnline);
  const [offlineEmail, setOfflineEmail] = useState('');
  const [offlineFormErr, setOfflineFormErr] = useState<string | null>(null);

  const matchedRegisteredStaff = useMemo(() => {
    const clean = offlineEmail.trim().toLowerCase();
    if (!clean) return null;
    return findRegisteredOfflineAccount(clean);
  }, [offlineEmail]);

  const isBootstrapOfflineEmail =
    offlineEmail.trim().toLowerCase() === bootstrapAdminEmail.toLowerCase();

  const handleLogin = async () => {
    setErrorMsg(null);
    setUnauthorizedHost(null);

    if (!isOnline) {
      if (activeKnownAccounts.length === 1 && !offlineEmail.trim()) {
        try {
          onOfflineSignIn({ email: activeKnownAccounts[0].email });
        } catch (err: any) {
          setOfflineFormErr(err?.message || 'Gagal masuk secara luring.');
        }
        return;
      }
      setShowOfflineForm(true);
      return;
    }

    setLoading(true);
    try {
      await onSignIn();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/unauthorized-domain') {
        setUnauthorizedHost(window.location.hostname);
        setErrorMsg(
          `Domain "${window.location.hostname}" belum didaftarkan pada Authorized domains di Firebase Authentication.`
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('Jendela masuk Google diblokir oleh browser. Izinkan pop-up lalu coba lagi.');
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Proses masuk dibatalkan sebelum selesai.');
      } else if (code === 'auth/network-request-failed') {
        setShowOfflineForm(true);
        setErrorMsg(
          'Tidak dapat menghubungi server Google karena jaringan terputus. Silakan masuk melalui Mode Luring di bawah ini.'
        );
      } else {
        setErrorMsg(err?.message || 'Gagal masuk dengan akun Google. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOfflineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOfflineFormErr(null);
    const cleanEmail = offlineEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setOfflineFormErr('Masukkan alamat email Google yang valid (contoh: nama@gmail.com).');
      return;
    }
    try {
      onOfflineSignIn({ email: cleanEmail });
    } catch (err: any) {
      setOfflineFormErr(err?.message || 'Gagal masuk secara luring.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-slate-100 px-4 py-8">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-900 text-white">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <span className="text-sm font-bold tracking-tight text-slate-900">I&apos;ComDev Institute</span>
        </div>
        <PWAInstallButton />
      </div>

      <main className="mx-auto my-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-emerald-800">
          Desa Cibiru Wetan · Kec. Cileunyi · Kab. Bandung
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950 text-balance">
          Sensus Rumah Tangga 2026
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Aplikasi pendataan lapangan resmi I&apos;ComDev Institute. Mendukung masuk &amp; pengisian
          formulir secara luring (offline) serta sinkronisasi otomatis ke Google Spreadsheet saat
          online.
        </p>

        {!isOnline && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs font-medium text-amber-950">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Perangkat sedang <strong>Luring (Offline)</strong>. Anda tetap bisa masuk menggunakan
              akun Google tersimpan atau memasukkan email Google Anda untuk mengisi data secara
              lokal.
            </span>
          </div>
        )}

        {user && unregisteredEmail ? (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
              <div>
                <h2 className="text-sm font-bold text-rose-950">
                  {inactiveMessage ? 'Akun Petugas Dinonaktifkan' : 'Akun Belum Terdaftar'}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-rose-900">
                  Email <span className="font-mono font-semibold">{unregisteredEmail}</span>{' '}
                  {inactiveMessage
                    ? 'saat ini berstatus nonaktif.'
                    : 'belum terdaftar di sistem.'}{' '}
                  Jika email Anda baru ditambahkan atau diubah di Google Spreadsheet tab{' '}
                  <code className="font-mono font-semibold">petugas</code>, minta Admin membuka
                  aplikasi atau menekan <strong>Tarik &amp; Sinkron dari Spreadsheet</strong> di menu
                  Petugas terlebih dahulu.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-100"
            >
              <LogOut className="h-4 w-4" />
              Keluar &amp; Ganti Akun Google
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {/* Saved Google Accounts for Instant 1-Tap Offline Login */}
            {activeKnownAccounts.length > 0 && !isOnline && (
              <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-950">
                  <UserCheck className="h-4 w-4 text-emerald-800" />
                  Akun Google Tersimpan di Perangkat
                </p>
                <div className="space-y-2">
                  {activeKnownAccounts.map((acc) => (
                    <div
                      key={acc.email}
                      className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white p-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => onOfflineSignIn({ email: acc.email })}
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-900 text-xs font-extrabold text-white">
                          {(acc.displayName || acc.email).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-extrabold text-slate-950">
                            {acc.displayName || acc.profile.name}
                          </p>
                          <p className="truncate font-mono text-[11px] text-slate-600">
                            {acc.email} · {ROLE_LABELS[acc.profile.role] || acc.profile.role}
                          </p>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOfflineSignIn({ email: acc.email })}
                          className="min-h-[36px] rounded-lg bg-emerald-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-900"
                        >
                          Masuk
                        </button>
                        <button
                          type="button"
                          title="Hapus akun tersimpan dari perangkat"
                          onClick={() => {
                            removeKnownAccount(acc.email);
                            onKnownAccountsChanged();
                          }}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={loading}
              onClick={handleLogin}
              className="gsi-material-button w-full"
            >
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    style={{ display: 'block' }}
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {loading
                    ? 'Menghubungkan...'
                    : !isOnline && activeKnownAccounts.length === 1
                    ? `Masuk Luring (${activeKnownAccounts[0].email})`
                    : !isOnline
                    ? 'Masuk dengan Email Google (Mode Luring)'
                    : 'Masuk dengan Google'}
                </span>
              </div>
            </button>

            {(!isOnline || showOfflineForm) && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-extrabold text-slate-900">
                  Masuk Mode Luring dengan Email Terdaftar
                </p>

                <form onSubmit={handleOfflineSubmit} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700">
                        Email Akun Google <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={offlineEmail}
                        onChange={(e) => {
                          setOfflineEmail(e.target.value);
                          setOfflineFormErr(null);
                        }}
                        placeholder="contoh: arisriswanto058@gmail.com"
                        className="mt-1 min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900"
                      />
                    </div>

                    {matchedRegisteredStaff && !matchedRegisteredStaff.active ? (
                      <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-900">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-rose-700" />
                        <span>
                          Akun ini tercatat nonaktif. Hubungi Admin atau Koordinator untuk
                          mengaktifkannya kembali.
                        </span>
                      </div>
                    ) : (matchedRegisteredStaff?.active || isBootstrapOfflineEmail) ? (
                      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                        <span>
                          Email terdaftar dikenali (
                          {matchedRegisteredStaff?.name || 'Admin'} ·{' '}
                          {ROLE_LABELS[matchedRegisteredStaff?.role || 'admin'] ||
                            matchedRegisteredStaff?.role}
                          ) — wilayah RT tugas otomatis dimuat.
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] leading-relaxed text-slate-600">
                        Cukup masukkan alamat email Google Anda yang sudah didaftarkan oleh Admin
                        atau Koordinator. Profil dan wilayah RT tugas akan diverifikasi otomatis
                        saat perangkat kembali online.
                      </p>
                    )}

                    {offlineFormErr && (
                      <p className="text-xs font-semibold text-rose-700">{offlineFormErr}</p>
                    )}

                    <button
                      type="submit"
                      className="min-h-[44px] w-full rounded-xl bg-emerald-800 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-900"
                    >
                      Masuk &amp; Mulai Pendataan Luring
                    </button>
                  </form>
              </div>
            )}

            {errorMsg && (
              <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-900">
                <p>{errorMsg}</p>
                {unauthorizedHost && firebaseConfig.projectId && (
                  <a
                    href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-bold text-emerald-900 underline hover:text-emerald-700"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Buka Pengaturan Authorized Domains di Firebase Console
                  </a>
                )}
              </div>
            )}

            <div className="border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
              Data responden dijaga kerahasiaannya dan hanya digunakan untuk perencanaan
              pembangunan Desa Cibiru Wetan (RPJMDes).
            </div>
          </div>
        )}
      </main>

      <footer className="mx-auto w-full max-w-md text-center text-xs text-slate-500">
        I&apos;ComDev Institute · Pendataan Desa Cibiru Wetan 2026
      </footer>
    </div>
  );
};
