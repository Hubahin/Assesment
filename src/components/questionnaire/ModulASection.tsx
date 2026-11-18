import React from 'react';
import { CHOICES } from '../../data/instrumentSpec';
import { ModulAData } from '../../types/census';
import { calculateLuasPerKapita } from '../../utils/xlsformValidation';
import {
  BigChoiceButtons,
  BigMultiChoiceButtons,
  FieldWrapper,
  NoteCallout,
} from '../FormControls';

interface ModulASectionProps {
  value: ModulAData;
  onChange: (next: ModulAData) => void;
}

export const ModulASection: React.FC<ModulASectionProps> = ({ value, onChange }) => {
  const setField = <K extends keyof ModulAData>(key: K, val: ModulAData[K]) => {
    onChange({ ...value, [key]: val });
  };

  const setInt = (key: keyof ModulAData, raw: string) => {
    if (raw === '') {
      onChange({ ...value, [key]: undefined });
      return;
    }
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
      onChange({ ...value, [key]: parsed });
    }
  };

  const setDec = (key: keyof ModulAData, raw: string) => {
    if (raw === '') {
      onChange({ ...value, [key]: undefined });
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) {
      onChange({ ...value, [key]: parsed });
    }
  };

  const luasPerKapita = calculateLuasPerKapita(value.luas_bangunan, value.jumlah_art);
  const showLokasiWc = value.fasilitas_bab === 'sendiri' || value.fasilitas_bab === 'bersama';
  const showKlosetDanTinja = Boolean(value.fasilitas_bab && value.fasilitas_bab !== 'tidak_ada');
  const showDaya = value.penerangan === 'pln_sendiri';
  const showDampakBencana = Boolean(
    value.bencana && value.bencana.length > 0 && !value.bencana.includes('tidak_ada')
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-950 px-4 py-3 text-white">
        <p className="text-xs font-semibold text-emerald-300">Modul A</p>
        <h2 className="text-lg font-bold">Keterangan Rumah Tangga</h2>
      </div>

      <FieldWrapper label="Nama kepala rumah tangga" code="nama_kk" required>
        <input
          type="text"
          value={value.nama_kk ?? ''}
          onChange={(e) => setField('nama_kk', e.target.value)}
          placeholder="Nama lengkap kepala rumah tangga"
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-medium text-slate-900 focus:border-emerald-700 focus:outline-none"
        />
      </FieldWrapper>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldWrapper
          label="Jumlah anggota rumah tangga (yang tinggal dan makan bersama)"
          code="jumlah_art"
          required
          hint="Nilai 1 sampai 30"
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={value.jumlah_art ?? ''}
            onChange={(e) => setInt('jumlah_art', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
          />
        </FieldWrapper>

        <FieldWrapper
          label="Jumlah Kartu Keluarga dalam rumah ini"
          code="jumlah_kk"
          required
          hint="Nilai 1 sampai 10"
        >
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={10}
            value={value.jumlah_kk ?? ''}
            onChange={(e) => setInt('jumlah_kk', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
          />
        </FieldWrapper>
      </div>

      <h3 className="pt-2 text-base font-extrabold text-slate-900">Perumahan</h3>

      <FieldWrapper label="Status kepemilikan rumah" code="status_rumah" required>
        <BigChoiceButtons
          options={CHOICES.status_rumah}
          value={value.status_rumah}
          onChange={(v) => setField('status_rumah', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Bukti penguasaan tanah tempat rumah berdiri" code="bukti_tanah" required>
        <BigChoiceButtons
          options={CHOICES.bukti_tanah}
          value={value.bukti_tanah}
          onChange={(v) => setField('bukti_tanah', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Luas bangunan rumah (m²)"
        code="luas_bangunan"
        required
        hint="Perkiraan panjang × lebar (> 0 dan ≤ 2000)"
      >
        <input
          type="number"
          inputMode="decimal"
          step="0.1"
          min={0.1}
          max={2000}
          value={value.luas_bangunan ?? ''}
          onChange={(e) => setDec('luas_bangunan', e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
        />
        {luasPerKapita !== undefined && (
          <p className="mt-2 text-xs font-semibold text-slate-700">
            Luas per kapita terhitung:{' '}
            <span className="font-mono font-bold text-emerald-900">{luasPerKapita} m²</span>
            {luasPerKapita < 7.2 && (
              <span className="ml-2 text-amber-800">(Peringatan: di bawah 7,2 m² per kapita)</span>
            )}
          </p>
        )}
      </FieldWrapper>

      <FieldWrapper label="Bahan dinding terluas" code="dinding" required>
        <BigChoiceButtons
          options={CHOICES.dinding}
          value={value.dinding}
          onChange={(v) => setField('dinding', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Bahan atap terluas" code="atap" required>
        <BigChoiceButtons
          options={CHOICES.atap}
          value={value.atap}
          onChange={(v) => setField('atap', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Bahan lantai terluas" code="lantai" required>
        <BigChoiceButtons
          options={CHOICES.lantai}
          value={value.lantai}
          onChange={(v) => setField('lantai', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Jumlah jendela yang bisa dibuka" code="jendela" required hint="0 sampai 50">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={50}
          value={value.jendela ?? ''}
          onChange={(e) => setInt('jendela', e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
        />
      </FieldWrapper>

      <h3 className="pt-2 text-base font-extrabold text-slate-900">
        Air, sanitasi, energi, dan sampah
      </h3>

      <FieldWrapper label="Sumber air utama untuk mandi dan mencuci" code="sumber_air" required>
        <BigChoiceButtons
          options={CHOICES.sumber_air}
          value={value.sumber_air}
          onChange={(v) => setField('sumber_air', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Sumber air minum utama" code="air_minum" required>
        <BigChoiceButtons
          options={CHOICES.air_minum}
          value={value.air_minum}
          onChange={(v) => setField('air_minum', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Cara mengolah air minum" code="olah_air" required>
        <BigChoiceButtons
          options={CHOICES.olah_air}
          value={value.olah_air}
          onChange={(v) => setField('olah_air', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Fasilitas buang air besar" code="fasilitas_bab" required>
        <BigChoiceButtons
          options={CHOICES.fasilitas_bab}
          value={value.fasilitas_bab}
          onChange={(v) => setField('fasilitas_bab', v)}
          columns={2}
        />
      </FieldWrapper>

      {showLokasiWc && (
        <FieldWrapper label="Lokasi WC" code="lokasi_wc" required>
          <BigChoiceButtons
            options={CHOICES.lokasi_wc}
            value={value.lokasi_wc}
            onChange={(v) => setField('lokasi_wc', v)}
            columns={2}
          />
        </FieldWrapper>
      )}

      {showKlosetDanTinja && (
        <>
          <FieldWrapper label="Jenis kloset" code="kloset" required>
            <BigChoiceButtons
              options={CHOICES.kloset}
              value={value.kloset}
              onChange={(v) => setField('kloset', v)}
              columns={2}
            />
          </FieldWrapper>

          <FieldWrapper label="Tempat pembuangan akhir tinja" code="buang_tinja" required>
            <BigChoiceButtons
              options={CHOICES.buang_tinja}
              value={value.buang_tinja}
              onChange={(v) => setField('buang_tinja', v)}
              columns={2}
            />
          </FieldWrapper>
        </>
      )}

      <FieldWrapper label="Sumber penerangan utama" code="penerangan" required>
        <BigChoiceButtons
          options={CHOICES.penerangan}
          value={value.penerangan}
          onChange={(v) => setField('penerangan', v)}
          columns={2}
        />
      </FieldWrapper>

      {showDaya && (
        <FieldWrapper label="Daya listrik terpasang" code="daya" required>
          <BigChoiceButtons
            options={CHOICES.daya}
            value={value.daya}
            onChange={(v) => setField('daya', v)}
            columns={2}
          />
        </FieldWrapper>
      )}

      <FieldWrapper label="Bahan bakar utama untuk memasak" code="bahan_bakar" required>
        <BigChoiceButtons
          options={CHOICES.bahan_bakar}
          value={value.bahan_bakar}
          onChange={(v) => setField('bahan_bakar', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Apakah di rumah tersedia tempat sampah?" code="tempat_sampah" required>
        <BigChoiceButtons
          options={CHOICES.ya_tidak}
          value={value.tempat_sampah}
          onChange={(v) => setField('tempat_sampah', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Cara utama membuang sampah" code="buang_sampah" required>
        <BigChoiceButtons
          options={CHOICES.buang_sampah}
          value={value.buang_sampah}
          onChange={(v) => setField('buang_sampah', v)}
          columns={2}
        />
      </FieldWrapper>

      <h3 className="pt-2 text-base font-extrabold text-slate-900">Ekonomi rumah tangga</h3>

      <FieldWrapper
        label="Pengeluaran makanan sebulan terakhir (Rp)"
        code="keluar_pangan"
        required
        hint="Termasuk nilai hasil kebun/ternak sendiri yang dikonsumsi"
      >
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100000000}
          value={value.keluar_pangan ?? ''}
          onChange={(e) => setInt('keluar_pangan', e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
        />
      </FieldWrapper>

      <FieldWrapper
        label="Pengeluaran bukan makanan sebulan terakhir (Rp)"
        code="keluar_nonpangan"
        required
        hint="Listrik, pulsa, transportasi, sekolah, kesehatan, cicilan, dll."
      >
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={100000000}
          value={value.keluar_nonpangan ?? ''}
          onChange={(e) => setInt('keluar_nonpangan', e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
        />
      </FieldWrapper>

      <FieldWrapper
        label="Dalam 12 bulan terakhir, pernahkah rumah tangga ini kekurangan makanan karena tidak ada uang atau sumber daya lain?"
        code="rawan_pangan"
        required
      >
        <BigChoiceButtons
          options={CHOICES.ya_tidak}
          value={value.rawan_pangan}
          onChange={(v) => setField('rawan_pangan', v)}
          columns={2}
        />
      </FieldWrapper>

      <NoteCallout
        title="Konversi Luas Lahan"
        text="Luas lahan dalam m². Konversi: 1 tumbak/bata = 14 m²; 1 hektare = 10.000 m². Isi 0 jika tidak ada."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FieldWrapper label="Luas sawah yang dikuasai (m²)" code="luas_sawah" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000000}
            value={value.luas_sawah ?? 0}
            onChange={(e) => setInt('luas_sawah', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
          />
        </FieldWrapper>
        {(value.luas_sawah ?? 0) > 0 && (
          <FieldWrapper label="Status penguasaan sawah" code="kuasa_sawah" required>
            <BigChoiceButtons
              options={CHOICES.penguasaan}
              value={value.kuasa_sawah}
              onChange={(v) => setField('kuasa_sawah', v)}
              columns={2}
            />
          </FieldWrapper>
        )}

        <FieldWrapper label="Luas kebun/ladang yang dikuasai (m²)" code="luas_kebun" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000000}
            value={value.luas_kebun ?? 0}
            onChange={(e) => setInt('luas_kebun', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
          />
        </FieldWrapper>
        {(value.luas_kebun ?? 0) > 0 && (
          <FieldWrapper label="Status penguasaan kebun/ladang" code="kuasa_kebun" required>
            <BigChoiceButtons
              options={CHOICES.penguasaan}
              value={value.kuasa_kebun}
              onChange={(v) => setField('kuasa_kebun', v)}
              columns={2}
            />
          </FieldWrapper>
        )}

        <FieldWrapper label="Luas pekarangan yang dikuasai (m²)" code="luas_pekarangan" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000000}
            value={value.luas_pekarangan ?? 0}
            onChange={(e) => setInt('luas_pekarangan', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
          />
        </FieldWrapper>
        {(value.luas_pekarangan ?? 0) > 0 && (
          <FieldWrapper label="Status penguasaan pekarangan" code="kuasa_pekarangan" required>
            <BigChoiceButtons
              options={CHOICES.penguasaan}
              value={value.kuasa_pekarangan}
              onChange={(v) => setField('kuasa_pekarangan', v)}
              columns={2}
            />
          </FieldWrapper>
        )}

        <FieldWrapper label="Luas kolam/tambak yang dikuasai (m²)" code="luas_kolam" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000000}
            value={value.luas_kolam ?? 0}
            onChange={(e) => setInt('luas_kolam', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900 focus:border-emerald-700 focus:outline-none"
          />
        </FieldWrapper>
        {(value.luas_kolam ?? 0) > 0 && (
          <FieldWrapper label="Status penguasaan kolam/tambak" code="kuasa_kolam" required>
            <BigChoiceButtons
              options={CHOICES.penguasaan}
              value={value.kuasa_kolam}
              onChange={(v) => setField('kuasa_kolam', v)}
              columns={2}
            />
          </FieldWrapper>
        )}
      </div>

      <FieldWrapper
        label="Aset ekonomi keluarga (pilih semua yang dimiliki)"
        code="aset"
        required
      >
        <BigMultiChoiceButtons
          options={CHOICES.aset}
          value={value.aset}
          onChange={(v) => setField('aset', v)}
          exclusiveCodes={['tidak_ada']}
        />
      </FieldWrapper>

      <div className="grid grid-cols-2 gap-4">
        <FieldWrapper label="Jumlah sapi/kerbau" code="ternak_sapi" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={value.ternak_sapi ?? 0}
            onChange={(e) => setInt('ternak_sapi', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
          />
        </FieldWrapper>
        <FieldWrapper label="Jumlah kambing/domba" code="ternak_kambing" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={value.ternak_kambing ?? 0}
            onChange={(e) => setInt('ternak_kambing', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
          />
        </FieldWrapper>
        <FieldWrapper label="Jumlah ayam/itik" code="ternak_unggas" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={value.ternak_unggas ?? 0}
            onChange={(e) => setInt('ternak_unggas', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
          />
        </FieldWrapper>
        <FieldWrapper label="Jumlah kolam ikan" code="ternak_ikan_kolam" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={10000}
            value={value.ternak_ikan_kolam ?? 0}
            onChange={(e) => setInt('ternak_ikan_kolam', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
          />
        </FieldWrapper>
      </div>

      <FieldWrapper label="Sumber pinjaman dalam 12 bulan terakhir" code="pinjaman" required>
        <BigMultiChoiceButtons
          options={CHOICES.pinjaman}
          value={value.pinjaman}
          onChange={(v) => setField('pinjaman', v)}
          exclusiveCodes={['tidak_pernah']}
        />
      </FieldWrapper>

      <FieldWrapper label="Apakah rumah tangga menerima bantuan sosial?" code="terima_bansos" required>
        <BigChoiceButtons
          options={CHOICES.ya_tidak}
          value={value.terima_bansos}
          onChange={(v) => setField('terima_bansos', v)}
          columns={2}
        />
      </FieldWrapper>

      {value.terima_bansos === 'ya' && (
        <FieldWrapper label="Jenis bantuan sosial yang diterima" code="jenis_bansos" required>
          <BigMultiChoiceButtons
            options={CHOICES.bansos}
            value={value.jenis_bansos}
            onChange={(v) => setField('jenis_bansos', v)}
            exclusiveCodes={[]}
          />
        </FieldWrapper>
      )}

      <h3 className="pt-2 text-base font-extrabold text-slate-900">
        Kendaraan, media, dan akses digital
      </h3>

      <FieldWrapper label="Kepemilikan televisi" code="televisi" required>
        <BigChoiceButtons
          options={CHOICES.ya_tidak}
          value={value.televisi}
          onChange={(v) => setField('televisi', v)}
          columns={2}
        />
      </FieldWrapper>

      <div className="grid grid-cols-2 gap-4">
        <FieldWrapper label="Jumlah sepeda motor" code="jumlah_motor" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            value={value.jumlah_motor ?? 0}
            onChange={(e) => setInt('jumlah_motor', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
          />
        </FieldWrapper>
        <FieldWrapper label="Jumlah mobil" code="jumlah_mobil" required>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            value={value.jumlah_mobil ?? 0}
            onChange={(e) => setInt('jumlah_mobil', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
          />
        </FieldWrapper>
      </div>

      <FieldWrapper label="Kualitas sinyal seluler di rumah" code="sinyal" required>
        <BigChoiceButtons
          options={CHOICES.sinyal}
          value={value.sinyal}
          onChange={(v) => setField('sinyal', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Apakah rumah tangga punya akses internet (paket data atau WiFi)?"
        code="internet"
        required
      >
        <BigChoiceButtons
          options={CHOICES.ya_tidak}
          value={value.internet}
          onChange={(v) => setField('internet', v)}
          columns={2}
        />
      </FieldWrapper>

      <h3 className="pt-2 text-base font-extrabold text-slate-900">Kerentanan bencana</h3>

      <FieldWrapper
        label="Bencana yang dialami rumah tangga dalam 5 tahun terakhir"
        code="bencana"
        required
      >
        <BigMultiChoiceButtons
          options={CHOICES.bencana}
          value={value.bencana}
          onChange={(v) => setField('bencana', v)}
          exclusiveCodes={['tidak_ada']}
        />
      </FieldWrapper>

      {showDampakBencana && (
        <FieldWrapper label="Dampak bencana" code="dampak_bencana" required>
          <BigMultiChoiceButtons
            options={CHOICES.dampak}
            value={value.dampak_bencana}
            onChange={(v) => setField('dampak_bencana', v)}
            exclusiveCodes={[]}
          />
        </FieldWrapper>
      )}
    </div>
  );
};
