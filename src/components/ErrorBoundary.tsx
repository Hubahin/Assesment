import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Terjadi kesalahan pada aplikasi.',
    };
  }

  render() {
    if (this.state.hasError) {
      let displayMsg = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed && parsed.error) {
          displayMsg = `Operasi ${parsed.operationType || 'data'} (${parsed.path || '-'}): ${parsed.error}`;
        }
      } catch {
        // plain string error
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 text-rose-700">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h1 className="text-lg font-bold">Terjadi Gangguan Sistem</h1>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-700 break-words">{displayMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              <RotateCcw className="h-4 w-4" />
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
