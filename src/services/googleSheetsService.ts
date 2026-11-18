import {
  HouseholdPiiRecord,
  HouseholdRecord,
  RevisionLogRecord,
  VisitRecord,
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
export const APPS_SCRIPT_TEMPLATE = `function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var mode = payload.mode || 'append';
    var tables = payload.tables || {};
    var tabNames = ['rumah_tangga', 'anggota', 'identitas', 'kunjungan', 'log_revisi'];

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
