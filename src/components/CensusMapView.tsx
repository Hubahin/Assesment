import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { DUSUN_LIST, STATUS_CACAH_META } from '../data/instrumentSpec';
import { HouseholdRecord, UserRole, WilayahConfig } from '../types/census';

const CIBIRU_WETAN_CENTER: [number, number] = [-6.9242, 107.7285];

interface CensusMapViewProps {
  role: UserRole;
  wilayah: WilayahConfig;
  households: HouseholdRecord[];
}

export const CensusMapView: React.FC<CensusMapViewProps> = ({
  role,
  wilayah,
  households,
}) => {
  const isAdmin = role === 'admin';
  const [filterDusun, setFilterDusun] = useState('');
  const [filterRw, setFilterRw] = useState('');
  const [filterRt, setFilterRt] = useState('');

  const mapRef = useRef<HTMLDivElement | null>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const rwOptions = useMemo(() => {
    return wilayah.rwMappings
      .filter((m) => !filterDusun || m.dusun === filterDusun)
      .map((m) => m.rw);
  }, [wilayah, filterDusun]);

  const rtOptions = useMemo(() => {
    if (!filterRw) return [];
    const mapping = wilayah.rwMappings.find((m) => m.rw === filterRw);
    if (!mapping) return [];
    return Array.from({ length: mapping.jumlahRt }, (_, i) => String(i + 1).padStart(2, '0'));
  }, [wilayah, filterRw]);

  const geocoded = useMemo(() => {
    return households.filter((h) => {
      if (!h.modul0?.lokasi || typeof h.modul0.lokasi.lat !== 'number') return false;
      if (filterDusun && h.dusun !== filterDusun) return false;
      if (filterRw && h.rw !== filterRw) return false;
      if (filterRt && h.rt !== filterRt) return false;
      return true;
    });
  }, [households, filterDusun, filterRw, filterRt]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!leafletMapRef.current) {
      const map = L.map(mapRef.current, {
        center: CIBIRU_WETAN_CENTER,
        zoom: 15,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      layerGroupRef.current = L.layerGroup().addTo(map);
      leafletMapRef.current = map;
      setTimeout(() => map.invalidateSize(), 150);
    }

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = leafletMapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    const bounds: [number, number][] = [];

    for (const h of geocoded) {
      const loc = h.modul0!.lokasi!;
      const meta = STATUS_CACAH_META[h.status_cacah];
      bounds.push([loc.lat, loc.lng]);

      const marker = L.circleMarker([loc.lat, loc.lng], {
        radius: 8,
        color: '#0F172A',
        weight: 2,
        fillColor: meta.hex,
        fillOpacity: 0.92,
      });

      const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const popupLines = [
        `<div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; line-height: 1.5;">`,
        `<div style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: #064E3B;">${esc(h.id_rt)}</div>`,
        `<div>Status: <strong>${esc(meta.label)}</strong></div>`,
      ];
      if (isAdmin) {
        popupLines.push(
          `<div>Nama KK: <strong>${esc(h.modulA?.nama_kk || h.nama_kk_daftar)}</strong></div>`
        );
      }
      popupLines.push(`</div>`);

      marker.bindPopup(popupLines.join(''));
      marker.addTo(group);
    }

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 17 });
    }
  }, [geocoded, isAdmin]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-extrabold text-slate-950">Peta Sebaran Rumah Tangga</h2>
            <p className="text-xs text-slate-600">
              Menampilkan <strong className="font-mono">{geocoded.length}</strong> titik lokasi
              tercatat (WGS84 · OpenStreetMap).
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <select
            value={filterDusun}
            onChange={(e) => {
              setFilterDusun(e.target.value);
              setFilterRw('');
              setFilterRt('');
            }}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
          >
            <option value="">Semua Dusun</option>
            {DUSUN_LIST.map((d) => (
              <option key={d.code} value={d.code}>
                {d.code} · {d.label}
              </option>
            ))}
          </select>

          <select
            value={filterRw}
            onChange={(e) => {
              setFilterRw(e.target.value);
              setFilterRt('');
            }}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
          >
            <option value="">Semua RW</option>
            {rwOptions.map((rw) => (
              <option key={rw} value={rw}>
                RW {rw}
              </option>
            ))}
          </select>

          <select
            value={filterRt}
            disabled={!filterRw}
            onChange={(e) => setFilterRt(e.target.value)}
            className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 disabled:bg-slate-100"
          >
            <option value="">Semua RT</option>
            {rtOptions.map((rt) => (
              <option key={rt} value={rt}>
                RT {rt}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 pt-1 text-xs">
          {Object.entries(STATUS_CACAH_META).map(([k, meta]) => (
            <div key={k} className="flex items-center gap-1.5 font-semibold text-slate-700">
              <span
                className="inline-block h-3 w-3 rounded-full border border-slate-900"
                style={{ backgroundColor: meta.hex }}
              />
              <span>{meta.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div ref={mapRef} className="h-[480px] w-full" />
      </div>
    </div>
  );
};
