/**
 * Sheets Template Manager
 * 
 * Manages common spreadsheet operations and templates for the AI Operations Command Center.
 * Provides pre-built templates for action logs, metrics dashboards, and other common use cases.
 * 
 * Features:
 * - Action Log template with formatted headers
 * - Metrics Dashboard with calculations and charts
 * - Reusable template creation utilities
 * - Sheet formatting and styling
 * 
 * Environment Variables:
 * - SHEETS_LOG_SPREADSHEET_ID: Default spreadsheet for action logs
 * - GOOGLE_SHEETS_API_KEY: Google Sheets API authentication
 * 
 * @module sheets-template-manager
 */

import { google, sheets_v4 } from 'googleapis';
import { getConfig } from '../../config';
import logger from '../../utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Sheet creation result
 */
interface SheetCreationResult {
  success: boolean;
  sheetId?: number;
  sheetName?: string;
  spreadsheetId?: string;
  url?: string;
  error?: string;
}

/**
 * Header configuration for sheet columns
 */
interface HeaderConfig {
  value: string;
  width?: number;
  horizontalAlignment?: 'LEFT' | 'CENTER' | 'RIGHT';
}

/**
 * Chart configuration
 */
interface ChartConfig {
  type: 'LINE' | 'BAR' | 'PIE' | 'COLUMN';
  title: string;
  sourceRange: string;
  position: {
    row: number;
    column: number;
  };
}

/**
 * Formula configuration
 */
interface FormulaConfig {
  cell: string;
  formula: string;
  format?: 'NUMBER' | 'PERCENT' | 'CURRENCY' | 'TIME';
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Action Log sheet configuration
 */
const ACTION_LOG_CONFIG = {
  sheetName: 'Action Log',
  headers: [
    { value: 'Date', width: 120 },
    { value: 'Time', width: 100 },
    { value: 'Source', width: 120 },
    { value: 'Action', width: 150 },
    { value: 'Target', width: 200 },
    { value: 'Status', width: 100 },
    { value: 'Details', width: 300 },
    { value: 'Link', width: 250 }
  ] as HeaderConfig[],
  headerColor: { red: 0.8, green: 0.8, blue: 0.8 },
  frozenRows: 1
};

/**
 * Metrics Dashboard configuration
 */
const METRICS_DASHBOARD_CONFIG = {
  sheetName: 'Dashboard',
  metrics: [
    { label: 'Total Signals Processed', row: 2, col: 1, formula: '=COUNTA(\'Action Log\'!A:A)-1' },
    { label: 'Tasks Created', row: 3, col: 1, formula: '=COUNTIF(\'Action Log\'!D:D,"create_task")' },
    { label: 'Success Rate', row: 4, col: 1, formula: '=COUNTIF(\'Action Log\'!F:F,"success")/COUNTA(\'Action Log\'!F:F)', format: 'PERCENT' },
    { label: 'Failed Actions', row: 5, col: 1, formula: '=COUNTIF(\'Action Log\'!F:F,"error")' },
    { label: 'Avg Processing Time (sec)', row: 6, col: 1, formula: '=AVERAGE(\'Action Log\'!B:B)', format: 'NUMBER' }
  ],
  headerColor: { red: 0.2, green: 0.6, blue: 0.9 },
  labelWidth: 250,
  valueWidth: 150
};

// ============================================================================
// Google Sheets API Client
// ============================================================================

/**
 * Get authenticated Google Sheets API client
 */
function getSheetsClient(): sheets_v4.Sheets {
  const config = getConfig();
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: config.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return google.sheets({ version: 'v4', auth });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert column number to letter (1 = A, 2 = B, etc.)
 */
function columnToLetter(column: number): string {
  let temp: number;
  let letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

/**
 * Check if a sheet exists in a spreadsheet
 */
async function sheetExists(
  spreadsheetId: string,
  sheetName: string
): Promise<{ exists: boolean; sheetId?: number }> {
  try {
    const sheets = getSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets.properties'
    });

    const sheet = response.data.sheets?.find(
      (s) => s.properties?.title === sheetName
    );

    const sheetId = sheet?.properties?.sheetId ?? undefined;

    return {
      exists: !!sheet,
      sheetId
    };
  } catch (error) {
    return { exists: false };
  }
}

/**
 * Delete a sheet if it exists
 */
async function deleteSheetIfExists(
  spreadsheetId: string,
  sheetName: string
): Promise<void> {
  const { exists, sheetId } = await sheetExists(spreadsheetId, sheetName);
  
  if (exists && sheetId !== undefined) {
    const sheets = getSheetsClient();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteSheet: {
            sheetId
          }
        }]
      }
    });
  }
}

/**
 * Create a new sheet with basic setup
 */
async function createSheet(
  spreadsheetId: string,
  sheetName: string,
  rowCount: number = 1000,
  columnCount: number = 26
): Promise<number> {
  const sheets = getSheetsClient();
  
  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title: sheetName,
            gridProperties: {
              rowCount,
              columnCount,
              frozenRowCount: 0
            }
          }
        }
      }]
    }
  });

  const sheetId = response.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (!sheetId) {
    throw new Error('Failed to create sheet - no sheet ID returned');
  }

  return sheetId;
}

/**
 * Format headers with bold, background color, and frozen row
 */
async function formatHeaders(
  spreadsheetId: string,
  sheetId: number,
  headers: HeaderConfig[],
  backgroundColor: { red: number; green: number; blue: number },
  frozenRows: number = 1
): Promise<void> {
  const sheets = getSheetsClient();

  const requests: any[] = [
    // Freeze header row
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: frozenRows
          }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    },
    // Format header row (bold + background)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: headers.length
        },
        cell: {
          userEnteredFormat: {
            backgroundColor,
            textFormat: {
              bold: true,
              fontSize: 11
            },
            horizontalAlignment: 'CENTER'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
      }
    }
  ];

  // Set column widths
  headers.forEach((header, index) => {
    if (header.width) {
      requests.push({
        updateDimensionProperties: {
          range: {
            sheetId,
            dimension: 'COLUMNS',
            startIndex: index,
            endIndex: index + 1
          },
          properties: {
            pixelSize: header.width
          },
          fields: 'pixelSize'
        }
      });
    }
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests }
  });
}

/**
 * Write values to a sheet
 */
async function writeValues(
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<void> {
  const sheets = getSheetsClient();
  
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  });
}

/**
 * Apply number format to a range
 */
async function applyNumberFormat(
  spreadsheetId: string,
  sheetId: number,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  format: 'NUMBER' | 'PERCENT' | 'CURRENCY' | 'TIME'
): Promise<void> {
  const sheets = getSheetsClient();

  const formatPatterns = {
    NUMBER: { type: 'NUMBER', pattern: '#,##0.00' },
    PERCENT: { type: 'NUMBER', pattern: '0.00%' },
    CURRENCY: { type: 'NUMBER', pattern: '$#,##0.00' },
    TIME: { type: 'NUMBER', pattern: '#,##0.00' }
  };

  const formatConfig = formatPatterns[format];

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: startRow,
            endRowIndex: endRow,
            startColumnIndex: startCol,
            endColumnIndex: endCol
          },
          cell: {
            userEnteredFormat: {
              numberFormat: formatConfig
            }
          },
          fields: 'userEnteredFormat.numberFormat'
        }
      }]
    }
  });
}

/**
 * Create a chart in the spreadsheet
 */
async function createChart(
  spreadsheetId: string,
  sheetId: number,
  config: ChartConfig
): Promise<void> {
  const sheets = getSheetsClient();

  const chartTypes = {
    LINE: 'LINE',
    BAR: 'BAR',
    PIE: 'PIE',
    COLUMN: 'COLUMN'
  };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        addChart: {
          chart: {
            spec: {
              title: config.title,
              basicChart: {
                chartType: chartTypes[config.type],
                legendPosition: 'RIGHT_LEGEND',
                axis: [
                  { position: 'BOTTOM_AXIS' },
                  { position: 'LEFT_AXIS' }
                ],
                domains: [{
                  domain: {
                    sourceRange: {
                      sources: [{
                        sheetId,
                        startRowIndex: 0,
                        endRowIndex: 10,
                        startColumnIndex: 0,
                        endColumnIndex: 1
                      }]
                    }
                  }
                }],
                series: [{
                  series: {
                    sourceRange: {
                      sources: [{
                        sheetId,
                        startRowIndex: 0,
                        endRowIndex: 10,
                        startColumnIndex: 1,
                        endColumnIndex: 2
                      }]
                    }
                  },
                  targetAxis: 'LEFT_AXIS'
                }]
              }
            },
            position: {
              overlayPosition: {
                anchorCell: {
                  sheetId,
                  rowIndex: config.position.row,
                  columnIndex: config.position.column
                }
              }
            }
          }
        }
      }]
    }
  });
}

// ============================================================================
// Main Template Functions
// ============================================================================

/**
 * Create Action Log sheet with formatted headers
 * 
 * Creates a standardized action log sheet for tracking all system operations.
 * 
 * Features:
 * - 8 columns: Date, Time, Source, Action, Target, Status, Details, Link
 * - Bold, centered headers with gray background
 * - Frozen header row
 * - Pre-configured column widths
 * - Auto-sized for 1000 rows
 * 
 * @param spreadsheetId - Google Sheets spreadsheet ID
 * @returns Promise resolving to creation result with sheet ID and URL
 * 
 * @example
 * ```typescript
 * const result = await createActionLogSheet('abc123spreadsheetId');
 * if (result.success) {
 *   console.log(`Action Log created: ${result.url}`);
 *   console.log(`Sheet ID: ${result.sheetId}`);
 * }
 * ```
 */
export async function createActionLogSheet(
  spreadsheetId: string
): Promise<SheetCreationResult> {
  const startTime = Date.now();
  
  try {
    logger.info('Creating Action Log sheet', {
      function: 'createActionLogSheet',
      spreadsheetId,
      sheetName: ACTION_LOG_CONFIG.sheetName
    });

    // Delete existing sheet if present
    await deleteSheetIfExists(spreadsheetId, ACTION_LOG_CONFIG.sheetName);

    // Create new sheet
    const sheetId = await createSheet(
      spreadsheetId,
      ACTION_LOG_CONFIG.sheetName,
      1000,
      ACTION_LOG_CONFIG.headers.length
    );

    // Write headers
    const headerValues = [ACTION_LOG_CONFIG.headers.map(h => h.value)];
    await writeValues(
      spreadsheetId,
      `${ACTION_LOG_CONFIG.sheetName}!A1`,
      headerValues
    );

    // Format headers
    await formatHeaders(
      spreadsheetId,
      sheetId,
      ACTION_LOG_CONFIG.headers,
      ACTION_LOG_CONFIG.headerColor,
      ACTION_LOG_CONFIG.frozenRows
    );

    const duration = Date.now() - startTime;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;

    logger.info('Action Log sheet created successfully', {
      function: 'createActionLogSheet',
      spreadsheetId,
      sheetId,
      sheetName: ACTION_LOG_CONFIG.sheetName,
      duration
    });

    return {
      success: true,
      sheetId,
      sheetName: ACTION_LOG_CONFIG.sheetName,
      spreadsheetId,
      url
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to create Action Log sheet', {
      function: 'createActionLogSheet',
      spreadsheetId,
      error: errorMessage,
      duration
    });

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Create Metrics Dashboard with calculations and charts
 * 
 * Creates a comprehensive metrics dashboard that automatically calculates
 * statistics from the Action Log sheet.
 * 
 * Features:
 * - 5 key metrics with auto-calculations
 * - Formulas linked to Action Log sheet
 * - Formatted numbers and percentages
 * - Visual charts for trends
 * - Blue header styling
 * - Professional layout
 * 
 * Metrics:
 * - Total Signals Processed: Count of all logged actions
 * - Tasks Created: Count of create_task actions
 * - Success Rate: Percentage of successful actions
 * - Failed Actions: Count of error status
 * - Avg Processing Time: Average duration in seconds
 * 
 * @param spreadsheetId - Google Sheets spreadsheet ID
 * @returns Promise resolving to creation result with sheet ID and URL
 * 
 * @example
 * ```typescript
 * // Create action log first
 * await createActionLogSheet('abc123');
 * 
 * // Then create dashboard
 * const result = await createMetricsDashboard('abc123');
 * if (result.success) {
 *   console.log(`Dashboard created: ${result.url}`);
 *   // Metrics will auto-calculate from Action Log
 * }
 * ```
 */
export async function createMetricsDashboard(
  spreadsheetId: string
): Promise<SheetCreationResult> {
  const startTime = Date.now();
  
  try {
    logger.info('Creating Metrics Dashboard', {
      function: 'createMetricsDashboard',
      spreadsheetId,
      sheetName: METRICS_DASHBOARD_CONFIG.sheetName
    });

    // Check if Action Log exists (required for formulas)
    const { exists: actionLogExists } = await sheetExists(
      spreadsheetId,
      ACTION_LOG_CONFIG.sheetName
    );

    if (!actionLogExists) {
      throw new Error(
        `Action Log sheet must exist before creating Dashboard. ` +
        `Run createActionLogSheet() first.`
      );
    }

    // Delete existing dashboard if present
    await deleteSheetIfExists(spreadsheetId, METRICS_DASHBOARD_CONFIG.sheetName);

    // Create new sheet
    const sheetId = await createSheet(
      spreadsheetId,
      METRICS_DASHBOARD_CONFIG.sheetName,
      100,
      10
    );

    // Write title
    await writeValues(
      spreadsheetId,
      `${METRICS_DASHBOARD_CONFIG.sheetName}!A1`,
      [['Metrics Dashboard']]
    );

    // Format title (large, bold, blue)
    const sheets = getSheetsClient();
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 2
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: METRICS_DASHBOARD_CONFIG.headerColor,
                textFormat: {
                  bold: true,
                  fontSize: 14,
                  foregroundColor: { red: 1, green: 1, blue: 1 }
                },
                horizontalAlignment: 'CENTER'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)'
          }
        }]
      }
    });

    // Write metric labels and formulas
    const rows: any[][] = [];
    
    for (const metric of METRICS_DASHBOARD_CONFIG.metrics) {
      // Ensure we have enough rows
      while (rows.length < metric.row) {
        rows.push(['', '']);
      }
      
      rows[metric.row - 1] = [metric.label, metric.formula];
    }

    await writeValues(
      spreadsheetId,
      `${METRICS_DASHBOARD_CONFIG.sheetName}!A2`,
      rows
    );

    // Set column widths
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 0,
                endIndex: 1
              },
              properties: {
                pixelSize: METRICS_DASHBOARD_CONFIG.labelWidth
              },
              fields: 'pixelSize'
            }
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId,
                dimension: 'COLUMNS',
                startIndex: 1,
                endIndex: 2
              },
              properties: {
                pixelSize: METRICS_DASHBOARD_CONFIG.valueWidth
              },
              fields: 'pixelSize'
            }
          }
        ]
      }
    });

    // Format metric labels (bold)
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              endRowIndex: 7,
              startColumnIndex: 0,
              endColumnIndex: 1
            },
            cell: {
              userEnteredFormat: {
                textFormat: {
                  bold: true
                }
              }
            },
            fields: 'userEnteredFormat.textFormat'
          }
        }]
      }
    });

    // Apply number formats to metric values
    for (const metric of METRICS_DASHBOARD_CONFIG.metrics) {
      if (metric.format) {
        await applyNumberFormat(
          spreadsheetId,
          sheetId,
          metric.row - 1,
          metric.row,
          1,
          2,
          metric.format as 'NUMBER' | 'PERCENT' | 'CURRENCY' | 'TIME'
        );
      }
    }

    // Add a simple chart (Success Rate trend)
    try {
      await createChart(spreadsheetId, sheetId, {
        type: 'PIE',
        title: 'Action Status Distribution',
        sourceRange: `${ACTION_LOG_CONFIG.sheetName}!F:F`,
        position: { row: 8, column: 0 }
      });
    } catch (chartError) {
      // Chart creation is optional - don't fail if it errors
      console.warn('Chart creation failed (optional):', chartError);
    }

    const duration = Date.now() - startTime;
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;

    logger.info('Metrics Dashboard created successfully', {
      function: 'createMetricsDashboard',
      spreadsheetId,
      sheetId,
      sheetName: METRICS_DASHBOARD_CONFIG.sheetName,
      metricsCount: METRICS_DASHBOARD_CONFIG.metrics.length,
      duration
    });

    return {
      success: true,
      sheetId,
      sheetName: METRICS_DASHBOARD_CONFIG.sheetName,
      spreadsheetId,
      url
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to create Metrics Dashboard', {
      function: 'createMetricsDashboard',
      spreadsheetId,
      error: errorMessage,
      duration
    });

    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Get default spreadsheet ID from config
 */
export function getDefaultSpreadsheetId(): string | undefined {
  const config = getConfig();
  return config.SHEETS_LOG_SPREADSHEET_ID;
}

/**
 * Initialize complete monitoring spreadsheet
 * 
 * Creates both Action Log and Metrics Dashboard in a single spreadsheet.
 * This is the recommended way to set up a new monitoring spreadsheet.
 * 
 * @param spreadsheetId - Google Sheets spreadsheet ID (optional, uses default from config)
 * @returns Promise resolving to object with both creation results
 * 
 * @example
 * ```typescript
 * // Use default spreadsheet from config
 * const result = await initializeMonitoringSpreadsheet();
 * 
 * // Or specify a spreadsheet
 * const result = await initializeMonitoringSpreadsheet('abc123');
 * 
 * if (result.actionLog.success && result.dashboard.success) {
 *   console.log('Monitoring spreadsheet ready!');
 *   console.log(`Action Log: ${result.actionLog.url}`);
 *   console.log(`Dashboard: ${result.dashboard.url}`);
 * }
 * ```
 */
export async function initializeMonitoringSpreadsheet(
  spreadsheetId?: string
): Promise<{
  actionLog: SheetCreationResult;
  dashboard: SheetCreationResult;
}> {
  const targetSpreadsheetId = spreadsheetId || getDefaultSpreadsheetId();
  
  if (!targetSpreadsheetId) {
    throw new Error(
      'No spreadsheet ID provided and SHEETS_LOG_SPREADSHEET_ID not configured'
    );
  }

  logger.info('Initializing monitoring spreadsheet', {
    function: 'initializeMonitoringSpreadsheet',
    spreadsheetId: targetSpreadsheetId
  });

  // Create Action Log first (Dashboard depends on it)
  const actionLog = await createActionLogSheet(targetSpreadsheetId);
  
  if (!actionLog.success) {
    return {
      actionLog,
      dashboard: {
        success: false,
        error: 'Action Log creation failed - Dashboard not created'
      }
    };
  }

  // Create Dashboard
  const dashboard = await createMetricsDashboard(targetSpreadsheetId);

  logger.info('Monitoring spreadsheet initialized', {
    function: 'initializeMonitoringSpreadsheet',
    spreadsheetId: targetSpreadsheetId,
    actionLogSuccess: actionLog.success,
    dashboardSuccess: dashboard.success
  });

  return { actionLog, dashboard };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  createActionLogSheet,
  createMetricsDashboard,
  initializeMonitoringSpreadsheet,
  getDefaultSpreadsheetId
};
