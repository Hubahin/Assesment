import React, { useState } from 'react';
import { ClipboardCheck, LogOut, ShieldAlert, WifiOff } from 'lucide-react';
import { User } from 'firebase/auth';
import { PWAInstallButton } from './PWAInstallButton';

interface LoginViewProps {
  user: User | null;
  unregisteredEmail?: string | null;
  inactiveMessage?: boolean;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  isOnline: boolean;
}

export const LoginView: React.FC<LoginViewProps> = ({
  user,
  unregisteredEmail,
  inactiveMessage,
  onSignIn,
  onSignOut,
  isOnline,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      await onSignIn();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/unauthorized-domain') {
        setErrorMsg(
          `Domain "${window.location.hostname}" belum diizinkan di Firebase Authentication. Gunakan URL resmi AI Studio atau tambahkan domain ini di Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else if (code === 'auth/popup-blocked') {
        setErrorMsg('Jendela masuk Google diblokir oleh browser. Izinkan pop-up lalu coba lagi.');
      } else if (code === 'auth/popup-closed-by-user') {
        setErrorMsg('Proses masuk dibatalkan sebelum selesai.');
      } else if (code === 'auth/network-request-failed') {
        setErrorMsg('Koneksi internet terputus saat menghubungi layanan masuk Google.');
      } else {
        setErrorMsg(err?.message || 'Gagal masuk dengan akun Google. Silakan coba lagi.');
      }
    } finally {
      setLoading(false);
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
          Aplikasi pendataan lapangan resmi I&apos;ComDev Institute untuk enumerator, koordinator
          enumerator, dan admin desa. Mendukung pengisian luring (offline) dan sinkronisasi otomatis
          ke Google Spreadsheet.
        </p>

        {!isOnline && (
          <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-xs font-medium text-amber-900">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>Perangkat sedang luring. Masuk akun Google memerlukan koneksi internet awal.</span>
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
                    : 'belum didaftarkan oleh Admin atau Koordinator Enumerator.'}{' '}
                  Pengguna yang belum terdaftar tidak dapat melihat data apa pun.
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
                  {loading ? 'Menghubungkan...' : 'Masuk dengan Google'}
                </span>
              </div>
            </button>

            {errorMsg && (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {errorMsg}
              </p>
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
