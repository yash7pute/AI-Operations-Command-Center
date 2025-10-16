import { EventEmitter } from 'events';
import { google, sheets_v4, Auth } from 'googleapis';
import logger from '../../utils/logger';
import { getAuthenticatedClient } from '../gmail/auth';

export class SheetsReader {
  private emitter = new EventEmitter();
  private authClient?: Auth.OAuth2Client;
  private sheets?: sheets_v4.Sheets;
  private lastDataMap = new Map<string, any>();
  private pollTimer: NodeJS.Timeout | null = null;

  async init() {
    if (this.sheets) return;
    this.authClient = await getAuthenticatedClient();
    this.sheets = google.sheets({ version: 'v4', auth: this.authClient });
  }

  on(event: 'change' | 'error', listener: (...args: any[]) => void) {
    this.emitter.on(event, listener);
  }

  off(event: 'change' | 'error', listener: (...args: any[]) => void) {
    this.emitter.off(event, listener);
  }

  async readSheet(spreadsheetId: string, range: string): Promise<string[][]> {
    await this.init();
    if (!this.sheets) throw new Error('Sheets client not initialized');
    try {
      const res = await this.sheets.spreadsheets.values.get({ spreadsheetId, range });
      const values = res.data.values || [];
      return values;
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || err?.message || String(err);
      logger.error('Failed to read sheet', { spreadsheetId, range, error: msg });
      if (msg.includes('notFound')) throw new Error(`Spreadsheet not found: ${spreadsheetId}`);
      if (msg.includes('permission')) throw new Error(`Permission denied reading spreadsheet: ${spreadsheetId}`);
      throw err;
    }
  }

  async getSheetMetadata(spreadsheetId: string) {
    await this.init();
    if (!this.sheets) throw new Error('Sheets client not initialized');
    try {
      const res = await this.sheets.spreadsheets.get({ spreadsheetId });
      const sheets = res.data.sheets || [];
      return sheets.map((s) => ({
        sheetId: s.properties?.sheetId,
        title: s.properties?.title,
        index: s.properties?.index,
        rowCount: s.properties?.gridProperties?.rowCount,
        columnCount: s.properties?.gridProperties?.columnCount,
      }));
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || err?.message || String(err);
      logger.error('Failed to get sheet metadata', { spreadsheetId, error: msg });
      throw err;
    }
  }

  /**
   * Read a sheet and parse rows into objects using the first row as headers.
   */
  async readSheetAsObjects(spreadsheetId: string, range: string): Promise<Record<string, any>[]> {
    const rows = await this.readSheet(spreadsheetId, range);
    if (!rows.length) return [];
    const headers = rows[0].map((h) => (h || '').toString());
    const results: Record<string, any>[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const obj: Record<string, any> = {};
      for (let c = 0; c < headers.length; c++) {
        const key = headers[c] || `col_${c}`;
        obj[key] = (row[c] !== undefined && row[c] !== null) ? row[c] : null;
      }
      results.push(obj);
    }
    return results;
  }

  /**
   * Watch a sheet range by polling every 2 minutes and emit a 'change' event when data differs from previous snapshot.
   */
  async watchSheet(spreadsheetId: string, range: string, pollIntervalMs = 120_000) {
    await this.init();
    const key = `${spreadsheetId}::${range}`;
    const pollOnce = async () => {
      try {
        const rows = await this.readSheetAsObjects(spreadsheetId, range);
        const prev = this.lastDataMap.get(key) || [];
        const changed = JSON.stringify(prev) !== JSON.stringify(rows);
        logger.info('Sheets watch check', { spreadsheetId, range, timestamp: new Date().toISOString(), changed, rowCount: rows.length });
        if (changed) {
          this.lastDataMap.set(key, rows);
          this.emitter.emit('change', { spreadsheetId, range, data: rows });
        }
      } catch (err) {
        logger.error('Error during sheets poll', err instanceof Error ? err.message : String(err));
        this.emitter.emit('error', err);
      }
    };

    // run immediately and then on interval
    await pollOnce();
    const timer = setInterval(pollOnce, pollIntervalMs);
    this.pollTimer = timer;
    return () => clearInterval(timer);
  }
}

export default new SheetsReader();
