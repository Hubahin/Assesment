import React, { useState } from 'react';
import { Camera, FolderOpen, ImageOff, Trash2 } from 'lucide-react';

interface PhotoCaptureProps {
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
}

export const PhotoCapture: React.FC<PhotoCaptureProps> = ({ value, onChange }) => {
  const [processing, setProcessing] = useState(false);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
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
          let compressed = canvas.toDataURL('image/jpeg', 0.72);
          if (compressed.length > 420000) {
            compressed = canvas.toDataURL('image/jpeg', 0.55);
          }
          if (compressed.length > 420000) {
            compressed = canvas.toDataURL('image/jpeg', 0.4);
          }
          onChange(compressed);
        } catch {
          setDisabledReason('Penyimpanan/kompresi foto tidak tersedia pada perangkat ini. Kuesioner tetap dapat dilanjutkan.');
        } finally {
          setProcessing(false);
        }
      };
      img.onerror = () => {
        setDisabledReason('Berkas gambar tidak dapat dibaca. Anda dapat memilih berkas lain atau melanjutkan tanpa foto.');
        setProcessing(false);
      };
      img.src = String(reader.result);
    };
    reader.onerror = () => {
      setDisabledReason('Gagal membaca foto dari perangkat. Anda dapat memilih berkas lain atau melanjutkan tanpa foto.');
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-sm font-bold text-slate-900">Foto Bagian Depan Rumah</p>
        <p className="text-xs text-slate-600">
          Ambil langsung dengan kamera atau pilih dari galeri/file HP setelah warga setuju.
          Hindari wajah orang dalam foto (otomatis dikompresi maks. 1024 piksel).
        </p>
      </div>

      {disabledReason && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <ImageOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <span>{disabledReason}</span>
        </div>
      )}

      {value ? (
        <div className="space-y-2">
          <img
            src={value}
            alt="Foto bagian depan rumah"
            className="max-h-64 w-full rounded-xl border border-slate-200 object-cover"
          />
          <button
            type="button"
            onClick={() => {
              setDisabledReason(null);
              onChange(null);
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            Hapus / Ganti Foto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-900 transition hover:border-emerald-700 hover:bg-emerald-50">
            <Camera className="h-5 w-5 shrink-0 text-emerald-800" />
            <span>{processing ? 'Mengompresi...' : 'Ambil dari Kamera'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              disabled={processing}
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          <label className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 transition hover:border-emerald-700 hover:bg-emerald-50">
            <FolderOpen className="h-5 w-5 shrink-0 text-slate-700" />
            <span>{processing ? 'Mengompresi...' : 'Pilih dari Galeri / File'}</span>
            <input
              type="file"
              accept="image/*"
              disabled={processing}
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );
};
