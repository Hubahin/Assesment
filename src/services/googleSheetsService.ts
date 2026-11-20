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
          .createTextOutput(JSON.stringify({ ok: true, petugas: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var values = sheet.getDataRange().getValues();
      if (values.length <= 1) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, petugas: [] }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      var colHeaders = values[0].map(function(h) {
        return String(h || '').trim().toLowerCase();
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
        .createTextOutput(JSON.stringify({ ok: true, petugas: rows }))
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
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var mode = payload.mode || 'append';
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

export async function appendSubmissionViaWebhook(params: {
  webhookUrl: string;
  household: HouseholdRecord;
  pii: HouseholdPiiRecord;
  visit: VisitRecord;
}): Promise<void> {
  const { webhookUrl, household, pii, visit } = params;
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

  await postWebhookPayload(webhookUrl, {
    mode: 'replace_all',
    tables: {
      rumah_tangga: buildRumahTanggaTable(households),
      anggota: buildAnggotaTable(households),
      identitas: buildIdentitasTable(piiRecords),
      kunjungan: buildKunjunganTable(visits),
      log_revisi: buildLogRevisiTable(revisionLogs),
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

export function buildPetugasTable(staffList: StaffMember[]): {
  headers: string[];
  rows: string[][];
} {
  const headers = ['email', 'nama', 'role', 'rt_tugas', 'aktif', 'koordinator_email'];
  const rows = staffList.map((s) => [
    s.email.toLowerCase(),
    s.name,
    s.role,
    s.role === 'admin' ? '' : (s.assignedRTs || []).join(', '),
    s.active ? 'ya' : 'tidak',
    s.koordinatorEmail || '',
  ]);
  return { headers, rows };
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

export async function pushStaffUpsertSafeToWebhook(params: {
  webhookUrl: string;
  actorRole: UserRole;
  savedStaff: StaffMember;
  updatedAdminStaffList?: StaffMember[];
  wilayah: WilayahConfig;
}): Promise<void> {
  const { webhookUrl, actorRole, savedStaff, updatedAdminStaffList, wilayah } = params;

  if (actorRole === 'admin' && updatedAdminStaffList) {
    await pushStaffToWebhook(webhookUrl, updatedAdminStaffList);
    return;
  }

  try {
    const rawRows = await fetchStaffFromWebhook(webhookUrl);
    const { validRows } = parseSpreadsheetStaffRows(rawRows, wilayah);
    const mergedMap = new Map<string, StaffMember>();
    for (const r of validRows) {
      mergedMap.set(r.email.toLowerCase(), {
        email: r.email.toLowerCase(),
        name: r.name,
        role: r.role,
        assignedRTs: r.assignedRTs,
        koordinatorEmail: r.koordinatorEmail,
        active: r.active,
        createdBy: 'spreadsheet',
      });
    }
    mergedMap.set(savedStaff.email.toLowerCase(), savedStaff);
    const mergedList = Array.from(mergedMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'id')
    );
    await pushStaffToWebhook(webhookUrl, mergedList);
  } catch {
    await postWebhookPayload(webhookUrl, {
      mode: 'append',
      tables: {
        petugas: buildPetugasTable([savedStaff]),
      },
    });
  }
}

export async function fetchStaffFromWebhook(
  webhookUrl: string
): Promise<SpreadsheetPetugasRawRow[]> {
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

  let parsed: { ok?: boolean; petugas?: SpreadsheetPetugasRawRow[]; error?: string };
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

  return Array.isArray(parsed.petugas) ? parsed.petugas : [];
}

const EMAIL_KEY_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function parseSpreadsheetStaffRows(
  rawRows: SpreadsheetPetugasRawRow[],
  wilayah: WilayahConfig
): {
  validRows: {
    email: string;
    name: string;
    role: UserRole;
    assignedRTs: string[];
    active: boolean;
    koordinatorEmail?: string;
  }[];
  errors: string[];
} {
  const validRtSet = new Set<string>();
  const rtsByRw = new Map<string, string[]>();
  const rtsByDusun = new Map<DusunCode, string[]>();

  for (const m of wilayah.rwMappings) {
    const rwKey = `${m.dusun}-${m.rw}`;
    const list: string[] = [];
    for (let i = 1; i <= (m.jumlahRt || 0); i++) {
      const rtKey = `${m.dusun}-${m.rw}-${String(i).padStart(2, '0')}`;
      validRtSet.add(rtKey);
      list.push(rtKey);
      const dList = rtsByDusun.get(m.dusun) || [];
      dList.push(rtKey);
      rtsByDusun.set(m.dusun, dList);
    }
    rtsByRw.set(rwKey, list);
  }

  const dedupMap = new Map<
    string,
    {
      email: string;
      name: string;
      role: UserRole;
      assignedRTs: string[];
      active: boolean;
      koordinatorEmail?: string;
    }
  >();
  const errors: string[] = [];

  rawRows.forEach((raw, idx) => {
    const rowNum = idx + 2;
    const emailRaw = String(raw.email || '').trim().toLowerCase();
    if (!emailRaw) return;
    if (!EMAIL_KEY_REGEX.test(emailRaw) || emailRaw.length > 200) {
      errors.push(`Baris ${rowNum}: email "${emailRaw}" tidak valid.`);
      return;
    }

    const nameRaw = String(raw.nama || raw.name || '').trim() || emailRaw.split('@')[0];
    const roleRaw = String(raw.role || raw.peran || '').trim().toLowerCase();
    let role: UserRole = 'enumerator';
    if (roleRaw === 'admin') {
      role = 'admin';
    } else if (roleRaw === 'koordinator' || roleRaw === 'koor' || roleRaw === 'dpl') {
      role = 'koordinator';
    } else if (roleRaw && roleRaw !== 'enumerator' && roleRaw !== 'enum' && roleRaw !== 'petugas') {
      errors.push(`Baris ${rowNum} (${emailRaw}): role "${roleRaw}" harus admin, koordinator, atau enumerator.`);
      return;
    }

    const aktifRaw = String(raw.aktif ?? raw.active ?? raw.status ?? 'ya').trim().toLowerCase();
    const active = !['tidak', 'nonaktif', 'non-aktif', 'false', '0', 'no', 'n', 'off'].includes(
      aktifRaw
    );

    const rtRaw = String(raw.rt_tugas || raw.assignedrts || raw.rt || '').trim();
    const expandedRts: string[] = [];
    if (role !== 'admin' && rtRaw && rtRaw.toLowerCase() !== 'semua') {
      const tokens = rtRaw
        .split(/[,;\n]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);

      for (const tok of tokens) {
        if (/^D[1-5]-\d{2}-\d{2}$/.test(tok)) {
          if (validRtSet.has(tok)) {
            expandedRts.push(tok);
          } else {
            errors.push(`Baris ${rowNum} (${emailRaw}): kode RT "${tok}" tidak ada di pemetaan wilayah.`);
          }
        } else if (/^D[1-5]-\d{2}(-\*)?$/.test(tok)) {
          const rwKey = tok.replace(/-\*$/, '');
          const rwRts = rtsByRw.get(rwKey) || [];
          if (rwRts.length > 0) {
            expandedRts.push(...rwRts);
          } else {
            errors.push(`Baris ${rowNum} (${emailRaw}): RW "${rwKey}" tidak ditemukan di pemetaan wilayah.`);
          }
        } else if (/^D[1-5](-\*)?$/.test(tok)) {
          const dusunCode = tok.replace(/-\*$/, '') as DusunCode;
          const dRts = rtsByDusun.get(dusunCode) || [];
          expandedRts.push(...dRts);
        } else {
          errors.push(`Baris ${rowNum} (${emailRaw}): format RT "${tok}" tidak dikenali (gunakan mis. D1-01-01 atau D1-01).`);
        }
      }
    }

    const assignedRTs = Array.from(new Set(expandedRts)).slice(0, 120);
    const koorEmail = String(raw.koordinator_email || raw.koordinatoremail || '')
      .trim()
      .toLowerCase();

    dedupMap.set(emailRaw, {
      email: emailRaw,
      name: nameRaw.slice(0, 150),
      role,
      assignedRTs,
      active,
      ...(koorEmail && EMAIL_KEY_REGEX.test(koorEmail) ? { koordinatorEmail: koorEmail } : {}),
    });
  });

  return {
    validRows: Array.from(dedupMap.values()),
    errors,
  };
}
