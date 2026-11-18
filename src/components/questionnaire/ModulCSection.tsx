import React from 'react';
import { CHOICES } from '../../data/instrumentSpec';
import { ModulBItem, ModulCData } from '../../types/census';
import { calculateAge } from '../../utils/xlsformValidation';
import { BigChoiceButtons, BigMultiChoiceButtons, FieldWrapper } from '../FormControls';

interface ModulCSectionProps {
  value: ModulCData;
  members: ModulBItem[];
  onChange: (next: ModulCData) => void;
}

export const ModulCSection: React.FC<ModulCSectionProps> = ({ value, members, onChange }) => {
  const setField = <K extends keyof ModulCData>(key: K, val: ModulCData[K]) => {
    onChange({ ...value, [key]: val });
  };

  const adultNames = members
    .filter((m) => {
      const age = calculateAge(m.tgl_lahir);
      return m.nama?.trim() && (age === undefined || age >= 17);
    })
    .map((m) => m.nama!.trim());

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-950 px-4 py-3 text-white">
        <p className="text-xs font-semibold text-emerald-300">Modul C · Satu Responden Dewasa</p>
        <h2 className="text-lg font-bold">Persepsi Pengelolaan Sampah &amp; Kehidupan Keagamaan</h2>
      </div>

      <FieldWrapper
        label="Nama responden Modul C"
        code="nama_resp_c"
        required
        hint="Anggota rumah tangga berusia 17 tahun ke atas"
      >
        {adultNames.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {adultNames.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setField('nama_resp_c', n)}
                className={`min-h-[38px] rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  value.nama_resp_c === n
                    ? 'border-emerald-800 bg-emerald-800 text-white'
                    : 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
        <input
          type="text"
          value={value.nama_resp_c ?? ''}
          onChange={(e) => setField('nama_resp_c', e.target.value)}
          placeholder="Nama responden dewasa (≥ 17 tahun)"
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
        />
      </FieldWrapper>

      <h3 className="pt-2 text-base font-extrabold text-slate-900">Pengelolaan sampah</h3>

      <FieldWrapper
        label="Sampah yang dibuang di selokan dapat menyebabkan banjir."
        code="k_selokan"
        required
      >
        <BigChoiceButtons
          options={CHOICES.benar_salah}
          value={value.k_selokan}
          onChange={(v) => setField('k_selokan', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Sampah yang berserakan memengaruhi kesehatan masyarakat sekitar."
        code="k_kesehatan"
        required
      >
        <BigChoiceButtons
          options={CHOICES.benar_salah}
          value={value.k_kesehatan}
          onChange={(v) => setField('k_kesehatan', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Saya bersedia memilah sampah organik dan anorganik di rumah jika tersedia fasilitasnya."
        code="s_pilah"
        required
      >
        <BigChoiceButtons
          options={CHOICES.likert}
          value={value.s_pilah}
          onChange={(v) => setField('s_pilah', v)}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Saya mendukung aturan/larangan plastik sekali pakai di lingkungan saya."
        code="s_plastik"
        required
      >
        <BigChoiceButtons
          options={CHOICES.likert}
          value={value.s_plastik}
          onChange={(v) => setField('s_plastik', v)}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Saya menggunakan kembali barang bekas agar tidak langsung dibuang."
        code="s_guna_ulang"
        required
      >
        <BigChoiceButtons
          options={CHOICES.likert}
          value={value.s_guna_ulang}
          onChange={(v) => setField('s_guna_ulang', v)}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Saya mengajak keluarga atau tetangga menjaga kebersihan dan mengelola sampah."
        code="s_ajak"
        required
      >
        <BigChoiceButtons
          options={CHOICES.likert}
          value={value.s_ajak}
          onChange={(v) => setField('s_ajak', v)}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Saya dapat merancang langkah-langkah mengelola sampah di rumah atau lingkungan secara sistematis."
        code="s_rancang"
        required
      >
        <BigChoiceButtons
          options={CHOICES.mampu}
          value={value.s_rancang}
          onChange={(v) => setField('s_rancang', v)}
        />
      </FieldWrapper>

      <h3 className="pt-2 text-base font-extrabold text-slate-900">Kehidupan keagamaan</h3>

      <FieldWrapper
        label="Lembaga keagamaan yang ada di wilayah Anda"
        code="lembaga_agama"
        required
      >
        <BigMultiChoiceButtons
          options={CHOICES.lembaga_agama}
          value={value.lembaga_agama}
          onChange={(v) => setField('lembaga_agama', v)}
          exclusiveCodes={[]}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Apakah Anda berafiliasi dengan organisasi kemasyarakatan keagamaan?"
        code="ormas_ya"
        required
      >
        <BigChoiceButtons
          options={CHOICES.ya_tidak_tolak}
          value={value.ormas_ya}
          onChange={(v) => setField('ormas_ya', v)}
        />
      </FieldWrapper>

      {value.ormas_ya === 'ya' && (
        <FieldWrapper label="Organisasi yang diikuti" code="ormas" required>
          <BigMultiChoiceButtons
            options={CHOICES.ormas}
            value={value.ormas}
            onChange={(v) => setField('ormas', v)}
            exclusiveCodes={[]}
          />
        </FieldWrapper>
      )}

      <FieldWrapper
        label="Tokoh agama yang berpengaruh di wilayah Anda"
        code="tokoh_agama"
        hint="Tidak wajib"
      >
        <input
          type="text"
          value={value.tokoh_agama ?? ''}
          onChange={(e) => setField('tokoh_agama', e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
        />
      </FieldWrapper>

      <FieldWrapper label="Panggilan untuk tokoh agama di wilayah ini" code="panggilan_tokoh">
        <BigMultiChoiceButtons
          options={CHOICES.panggilan}
          value={value.panggilan_tokoh}
          onChange={(v) => setField('panggilan_tokoh', v)}
          exclusiveCodes={[]}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Bagaimana hubungan antarlembaga/kelompok keagamaan di wilayah Anda?"
        code="hubungan_lembaga"
        required
      >
        <BigChoiceButtons
          options={CHOICES.harmoni}
          value={value.hubungan_lembaga}
          onChange={(v) => setField('hubungan_lembaga', v)}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Apakah ada kegiatan sosial lintas agama atau lintas aliran?"
        code="lintas_agama"
        required
      >
        <BigChoiceButtons
          options={CHOICES.ya_tidak}
          value={value.lintas_agama}
          onChange={(v) => setField('lintas_agama', v)}
          columns={2}
        />
      </FieldWrapper>

      {value.lintas_agama === 'ya' && (
        <FieldWrapper label="Contoh kegiatannya" code="contoh_lintas" required>
          <input
            type="text"
            value={value.contoh_lintas ?? ''}
            onChange={(e) => setField('contoh_lintas', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
          />
        </FieldWrapper>
      )}

      <FieldWrapper
        label="Sumber informasi keagamaan yang paling sering"
        code="info_agama"
        required
      >
        <BigChoiceButtons
          options={CHOICES.info_agama}
          value={value.info_agama}
          onChange={(v) => setField('info_agama', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Adakah media lokal/grup komunikasi yang menginformasikan kegiatan lintas agama?"
        code="media_lokal"
        required
      >
        <BigChoiceButtons
          options={CHOICES.ya_tidak}
          value={value.media_lokal}
          onChange={(v) => setField('media_lokal', v)}
          columns={2}
        />
      </FieldWrapper>

      {value.media_lokal === 'ya' && (
        <FieldWrapper label="Nama atau bentuk medianya" code="nama_media" required>
          <input
            type="text"
            value={value.nama_media ?? ''}
            onChange={(e) => setField('nama_media', e.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
          />
        </FieldWrapper>
      )}

      <FieldWrapper
        label="Di mana biasanya pertemuan keagamaan diadakan?"
        code="tempat_pertemuan"
        required
      >
        <BigChoiceButtons
          options={CHOICES.tempat}
          value={value.tempat_pertemuan}
          onChange={(v) => setField('tempat_pertemuan', v)}
          columns={2}
        />
      </FieldWrapper>

      <FieldWrapper
        label="Topik yang sering dibahas dalam pertemuan tersebut"
        code="topik_pertemuan"
      >
        <input
          type="text"
          value={value.topik_pertemuan ?? ''}
          onChange={(e) => setField('topik_pertemuan', e.target.value)}
          className="min-h-[48px] w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-base text-slate-900"
        />
      </FieldWrapper>

      <FieldWrapper
        label="Catatan enumerator"
        code="catatan_enumerator"
        hint="Kendala, keraguan jawaban, dll."
      >
        <textarea
          rows={3}
          value={value.catatan_enumerator ?? ''}
          onChange={(e) => setField('catatan_enumerator', e.target.value)}
          className="w-full rounded-xl border border-slate-300 p-3.5 text-base text-slate-900"
        />
      </FieldWrapper>
    </div>
  );
};
