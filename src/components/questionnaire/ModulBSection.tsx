import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, Eye, EyeOff, UserCheck } from 'lucide-react';
import { CHOICES } from '../../data/instrumentSpec';
import { MemberPiiItem, ModulBItem } from '../../types/census';
import { calculateAge, maskDigits } from '../../utils/xlsformValidation';
import {
  BigChoiceButtons,
  BigMultiChoiceButtons,
  FieldWrapper,
  NoteCallout,
} from '../FormControls';

interface ModulBSectionProps {
  jumlahArt: number;
  members: ModulBItem[];
  membersPii: MemberPiiItem[];
  memberCompleted: boolean[];
  isAdmin: boolean;
  onChange: (members: ModulBItem[], membersPii: MemberPiiItem[]) => void;
}

export const ModulBSection: React.FC<ModulBSectionProps> = ({
  jumlahArt,
  members,
  membersPii,
  memberCompleted,
  isAdmin,
  onChange,
}) => {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [revealNik, setRevealNik] = useState<Record<number, boolean>>({});

  if (activeIdx === null) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-emerald-950 px-4 py-3 text-white">
          <p className="text-xs font-semibold text-emerald-300">Modul B · Anggota Rumah Tangga</p>
          <h2 className="text-lg font-bold">
            Daftar Kartu Anggota ({members.length} dari {jumlahArt || 1} orang)
          </h2>
        </div>

        <p className="text-sm text-slate-600">
          Ketuk setiap kartu anggota di bawah ini untuk mengisi atau melengkapi data. Anggota
          pertama adalah Kepala Rumah Tangga.
        </p>

        <div className="space-y-2.5">
          {members.map((m, idx) => {
            const done = memberCompleted[idx];
            const age = calculateAge(m.tgl_lahir);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`flex min-h-[68px] w-full items-center justify-between gap-3 rounded-xl border p-4 text-left transition ${
                  done
                    ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                    : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <span className="font-mono font-bold text-slate-800">#{idx + 1}</span>
                    <span>·</span>
                    <span>
                      {CHOICES.hubungan.find((h) => h.code === m.hubungan)?.label || 'Belum dipilih'}
                    </span>
                    {age !== undefined && age >= 0 && (
                      <>
                        <span>·</span>
                        <span className="tabular-nums">{age} th</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1 truncate text-base font-bold text-slate-950">
                    {m.nama?.trim() || `Anggota Rumah Tangga ${idx + 1}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {done ? (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4" />
                      Selesai
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800">
                      <AlertCircle className="h-4 w-4" />
                      Belum lengkap
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const m = members[activeIdx] || { no_urut: activeIdx + 1 };
  const pii = membersPii[activeIdx] || { no_urut: activeIdx + 1, nama: m.nama || '' };
  const usia = calculateAge(m.tgl_lahir);
  const hasUsia = usia !== undefined && usia >= 0;

  const updateMember = (patch: Partial<ModulBItem>) => {
    const nextMembers = members.map((item, idx) =>
      idx === activeIdx ? { ...item, ...patch, no_urut: idx + 1 } : item
    );
    const nextPii = membersPii.map((item, idx) =>
      idx === activeIdx
        ? { ...item, nama: patch.nama !== undefined ? patch.nama : item.nama, no_urut: idx + 1 }
        : item
    );
    onChange(nextMembers, nextPii);
  };

  const updatePii = (patch: Partial<MemberPiiItem>) => {
    const nextPii = membersPii.map((item, idx) =>
      idx === activeIdx ? { ...item, ...patch, no_urut: idx + 1 } : item
    );
    onChange(members, nextPii);
  };

  const setInt = (key: keyof ModulBItem, raw: string) => {
    if (raw === '') {
      updateMember({ [key]: undefined });
      return;
    }
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) updateMember({ [key]: parsed });
  };

  const setDec = (key: keyof ModulBItem, raw: string) => {
    if (raw === '') {
      updateMember({ [key]: undefined });
      return;
    }
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed)) updateMember({ [key]: parsed });
  };

  const showNikPreview = isAdmin || Boolean(revealNik[activeIdx]);
  const nikLen = (pii.nik || '').trim().length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-900 px-4 py-3 text-white">
        <button
          type="button"
          onClick={() => setActiveIdx(null)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold hover:bg-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Daftar Anggota
        </button>
        <div className="text-right">
          <p className="text-xs text-slate-300">Kartu Anggota #{activeIdx + 1}</p>
          <p className="text-sm font-bold truncate max-w-[200px]">
            {m.nama?.trim() || `Anggota ${activeIdx + 1}`}
          </p>
        </div>
      </div>

      <FieldWrapper label="Nama lengkap" code="nama" required>
        <input
          type="text"
          value={m.nama ?? ''}
          onChange={(e) => updateMember({ nama: e.target.value })}
          placeholder="Nama lengkap sesuai identitas"
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base font-medium text-slate-900"
        />
      </FieldWrapper>

      <FieldWrapper label="Hubungan dengan kepala rumah tangga" code="hubungan" required>
        <BigChoiceButtons
          options={CHOICES.hubungan}
          value={m.hubungan}
          onChange={(v) => updateMember({ hubungan: v })}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Jenis kelamin" code="jk" required>
        <BigChoiceButtons
          options={CHOICES.jk}
          value={m.jk}
          onChange={(v) => updateMember({ jk: v })}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper label="Tanggal lahir" code="tgl_lahir" required>
        <input
          type="date"
          min="1900-01-01"
          max="2026-12-31"
          value={m.tgl_lahir ?? ''}
          onChange={(e) => updateMember({ tgl_lahir: e.target.value })}
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold text-slate-900"
        />
        {hasUsia ? (
          <p className="mt-2 text-sm font-bold text-emerald-900">
            Usia: <span className="font-mono tabular-nums">{usia}</span> tahun
          </p>
        ) : usia === -1 ? (
          <p className="mt-2 text-xs font-bold text-rose-700">
            Tanggal lahir tidak boleh di masa depan.
          </p>
        ) : null}
      </FieldWrapper>

      <FieldWrapper label="Kewarganegaraan" code="kewarganegaraan" required>
        <BigChoiceButtons
          options={CHOICES.wn}
          value={m.kewarganegaraan}
          onChange={(v) => updateMember({ kewarganegaraan: v })}
          columns={2}
        />
      </FieldWrapper>

      <h3 className="pt-2 text-base font-extrabold text-slate-900">
        Kependudukan dan administrasi
      </h3>

      <FieldWrapper label="Status kependudukan" code="status_penduduk" required>
        <BigChoiceButtons
          options={CHOICES.status_penduduk}
          value={m.status_penduduk}
          onChange={(v) => updateMember({ status_penduduk: v })}
        />
      </FieldWrapper>

      {m.status_penduduk && m.status_penduduk !== 'asli' && (
        <>
          <FieldWrapper label="Kabupaten/kota asal" code="asal_kab" required>
            <input
              type="text"
              value={m.asal_kab ?? ''}
              onChange={(e) => updateMember({ asal_kab: e.target.value })}
              placeholder="Contoh: Kab. Garut / Kota Bandung"
              className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
            />
          </FieldWrapper>
          <FieldWrapper
            label="Tahun mulai tinggal di desa ini"
            code="tahun_tinggal"
            required
            hint="1940 sampai 2026"
          >
            <input
              type="number"
              inputMode="numeric"
              min={1940}
              max={2026}
              value={m.tahun_tinggal ?? ''}
              onChange={(e) => setInt('tahun_tinggal', e.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
            />
          </FieldWrapper>
        </>
      )}

      <FieldWrapper
        label="NIK (16 digit)"
        code="nik"
        hint="Tidak wajib. Isi hanya jika warga bersedia dan desa membutuhkannya untuk sinkronisasi data. Disimpan terpisah & disamarkan."
      >
        <div className="flex items-center gap-2">
          <input
            type={showNikPreview ? 'text' : 'password'}
            inputMode="numeric"
            maxLength={16}
            value={pii.nik ?? ''}
            onChange={(e) => updatePii({ nik: e.target.value.replace(/\D/g, '').slice(0, 16) })}
            placeholder="16 digit angka (opsional)"
            className="min-h-[48px] flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tracking-wider text-slate-900"
          />
          {!isAdmin && (
            <button
              type="button"
              onClick={() => setRevealNik((prev) => ({ ...prev, [activeIdx]: !prev[activeIdx] }))}
              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-700"
              aria-label="Tampilkan atau samarkan NIK"
            >
              {showNikPreview ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          )}
        </div>
        {pii.nik && (
          <p className="mt-1.5 font-mono text-xs text-slate-500">
            Tampilan tersamar: {maskDigits(pii.nik, isAdmin)}
          </p>
        )}
      </FieldWrapper>

      {nikLen === 16 && (
        <FieldWrapper label="Apakah NIK sudah aktif/terdaftar di Dukcapil?" code="nik_aktif" required>
          <BigChoiceButtons
            options={CHOICES.ya_tidak_tahu}
            value={m.nik_aktif}
            onChange={(v) => updateMember({ nik_aktif: v })}
            columns={2}
          />
        </FieldWrapper>
      )}

      {m.hubungan === 'kk' && (
        <FieldWrapper
          label="Nomor Kartu Keluarga (16 digit)"
          code="no_kk"
          hint="Tidak wajib. Ketentuan sama dengan NIK."
        >
          <input
            type={showNikPreview ? 'text' : 'password'}
            inputMode="numeric"
            maxLength={16}
            value={pii.no_kk ?? ''}
            onChange={(e) => updatePii({ no_kk: e.target.value.replace(/\D/g, '').slice(0, 16) })}
            placeholder="16 digit Nomor KK (opsional)"
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tracking-wider text-slate-900"
          />
          {pii.no_kk && (
            <p className="mt-1.5 font-mono text-xs text-slate-500">
              Tampilan tersamar: {maskDigits(pii.no_kk, isAdmin)}
            </p>
          )}
        </FieldWrapper>
      )}

      {hasUsia && usia >= 17 && (
        <FieldWrapper label="Memiliki KTP-el" code="punya_ktp" required>
          <BigChoiceButtons
            options={CHOICES.ya_tidak}
            value={m.punya_ktp}
            onChange={(v) => updateMember({ punya_ktp: v })}
            columns={2}
          />
        </FieldWrapper>
      )}

      <FieldWrapper label="Memiliki akta kelahiran" code="akta_lahir" required>
        <BigChoiceButtons
          options={CHOICES.ya_tidak}
          value={m.akta_lahir}
          onChange={(v) => updateMember({ akta_lahir: v })}
          columns={2}
        />
      </FieldWrapper>

      {hasUsia && usia >= 10 && (
        <>
          <FieldWrapper label="Status perkawinan" code="status_kawin" required>
            <BigChoiceButtons
              options={CHOICES.status_kawin}
              value={m.status_kawin}
              onChange={(v) => updateMember({ status_kawin: v })}
              columns={2}
            />
          </FieldWrapper>

          {m.status_kawin === 'kawin' && (
            <FieldWrapper label="Memiliki buku nikah/akta perkawinan" code="buku_nikah" required>
              <BigChoiceButtons
                options={CHOICES.ya_tidak}
                value={m.buku_nikah}
                onChange={(v) => updateMember({ buku_nikah: v })}
                columns={2}
              />
            </FieldWrapper>
          )}

          {m.status_kawin === 'kawin' && m.buku_nikah === 'ya' && (
            <FieldWrapper label="Tahun menikah (sesuai buku nikah)" code="tahun_nikah" hint="1940–2026">
              <input
                type="number"
                inputMode="numeric"
                min={1940}
                max={2026}
                value={m.tahun_nikah ?? ''}
                onChange={(e) => setInt('tahun_nikah', e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
              />
            </FieldWrapper>
          )}
        </>
      )}

      {(m.hubungan === 'kk' || m.hubungan === 'pasangan') && (
        <FieldWrapper label="Jumlah anak yang dimiliki" code="jumlah_anak" required hint="0 sampai 20">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={20}
            value={m.jumlah_anak ?? ''}
            onChange={(e) => setInt('jumlah_anak', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
          />
        </FieldWrapper>
      )}

      {hasUsia && usia >= 5 && (
        <>
          <h3 className="pt-2 text-base font-extrabold text-slate-900">Pendidikan dan keagamaan</h3>

          <FieldWrapper label="Partisipasi sekolah" code="partisipasi" required>
            <BigChoiceButtons
              options={CHOICES.partisipasi}
              value={m.partisipasi}
              onChange={(v) => updateMember({ partisipasi: v })}
            />
          </FieldWrapper>

          {m.partisipasi === 'masih' && (
            <>
              <FieldWrapper label="Jenjang yang sedang diikuti" code="jenjang_sedang" required>
                <BigChoiceButtons
                  options={CHOICES.jenjang}
                  value={m.jenjang_sedang}
                  onChange={(v) => updateMember({ jenjang_sedang: v })}
                  columns={2}
                />
              </FieldWrapper>
              <FieldWrapper
                label="Menerima bantuan pendidikan (PIP, beasiswa, dll.)"
                code="bantuan_pendidikan"
                required
              >
                <BigChoiceButtons
                  options={CHOICES.ya_tidak}
                  value={m.bantuan_pendidikan}
                  onChange={(v) => updateMember({ bantuan_pendidikan: v })}
                  columns={2}
                />
              </FieldWrapper>
            </>
          )}

          {m.partisipasi === 'tidak_lagi' && usia >= 7 && usia <= 18 && (
            <FieldWrapper label="Alasan tidak sekolah lagi" code="alasan_tidak_sekolah" required>
              <BigChoiceButtons
                options={CHOICES.alasan}
                value={m.alasan_tidak_sekolah}
                onChange={(v) => updateMember({ alasan_tidak_sekolah: v })}
                columns={2}
              />
            </FieldWrapper>
          )}

          <FieldWrapper label="Ijazah tertinggi yang dimiliki" code="ijazah" required>
            <BigChoiceButtons
              options={CHOICES.ijazah}
              value={m.ijazah}
              onChange={(v) => updateMember({ ijazah: v })}
              columns={2}
            />
          </FieldWrapper>

          <FieldWrapper
            label="Pendidikan nonformal yang pernah/sedang diikuti"
            code="nonformal"
            required
          >
            <BigMultiChoiceButtons
              options={CHOICES.nonformal}
              value={m.nonformal}
              onChange={(v) => updateMember({ nonformal: v })}
              exclusiveCodes={['tidak_ada']}
            />
          </FieldWrapper>

          {usia >= 7 && (
            <FieldWrapper
              label="Kemampuan membaca dan menulis huruf Latin"
              code="melek_latin"
              required
            >
              <BigChoiceButtons
                options={CHOICES.melek}
                value={m.melek_latin}
                onChange={(v) => updateMember({ melek_latin: v })}
              />
            </FieldWrapper>
          )}

          <FieldWrapper label="Agama" code="agama" required>
            <BigChoiceButtons
              options={CHOICES.agama}
              value={m.agama}
              onChange={(v) => updateMember({ agama: v })}
              columns={2}
            />
          </FieldWrapper>

          {m.agama === 'islam' && (
            <FieldWrapper
              label="Kemampuan membaca dan menulis Al-Qur'an"
              code="baca_quran"
              required
            >
              <BigChoiceButtons
                options={CHOICES.quran}
                value={m.baca_quran}
                onChange={(v) => updateMember({ baca_quran: v })}
                columns={2}
              />
            </FieldWrapper>
          )}
        </>
      )}

      {hasUsia && usia >= 15 && (
        <>
          <h3 className="pt-2 text-base font-extrabold text-slate-900">Pekerjaan dan penghasilan</h3>

          <FieldWrapper label="Pekerjaan utama" code="pekerjaan" required>
            <BigChoiceButtons
              options={CHOICES.pekerjaan}
              value={m.pekerjaan}
              onChange={(v) => updateMember({ pekerjaan: v })}
              columns={2}
            />
          </FieldWrapper>

          {m.pekerjaan === 'lainnya' && (
            <FieldWrapper label="Sebutkan pekerjaan lainnya" code="pekerjaan_lain" required>
              <input
                type="text"
                value={m.pekerjaan_lain ?? ''}
                onChange={(e) => updateMember({ pekerjaan_lain: e.target.value })}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
              />
            </FieldWrapper>
          )}

          {m.pekerjaan === 'pedagang' && (
            <FieldWrapper label="Jenis usaha" code="jenis_usaha" required>
              <input
                type="text"
                value={m.jenis_usaha ?? ''}
                onChange={(e) => updateMember({ jenis_usaha: e.target.value })}
                placeholder="Contoh: Warung kelontong, jajanan, pakaian"
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
              />
            </FieldWrapper>
          )}

          {m.pekerjaan &&
            m.pekerjaan !== 'tidak_bekerja' &&
            m.pekerjaan !== 'pelajar' &&
            m.pekerjaan !== 'mengurus_rt' && (
              <FieldWrapper
                label="Penghasilan per bulan dari seluruh pekerjaan (Rp)"
                code="penghasilan"
                required
                hint="Pilih 'Tidak bersedia menjawab' bila warga menolak."
              >
                <BigChoiceButtons
                  options={CHOICES.penghasilan}
                  value={m.penghasilan}
                  onChange={(v) => updateMember({ penghasilan: v })}
                  columns={2}
                />
              </FieldWrapper>
            )}

          <FieldWrapper label="Keterampilan usaha yang dimiliki" code="keterampilan" required>
            <BigMultiChoiceButtons
              options={CHOICES.keterampilan}
              value={m.keterampilan}
              onChange={(v) => updateMember({ keterampilan: v })}
              exclusiveCodes={['tidak_ada']}
            />
          </FieldWrapper>

          <FieldWrapper label="Pernah bekerja di luar negeri" code="kerja_ln" required>
            <BigChoiceButtons
              options={CHOICES.ya_tidak}
              value={m.kerja_ln}
              onChange={(v) => updateMember({ kerja_ln: v })}
              columns={2}
            />
          </FieldWrapper>

          {m.kerja_ln === 'ya' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FieldWrapper label="Bekerja sebagai" code="ln_sebagai" required>
                <input
                  type="text"
                  value={m.ln_sebagai ?? ''}
                  onChange={(e) => updateMember({ ln_sebagai: e.target.value })}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
                />
              </FieldWrapper>
              <FieldWrapper label="Di negara" code="ln_negara" required>
                <input
                  type="text"
                  value={m.ln_negara ?? ''}
                  onChange={(e) => updateMember({ ln_negara: e.target.value })}
                  className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
                />
              </FieldWrapper>
            </div>
          )}
        </>
      )}

      <h3 className="pt-2 text-base font-extrabold text-slate-900">Kesehatan dan disabilitas</h3>

      <FieldWrapper label="Status kepesertaan BPJS Kesehatan" code="bpjs" required>
        <BigChoiceButtons
          options={CHOICES.bpjs}
          value={m.bpjs}
          onChange={(v) => updateMember({ bpjs: v })}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Penyakit yang pernah didiagnosis dokter/tenaga kesehatan"
        code="penyakit"
        hint="Tidak wajib"
      >
        <BigMultiChoiceButtons
          options={CHOICES.penyakit}
          value={m.penyakit}
          onChange={(v) => updateMember({ penyakit: v })}
          exclusiveCodes={['tidak_ada', 'tidak_bersedia']}
        />
      </FieldWrapper>

      {hasUsia && usia >= 5 && (
        <>
          <NoteCallout text="Pertanyaan berikut tentang kesulitan melakukan kegiatan sehari-hari (Washington Group Short Set)." />
          <FieldWrapper
            label="Apakah mengalami kesulitan melihat, meskipun memakai kacamata?"
            code="wg_lihat"
            required
          >
            <BigChoiceButtons
              options={CHOICES.wg}
              value={m.wg_lihat}
              onChange={(v) => updateMember({ wg_lihat: v })}
              columns={2}
            />
          </FieldWrapper>
          <FieldWrapper
            label="Apakah mengalami kesulitan mendengar, meskipun memakai alat bantu dengar?"
            code="wg_dengar"
            required
          >
            <BigChoiceButtons
              options={CHOICES.wg}
              value={m.wg_dengar}
              onChange={(v) => updateMember({ wg_dengar: v })}
              columns={2}
            />
          </FieldWrapper>
          <FieldWrapper
            label="Apakah mengalami kesulitan berjalan atau naik tangga?"
            code="wg_jalan"
            required
          >
            <BigChoiceButtons
              options={CHOICES.wg}
              value={m.wg_jalan}
              onChange={(v) => updateMember({ wg_jalan: v })}
              columns={2}
            />
          </FieldWrapper>
          <FieldWrapper
            label="Apakah mengalami kesulitan mengingat atau berkonsentrasi?"
            code="wg_ingat"
            required
          >
            <BigChoiceButtons
              options={CHOICES.wg}
              value={m.wg_ingat}
              onChange={(v) => updateMember({ wg_ingat: v })}
              columns={2}
            />
          </FieldWrapper>
          <FieldWrapper
            label="Apakah mengalami kesulitan mengurus diri sendiri, seperti mandi atau berpakaian?"
            code="wg_urus_diri"
            required
          >
            <BigChoiceButtons
              options={CHOICES.wg}
              value={m.wg_urus_diri}
              onChange={(v) => updateMember({ wg_urus_diri: v })}
              columns={2}
            />
          </FieldWrapper>
          <FieldWrapper
            label="Apakah mengalami kesulitan berkomunikasi, misalnya memahami atau dipahami orang lain?"
            code="wg_komunikasi"
            required
          >
            <BigChoiceButtons
              options={CHOICES.wg}
              value={m.wg_komunikasi}
              onChange={(v) => updateMember({ wg_komunikasi: v })}
              columns={2}
            />
          </FieldWrapper>
        </>
      )}

      {m.jk === 'p' && hasUsia && usia >= 15 && usia <= 49 && m.status_kawin === 'kawin' && (
        <>
          <h3 className="pt-2 text-base font-extrabold text-slate-900">KB dan kesehatan ibu</h3>

          <FieldWrapper label="Saat ini sedang memakai alat/cara KB?" code="kb_aktif" required>
            <BigChoiceButtons
              options={CHOICES.ya_tidak}
              value={m.kb_aktif}
              onChange={(v) => updateMember({ kb_aktif: v })}
              columns={2}
            />
          </FieldWrapper>

          {m.kb_aktif === 'ya' && (
            <FieldWrapper label="Metode KB yang dipakai" code="kb_metode" required>
              <BigChoiceButtons
                options={CHOICES.kb}
                value={m.kb_metode}
                onChange={(v) => updateMember({ kb_metode: v })}
                columns={2}
              />
            </FieldWrapper>
          )}

          <FieldWrapper label="Saat ini sedang hamil?" code="hamil" required>
            <BigChoiceButtons
              options={CHOICES.ya_tidak}
              value={m.hamil}
              onChange={(v) => updateMember({ hamil: v })}
              columns={2}
            />
          </FieldWrapper>

          {m.hamil === 'ya' && (
            <FieldWrapper
              label="Sudah memeriksakan kehamilan ke tenaga kesehatan?"
              code="periksa_hamil"
              required
            >
              <BigChoiceButtons
                options={CHOICES.ya_tidak}
                value={m.periksa_hamil}
                onChange={(v) => updateMember({ periksa_hamil: v })}
                columns={2}
              />
            </FieldWrapper>
          )}
        </>
      )}

      {hasUsia && usia < 5 && (
        <>
          <h3 className="pt-2 text-base font-extrabold text-slate-900">Kesehatan balita</h3>

          <FieldWrapper
            label="Datang ke posyandu dalam 3 bulan terakhir?"
            code="posyandu_3bln"
            required
          >
            <BigChoiceButtons
              options={CHOICES.ya_tidak}
              value={m.posyandu_3bln}
              onChange={(v) => updateMember({ posyandu_3bln: v })}
              columns={2}
            />
          </FieldWrapper>

          <FieldWrapper
            label="Kelengkapan imunisasi sesuai usia (lihat buku KIA)"
            code="imunisasi"
            required
          >
            <BigChoiceButtons
              options={CHOICES.imunisasi}
              value={m.imunisasi}
              onChange={(v) => updateMember({ imunisasi: v })}
            />
          </FieldWrapper>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FieldWrapper
              label="Berat badan terakhir (kg, dari buku KIA/KMS)"
              code="berat_badan"
              hint="Kosongkan jika tidak ada catatan (> 1 dan < 40)"
            >
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={m.berat_badan ?? ''}
                onChange={(e) => setDec('berat_badan', e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
              />
            </FieldWrapper>
            <FieldWrapper
              label="Tinggi/panjang badan terakhir (cm, dari buku KIA/KMS)"
              code="tinggi_badan"
              hint="Kosongkan jika tidak ada catatan (> 30 dan < 130)"
            >
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={m.tinggi_badan ?? ''}
                onChange={(e) => setDec('tinggi_badan', e.target.value)}
                className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-base font-bold tabular-nums text-slate-900"
              />
            </FieldWrapper>
          </div>
        </>
      )}

      {hasUsia && usia >= 15 && (
        <>
          <h3 className="pt-2 text-base font-extrabold text-slate-900">Partisipasi kelembagaan</h3>

          <FieldWrapper label="Keanggotaan dalam kelompok/lembaga" code="keanggotaan" required>
            <BigMultiChoiceButtons
              options={CHOICES.lembaga}
              value={m.keanggotaan}
              onChange={(v) => updateMember({ keanggotaan: v })}
              exclusiveCodes={['tidak_ada']}
            />
          </FieldWrapper>

          <FieldWrapper
            label="Hadir dalam musyawarah dusun/desa selama 12 bulan terakhir?"
            code="hadir_musyawarah"
            required
          >
            <BigChoiceButtons
              options={CHOICES.ya_tidak}
              value={m.hadir_musyawarah}
              onChange={(v) => updateMember({ hadir_musyawarah: v })}
              columns={2}
            />
          </FieldWrapper>

          <FieldWrapper label="Memiliki telepon seluler (HP)" code="punya_hp" required>
            <BigChoiceButtons
              options={CHOICES.ya_tidak}
              value={m.punya_hp}
              onChange={(v) => updateMember({ punya_hp: v })}
              columns={2}
            />
          </FieldWrapper>
        </>
      )}

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setActiveIdx(null)}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-900"
        >
          <UserCheck className="h-4 w-4" />
          Simpan &amp; Kembali ke Daftar Anggota
        </button>
      </div>
    </div>
  );
};
