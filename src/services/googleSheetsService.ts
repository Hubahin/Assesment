import {
  DusunCode,
  HouseholdPiiRecord,
  HouseholdRecord,
  RevisionLogRecord,
  StaffMember,
  UserRole,
  VisitRecord,
  WilayahConfig,
} from '../types/census';
import {
  buildAnggotaTable,
  buildIdentitasTable,
  buildKunjunganTable,
  buildLogRevisiTable,
  buildRumahTanggaTable,
} from './exportService';

/**
 * Integrasi Google Spreadsheet melalui Google Apps Script Web App.
 * Tidak memerlukan Project Google Cloud, OAuth Consent Screen, atau API Key berbayar.
 */
export const APPS_SCRIPT_TEMPLATE = `function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'get_petugas';

    if (action === 'get_petugas') {
      var sheet = ss.getSheetByName('petugas');
      var headers = ['email', 'nama', 'role', 'rt_tugas', 'aktif', 'koordinator_email'];
      if (!sheet) {
        sheet = ss.insertSheet('petugas');
        sheet.appendRow(headers);
        sheet.setFrozenRows(1);
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, version: 2, supportsPetugasOps: true, petugas: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var values = sheet.getDataRange().getValues();
      if (values.length <= 1) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, version: 2, supportsPetugasOps: true, petugas: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var colHeaders = values[0].map(function(h) {
        return String(h || '').trim().toLowerCase().replace(/\\s+/g, '_');
      });
      var rows = [];
      for (var i = 1; i < values.length; i++) {
        var rowObj = {};
        var hasContent = false;
        for (var c = 0; c < colHeaders.length; c++) {
          var key = colHeaders[c];
          if (!key) continue;
          var val = values[i][c];
          if (val !== '' && val !== null && val !== undefined) hasContent = true;
          rowObj[key] = (val === null || val === undefined) ? '' : String(val);
        }
        if (hasContent) rows.push(rowObj);
      }

      return ContentService
        .createTextOutput(JSON.stringify({ ok: true, version: 2, supportsPetugasOps: true, petugas: rows }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: 'Aksi tidak dikenal' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var mode = payload.mode || 'append';

    if (mode === 'upsert_petugas' && payload.petugasRow) {
      var headers = ['email', 'nama', 'role', 'rt_tugas', 'aktif', 'koordinator_email'];
      var pSheet = ss.getSheetByName('petugas') || ss.insertSheet('petugas');
      if (pSheet.getLastRow() === 0) {
        pSheet.appendRow(headers);
        pSheet.setFrozenRows(1);
      }
      var targetEmail = String(payload.petugasRow[0] || '').trim().toLowerCase();
      var pValues = pSheet.getDataRange().getValues();
      var emailCol = 0;
      if (pValues.length > 0) {
        for (var hc = 0; hc < pValues[0].length; hc++) {
          if (String(pValues[0][hc] || '').trim().toLowerCase() === 'email') {
            emailCol = hc;
            break;
          }
        }
      }
      var updated = false;
      for (var r = 1; r < pValues.length; r++) {
        var rowEmail = String(pValues[r][emailCol] || '').trim().toLowerCase();
        if (rowEmail === targetEmail && targetEmail) {
          pSheet.getRange(r + 1, 1, 1, payload.petugasRow.length).setValues([payload.petugasRow]);
          updated = true;
          break;
        }
      }
      if (!updated) {
        pSheet.appendRow(payload.petugasRow);
      }
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (mode === 'delete_petugas' && payload.email) {
      var delSheet = ss.getSheetByName('petugas');
      if (delSheet && delSheet.getLastRow() > 1) {
        var delEmail = String(payload.email || '').trim().toLowerCase();
        var delValues = delSheet.getDataRange().getValues();
        var delEmailCol = 0;
        for (var dc = 0; dc < delValues[0].length; dc++) {
          if (String(delValues[0][dc] || '').trim().toLowerCase() === 'email') {
            delEmailCol = dc;
            break;
          }
        }
        for (var dr = delValues.length - 1; dr >= 1; dr--) {
          if (String(delValues[dr][delEmailCol] || '').trim().toLowerCase() === delEmail) {
            delSheet.deleteRow(dr + 1);
          }
        }
      }
      return ContentService
        .createTextOutput(JSON.stringify({ ok: true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var tables = payload.tables || {};
    var tabNames = ['rumah_tangga', 'anggota', 'identitas', 'kunjungan', 'log_revisi', 'petugas'];

    tabNames.forEach(function(name) {
      var tbl = tables[name];
      if (!tbl || !tbl.headers) return;
      var sheet = ss.getSheetByName(name) || ss.insertSheet(name);

      if (mode === 'replace_all') {
        sheet.clearContents();
        var allRows = [tbl.headers].concat(tbl.rows || []);
        if (allRows.length > 0) {
          sheet.getRange(1, 1, allRows.length, tbl.headers.length).setValues(allRows);
          sheet.setFrozenRows(1);
        }
      } else {
        if (sheet.getLastRow() === 0) {
          sheet.appendRow(tbl.headers);
          sheet.setFrozenRows(1);
        }
        (tbl.rows || []).forEach(function(row) {
          sheet.appendRow(row);
        });
      }
    });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}`;

export function isValidAppsScriptUrl(url: string): boolean {
  const trimmed = url.trim();
  return /^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[a-zA-Z0-9_-]+\/exec/.test(trimmed);
}

async function postWebhookPayload(webhookUrl: string, payload: unknown): Promise<void> {
  if (!isValidAppsScriptUrl(webhookUrl)) {
    throw new Error('URL Google Apps Script Web App tidak valid (harus berakhiran /exec).');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Perangkat sedang luring. Sinkronisasi Spreadsheet ditunda hingga online.');
  }

  // Gunakan text/plain + no-cors agar terhindar dari preflight CORS & redirect 302 script.googleusercontent.com
  await fetch(webhookUrl.trim(), {
    method: 'POST',
    mode: 'no-cors',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });
}

export function isHouseholdSubmittedForSheet(h: HouseholdRecord): boolean {
  return (
    Boolean(h.submittedAt) &&
    h.status_cacah !== 'draf' &&
    h.status_cacah !== 'belum_dikunjungi'
  );
}

export async function appendSubmissionViaWebhook(params: {
  webhookUrl: string;
  household: HouseholdRecord;
  pii: HouseholdPiiRecord;
  visit: VisitRecord;
}): Promise<void> {
  const { webhookUrl, household, pii, visit } = params;
  if (!isHouseholdSubmittedForSheet(household)) {
    return;
  }
  const rtTable = buildRumahTanggaTable([household]);
  const angTable = buildAnggotaTable([household]);
  const idTable = buildIdentitasTable([pii]);
  const visTable = buildKunjunganTable([visit]);

  await postWebhookPayload(webhookUrl, {
    mode: 'append',
    tables: {
      rumah_tangga: rtTable,
      anggota: angTable,
      identitas: idTable,
      kunjungan: visTable,
    },
  });
}

export async function syncAllDataViaWebhook(params: {
  webhookUrl: string;
  households: HouseholdRecord[];
  piiRecords: HouseholdPiiRecord[];
  visits: VisitRecord[];
  revisionLogs: RevisionLogRecord[];
}): Promise<void> {
  const { webhookUrl, households, piiRecords, visits, revisionLogs } = params;
  const submittedHouseholds = households.filter(isHouseholdSubmittedForSheet);
  const submittedIds = new Set(submittedHouseholds.map((h) => h.id_rt));
  const submittedPii = piiRecords.filter((p) => submittedIds.has(p.id_rt));
  const submittedVisits = visits.filter((v) => submittedIds.has(v.id_rt));
  const submittedLogs = revisionLogs.filter((l) => submittedIds.has(l.id_rt));

  await postWebhookPayload(webhookUrl, {
    mode: 'replace_all',
    tables: {
      rumah_tangga: buildRumahTanggaTable(submittedHouseholds),
      anggota: buildAnggotaTable(submittedHouseholds),
      identitas: buildIdentitasTable(submittedPii),
      kunjungan: buildKunjunganTable(submittedVisits),
      log_revisi: buildLogRevisiTable(submittedLogs),
    },
  });
}

export async function clearAllDataViaWebhook(webhookUrl: string): Promise<void> {
  await syncAllDataViaWebhook({
    webhookUrl,
    households: [],
    piiRecords: [],
    visits: [],
    revisionLogs: [],
  });
}

export interface SpreadsheetPetugasRawRow {
  email?: string;
  nama?: string;
  name?: string;
  role?: string;
  peran?: string;
  rt_tugas?: string;
  assignedrts?: string;
  rt?: string;
  aktif?: string;
  active?: string;
  status?: string;
  koordinator_email?: string;
  koordinatoremail?: string;
  [key: string]: string | undefined;
}

export const PETUGAS_HEADERS = [
  'email',
  'nama',
  'role',
  'rt_tugas',
  'aktif',
  'koordinator_email',
];

function staffToPetugasRow(s: StaffMember): string[] {
  return [
    s.email.toLowerCase(),
    s.name,
    s.role,
    s.role === 'admin' ? '' : (s.assignedRTs || []).join(', '),
    s.active ? 'ya' : 'tidak',
    s.koordinatorEmail || '',
  ];
}

export function buildPetugasTable(staffList: StaffMember[]): {
  headers: string[];
  rows: string[][];
} {
  return {
    headers: PETUGAS_HEADERS,
    rows: staffList.map(staffToPetugasRow),
  };
}

function normalizeRawRowFields(raw: SpreadsheetPetugasRawRow): Record<string, string> {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const cleanKey = k
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (cleanKey) {
      norm[cleanKey] = v === undefined || v === null ? '' : String(v);
    }
  }
  return norm;
}

function pickRawField(norm: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    if (norm[c] !== undefined) return norm[c];
  }
  return '';
}

function rawRowToPreservedPetugasRow(raw: SpreadsheetPetugasRawRow): string[] | null {
  const norm = normalizeRawRowFields(raw);
  const email = pickRawField(norm, ['email', 'e_mail', 'alamat_email']).trim().toLowerCase();
  if (!email) return null;
  const nama = pickRawField(norm, ['nama', 'name', 'nama_lengkap']).trim() || email.split('@')[0];
  const role = pickRawField(norm, ['role', 'peran', 'jabatan']).trim().toLowerCase() || 'enumerator';
  const rtTugas = pickRawField(norm, [
    'rt_tugas',
    'wilayah_tugas',
    'wilayah',
    'tugas_rt',
    'penugasan_rt',
    'assignedrts',
    'assigned_rts',
    'rt',
    'rw',
  ]).trim();
  const aktif = pickRawField(norm, ['aktif', 'active', 'status']).trim() || 'ya';
  const koordinatorEmail = pickRawField(norm, [
    'koordinator_email',
    'koordinatoremail',
    'email_koordinator',
    'koordinator',
  ])
    .trim()
    .toLowerCase();

  return [email, nama, role, rtTugas, aktif, koordinatorEmail];
}

export async function pushStaffToWebhook(
  webhookUrl: string,
  staffList: StaffMember[]
): Promise<void> {
  await postWebhookPayload(webhookUrl, {
    mode: 'replace_all',
    tables: {
      petugas: buildPetugasTable(staffList),
    },
  });
}

export async function pushStaffRowsRawToWebhook(
  webhookUrl: string,
  rows: string[][]
): Promise<void> {
  await postWebhookPayload(webhookUrl, {
    mode: 'replace_all',
    tables: {
      petugas: {
        headers: PETUGAS_HEADERS,
        rows,
      },
    },
  });
}

export async function pushStaffUpsertSafeToWebhook(params: {
  webhookUrl: string;
  actorRole?: UserRole;
  savedStaff: StaffMember;
  updatedAdminStaffList?: StaffMember[];
  wilayah?: WilayahConfig;
}): Promise<void> {
  const { webhookUrl, savedStaff } = params;
  const targetEmail = savedStaff.email.trim().toLowerCase();
  const newRow = staffToPetugasRow(savedStaff);

  try {
    const meta = await fetchStaffMetaFromWebhook(webhookUrl);
    if (meta.supportsPetugasOps) {
      await postWebhookPayload(webhookUrl, {
        mode: 'upsert_petugas',
        petugasRow: newRow,
      });
      return;
    }

    // Fallback aman untuk Apps Script versi lama: pertahankan kolom rt_tugas asli milik baris lain tanpa reset
    const mergedMap = new Map<string, string[]>();
    for (const raw of meta.petugas) {
      const preserved = rawRowToPreservedPetugasRow(raw);
      if (preserved && preserved[0]) {
        mergedMap.set(preserved[0], preserved);
      }
    }
    mergedMap.set(targetEmail, newRow);

    const rows = Array.from(mergedMap.values()).sort((a, b) =>
      a[1].localeCompare(b[1], 'id')
    );
    await pushStaffRowsRawToWebhook(webhookUrl, rows);
  } catch {
    await postWebhookPayload(webhookUrl, {
      mode: 'append',
      tables: {
        petugas: buildPetugasTable([savedStaff]),
      },
    });
  }
}

export async function pushStaffDeleteSafeToWebhook(params: {
  webhookUrl: string;
  targetEmail: string;
}): Promise<void> {
  const targetEmail = params.targetEmail.trim().toLowerCase();
  const meta = await fetchStaffMetaFromWebhook(params.webhookUrl);

  if (meta.supportsPetugasOps) {
    await postWebhookPayload(params.webhookUrl, {
      mode: 'delete_petugas',
      email: targetEmail,
    });
    return;
  }

  // Fallback aman untuk Apps Script versi lama: hapus hanya 1 email & pertahankan baris lain apa adanya
  const remainingRows: string[][] = [];
  for (const raw of meta.petugas) {
    const preserved = rawRowToPreservedPetugasRow(raw);
    if (preserved && preserved[0] && preserved[0] !== targetEmail) {
      remainingRows.push(preserved);
    }
  }
  await pushStaffRowsRawToWebhook(params.webhookUrl, remainingRows);
}

export async function pushKoordinatorStaffSafeToWebhook(params: {
  webhookUrl: string;
  koordinatorEmail: string;
  koordinatorAssignedRTs: string[];
  enumerators: StaffMember[];
  wilayah: WilayahConfig;
}): Promise<void> {
  const { webhookUrl, koordinatorEmail, koordinatorAssignedRTs, enumerators, wilayah } = params;
  const koorLower = koordinatorEmail.trim().toLowerCase();
  const koorRtSet = new Set(koordinatorAssignedRTs);

  const meta = await fetchStaffMetaFromWebhook(webhookUrl);
  const { validRows } = parseSpreadsheetStaffRows(meta.petugas, wilayah);
  const parsedByEmail = new Map(validRows.map((r) => [r.email.toLowerCase(), r]));

  const mergedMap = new Map<string, string[]>();
  for (const raw of meta.petugas) {
    const preserved = rawRowToPreservedPetugasRow(raw);
    if (!preserved || !preserved[0]) continue;
    const rowEmail = preserved[0];
    const parsed = parsedByEmail.get(rowEmail);

    const isOtherOrProtected =
      !parsed ||
      parsed.role !== 'enumerator' ||
      (parsed.koordinatorEmail && parsed.koordinatorEmail !== koorLower) ||
      (parsed.hasRtError) ||
      (!parsed.assignedRTs.some((rt) => koorRtSet.has(rt)) &&
        parsed.koordinatorEmail !== koorLower);

    if (isOtherOrProtected) {
      mergedMap.set(rowEmail, preserved);
    }
  }

  for (const enumStaff of enumerators) {
    mergedMap.set(enumStaff.email.toLowerCase(), staffToPetugasRow(enumStaff));
  }

  const rows = Array.from(mergedMap.values()).sort((a, b) => a[1].localeCompare(b[1], 'id'));
  await pushStaffRowsRawToWebhook(webhookUrl, rows);
}

export interface FetchStaffWebhookResult {
  petugas: SpreadsheetPetugasRawRow[];
  supportsPetugasOps: boolean;
}

export async function fetchStaffMetaFromWebhook(
  webhookUrl: string
): Promise<FetchStaffWebhookResult> {
  if (!isValidAppsScriptUrl(webhookUrl)) {
    throw new Error('URL Google Apps Script Web App tidak valid (harus berakhiran /exec).');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Perangkat sedang luring. Tidak dapat membaca Google Spreadsheet.');
  }

  const sep = webhookUrl.includes('?') ? '&' : '?';
  const targetUrl = `${webhookUrl.trim()}${sep}action=get_petugas&_ts=${Date.now()}`;

  const res = await fetch(targetUrl, {
    method: 'GET',
    redirect: 'follow',
  });
  const text = await res.text();
  if (!text || text.trim().startsWith('<')) {
    throw new Error(
      'Kode Google Apps Script di Spreadsheet belum memiliki fungsi doGet untuk membaca tab "petugas". Salin ulang kode Apps Script terbaru di menu Admin & Sheet lalu Deploy versi baru.'
    );
  }

  let parsed: {
    ok?: boolean;
    version?: number;
    supportsPetugasOps?: boolean;
    petugas?: SpreadsheetPetugasRawRow[];
    error?: string;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      'Respons Google Apps Script tidak valid. Pastikan kode Apps Script terbaru sudah di-Deploy dengan akses "Siapa saja (Anyone)".'
    );
  }

  if (!parsed.ok) {
    throw new Error(parsed.error || 'Gagal membaca tab petugas dari Google Spreadsheet.');
  }

  return {
    petugas: Array.isArray(parsed.petugas) ? parsed.petugas : [],
    supportsPetugasOps: Boolean(parsed.supportsPetugasOps || (parsed.version && parsed.version >= 2)),
  };
}

export async function fetchStaffFromWebhook(
  webhookUrl: string
): Promise<SpreadsheetPetugasRawRow[]> {
  const res = await fetchStaffMetaFromWebhook(webhookUrl);
  return res.petugas;
}

const EMAIL_KEY_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

const ROMAN_DUSUN: Record<string, DusunCode> = {
  I: 'D1',
  '1': 'D1',
  II: 'D2',
  '2': 'D2',
  III: 'D3',
  '3': 'D3',
  IV: 'D4',
  '4': 'D4',
  V: 'D5',
  '5': 'D5',
};

export interface ParsedSpreadsheetStaffRow {
  email: string;
  name: string;
  role: UserRole;
  assignedRTs: string[];
  active: boolean;
  koordinatorEmail?: string;
  rtRawText: string;
  hasRtError: boolean;
  explicitClearRt: boolean;
}

export function parseSpreadsheetStaffRows(
  rawRows: SpreadsheetPetugasRawRow[],
  wilayah: WilayahConfig
): {
  validRows: ParsedSpreadsheetStaffRow[];
  errors: string[];
} {
  const validRtSet = new Set<string>();
  const rtsByRw = new Map<string, string[]>();
  const rtsByRwNumber = new Map<string, string[]>();
  const rwToDusun = new Map<string, DusunCode>();
  const rtsByDusun = new Map<DusunCode, string[]>();
  const allValidRts: string[] = [];

  for (const m of wilayah.rwMappings) {
    const rwPad = String(m.rw).padStart(2, '0');
    const rwKey = `${m.dusun}-${rwPad}`;
    const list: string[] = [];
    for (let i = 1; i <= (m.jumlahRt || 0); i++) {
      const rtKey = `${m.dusun}-${rwPad}-${String(i).padStart(2, '0')}`;
      validRtSet.add(rtKey);
      allValidRts.push(rtKey);
      list.push(rtKey);
      const dList = rtsByDusun.get(m.dusun) || [];
      dList.push(rtKey);
      rtsByDusun.set(m.dusun, dList);
    }
    rtsByRw.set(rwKey, list);
    const existingByRwNum = rtsByRwNumber.get(rwPad) || [];
    rtsByRwNumber.set(rwPad, [...existingByRwNum, ...list]);
    rwToDusun.set(rwPad, m.dusun);
  }

  const dedupMap = new Map<string, ParsedSpreadsheetStaffRow>();
  const errors: string[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const norm = normalizeRawRowFields(raw);
    const emailRaw = pickRawField(norm, ['email', 'e_mail', 'alamat_email']).trim().toLowerCase();
    if (!emailRaw) return;
    if (!EMAIL_KEY_REGEX.test(emailRaw) || emailRaw.length > 200) {
      errors.push(`Baris ${rowNum}: email "${emailRaw}" tidak valid.`);
      return;
    }

    const nameRaw =
      pickRawField(norm, ['nama', 'name', 'nama_lengkap']).trim() || emailRaw.split('@')[0];
    const roleRaw = pickRawField(norm, ['role', 'peran', 'jabatan']).trim().toLowerCase();
    let role: UserRole = 'enumerator';
    if (roleRaw === 'admin') {
      role = 'admin';
    } else if (roleRaw === 'koordinator' || roleRaw === 'koor' || roleRaw === 'dpl') {
      role = 'koordinator';
    } else if (roleRaw && roleRaw !== 'enumerator' && roleRaw !== 'enum' && roleRaw !== 'petugas') {
      errors.push(
        `Baris ${rowNum} (${emailRaw}): role "${roleRaw}" harus admin, koordinator, atau enumerator.`
      );
      return;
    }

    const aktifRaw = (pickRawField(norm, ['aktif', 'active', 'status']) || 'ya')
      .trim()
      .toLowerCase();
    const active = !['tidak', 'nonaktif', 'non-aktif', 'false', '0', 'no', 'n', 'off'].includes(
      aktifRaw
    );

    const rtRaw = pickRawField(norm, [
      'rt_tugas',
      'wilayah_tugas',
      'wilayah',
      'tugas_rt',
      'penugasan_rt',
      'assignedrts',
      'assigned_rts',
      'rt',
      'rw',
    ]).trim();
    const rtLower = rtRaw.toLowerCase();
    const explicitClearRt = ['-', 'kosong', 'clear', 'tidak ada', 'none', 'hapus'].includes(
      rtLower
    );

    const expandedRts: string[] = [];
    let hasRtError = false;

    if (role !== 'admin' && rtRaw && !explicitClearRt) {
      if (rtLower === 'semua' || rtLower === 'all' || rtLower === 'seluruh desa') {
        expandedRts.push(...allValidRts);
      } else {
        const tokens = rtRaw
          .split(/[,;\n]+/)
          .map((t) => t.trim().toUpperCase())
          .filter(Boolean);

        for (const tok of tokens) {
          // 1. Rentang RT, mis. D1-01-01 s/d D1-01-05 atau D1-01-01 - D1-01-05
          const rangeMatch = /^(D[1-5])[.\-\s]+(\d{1,2})[.\-\s]+(\d{1,2})\s*(?:S\/?D|-|\.\.|SAMPAI)\s*(?:D[1-5][.\-\s]+\d{1,2}[.\-\s]+)?(\d{1,2})$/i.exec(
            tok
          );
          if (rangeMatch) {
            const dCode = rangeMatch[1].toUpperCase() as DusunCode;
            const rwPad = rangeMatch[2].padStart(2, '0');
            const startRt = parseInt(rangeMatch[3], 10);
            const endRt = parseInt(rangeMatch[4], 10);
            if (startRt <= endRt && endRt <= 99) {
              let foundAny = false;
              for (let n = startRt; n <= endRt; n++) {
                const candidate = `${dCode}-${rwPad}-${String(n).padStart(2, '0')}`;
                if (validRtSet.has(candidate)) {
                  expandedRts.push(candidate);
                  foundAny = true;
                }
              }
              if (!foundAny) {
                hasRtError = true;
                errors.push(`Baris ${rowNum} (${emailRaw}): rentang RT "${tok}" tidak valid pada pemetaan wilayah.`);
              }
            } else {
              hasRtError = true;
              errors.push(`Baris ${rowNum} (${emailRaw}): rentang RT "${tok}" tidak valid.`);
            }
            continue;
          }

          // 2. Kode RT lengkap (mendukung pemisah -, ., spasi dan angka tanpa 0 di depan: D1-1-1 -> D1-01-01)
          const fullRtMatch = /^(D[1-5])[.\-\s]+(\d{1,2})[.\-\s]+(\d{1,2})$/.exec(tok);
          if (fullRtMatch) {
            const candidate = `${fullRtMatch[1]}-${fullRtMatch[2].padStart(2, '0')}-${fullRtMatch[3].padStart(2, '0')}`;
            if (validRtSet.has(candidate)) {
              expandedRts.push(candidate);
            } else {
              hasRtError = true;
              errors.push(
                `Baris ${rowNum} (${emailRaw}): kode RT "${tok}" (${candidate}) tidak ada di pemetaan wilayah.`
              );
            }
            continue;
          }

          // 3. Kode RW + Dusun (mis. D1-01, D1-1, D1-01-*, D1 RW 01, D1-RW01)
          const rwWithDusunMatch = /^(D[1-5])[.\-\s]+(?:RW\s*)?(\d{1,2})(?:[.\-\s]*\*)?$/.exec(tok);
          if (rwWithDusunMatch) {
            const rwKey = `${rwWithDusunMatch[1]}-${rwWithDusunMatch[2].padStart(2, '0')}`;
            const rwRts = rtsByRw.get(rwKey) || [];
            if (rwRts.length > 0) {
              expandedRts.push(...rwRts);
            } else {
              hasRtError = true;
              errors.push(
                `Baris ${rowNum} (${emailRaw}): RW "${rwKey}" tidak ditemukan di pemetaan wilayah.`
              );
            }
            continue;
          }

          // 4. Format "RT 01 RW 01" atau "RW 01 RT 01"
          const rtRwMatch =
            /^RT\s*(\d{1,2})[\s/\-,]+RW\s*(\d{1,2})$/.exec(tok) ||
            /^RW\s*(\d{1,2})[\s/\-,]+RT\s*(\d{1,2})$/.exec(tok);
          if (rtRwMatch) {
            const isRtFirst = tok.startsWith('RT');
            const rtPad = (isRtFirst ? rtRwMatch[1] : rtRwMatch[2]).padStart(2, '0');
            const rwPad = (isRtFirst ? rtRwMatch[2] : rtRwMatch[1]).padStart(2, '0');
            const dCode = rwToDusun.get(rwPad);
            const candidate = dCode ? `${dCode}-${rwPad}-${rtPad}` : '';
            if (candidate && validRtSet.has(candidate)) {
              expandedRts.push(candidate);
            } else {
              hasRtError = true;
              errors.push(
                `Baris ${rowNum} (${emailRaw}): "${tok}" tidak cocok dengan pemetaan RT/RW desa.`
              );
            }
            continue;
          }

          // 5. Format RW saja (mis. "RW 01", "RW01", "RW 1")
          const rwOnlyMatch = /^RW\s*(\d{1,2})(?:[.\-\s]*\*)?$/.exec(tok);
          if (rwOnlyMatch) {
            const rwPad = rwOnlyMatch[1].padStart(2, '0');
            const rwRts = rtsByRwNumber.get(rwPad) || [];
            if (rwRts.length > 0) {
              expandedRts.push(...rwRts);
            } else {
              hasRtError = true;
              errors.push(
                `Baris ${rowNum} (${emailRaw}): RW "${rwPad}" tidak ditemukan di pemetaan wilayah.`
              );
            }
            continue;
          }

          // 6. Kode Dusun (mis. D1, D1-*, DUSUN 1, DUSUN I)
          const dusunMatch =
            /^(D[1-5])(?:[.\-\s]*\*)?$/.exec(tok) ||
            /^DUSUN\s+([1-5]|I{1,3}|IV|V)$/.exec(tok);
          if (dusunMatch) {
            const rawD = dusunMatch[1];
            const dCode = (rawD.startsWith('D') ? rawD : ROMAN_DUSUN[rawD]) as DusunCode | undefined;
            const dRts = dCode ? rtsByDusun.get(dCode) || [] : [];
            if (dRts.length > 0) {
              expandedRts.push(...dRts);
            } else {
              hasRtError = true;
              errors.push(`Baris ${rowNum} (${emailRaw}): Dusun "${tok}" tidak ditemukan.`);
            }
            continue;
          }

          hasRtError = true;
          errors.push(
            `Baris ${rowNum} (${emailRaw}): format RT "${tok}" tidak dikenali (gunakan mis. D1-01-01, D1-01, atau RW 01).`
          );
        }
      }
    }

    const assignedRTs = Array.from(new Set(expandedRts)).slice(0, 120);
    const koorEmail = pickRawField(norm, [
      'koordinator_email',
      'koordinatoremail',
      'email_koordinator',
      'koordinator',
    ])
      .trim()
      .toLowerCase();

    dedupMap.set(emailRaw, {
      email: emailRaw,
      name: nameRaw.slice(0, 150),
      role,
      assignedRTs,
      active,
      ...(koorEmail && EMAIL_KEY_REGEX.test(koorEmail) ? { koordinatorEmail: koorEmail } : {}),
      rtRawText: rtRaw,
      hasRtError,
      explicitClearRt,
    });
  });

  return {
    validRows: Array.from(dedupMap.values()),
    errors,
  };
}
