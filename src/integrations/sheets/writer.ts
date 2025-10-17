import { google, sheets_v4, Auth } from 'googleapis';
import logger from '../../utils/logger';
import { getAuthenticatedClient } from '../gmail/auth';

function isValidCellValue(v: any): boolean {
  return (
    v === null ||
    v === undefined ||
    typeof v === 'string' ||
    typeof v === 'number' ||
    v instanceof Date
  );
}

function normalizeCellValue(v: any): string | number | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'number' || typeof v === 'string') return v;
  return String(v);
}

async function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 5, baseMs = 1000): Promise<T> {
  let attempt = 0;
  let lastErr: any;
  while (attempt < attempts) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      attempt += 1;
      const msg = (err?.errors && err.errors[0]?.message) || err?.message || String(err);
      // if quota or rate limit, wait and retry
      if (/quota|rateLimitExceeded|userRateLimitExceeded|429/i.test(msg) && attempt < attempts) {
        const wait = baseMs * Math.pow(2, attempt - 1);
        logger.warn(`Rate/quota error, retrying in ${wait}ms (attempt ${attempt})`, { error: msg });
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      // other errors: don't retry
      throw err;
    }
  }
  throw lastErr;
}

export class SheetsWriter {
  private authClient?: Auth.OAuth2Client;
  private sheets?: sheets_v4.Sheets;

  private async init() {
    if (this.sheets) return;
    this.authClient = await getAuthenticatedClient();
    this.sheets = google.sheets({ version: 'v4', auth: this.authClient });
  }

  /**
   * Append a row of values to a sheet range.
   */
  async appendRow(spreadsheetId: string, range: string, values: any[]): Promise<sheets_v4.Schema$AppendValuesResponse> {
    await this.init();
    if (!this.sheets) throw new Error('Sheets client not initialized');

    // validate
    for (const v of values) {
      if (!isValidCellValue(v)) throw new Error(`Invalid cell value type: ${typeof v}`);
    }

    const normalized = values.map(normalizeCellValue);

    const op = async () =>
      (await this.sheets!.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [normalized] },
      })).data;

    logger.info('Appending row to sheet', { spreadsheetId, range, values: normalized, ts: new Date().toISOString() });
    return await retryWithBackoff(op);
  }

  /**
   * Update a single cell (range must point to one cell)
   * Returns the updated response. On failure, attempts rollback to previous value.
   */
  async updateCell(spreadsheetId: string, range: string, value: any): Promise<sheets_v4.Schema$UpdateValuesResponse> {
    await this.init();
    if (!this.sheets) throw new Error('Sheets client not initialized');

    if (!isValidCellValue(value)) throw new Error(`Invalid cell value type: ${typeof value}`);
    const normalized = normalizeCellValue(value);

    // read previous value for rollback
    let prev: any[][] = [[]];
    try {
      const getRes = await this.sheets.spreadsheets.values.get({ spreadsheetId, range });
      prev = getRes.data.values || [[]];
    } catch (err) {
      // if reading previous fails, log but continue (no rollback available)
      logger.warn('Failed to read previous cell value before update', { spreadsheetId, range, error: (err as any)?.message || String(err) });
    }

    const op = async () =>
      (await this.sheets!.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: { values: [[normalized]] },
      })).data;

    logger.info('Updating cell', { spreadsheetId, range, value: normalized, ts: new Date().toISOString() });

    try {
  const res = await retryWithBackoff(op);
  return res;
    } catch (err) {
      logger.error('Update failed, attempting rollback', { spreadsheetId, range, error: (err as any)?.message || String(err) });
      // attempt rollback if we have prev
      try {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption: 'RAW',
          requestBody: { values: prev },
        });
        logger.info('Rollback successful', { spreadsheetId, range, ts: new Date().toISOString() });
      } catch (rbErr) {
        logger.error('Rollback failed', { spreadsheetId, range, error: (rbErr as any)?.message || String(rbErr) });
      }
      throw err;
    }
  }

  /**
   * Batch update multiple ranges. updates: [{ range, values: [[...]] }]
   * On failure, attempts rollback using previously read values.
   */
  async batchUpdate(spreadsheetId: string, updates: { range: string; values: any[][] }[]): Promise<sheets_v4.Schema$BatchUpdateValuesResponse> {
    await this.init();
    if (!this.sheets) throw new Error('Sheets client not initialized');

    // validate all values first
    for (const upd of updates) {
      for (const row of upd.values) {
        for (const cell of row) if (!isValidCellValue(cell)) throw new Error(`Invalid cell value type in range ${upd.range}`);
      }
    }

    // read previous values for rollback
    const prevMap: Record<string, any[][]> = {};
    for (const upd of updates) {
      try {
        const res = await this.sheets.spreadsheets.values.get({ spreadsheetId, range: upd.range });
        prevMap[upd.range] = res.data.values || [];
      } catch (err) {
        prevMap[upd.range] = [];
        logger.warn('Failed to read previous range for rollback', { spreadsheetId, range: upd.range, error: (err as any)?.message || String(err) });
      }
    }

    const data = updates.map((u) => ({ range: u.range, values: u.values.map((r) => r.map(normalizeCellValue)) }));

    const op = async () =>
      this.sheets!.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'RAW', data },
      });

    logger.info('Batch updating sheet', { spreadsheetId, ranges: updates.map((u) => u.range), ts: new Date().toISOString() });

    try {
  const res = await retryWithBackoff(op);
  return res as sheets_v4.Schema$BatchUpdateValuesResponse;
    } catch (err) {
      logger.error('Batch update failed, attempting rollback', { spreadsheetId, error: (err as any)?.message || String(err) });
      // rollback
      const rollbackData = Object.keys(prevMap).map((range) => ({ range, values: prevMap[range] }));
      try {
        await this.sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: rollbackData } });
        logger.info('Batch rollback successful', { spreadsheetId, ts: new Date().toISOString() });
      } catch (rbErr) {
        logger.error('Batch rollback failed', { spreadsheetId, error: (rbErr as any)?.message || String(rbErr) });
      }
      throw err;
    }
  }
}

export default new SheetsWriter();
