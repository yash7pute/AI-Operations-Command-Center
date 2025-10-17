/**
 * Google Sheets Executor
 * 
 * Manages spreadsheet operations including data writing, formatting, and analytics.
 * Provides comprehensive sheet management with audit logging and metrics tracking.
 * 
 * Key Features:
 * - Row/cell/range updates
 * - Sheet creation and management
 * - Action logging for audit trail
 * - Metrics dashboard updates
 * - Data validation and formatting
 * - Automatic sheet creation
 * 
 * Operations:
 * - append_row: Add new row with data
 * - update_cell: Update specific cell
 * - update_range: Update multiple cells
 * - create_sheet: Add new tab to spreadsheet
 */

import { google, sheets_v4 } from 'googleapis';
import { ExecutionResult } from '../../types';
import { config } from '../../config';
import { logExecutionStart, logExecutionSuccess, logExecutionFailure } from '../execution-logger';
import logger from '../../utils/logger';

const sheets = google.sheets({
  version: 'v4',
  auth: config.GOOGLE_SHEETS_API_KEY
});

/**
 * Sheet operation types
 */
export enum SheetOperation {
  APPEND_ROW = 'append_row',
  UPDATE_CELL = 'update_cell',
  UPDATE_RANGE = 'update_range',
  CREATE_SHEET = 'create_sheet'
}

/**
 * Cell value types for validation and formatting
 */
export enum CellType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  CURRENCY = 'currency',
  PERCENTAGE = 'percentage'
}

/**
 * Data for sheet operations
 */
export interface SheetData {
  values: any[][];
  range?: string;
  sheetName?: string;
  startRow?: number;
  startColumn?: number;
}

/**
 * Action log entry structure
 */
export interface ActionLog {
  timestamp: Date;
  action: string;
  target: string;
  status: 'success' | 'failure' | 'pending';
  details?: string;
}

/**
 * Metrics data structure
 */
export interface MetricsData {
  signalsProcessed?: number;
  tasksCreated?: number;
  successRate?: number;
  errors?: number;
  averageResponseTime?: number;
  period?: 'daily' | 'weekly' | 'monthly';
  date?: Date;
}

/**
 * Cell formatting options
 */
export interface CellFormatting {
  type?: CellType;
  numberFormat?: string;
  bold?: boolean;
  backgroundColor?: { red: number; green: number; blue: number };
  horizontalAlignment?: 'LEFT' | 'CENTER' | 'RIGHT';
}

// Cache for sheet metadata
const sheetMetadataCache = new Map<string, any>();

/**
 * Validate data based on expected type
 */
function validateCellValue(value: any, expectedType: CellType): { valid: boolean; formatted: any; error?: string } {
  try {
    switch (expectedType) {
      case CellType.STRING:
        return { valid: true, formatted: String(value) };
      
      case CellType.NUMBER:
        const num = Number(value);
        if (isNaN(num)) {
          return { valid: false, formatted: value, error: `Invalid number: ${value}` };
        }
        return { valid: true, formatted: num };
      
      case CellType.BOOLEAN:
        if (typeof value === 'boolean') {
          return { valid: true, formatted: value };
        }
        if (value === 'true' || value === 'TRUE' || value === 1) {
          return { valid: true, formatted: true };
        }
        if (value === 'false' || value === 'FALSE' || value === 0) {
          return { valid: true, formatted: false };
        }
        return { valid: false, formatted: value, error: `Invalid boolean: ${value}` };
      
      case CellType.DATE:
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return { valid: false, formatted: value, error: `Invalid date: ${value}` };
        }
        return { valid: true, formatted: date.toISOString().split('T')[0] };
      
      case CellType.CURRENCY:
        const currency = Number(value);
        if (isNaN(currency)) {
          return { valid: false, formatted: value, error: `Invalid currency: ${value}` };
        }
        return { valid: true, formatted: currency };
      
      case CellType.PERCENTAGE:
        const percent = Number(value);
        if (isNaN(percent)) {
          return { valid: false, formatted: value, error: `Invalid percentage: ${value}` };
        }
        return { valid: true, formatted: percent / 100 };
      
      default:
        return { valid: true, formatted: value };
    }
  } catch (error: any) {
    return { valid: false, formatted: value, error: error.message };
  }
}

/**
 * Validate array of data
 */
function validateData(data: any[][], types?: CellType[][]): { valid: boolean; errors: string[]; formatted: any[][] } {
  const errors: string[] = [];
  const formatted: any[][] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const formattedRow: any[] = [];
    
    for (let j = 0; j < row.length; j++) {
      const value = row[j];
      const expectedType = types?.[i]?.[j];
      
      if (expectedType) {
        const validation = validateCellValue(value, expectedType);
        if (!validation.valid) {
          errors.push(`Row ${i + 1}, Column ${j + 1}: ${validation.error}`);
        }
        formattedRow.push(validation.formatted);
      } else {
        formattedRow.push(value);
      }
    }
    
    formatted.push(formattedRow);
  }

  return {
    valid: errors.length === 0,
    errors,
    formatted
  };
}

/**
 * Get sheet metadata (with caching)
 */
async function getSheetMetadata(spreadsheetId: string, bustCache: boolean = false): Promise<any> {
  if (!bustCache && sheetMetadataCache.has(spreadsheetId)) {
    return sheetMetadataCache.get(spreadsheetId);
  }

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(sheetId,title,gridProperties))'
  });

  sheetMetadataCache.set(spreadsheetId, response.data);
  return response.data;
}

/**
 * Check if sheet exists in spreadsheet
 */
async function sheetExists(spreadsheetId: string, sheetName: string): Promise<boolean> {
  try {
    const metadata = await getSheetMetadata(spreadsheetId);
    const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName);
    return !!sheet;
  } catch (error) {
    logger.error('Error checking sheet existence', { error, spreadsheetId, sheetName });
    return false;
  }
}

/**
 * Create a new sheet in the spreadsheet
 */
async function createSheet(spreadsheetId: string, sheetName: string, rows: number = 1000, columns: number = 26): Promise<number> {
  try {
    const response = await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName,
              gridProperties: {
                rowCount: rows,
                columnCount: columns
              }
            }
          }
        }]
      }
    });

    // Bust cache
    sheetMetadataCache.delete(spreadsheetId);

    const sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId;
    logger.info('Sheet created successfully', { spreadsheetId, sheetName, sheetId });
    
    return sheetId || 0;
  } catch (error: any) {
    // Check if sheet already exists
    if (error.message?.includes('already exists')) {
      logger.info('Sheet already exists', { spreadsheetId, sheetName });
      const metadata = await getSheetMetadata(spreadsheetId, true);
      const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName);
      return sheet?.properties?.sheetId || 0;
    }
    throw error;
  }
}

/**
 * Apply formatting to cells
 */
async function applyCellFormatting(
  spreadsheetId: string,
  sheetId: number,
  startRow: number,
  startColumn: number,
  endRow: number,
  endColumn: number,
  formatting: CellFormatting
): Promise<void> {
  const requests: any[] = [];

  // Number format
  if (formatting.numberFormat) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: startRow,
          endRowIndex: endRow,
          startColumnIndex: startColumn,
          endColumnIndex: endColumn
        },
        cell: {
          userEnteredFormat: {
            numberFormat: {
              type: formatting.numberFormat
            }
          }
        },
        fields: 'userEnteredFormat.numberFormat'
      }
    });
  }

  // Text formatting
  if (formatting.bold !== undefined || formatting.horizontalAlignment) {
    const textFormat: any = {};
    if (formatting.bold !== undefined) {
      textFormat.bold = formatting.bold;
    }

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: startRow,
          endRowIndex: endRow,
          startColumnIndex: startColumn,
          endColumnIndex: endColumn
        },
        cell: {
          userEnteredFormat: {
            textFormat,
            horizontalAlignment: formatting.horizontalAlignment
          }
        },
        fields: 'userEnteredFormat(textFormat,horizontalAlignment)'
      }
    });
  }

  // Background color
  if (formatting.backgroundColor) {
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: startRow,
          endRowIndex: endRow,
          startColumnIndex: startColumn,
          endColumnIndex: endColumn
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: formatting.backgroundColor
          }
        },
        fields: 'userEnteredFormat.backgroundColor'
      }
    });
  }

  if (requests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });
  }
}

/**
 * Get number format string based on cell type
 */
function getNumberFormat(type: CellType): string | undefined {
  switch (type) {
    case CellType.DATE:
      return 'DATE';
    case CellType.CURRENCY:
      return 'CURRENCY';
    case CellType.PERCENTAGE:
      return 'PERCENT';
    case CellType.NUMBER:
      return 'NUMBER';
    default:
      return undefined;
  }
}

/**
 * Update Google Sheet with specified operation
 * 
 * @param spreadsheetId - The spreadsheet ID
 * @param data - Data to write (SheetData object)
 * @param operation - Operation type (append_row, update_cell, update_range, create_sheet)
 * @param formatting - Optional cell formatting
 * @param validate - Whether to validate data (default: true)
 * @returns ExecutionResult
 */
export async function updateSheet(
  spreadsheetId: string,
  data: SheetData,
  operation: SheetOperation,
  formatting?: CellFormatting,
  validate: boolean = true
): Promise<ExecutionResult> {
  const actionId = `sheets-update-${Date.now()}`;
  const startTime = Date.now();

  try {
    await logExecutionStart(
      actionId,
      actionId,
      'update_sheet',
      'sheets',
      { spreadsheetId, operation, sheetName: data.sheetName }
    );

    // Validate data if requested
    if (validate && data.values) {
      const validation = validateData(data.values);
      if (!validation.valid) {
        throw new Error(`Data validation failed: ${validation.errors.join(', ')}`);
      }
      data.values = validation.formatted;
    }

    let result: any;
    const sheetName = data.sheetName || 'Sheet1';

    switch (operation) {
      case SheetOperation.APPEND_ROW:
        // Append row to sheet
        const appendRange = `${sheetName}!A:Z`;
        result = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: appendRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: data.values
          }
        });

        logger.info('Row appended successfully', {
          spreadsheetId,
          sheetName,
          rowsAdded: data.values.length
        });
        break;

      case SheetOperation.UPDATE_CELL:
        // Update specific cell
        if (!data.range && (data.startRow === undefined || data.startColumn === undefined)) {
          throw new Error('Must specify either range or startRow/startColumn for UPDATE_CELL');
        }

        const cellRange = data.range || 
          `${sheetName}!${columnToLetter(data.startColumn!)}${data.startRow! + 1}`;

        result = await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: cellRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: data.values
          }
        });

        logger.info('Cell updated successfully', {
          spreadsheetId,
          range: cellRange
        });
        break;

      case SheetOperation.UPDATE_RANGE:
        // Update range of cells
        if (!data.range) {
          throw new Error('Must specify range for UPDATE_RANGE operation');
        }

        const updateRange = data.range.includes('!') ? data.range : `${sheetName}!${data.range}`;

        result = await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: updateRange,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: data.values
          }
        });

        logger.info('Range updated successfully', {
          spreadsheetId,
          range: updateRange,
          cellsUpdated: result.data.updatedCells
        });
        break;

      case SheetOperation.CREATE_SHEET:
        // Create new sheet tab
        const rows = data.values?.[0]?.[0] || 1000;
        const columns = data.values?.[0]?.[1] || 26;
        const sheetId = await createSheet(spreadsheetId, sheetName, rows, columns);

        result = { sheetId, sheetName };
        logger.info('Sheet created successfully', { spreadsheetId, sheetName, sheetId });
        break;

      default:
        throw new Error(`Unknown operation: ${operation}`);
    }

    // Apply formatting if specified
    if (formatting && operation !== SheetOperation.CREATE_SHEET) {
      const metadata = await getSheetMetadata(spreadsheetId);
      const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName);
      const sheetId = sheet?.properties?.sheetId || 0;

      let startRow = 0;
      let startColumn = 0;
      let endRow = data.values.length;
      let endColumn = data.values[0]?.length || 0;

      if (data.startRow !== undefined) startRow = data.startRow;
      if (data.startColumn !== undefined) startColumn = data.startColumn;

      if (formatting.type) {
        formatting.numberFormat = getNumberFormat(formatting.type);
      }

      await applyCellFormatting(
        spreadsheetId,
        sheetId,
        startRow,
        startColumn,
        endRow,
        endColumn,
        formatting
      );

      logger.info('Formatting applied successfully', { spreadsheetId, sheetName, formatting });
    }

    const executionTime = Date.now() - startTime;
    const resultData = {
      spreadsheetId,
      operation,
      sheetName,
      cellsUpdated: result?.data?.updatedCells || 0,
      rowsAdded: operation === SheetOperation.APPEND_ROW ? data.values.length : 0,
      sheetId: result?.sheetId
    };

    await logExecutionSuccess(
      actionId,
      actionId,
      'update_sheet',
      'sheets',
      { spreadsheetId, operation },
      resultData,
      executionTime
    );

    return {
      success: true,
      data: resultData,
      executionTime,
      executorUsed: 'sheets'
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    await logExecutionFailure(
      actionId,
      actionId,
      'update_sheet',
      'sheets',
      { spreadsheetId, operation },
      error.message || 'Failed to update sheet',
      executionTime
    );

    logger.error('Sheet update failed', {
      error: error.message,
      spreadsheetId,
      operation
    });

    return {
      success: false,
      error: error.message || 'Failed to update sheet',
      executionTime,
      executorUsed: 'sheets'
    };
  }
}

/**
 * Log action to audit trail sheet
 * 
 * Creates action log sheet if doesn't exist and appends entry with:
 * [Timestamp, Action, Target, Status, Details]
 * 
 * @param spreadsheetId - The spreadsheet ID
 * @param actionLog - Action log entry
 * @returns ExecutionResult
 */
export async function logAction(
  spreadsheetId: string,
  actionLog: ActionLog
): Promise<ExecutionResult> {
  const actionId = `sheets-log-${Date.now()}`;
  const startTime = Date.now();

  try {
    await logExecutionStart(
      actionId,
      actionId,
      'log_action',
      'sheets',
      { spreadsheetId, action: actionLog.action }
    );

    const sheetName = 'Action Log';

    // Check if Action Log sheet exists, create if not
    const exists = await sheetExists(spreadsheetId, sheetName);
    if (!exists) {
      await createSheet(spreadsheetId, sheetName, 10000, 5);
      
      // Add headers
      const headers = [['Timestamp', 'Action', 'Target', 'Status', 'Details']];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:E1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: headers }
      });

      // Format headers
      const metadata = await getSheetMetadata(spreadsheetId, true);
      const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName);
      const sheetId = sheet?.properties?.sheetId || 0;

      await applyCellFormatting(
        spreadsheetId,
        sheetId,
        0,
        0,
        1,
        5,
        {
          bold: true,
          backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
          horizontalAlignment: 'CENTER'
        }
      );

      logger.info('Action Log sheet created with headers', { spreadsheetId });
    }

    // Append action log entry
    const timestamp = actionLog.timestamp.toISOString();
    const logEntry = [[
      timestamp,
      actionLog.action,
      actionLog.target,
      actionLog.status,
      actionLog.details || ''
    ]];

    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:E`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: logEntry }
    });

    logger.info('Action logged successfully', {
      spreadsheetId,
      action: actionLog.action,
      status: actionLog.status
    });

    const executionTime = Date.now() - startTime;
    const resultData = {
      spreadsheetId,
      sheetName,
      action: actionLog.action,
      status: actionLog.status,
      updatedRange: result.data.updates?.updatedRange
    };

    await logExecutionSuccess(
      actionId,
      actionId,
      'log_action',
      'sheets',
      { spreadsheetId, action: actionLog.action },
      resultData,
      executionTime
    );

    return {
      success: true,
      data: resultData,
      executionTime,
      executorUsed: 'sheets'
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    await logExecutionFailure(
      actionId,
      actionId,
      'log_action',
      'sheets',
      { spreadsheetId, action: actionLog.action },
      error.message || 'Failed to log action',
      executionTime
    );

    logger.error('Action logging failed', {
      error: error.message,
      spreadsheetId,
      action: actionLog.action
    });

    return {
      success: false,
      error: error.message || 'Failed to log action',
      executionTime,
      executorUsed: 'sheets'
    };
  }
}

/**
 * Update metrics dashboard sheet
 * 
 * Updates dashboard with current metrics including:
 * - Signals processed
 * - Tasks created
 * - Success rate
 * - Daily/weekly/monthly aggregations
 * 
 * @param spreadsheetId - The spreadsheet ID
 * @param metrics - Metrics data
 * @returns ExecutionResult
 */
export async function updateMetrics(
  spreadsheetId: string,
  metrics: MetricsData
): Promise<ExecutionResult> {
  const actionId = `sheets-metrics-${Date.now()}`;
  const startTime = Date.now();

  try {
    await logExecutionStart(
      actionId,
      actionId,
      'update_metrics',
      'sheets',
      { spreadsheetId, period: metrics.period }
    );

    const sheetName = 'Metrics Dashboard';
    const date = metrics.date || new Date();
    const dateStr = date.toISOString().split('T')[0];

    // Check if Metrics Dashboard sheet exists, create if not
    const exists = await sheetExists(spreadsheetId, sheetName);
    if (!exists) {
      await createSheet(spreadsheetId, sheetName, 5000, 10);
      
      // Add headers
      const headers = [[
        'Date',
        'Period',
        'Signals Processed',
        'Tasks Created',
        'Success Rate (%)',
        'Errors',
        'Avg Response Time (ms)',
        'Updated At'
      ]];
      
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1:H1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: headers }
      });

      // Format headers
      const metadata = await getSheetMetadata(spreadsheetId, true);
      const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName);
      const sheetId = sheet?.properties?.sheetId || 0;

      await applyCellFormatting(
        spreadsheetId,
        sheetId,
        0,
        0,
        1,
        8,
        {
          bold: true,
          backgroundColor: { red: 0.2, green: 0.4, blue: 0.8 },
          horizontalAlignment: 'CENTER'
        }
      );

      logger.info('Metrics Dashboard sheet created with headers', { spreadsheetId });
    }

    // Prepare metrics row
    const metricsRow = [[
      dateStr,
      metrics.period || 'daily',
      metrics.signalsProcessed || 0,
      metrics.tasksCreated || 0,
      metrics.successRate ? (metrics.successRate * 100).toFixed(2) : '0.00',
      metrics.errors || 0,
      metrics.averageResponseTime || 0,
      new Date().toISOString()
    ]];

    // Append metrics
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:H`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: metricsRow }
    });

    // Apply formatting to numeric columns
    const metadata = await getSheetMetadata(spreadsheetId);
    const sheet = metadata.sheets?.find((s: any) => s.properties.title === sheetName);
    const sheetId = sheet?.properties?.sheetId || 0;

    // Get the row number that was just added
    const updatedRange = result.data.updates?.updatedRange || '';
    const rowMatch = updatedRange.match(/(\d+)$/);
    const rowIndex = rowMatch ? parseInt(rowMatch[1]) - 1 : 1;

    // Format percentage column
    await applyCellFormatting(
      spreadsheetId,
      sheetId,
      rowIndex,
      4,
      rowIndex + 1,
      5,
      { type: CellType.PERCENTAGE }
    );

    logger.info('Metrics updated successfully', {
      spreadsheetId,
      period: metrics.period,
      signalsProcessed: metrics.signalsProcessed
    });

    const executionTime = Date.now() - startTime;
    const resultData = {
      spreadsheetId,
      sheetName,
      period: metrics.period,
      metricsUpdated: Object.keys(metrics).length,
      updatedRange: result.data.updates?.updatedRange
    };

    await logExecutionSuccess(
      actionId,
      actionId,
      'update_metrics',
      'sheets',
      { spreadsheetId, period: metrics.period },
      resultData,
      executionTime
    );

    return {
      success: true,
      data: resultData,
      executionTime,
      executorUsed: 'sheets'
    };

  } catch (error: any) {
    const executionTime = Date.now() - startTime;
    
    await logExecutionFailure(
      actionId,
      actionId,
      'update_metrics',
      'sheets',
      { spreadsheetId, period: metrics.period },
      error.message || 'Failed to update metrics',
      executionTime
    );

    logger.error('Metrics update failed', {
      error: error.message,
      spreadsheetId,
      period: metrics.period
    });

    return {
      success: false,
      error: error.message || 'Failed to update metrics',
      executionTime,
      executorUsed: 'sheets'
    };
  }
}

/**
 * Helper: Convert column number to letter (0 = A, 1 = B, etc.)
 */
function columnToLetter(column: number): string {
  let letter = '';
  while (column >= 0) {
    letter = String.fromCharCode((column % 26) + 65) + letter;
    column = Math.floor(column / 26) - 1;
  }
  return letter;
}

/**
 * Clear sheet metadata cache
 */
export function clearMetadataCache(): void {
  sheetMetadataCache.clear();
  logger.info('Sheet metadata cache cleared');
}

/**
 * Get current metadata cache (for debugging)
 */
export function getMetadataCache(): Map<string, any> {
  return new Map(sheetMetadataCache);
}
