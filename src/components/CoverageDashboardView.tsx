import React, { useMemo, useState } from 'react';
import { HouseholdRecord, VisitRecord, WilayahConfig } from '../types/census';
import { DUSUN_LIST } from '../data/instrumentSpec';

interface CoverageDashboardViewProps {
  wilayah: WilayahConfig;
  households: HouseholdRecord[];
  visits: VisitRecord[];
}

interface CoverageRow {
  key: string;
  label: string;
  bangunan: number;
  terdaftar: number;
  tercacah: number;
  menolak: number;
  tidakDitemui: number;
  rumahKosong: number;
  belum: number;
  cakupanPct: number;
}

function computeStats(key: string, label: string, list: HouseholdRecord[]): CoverageRow {
  const bangunanSet = new Set<string>();
  let tercacah = 0;
  let menolak = 0;
  let tidakDitemui = 0;
  let rumahKosong = 0;
  let belum = 0;

  for (const h of list) {
    bangunanSet.add(`${h.rtKey}_${h.no_bangunan}`);
    if (h.status_cacah === 'tercacah') tercacah++;
    else if (h.status_cacah === 'menolak') menolak++;
    else if (h.status_cacah === 'tidak_ditemui') tidakDitemui++;
    else if (h.status_cacah === 'rumah_kosong') rumahKosong++;
    else belum++;
  }

  const terdaftar = list.length;
  const denom = Math.max(0, terdaftar - rumahKosong);
  const cakupanPct = denom > 0 ? Math.round((tercacah / denom) * 1000) / 10 : 0;

  return {
    key,
    label,
    bangunan: bangunanSet.size,
    terdaftar,
    tercacah,
    menolak,
    tidakDitemui,
    rumahKosong,
    belum,
    cakupanPct,
  };
}

export const CoverageDashboardView: React.FC<CoverageDashboardViewProps> = ({
  wilayah,
  households,
  visits,
}) => {
  const [tab, setTab] = useState<'dusun' | 'rw' | 'rt' | 'harian'>('dusun');

  const summaryAll = useMemo(() => computeStats('all', 'Total Desa Cibiru Wetan', households), [households]);

  const byDusun = useMemo(() => {
    return DUSUN_LIST.map((d) =>
      computeStats(
        d.code,
        `${d.code} · ${d.label}`,
        households.filter((h) => h.dusun === d.code)
      )
    );
  }, [households]);

  const byRw = useMemo(() => {
    return wilayah.rwMappings.map((m) =>
      computeStats(
        `${m.dusun}-${m.rw}`,
        `${m.dusun} · RW ${m.rw}`,
        households.filter((h) => h.rw === m.rw)
      )
    );
  }, [wilayah, households]);

  const byRt = useMemo(() => {
    const rows: CoverageRow[] = [];
    for (const m of wilayah.rwMappings) {
      for (let i = 1; i <= (m.jumlahRt || 0); i++) {
        const rtStr = String(i).padStart(2, '0');
        const rtKey = `${m.dusun}-${m.rw}-${rtStr}`;
        const list = households.filter((h) => h.rtKey === rtKey);
        if (list.length > 0) {
          rows.push(computeStats(rtKey, `${m.dusun} / RW ${m.rw} / RT ${rtStr}`, list));
        }
      }
    }
    return rows;
  }, [wilayah, households]);

  const dailyProgress = useMemo(() => {
    const map = new Map<
      string,
      { date: string; enumerator: string; totalVisits: number; ditemuiSetuju: number; gagal: number }
    >();
    for (const v of visits) {
      const dateStr = (v.waktu || '').slice(0, 10) || 'Tidak diketahui';
      const email = v.enumerator_name ? `${v.enumerator_name} (${v.enumerator_email})` : v.enumerator_email;
      const key = `${dateStr}__${v.enumerator_email}`;
      const cur = map.get(key) || {
        date: dateStr,
        enumerator: email,
        totalVisits: 0,
        ditemuiSetuju: 0,
        gagal: 0,
      };
      cur.totalVisits++;
      if (v.status_kunjungan === 'ditemui' && v.persetujuan === 'ya') cur.ditemuiSetuju++;
      else cur.gagal++;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [visits]);

  const activeRows = tab === 'dusun' ? byDusun : tab === 'rw' ? byRw : byRt;

  return (
    <div className="space-y-4">
      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">RTg Terdaftar</p>
          <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-slate-950">
            {summaryAll.terdaftar}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {summaryAll.bangunan} bangunan
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">Tercacah</p>
          <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-emerald-800">
            {summaryAll.tercacah}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {summaryAll.belum} belum/draf
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">Cakupan Efektif</p>
          <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-emerald-900">
            {summaryAll.cakupanPct}%
          </p>
          <p className="mt-0.5 text-xs text-slate-500">tercacah ÷ (daftar − kosong)</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold text-slate-500">Gagal / Kosong</p>
          <p className="mt-1 font-mono text-2xl font-extrabold tabular-nums text-amber-800">
            {summaryAll.menolak + summaryAll.tidakDitemui + summaryAll.rumahKosong}
          </p>
          <p className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {summaryAll.menolak} tolak · {summaryAll.tidakDitemui} tdk ditemui ·{' '}
            {summaryAll.rumahKosong} kosong
          </p>
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ['dusun', 'Per Dusun'],
              ['rw', 'Per RW'],
              ['rt', 'Per RT'],
              ['harian', 'Progres Enumerator/Hari'],
            ] as const
          ).map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[40px] rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                tab === id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {tab === 'harian' ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-bold">Tanggal</th>
                <th className="px-4 py-3 font-bold">Enumerator</th>
                <th className="px-4 py-3 text-right font-bold">Total Kunjungan</th>
                <th className="px-4 py-3 text-right font-bold">Tercacah</th>
                <th className="px-4 py-3 text-right font-bold">Menolak/Tdk Ditemui/Kosong</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dailyProgress.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                    Belum ada catatan kunjungan tercatat.
                  </td>
                </tr>
              ) : (
                dailyProgress.map((row) => (
                  <tr key={`${row.date}-${row.enumerator}`} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold tabular-nums">{row.date}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.enumerator}</td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                      {row.totalVisits}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold tabular-nums text-emerald-800">
                      {row.ditemuiSetuju}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-amber-800">
                      {row.gagal}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-bold">Wilayah</th>
                <th className="px-3 py-3 text-right font-bold">Bangunan</th>
                <th className="px-3 py-3 text-right font-bold">Terdaftar</th>
                <th className="px-3 py-3 text-right font-bold">Tercacah</th>
                <th className="px-3 py-3 text-right font-bold">Menolak</th>
                <th className="px-3 py-3 text-right font-bold">Tdk Ditemui</th>
                <th className="px-3 py-3 text-right font-bold">Kosong</th>
                <th className="px-3 py-3 text-right font-bold">Belum</th>
                <th className="px-4 py-3 text-right font-bold">Cakupan (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activeRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    Belum ada rumah tangga terdaftar pada tampilan ini.
                  </td>
                </tr>
              ) : (
                activeRows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">{r.label}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums">{r.bangunan}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold tabular-nums">{r.terdaftar}</td>
                    <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-emerald-800">
                      {r.tercacah}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-rose-700">{r.menolak}</td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-amber-700">
                      {r.tidakDitemui}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-stone-700">
                      {r.rumahKosong}
                    </td>
                    <td className="px-3 py-3 text-right font-mono tabular-nums text-slate-600">{r.belum}</td>
                    <td className="px-4 py-3 text-right font-mono font-extrabold tabular-nums text-emerald-900">
                      {r.cakupanPct.toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
