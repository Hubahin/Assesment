import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AlertTriangle, CheckCircle2, Crosshair, MapPin, Navigation } from 'lucide-react';
import { LokasiData } from '../types/census';

// Pusat Desa Cibiru Wetan, Kec. Cileunyi, Kab. Bandung
const CIBIRU_WETAN_CENTER: [number, number] = [-6.9242, 107.7285];

interface LocationPickerProps {
  value?: LokasiData;
  onChange: (lokasi: LokasiData) => void;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({ value, onChange }) => {
  const [tracking, setTracking] = useState(false);
  const [liveAccuracy, setLiveAccuracy] = useState<number | null>(null);
  const [liveCoords, setLiveCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState(value?.metode === 'manual');
  const [manualReason, setManualReason] = useState(value?.alasan_manual || '');

  const watchIdRef = useRef<number | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);

  const stopWatching = () => {
    if (watchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setTracking(false);
  };

  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, []);

  // Initialize Leaflet map when manualMode is active or coordinates exist
  useEffect(() => {
    if (!manualMode || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initCenter: [number, number] = value
        ? [value.lat, value.lng]
        : liveCoords
        ? [liveCoords.lat, liveCoords.lng]
        : CIBIRU_WETAN_CENTER;

      const map = L.map(mapContainerRef.current, {
        center: initCenter,
        zoom: 17,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      if (value) {
        markerRef.current = L.circleMarker([value.lat, value.lng], {
          radius: 10,
          color: '#064E3B',
          fillColor: '#10B981',
          fillOpacity: 0.9,
          weight: 3,
        }).addTo(map);
      }

      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));

        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lng]);
        } else {
          markerRef.current = L.circleMarker([lat, lng], {
            radius: 10,
            color: '#064E3B',
            fillColor: '#10B981',
            fillOpacity: 0.9,
            weight: 3,
          }).addTo(map);
        }

        onChange({
          lat,
          lng,
          akurasi: 0,
          waktu: new Date().toISOString(),
          metode: 'manual',
          alasan_manual: manualReason.trim(),
        });
      });

      mapInstanceRef.current = map;
      setTimeout(() => map.invalidateSize(), 150);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualMode]);

  const startGpsCapture = () => {
    setGpsError(null);
    setManualMode(false);
    if (!('geolocation' in navigator)) {
      setGpsError('Perangkat ini tidak mendukung GPS. Gunakan mode tandai manual di peta.');
      return;
    }

    setTracking(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy);
        setLiveCoords({ lat, lng });
        setLiveAccuracy(acc);

        // Otomatis kunci bila akurasi <= 10 meter
        if (acc <= 10) {
          onChange({
            lat,
            lng,
            akurasi: acc,
            waktu: new Date().toISOString(),
            metode: 'gps',
          });
          stopWatching();
        }
      },
      (err) => {
        setGpsError(
          err.code === 1
            ? 'Izin lokasi ditolak browser. Aktifkan izin lokasi atau gunakan mode manual di peta.'
            : 'Gagal memperoleh sinyal GPS. Pastikan berada di depan pintu rumah atau gunakan mode manual.'
        );
        stopWatching();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20000,
      }
    );
  };

  const acceptCurrentGps = () => {
    if (!liveCoords || liveAccuracy === null) return;
    onChange({
      lat: liveCoords.lat,
      lng: liveCoords.lng,
      akurasi: liveAccuracy,
      waktu: new Date().toISOString(),
      metode: 'gps',
    });
    stopWatching();
  };

  const handleManualReasonChange = (reason: string) => {
    setManualReason(reason);
    if (value && value.metode === 'manual') {
      onChange({
        ...value,
        alasan_manual: reason,
      });
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-slate-900">Titik Lokasi Rumah (WGS84)</p>
          <p className="text-xs text-slate-600">
            Ambil di depan pintu rumah. Tunggu sampai akurasi di bawah 10 meter (maks. 20 m).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={tracking ? stopWatching : startGpsCapture}
          className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
            tracking
              ? 'bg-amber-600 text-white hover:bg-amber-700'
              : 'bg-emerald-800 text-white hover:bg-emerald-900'
          }`}
        >
          <Navigation className="h-4 w-4" />
          <span>{tracking ? 'Hentikan Pencarian GPS' : 'Ambil Titik GPS'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            stopWatching();
            setManualMode((v) => !v);
          }}
          className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
            manualMode
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
          }`}
        >
          <MapPin className="h-4 w-4" />
          <span>{manualMode ? 'Tutup Peta Manual' : 'Tandai Manual di Peta'}</span>
        </button>
      </div>

      {tracking && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-950">
              <Crosshair className="h-4 w-4 animate-spin" />
              <span>Mencari satelit GPS...</span>
            </div>
            {liveAccuracy !== null && (
              <span className="font-mono text-sm font-bold tabular-nums text-sky-900">
                Akurasi: {liveAccuracy} m
              </span>
            )}
          </div>

          {liveCoords && liveAccuracy !== null && liveAccuracy > 10 && liveAccuracy <= 20 && (
            <div className="mt-3 space-y-2 border-t border-sky-200 pt-2.5">
              <p className="text-xs text-amber-900 font-medium">
                Akurasi {liveAccuracy} m (antara 10–20 m). Anda dapat menerima dengan peringatan
                atau menunggu hingga ≤ 10 m.
              </p>
              <button
                type="button"
                onClick={acceptCurrentGps}
                className="min-h-[44px] w-full rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700"
              >
                Gunakan Titik Ini ({liveAccuracy} m, dengan peringatan)
              </button>
            </div>
          )}

          {liveCoords && liveAccuracy !== null && liveAccuracy > 20 && (
            <div className="mt-2 flex flex-col gap-2">
              <p className="text-xs text-slate-700">
                Akurasi masih {liveAccuracy} m (&gt; 20 m). Bergeraklah ke area terbuka atau tunggu
                sebentar.
              </p>
              <button
                type="button"
                onClick={acceptCurrentGps}
                className="min-h-[40px] rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
              >
                Pakai sementara ({liveAccuracy} m)
              </button>
            </div>
          )}
        </div>
      )}

      {gpsError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
          <span>{gpsError}</span>
        </div>
      )}

      {manualMode && (
        <div className="space-y-3 rounded-xl border border-slate-300 bg-white p-3">
          <p className="text-xs font-medium text-slate-700">
            Ketuk lokasi rumah pada peta OpenStreetMap di bawah ini, lalu wajib isi alasan
            penentuan manual.
          </p>
          <div
            ref={mapContainerRef}
            className="h-64 w-full overflow-hidden rounded-lg border border-slate-200"
          />
          <div>
            <label className="block text-xs font-bold text-slate-800">
              Alasan penentuan titik manual <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              value={manualReason}
              onChange={(e) => handleManualReasonChange(e.target.value)}
              placeholder="Contoh: Sinyal GPS lemah di gang sempit / atap rapat"
              className="mt-1.5 min-h-[44px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none"
            />
          </div>
        </div>
      )}

      {value && (
        <div
          className={`rounded-xl border p-3 ${
            value.metode === 'gps' && value.akurasi <= 10
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-amber-300 bg-amber-50 text-amber-950'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold">
              {value.metode === 'gps' && value.akurasi <= 10 ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-700" />
              )}
              <span>
                {value.metode === 'gps'
                  ? `GPS Tersimpan · Akurasi ${value.akurasi} m`
                  : 'Titik Manual Peta Tersimpan'}
              </span>
            </div>
            <span className="font-mono text-xs tabular-nums">
              {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
            </span>
          </div>
          {value.metode === 'manual' && !value.alasan_manual?.trim() && (
            <p className="mt-1 text-xs font-semibold text-rose-700">
              Isi alasan penentuan manual di atas sebelum mengirim.
            </p>
          )}
        </div>
      )}
    </div>
  );
};
