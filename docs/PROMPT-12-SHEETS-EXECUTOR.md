# 📊 Prompt 12: Google Sheets Data Writer - Complete Implementation

## 🎯 Overview

The **Sheets Data Writer** provides comprehensive Google Sheets operations for data management, audit logging, and analytics tracking. It handles spreadsheet updates, automatic sheet creation, data validation, cell formatting, and metrics dashboards.

---

## ✅ Requirements Met

### Core Features

| Requirement | Status | Implementation |
|------------|--------|----------------|
| **updateSheet()** with operations | ✅ Complete | Lines 322-522 |
| - append_row | ✅ Complete | Adds new rows to end of sheet |
| - update_cell | ✅ Complete | Updates specific cell by range or coordinates |
| - update_range | ✅ Complete | Updates multiple cells in range |
| - create_sheet | ✅ Complete | Creates new tab in spreadsheet |
| **logAction()** audit trail | ✅ Complete | Lines 524-640 |
| - Timestamp tracking | ✅ Complete | ISO format with milliseconds |
| - Action/Target/Status/Details | ✅ Complete | 5-column structured log |
| - Auto-creates sheet | ✅ Complete | Creates "Action Log" if missing |
| - Header formatting | ✅ Complete | Bold, gray background, centered |
| **updateMetrics()** dashboard | ✅ Complete | Lines 642-792 |
| - Signals processed | ✅ Complete | Numeric tracking |
| - Tasks created | ✅ Complete | Count tracking |
| - Success rate | ✅ Complete | Percentage formatting |
| - Daily/weekly/monthly periods | ✅ Complete | Period-based aggregation |
| - Auto-creates dashboard | ✅ Complete | Creates "Metrics Dashboard" if missing |
| **Cell formatting** | ✅ Complete | Lines 256-317 |
| - Dates | ✅ Complete | DATE format |
| - Numbers | ✅ Complete | NUMBER format |
| - Currency | ✅ Complete | CURRENCY format with $ |
| - Percentages | ✅ Complete | PERCENT format |
| - Bold/colors/alignment | ✅ Complete | Text formatting |
| **Data validation** | ✅ Complete | Lines 137-199 |
| - Type checking | ✅ Complete | String/Number/Boolean/Date/Currency |
| - Error reporting | ✅ Complete | Row/column specific errors |
| - Auto-formatting | ✅ Complete | Converts types automatically |
| **Execution logging** | ✅ Complete | All functions use execution-logger |

---

## 📦 File Structure

```
src/workflows/executors/
└── sheets-executor.ts (794 lines)
    ├── Enums (SheetOperation, CellType)
    ├── Interfaces (SheetData, ActionLog, MetricsData, CellFormatting)
    ├── Validation Functions
    ├── Helper Functions
    ├── Main Exported Functions:
    │   ├── updateSheet()
    │   ├── logAction()
    │   └── updateMetrics()
    └── Utility Functions
```

---

## 🔧 Core Functions

### 1. updateSheet()

**Purpose:** Update Google Sheet with various operations

**Signature:**
```typescript
async function updateSheet(
  spreadsheetId: string,
  data: SheetData,
  operation: SheetOperation,
  formatting?: CellFormatting,
  validate?: boolean
): Promise<ExecutionResult>
```

**Operations:**

#### APPEND_ROW
Adds new rows to the end of the sheet.

```typescript
const result = await SheetsExecutor.updateSheet(
  'spreadsheet-id-123',
  {
    values: [
      ['John Doe', 'john@example.com', 30],
      ['Jane Smith', 'jane@example.com', 25]
    ],
    sheetName: 'Users'
  },
  SheetsExecutor.SheetOperation.APPEND_ROW
);
```

#### UPDATE_CELL
Updates a specific cell.

```typescript
const result = await SheetsExecutor.updateSheet(
  'spreadsheet-id-123',
  {
    values: [['Updated Value']],
    range: 'Sheet1!B2' // or use startRow/startColumn
  },
  SheetsExecutor.SheetOperation.UPDATE_CELL
);
```

#### UPDATE_RANGE
Updates multiple cells in a range.

```typescript
const result = await SheetsExecutor.updateSheet(
  'spreadsheet-id-123',
  {
    values: [
      ['Header1', 'Header2', 'Header3'],
      ['Value1', 'Value2', 'Value3'],
      ['Value4', 'Value5', 'Value6']
    ],
    range: 'A1:C3',
    sheetName: 'Data'
  },
  SheetsExecutor.SheetOperation.UPDATE_RANGE
);
```

#### CREATE_SHEET
Creates a new sheet/tab in the spreadsheet.

```typescript
const result = await SheetsExecutor.updateSheet(
  'spreadsheet-id-123',
  {
    values: [[1000, 26]], // rows, columns
    sheetName: 'New Sheet'
  },
  SheetsExecutor.SheetOperation.CREATE_SHEET
);
```

---

### 2. logAction()

**Purpose:** Log actions to audit trail sheet for compliance and analytics

**Signature:**
```typescript
async function logAction(
  spreadsheetId: string,
  actionLog: ActionLog
): Promise<ExecutionResult>
```

**Features:**
- Automatically creates "Action Log" sheet if it doesn't exist
- Adds formatted headers on first creation
- Appends timestamped entries
- Perfect for audit trail and compliance

**Example:**
```typescript
const result = await SheetsExecutor.logAction(
  'spreadsheet-id-123',
  {
    timestamp: new Date(),
    action: 'create_task',
    target: 'trello:board-123',
    status: 'success',
    details: 'Created card "Review PR #42" with assignee John'
  }
);
```

**Sheet Structure:**
```
| Timestamp           | Action        | Target           | Status  | Details                              |
|---------------------|---------------|------------------|---------|--------------------------------------|
| 2025-10-16T10:30:00 | create_task   | trello:board-123 | success | Created card "Review PR #42"         |
| 2025-10-16T10:31:15 | send_notif    | slack:#general   | success | Sent notification to team            |
| 2025-10-16T10:32:00 | file_document | drive:folder-456 | failure | Permission denied                    |
```

---

### 3. updateMetrics()

**Purpose:** Update metrics dashboard with current performance data

**Signature:**
```typescript
async function updateMetrics(
  spreadsheetId: string,
  metrics: MetricsData
): Promise<ExecutionResult>
```

**Features:**
- Automatically creates "Metrics Dashboard" sheet
- Adds formatted headers with blue background
- Tracks key performance indicators
- Supports daily/weekly/monthly aggregations
- Auto-formats percentages and numbers

**Example:**
```typescript
const result = await SheetsExecutor.updateMetrics(
  'spreadsheet-id-123',
  {
    signalsProcessed: 142,
    tasksCreated: 89,
    successRate: 0.94, // 94%
    errors: 8,
    averageResponseTime: 245, // milliseconds
    period: 'daily',
    date: new Date('2025-10-16')
  }
);
```

**Dashboard Structure:**
```
| Date       | Period | Signals | Tasks | Success Rate | Errors | Avg Response | Updated At          |
|------------|--------|---------|-------|--------------|--------|--------------|---------------------|
| 2025-10-16 | daily  | 142     | 89    | 94.00%       | 8      | 245          | 2025-10-16T23:59:00 |
| 2025-10-15 | daily  | 138     | 92    | 95.65%       | 6      | 230          | 2025-10-15T23:59:00 |
| 2025-10-14 | daily  | 155     | 97    | 93.55%       | 10     | 260          | 2025-10-14T23:59:00 |
```

---

## 🎨 Cell Formatting

The Sheets executor supports comprehensive cell formatting:

### Formatting Options

```typescript
interface CellFormatting {
  type?: CellType;                  // Auto-applies correct format
  numberFormat?: string;             // Custom number format
  bold?: boolean;                    // Bold text
  backgroundColor?: {                // Cell background color
    red: number;    // 0.0 to 1.0
    green: number;  // 0.0 to 1.0
    blue: number;   // 0.0 to 1.0
  };
  horizontalAlignment?: 'LEFT' | 'CENTER' | 'RIGHT';
}
```

### Supported Cell Types

| Type | Description | Format Applied | Example |
|------|-------------|----------------|---------|
| `STRING` | Text values | None | "Hello World" |
| `NUMBER` | Numeric values | NUMBER | 42, 3.14 |
| `BOOLEAN` | True/False | None | true, FALSE |
| `DATE` | Date values | DATE | "2025-10-16" |
| `CURRENCY` | Money values | CURRENCY | $1,234.56 |
| `PERCENTAGE` | Percent values | PERCENT | 94.5% |

### Example: Formatted Update

```typescript
const result = await SheetsExecutor.updateSheet(
  'spreadsheet-id-123',
  {
    values: [
      ['Product', 'Price', 'Discount', 'Available'],
      ['Widget', 29.99, 0.15, true],
      ['Gadget', 49.99, 0.20, false]
    ],
    range: 'A1:D3',
    sheetName: 'Products'
  },
  SheetsExecutor.SheetOperation.UPDATE_RANGE,
  {
    bold: true,
    backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
    horizontalAlignment: 'CENTER'
  }
);
```

---

## ✅ Data Validation

The executor validates data before writing to ensure data integrity:

### Validation Features

1. **Type Checking** - Validates data matches expected type
2. **Format Conversion** - Automatically converts to correct format
3. **Error Reporting** - Reports specific row/column errors
4. **Optional Bypass** - Can disable validation if needed

### Example: Validation in Action

```typescript
// This data has type mismatches
const badData = [
  ['Name', 'Age', 'Salary', 'Active'],
  ['John', 'thirty', 50000, true],      // Age is string, should be number
  ['Jane', 25, 'lots', 'yes'],          // Salary is string, Active is string
];

// Validation will catch these errors
const result = await SheetsExecutor.updateSheet(
  'spreadsheet-id-123',
  { values: badData, sheetName: 'Employees' },
  SheetsExecutor.SheetOperation.APPEND_ROW,
  undefined,
  true // Enable validation (default)
);

// Result will be:
// success: false
// error: "Data validation failed: Row 2, Column 2: Invalid number: thirty, 
//         Row 3, Column 3: Invalid currency: lots"
```

### Disable Validation

```typescript
// Skip validation for performance or when data is already validated
const result = await SheetsExecutor.updateSheet(
  'spreadsheet-id-123',
  data,
  operation,
  formatting,
  false // Disable validation
);
```

---

## 🔄 Action Router Integration

The Sheets executor is fully integrated with the action router:

### Registered Actions

```typescript
// Update sheet with data
'update_sheet:sheets': {
  spreadsheetId: string;
  values: any[][];
  range?: string;
  sheetName?: string;
  operation?: 'append_row' | 'update_cell' | 'update_range' | 'create_sheet';
  formatting?: CellFormatting;
  validate?: boolean;
}

// Log action to audit trail
'log_action:sheets': {
  spreadsheetId: string;
  action: string;
  target: string;
  status: 'success' | 'failure' | 'pending';
  details?: string;
  timestamp?: Date;
}

// Update metrics dashboard
'update_metrics:sheets': {
  spreadsheetId: string;
  signalsProcessed?: number;
  tasksCreated?: number;
  successRate?: number;
  errors?: number;
  averageResponseTime?: number;
  period?: 'daily' | 'weekly' | 'monthly';
  date?: Date;
}
```

### Example: Using Action Router

```typescript
import { routeAction } from './action-router';

// Log an action via action router
const result = await routeAction({
  correlationId: 'corr-123',
  action: 'log_action',
  target: 'sheets',
  params: {
    spreadsheetId: 'sheet-id-123',
    action: 'create_task',
    target: 'trello:board-456',
    status: 'success',
    details: 'Task created successfully'
  }
});
```

---

## 🚀 Usage Examples

### Example 1: Employee Data Management

```typescript
import * as SheetsExecutor from './sheets-executor';

async function addEmployee() {
  // Add new employee
  const result = await SheetsExecutor.updateSheet(
    'employee-spreadsheet-id',
    {
      values: [[
        'EMP-1234',
        'Alice Johnson',
        'alice@company.com',
        'Engineering',
        new Date('2025-10-01'),
        85000
      ]],
      sheetName: 'Employees'
    },
    SheetsExecutor.SheetOperation.APPEND_ROW,
    {
      type: SheetsExecutor.CellType.CURRENCY // Format salary column
    }
  );

  // Log the action
  if (result.success) {
    await SheetsExecutor.logAction(
      'employee-spreadsheet-id',
      {
        timestamp: new Date(),
        action: 'add_employee',
        target: 'Employees Sheet',
        status: 'success',
        details: 'Added employee EMP-1234: Alice Johnson'
      }
    );
  }
}
```

### Example 2: Sales Dashboard

```typescript
async function updateSalesDashboard(salesData: any) {
  const spreadsheetId = 'sales-dashboard-id';

  // Update sales data
  await SheetsExecutor.updateSheet(
    spreadsheetId,
    {
      values: [[
        new Date().toISOString().split('T')[0],
        salesData.totalSales,
        salesData.unitsold,
        salesData.avgOrderValue
      ]],
      sheetName: 'Daily Sales'
    },
    SheetsExecutor.SheetOperation.APPEND_ROW,
    { type: SheetsExecutor.CellType.CURRENCY }
  );

  // Update metrics
  await SheetsExecutor.updateMetrics(
    spreadsheetId,
    {
      signalsProcessed: salesData.ordersProcessed,
      tasksCreated: salesData.shipmentsCreated,
      successRate: salesData.successfulOrders / salesData.totalOrders,
      period: 'daily',
      date: new Date()
    }
  );
}
```

### Example 3: Audit Trail System

```typescript
async function trackSystemActions() {
  const auditSpreadsheet = 'audit-trail-id';

  // Log various actions
  const actions = [
    {
      timestamp: new Date(),
      action: 'user_login',
      target: 'auth:user-123',
      status: 'success' as const,
      details: 'User logged in from IP 192.168.1.100'
    },
    {
      timestamp: new Date(),
      action: 'data_export',
      target: 'database:customers',
      status: 'success' as const,
      details: 'Exported 1,523 customer records'
    },
    {
      timestamp: new Date(),
      action: 'permission_change',
      target: 'user:user-456',
      status: 'pending' as const,
      details: 'Awaiting admin approval for role change'
    }
  ];

  for (const action of actions) {
    await SheetsExecutor.logAction(auditSpreadsheet, action);
  }
}
```

### Example 4: Weekly Report Generation

```typescript
async function generateWeeklyReport() {
  const spreadsheetId = 'reports-id';
  const weekStart = new Date('2025-10-13');
  const weekEnd = new Date('2025-10-19');

  // Create new sheet for this week
  await SheetsExecutor.updateSheet(
    spreadsheetId,
    {
      values: [[100, 10]], // 100 rows, 10 columns
      sheetName: 'Week 42 - Oct 13-19'
    },
    SheetsExecutor.SheetOperation.CREATE_SHEET
  );

  // Add headers
  await SheetsExecutor.updateSheet(
    spreadsheetId,
    {
      values: [[
        'Date',
        'Tasks Created',
        'Tasks Completed',
        'Completion Rate',
        'Avg Time (hrs)',
        'Team Members',
        'Blockers'
      ]],
      range: 'A1:G1',
      sheetName: 'Week 42 - Oct 13-19'
    },
    SheetsExecutor.SheetOperation.UPDATE_RANGE,
    {
      bold: true,
      backgroundColor: { red: 0.2, green: 0.5, blue: 0.8 },
      horizontalAlignment: 'CENTER'
    }
  );

  // Add data for each day
  // ... populate with daily metrics
}
```

---

## 🛡️ Error Handling

The Sheets executor provides comprehensive error handling:

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| **Validation failed** | Data types don't match | Check data types or disable validation |
| **Sheet not found** | Sheet name doesn't exist | Check sheet name or create sheet first |
| **Permission denied** | API key lacks permissions | Update Google Sheets API permissions |
| **Invalid range** | Range format incorrect | Use A1 notation (e.g., "A1:C10") |
| **Spreadsheet not found** | Invalid spreadsheet ID | Verify spreadsheet ID is correct |

### Error Response Format

```typescript
{
  success: false,
  error: "Data validation failed: Row 2, Column 3: Invalid number: abc",
  executionTime: 145,
  executorUsed: 'sheets'
}
```

---

## 📊 Performance Optimization

### Metadata Caching

The executor caches spreadsheet metadata to reduce API calls:

```typescript
// Metadata is cached automatically
const result1 = await updateSheet(...); // Fetches metadata
const result2 = await updateSheet(...); // Uses cached metadata

// Clear cache manually if needed
SheetsExecutor.clearMetadataCache();
```

### Batch Operations

For multiple updates, use batch operations:

```typescript
// Instead of multiple UPDATE_CELL calls
// Use UPDATE_RANGE for better performance
const result = await SheetsExecutor.updateSheet(
  spreadsheetId,
  {
    values: [
      [value1],
      [value2],
      [value3]
    ],
    range: 'A1:A3'
  },
  SheetsExecutor.SheetOperation.UPDATE_RANGE
);
```

---

## 🔍 Debugging

### View Metadata Cache

```typescript
const cache = SheetsExecutor.getMetadataCache();
console.log('Cached spreadsheets:', cache.size);
cache.forEach((data, id) => {
  console.log(`${id}:`, data.sheets?.length, 'sheets');
});
```

### Enable Verbose Logging

```bash
# .env
LOG_LEVEL=debug
```

This will log:
- All API calls
- Validation results
- Formatting operations
- Cache hits/misses

---

## 🎯 Best Practices

### 1. Use Appropriate Operations

```typescript
// ✅ Good - Use APPEND_ROW for adding to end
await updateSheet(id, data, SheetOperation.APPEND_ROW);

// ❌ Bad - Don't use UPDATE_RANGE to append
await updateSheet(id, data, SheetOperation.UPDATE_RANGE);
```

### 2. Enable Validation by Default

```typescript
// ✅ Good - Validate data
await updateSheet(id, data, op, formatting, true);

// ⚠️ Caution - Only skip for trusted data
await updateSheet(id, data, op, formatting, false);
```

### 3. Log Important Actions

```typescript
// ✅ Good - Log for audit trail
const result = await updateSheet(...);
if (result.success) {
  await logAction(id, {
    action: 'data_import',
    target: 'Sales Sheet',
    status: 'success',
    timestamp: new Date()
  });
}
```

### 4. Use Metrics for Analytics

```typescript
// ✅ Good - Track daily metrics
await updateMetrics(id, {
  signalsProcessed: dailyCount,
  successRate: successfulCount / totalCount,
  period: 'daily',
  date: new Date()
});
```

---

## 📈 Integration Patterns

### Pattern 1: After Task Creation

```typescript
// Create task in Trello
const taskResult = await TrelloExecutor.createCard({...});

// Log the action
await SheetsExecutor.logAction(
  auditSpreadsheet,
  {
    timestamp: new Date(),
    action: 'create_task',
    target: `trello:${taskResult.data.cardId}`,
    status: taskResult.success ? 'success' : 'failure',
    details: `Created card "${taskResult.data.cardName}"`
  }
);

// Update metrics
await SheetsExecutor.updateMetrics(
  metricsSpreadsheet,
  {
    tasksCreated: 1,
    period: 'daily'
  }
);
```

### Pattern 2: End of Day Summary

```typescript
async function endOfDaySummary() {
  const today = new Date();
  const stats = await getDailyStats(); // Your stats function

  await SheetsExecutor.updateMetrics(
    'daily-dashboard-id',
    {
      signalsProcessed: stats.totalSignals,
      tasksCreated: stats.totalTasks,
      successRate: stats.successRate,
      errors: stats.errorCount,
      averageResponseTime: stats.avgResponseMs,
      period: 'daily',
      date: today
    }
  );
}
```

---

## 🎉 Summary

**Prompt 12: Sheets Data Writer** provides enterprise-grade spreadsheet operations with:

✅ **4 sheet operations** (append, update cell/range, create sheet)  
✅ **Audit logging** (automatic sheet creation, formatted headers)  
✅ **Metrics tracking** (dashboard with aggregations)  
✅ **Data validation** (6 cell types with auto-formatting)  
✅ **Cell formatting** (colors, bold, alignment, number formats)  
✅ **Error handling** (comprehensive validation and logging)  
✅ **Performance** (metadata caching, batch operations)  
✅ **Action router integration** (3 registered actions)  

**File:** `src/workflows/executors/sheets-executor.ts` (794 lines)  
**Build Status:** ✅ 0 errors  
**Integration:** ✅ Action router registered  
**Configuration:** ✅ Environment ready  

---

*Generated: 2025-10-16*  
*Implementation: sheets-executor.ts (794 lines)*  
*Status: Production Ready ✅*
