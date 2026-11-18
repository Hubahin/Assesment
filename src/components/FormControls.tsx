import React from 'react';
import { Check, Info } from 'lucide-react';
import { OptionItem } from '../data/instrumentSpec';

interface FieldWrapperProps {
  label: string;
  code?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

export const FieldWrapper: React.FC<FieldWrapperProps> = ({
  label,
  code,
  required,
  hint,
  error,
  children,
}) => {
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <label className="text-[15px] font-bold leading-snug text-slate-900">
          {label}
          {required && <span className="ml-1 text-rose-600">*</span>}
        </label>
        {code && (
          <span className="shrink-0 font-mono text-[11px] font-medium text-slate-400">
            {code}
          </span>
        )}
      </div>
      {hint && <p className="text-xs leading-relaxed text-slate-600">{hint}</p>}
      <div className="pt-1">{children}</div>
      {error && <p className="text-xs font-semibold text-rose-700">{error}</p>}
    </div>
  );
};

interface SingleChoiceProps {
  options: readonly OptionItem[];
  value?: string;
  onChange: (val: string) => void;
  columns?: 1 | 2;
}

export const BigChoiceButtons: React.FC<SingleChoiceProps> = ({
  options,
  value,
  onChange,
  columns = 1,
}) => {
  return (
    <div className={`grid gap-2 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
      {options.map((opt) => {
        const active = value === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => onChange(opt.code)}
            className={`flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition active:scale-[0.99] ${
              active
                ? 'border-emerald-800 bg-emerald-800 text-white shadow-sm'
                : 'border-slate-300 bg-slate-50 text-slate-900 hover:border-slate-400 hover:bg-slate-100'
            }`}
          >
            <span className="leading-snug">{opt.label}</span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                active ? 'border-white bg-white text-emerald-900' : 'border-slate-400 bg-white'
              }`}
            >
              {active && <Check className="h-3.5 w-3.5 stroke-[3]" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};

interface MultiChoiceProps {
  options: readonly OptionItem[];
  value?: string[];
  onChange: (vals: string[]) => void;
  exclusiveCodes?: string[];
}

export const BigMultiChoiceButtons: React.FC<MultiChoiceProps> = ({
  options,
  value = [],
  onChange,
  exclusiveCodes = ['tidak_ada'],
}) => {
  const toggle = (code: string) => {
    const exists = value.includes(code);
    if (exists) {
      onChange(value.filter((v) => v !== code));
      return;
    }
    if (exclusiveCodes.includes(code)) {
      onChange([code]);
      return;
    }
    const withoutEx = value.filter((v) => !exclusiveCodes.includes(v));
    onChange([...withoutEx, code]);
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((opt) => {
        const active = value.includes(opt.code);
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => toggle(opt.code)}
            className={`flex min-h-[48px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition active:scale-[0.99] ${
              active
                ? 'border-emerald-800 bg-emerald-800 text-white shadow-sm'
                : 'border-slate-300 bg-slate-50 text-slate-900 hover:border-slate-400 hover:bg-slate-100'
            }`}
          >
            <span className="leading-snug">{opt.label}</span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                active ? 'border-white bg-white text-emerald-900' : 'border-slate-400 bg-white'
              }`}
            >
              {active && <Check className="h-3.5 w-3.5 stroke-[3]" />}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export const NoteCallout: React.FC<{ title?: string; text: string; tone?: 'info' | 'consent' }> = ({
  title,
  text,
  tone = 'info',
}) => (
  <div
    className={`rounded-xl border p-4 ${
      tone === 'consent'
        ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
        : 'border-slate-200 bg-slate-100 text-slate-800'
    }`}
  >
    <div className="flex items-start gap-2.5">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        {title && <p className="text-xs font-bold uppercase tracking-wide">{title}</p>}
        <p className="text-sm leading-relaxed">{text}</p>
      </div>
    </div>
  </div>
);
