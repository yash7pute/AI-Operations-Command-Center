# 🚀 Quick Start Guide - Workflow Integration Tests

## Running Tests

### Run All Workflow Tests
```bash
npm test -- workflows.test.ts
```

### Run Specific Workflow
```bash
# Invoice processing tests
npm test -- -t "Invoice Processing Workflow"

# Bug report tests
npm test -- -t "Bug Report Workflow"

# Meeting request tests
npm test -- -t "Meeting Request Workflow"
```

### Run Specific Test
```bash
npm test -- -t "should complete full workflow successfully"
npm test -- -t "should rollback if step 2 fails"
npm test -- -t "should be idempotent"
```

---

## Test Output Examples

### ✅ Successful Test
```
PASS tests/workflows/workflows.test.ts
  Invoice Processing Workflow
    ✓ should complete full workflow successfully (45ms)
    ✓ should rollback if step 2 fails (32ms)
    ✓ should be idempotent - running twice executes once (28ms)
```

### ❌ Failed Test
```
FAIL tests/workflows/workflows.test.ts
  Invoice Processing Workflow
    ✕ should rollback if step 2 fails (150ms)
    
  Expected mockDriveFilesDelete to have been called 1 times
  Received: 0 calls
```

---

## Understanding Test Results

### Invoice Processing Workflow

**Test 1: Full Workflow Success**
```
What it tests: All 3 steps complete successfully
Expected result: 
  - File uploaded to Drive ✅
  - Accounting sheet updated ✅
  - Finance team notified ✅
  - Workflow status: 'completed'
  - 3 results returned
```

**Test 2: Rollback on Step 2 Failure**
```
What it tests: Sheet update fails, everything rolls back
Expected result:
  - Step 1 executes ✅
  - Step 2 fails ❌
  - File deleted from Drive (rollback) ✅
  - Step 3 never called ✅
  - Workflow status: 'rolled_back'
  - Error thrown
```

**Test 3: Idempotency**
```
What it tests: Same workflow ID runs twice
Expected result:
  - First run: All steps execute ✅
  - Second run: No API calls made ✅
  - Same results returned both times
  - Only executed once
```

---

## Key Concepts

### 1. Workflow State
```typescript
{
  workflowId: 'invoice-wf-001',
  status: 'completed',
  steps: [
    { name: 'file_attachment', status: 'completed', result: {...} },
    { name: 'update_sheet', status: 'completed', result: {...} },
    { name: 'notify_finance', status: 'completed', result: {...} }
  ],
  executedSteps: ['file_attachment', 'update_sheet', 'notify_finance']
}
```

### 2. Idempotency Check
```typescript
// Before executing a step
if (stateManager.isStepExecuted(workflowId, stepName)) {
  // Return cached result
  return stateManager.getRollbackData(workflowId, stepName);
}
// Otherwise, execute step
```

### 3. Rollback Order
```
Execution Order:    Step 1 → Step 2 → Step 3
Rollback Order:     Step 3 ← Step 2 ← Step 1
                    (reverse)
```

---

## Common Test Patterns

### Pattern 1: Full Success Path
```typescript
// Setup mocks
mockDriveFilesCreate.mockResolvedValue({ data: { id: '123' } });
mockSheetsAppend.mockResolvedValue({ data: { updates: {...} } });
mockSlackPostMessage.mockResolvedValue({ ts: '123.456' });

// Execute workflow
const result = await workflow.execute('wf-id', data);

// Verify all steps completed
expect(result.success).toBe(true);
expect(result.results).toHaveLength(3);
```

### Pattern 2: Failure & Rollback
```typescript
// Setup: Step 1 succeeds, Step 2 fails
mockDriveFilesCreate.mockResolvedValue({ data: { id: '123' } });
mockSheetsAppend.mockRejectedValue(new Error('Permission denied'));

// Execute and expect failure
await expect(workflow.execute('wf-id', data)).rejects.toThrow();

// Verify rollback called
expect(mockDriveFilesDelete).toHaveBeenCalledWith({ fileId: '123' });
```

### Pattern 3: Idempotency
```typescript
// First execution
await workflow.execute('same-id', data);

// Clear mocks
jest.clearAllMocks();

// Second execution
await workflow.execute('same-id', data);

// Verify no API calls on second run
expect(mockDriveFilesCreate).not.toHaveBeenCalled();
expect(mockSheetsAppend).not.toHaveBeenCalled();
```

---

## Debugging Failed Tests

### Check 1: Mock Setup
```typescript
// Ensure mocks are configured correctly
mockDriveFilesCreate.mockResolvedValue({ 
  data: { 
    id: 'file-123',
    webViewLink: 'https://drive.google.com/...' // Don't forget this!
  }
});
```

### Check 2: Call Counts
```typescript
// Verify exact number of calls
expect(mockSlackPostMessage).toHaveBeenCalledTimes(3); // Not 2 or 4
```

### Check 3: Call Parameters
```typescript
// Verify exact parameters
expect(mockSheetsAppend).toHaveBeenCalledWith({
  spreadsheetId: 'accounting-sheet-123', // Exact ID
  range: 'Invoices!A:D', // Exact range
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: [[/* exact values */]] }
});
```

### Check 4: Rollback Order
```typescript
// Verify rollback happens in reverse
const calls = mockDriveFilesDelete.mock.calls;
// Should be called AFTER sheets rollback
```

---

## Performance Expectations

### Test Execution Times (with mocks)

```
Fast tests:    < 50ms   (simple operations)
Medium tests:  < 200ms  (multiple steps)
Slow tests:    < 500ms  (complex workflows)
```

### If Tests Are Slow
1. Check for unnecessary waits
2. Verify mocks are not actually calling APIs
3. Reduce test data size
4. Use `jest.setTimeout()` if needed

---

## Test Data Examples

### Invoice Data
```typescript
const invoice = {
  fileName: 'invoice-001.pdf',
  content: 'PDF content string...',
  amount: 1500.00,
  vendor: 'Acme Corp'
};
```

### Bug Data
```typescript
const bug = {
  title: 'Login button broken',
  description: 'Detailed description...',
  priority: 'critical', // or 'high', 'medium', 'low'
  reporter: 'user@example.com'
};
```

### Meeting Data
```typescript
const meeting = {
  title: 'Q4 Planning',
  agenda: '1. Item 1\n2. Item 2\n3. Item 3',
  attendees: ['@alice', '@bob', '@charlie'],
  date: '2025-10-25',
  time: '14:00'
};
```

---

## Common Issues & Solutions

### Issue 1: "Mock not called"
**Cause**: Mock not properly set up or wrong function mocked  
**Solution**: 
```typescript
// Ensure mock is defined before test
beforeEach(() => {
  jest.clearAllMocks();
  mockFunction.mockResolvedValue({ expected: 'value' });
});
```

### Issue 2: "Unexpected number of calls"
**Cause**: Test pollution from previous tests  
**Solution**:
```typescript
// Clear mocks between tests
afterEach(() => {
  jest.clearAllMocks();
});
```

### Issue 3: "State not persisting"
**Cause**: New state manager created per test  
**Solution**:
```typescript
// Use same state manager
let stateManager: WorkflowStateManager;
beforeEach(() => {
  stateManager = new WorkflowStateManager();
});
```

### Issue 4: "Rollback not triggered"
**Cause**: Error not properly thrown  
**Solution**:
```typescript
// Ensure mock rejects with error
mockFunction.mockRejectedValue(new Error('Expected error'));
```

---

## Best Practices

### ✅ DO
- Clear mocks between tests (`jest.clearAllMocks()`)
- Use descriptive test names
- Test both success and failure paths
- Verify exact API calls
- Check rollback operations
- Test idempotency

### ❌ DON'T
- Share state between tests
- Hardcode IDs (use variables)
- Skip error cases
- Forget to verify rollback
- Ignore TypeScript errors
- Mix real and mock APIs

---

## Quick Reference Commands

```bash
# Run all tests
npm test

# Run workflow tests only
npm test workflows.test.ts

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch

# Run specific test
npm test -- -t "test name"

# Verbose output
npm test -- --verbose

# Show all tests (including passed)
npm test -- --verbose
```

---

## Test File Structure

```typescript
tests/workflows/workflows.test.ts
├── Mock Setup (lines 1-100)
│   ├── Drive mocks
│   ├── Sheets mocks
│   ├── Slack mocks
│   ├── Trello mocks
│   └── Notion mocks
│
├── State Management (lines 101-200)
│   ├── WorkflowState interface
│   ├── StepState interface
│   └── WorkflowStateManager class
│
├── Workflow Implementations (lines 201-750)
│   ├── InvoiceProcessingWorkflow
│   ├── BugReportWorkflow
│   └── MeetingRequestWorkflow
│
└── Test Suites (lines 751-1300)
    ├── Invoice Processing (5 tests)
    ├── Bug Report (4 tests)
    ├── Meeting Request (5 tests)
    └── Cross-Workflow (3 tests)
```

---

## Need Help?

### Documentation
- `docs/PROMPT-25-WORKFLOW-TESTS.md` - Complete technical docs
- `docs/FINAL-STATUS-PROMPT-25.md` - Session summary
- `docs/PROJECT-FINAL-SUMMARY.md` - Project overview

### Code Examples
- Look at existing tests for patterns
- Check mock setup in beforeEach blocks
- Review workflow implementations

### Debugging
- Add `console.log()` in test or workflow code
- Use `--verbose` flag for detailed output
- Check mock.calls to see what was called

---

**Created**: October 17, 2025  
**Version**: 1.0  
**Status**: ✅ Complete
