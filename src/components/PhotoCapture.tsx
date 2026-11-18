import React, { useState } from 'react';
import { Camera, ImageOff, Trash2 } from 'lucide-react';

interface PhotoCaptureProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ value, onChange }) => {
  const [processing, setProcessing] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    setDisabledReason(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const maxSide = 1024;
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
          if (!ctx) throw new Error('Canvas tidak tersedia');
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.72);
          onChange(compressed);
        } catch {
          setDisabledReason('Penyimpanan/kompresi foto tidak tersedia pada perangkat ini. Kuesioner tetap dapat dilanjutkan.');
        } finally {
          setProcessing(false);
        }
      };
      img.onerror = () => {
        setDisabledReason('Berkas gambar tidak dapat dibaca. Anda dapat melanjutkan tanpa foto.');
        setProcessing(false);
      };
      img.src = String(reader.result);
    };
    reader.onerror = () => {
      setDisabledReason('Gagal membaca foto dari perangkat. Anda dapat melanjutkan tanpa foto.');
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-sm font-bold text-slate-900">Foto Bagian Depan Rumah</p>
        <p className="text-xs text-slate-600">
          Ambil setelah warga setuju. Hindari wajah orang dalam foto (otomatis dikompresi maks.
          1024 piksel).
        </p>
      </div>

      {disabledReason ? (
        <div className="flex items-start gap-2 rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-700">
          <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <span>{disabledReason}</span>
        </div>
      ) : value ? (
        <div className="space-y-2">
          <img
            src={value}
            alt="Foto bagian depan rumah"
            className="max-h-64 w-full rounded-xl border border-slate-200 object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            Hapus / Ambil Ulang Foto
          </button>
        </div>
      ) : (
        <label className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-emerald-700 hover:bg-emerald-50">
          <Camera className="h-5 w-5 text-emerald-800" />
          <span>{processing ? 'Mengompresi foto...' : 'Ambil atau Pilih Foto Rumah'}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={processing}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
};
