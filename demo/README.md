# Orchestration Demo

An interactive demonstration of the AI Operations Command Center orchestration layer capabilities.

## Overview

This demo script showcases all orchestration features in action with color-coded console output and mocked API calls. No real platform APIs are invoked - everything runs in demo mode.

## Features Demonstrated

### 1. **Action Routing** 📋
- Shows how different action types are routed to appropriate executors
- Demonstrates 5 platforms: Notion, Trello, Slack, Google Drive, Google Sheets
- Validates actions before routing

### 2. **Priority Queue** ⚡
- Demonstrates priority-based queue management
- Shows how urgent/critical actions jump ahead in queue
- 4 priority levels: Critical → High → Normal → Low

### 3. **Multi-Step Workflow** 🔄
- Complete invoice processing workflow
- Coordinates actions across multiple platforms
- Manages dependencies between steps
- Executes steps in correct order

### 4. **Error Handling & Retry** 🔧
- Automatic retry with exponential backoff
- Demonstrates transient failure recovery
- Shows retry attempts and final success

### 5. **Rollback on Failure** ⏮️
- Demonstrates automatic rollback when workflow fails
- LIFO (Last In, First Out) rollback ordering
- Ensures data consistency on failure

### 6. **Approval Flow** 👤
- Human-in-the-loop approval for high-impact actions
- Interactive approval via Slack simulation
- Blocks dangerous operations until approved

### 7. **Metrics Dashboard** 📊
- Real-time metrics collection
- Circuit breaker status monitoring
- Success rate, execution time, and throughput metrics

## Running the Demo

### Prerequisites

```bash
npm install
```

### Run Full Demo

```bash
npm run demo:orchestration
```

This will run all 7 demo scenarios in sequence with color-coded output.

### Expected Output

```
================================================================================
🚀 AI OPERATIONS COMMAND CENTER - ORCHESTRATION DEMO
================================================================================
This demo showcases all orchestration layer capabilities
Demo mode: No real API calls are made

================================================================================
📋 DEMO 1: ACTION ROUTING
================================================================================
Demonstrating how different action types are routed to appropriate executors

▶ Action: create_task (notion)
--------------------------------------------------------------------------------
  ℹ Routed to: notion-executor
  ✓ Completed in 127.45ms
  Result: { "pageId": "notion-1697558400000", "url": "..." }

...

================================================================================
📊 DEMO SUMMARY
================================================================================

▶ Execution Statistics
--------------------------------------------------------------------------------
  Total Actions            : 20
  Successful               : 18 (90.0%)
  Failed                   : 1 (5.0%)
  Pending Approval         : 1
  Retry Attempts           : 2
  Rollback Operations      : 4

▶ Performance Metrics
--------------------------------------------------------------------------------
  Average Execution Time   : 125.34ms
  Total Execution Time     : 2506.80ms
  Throughput              : 7.98 actions/sec

▶ Actions by Platform
--------------------------------------------------------------------------------
  notion                  : 6
  trello                  : 4
  slack                   : 5
  drive                   : 3
  sheets                  : 2

▶ Actions by Priority
--------------------------------------------------------------------------------
  critical                : 2
  high                    : 8
  normal                  : 8
  low                     : 2

================================================================================
✨ DEMO COMPLETE
================================================================================
✓ All orchestration capabilities demonstrated successfully!

Key Takeaways:
  → Actions are intelligently routed to appropriate executors
  → Priority queue ensures urgent actions are processed first
  → Multi-step workflows coordinate actions across platforms
  → Automatic retry with exponential backoff handles transient failures
  → Rollback mechanisms ensure consistency on workflow failure
  → Human-in-the-loop approval protects high-impact actions
  → Real-time metrics provide operational visibility

Next Steps:
  → Review documentation: docs/ORCHESTRATION.md
  → Explore API reference: docs/ORCHESTRATION_API.md
  → Check operational runbook: docs/ORCHESTRATION_RUNBOOK.md
  → Run tests: npm test
```

## Demo Components

### Action Types

**Notion**:
- `create_task` - Create task in Notion database
- `update_task` - Update existing task

**Trello**:
- `create_card` - Create card on board
- `add_label` - Add label to card

**Slack**:
- `send_message` - Send message to channel
- `request_approval` - Request human approval

**Google Drive**:
- `create_file` - Upload file to Drive
- `delete_file` - Delete file from Drive

**Google Sheets**:
- `append_row` - Append row to spreadsheet
- `delete_row` - Delete row from spreadsheet

### Mock Data

All platform executors are mocked to return realistic data:
- **Notion**: Returns page IDs and URLs
- **Trello**: Returns card IDs and URLs
- **Slack**: Returns message IDs and timestamps
- **Drive**: Returns file IDs and URLs
- **Sheets**: Returns spreadsheet IDs and row numbers

No real API calls are made during the demo.

### Color-Coded Output

- 🟢 **Green (✓)**: Success messages
- 🔴 **Red (✗)**: Error messages
- 🟡 **Yellow (⚠)**: Warning messages
- 🔵 **Cyan (ℹ)**: Info messages
- 🟣 **Magenta (→)**: Step indicators

## Demo Scenarios

### Scenario 1: Action Routing
**Duration**: ~2 seconds  
**Actions**: 5 (one per platform)  
**Demonstrates**: Platform-specific routing

### Scenario 2: Priority Queue
**Duration**: ~1.5 seconds  
**Actions**: 4 (different priorities)  
**Demonstrates**: Critical actions jump queue

### Scenario 3: Multi-Step Workflow
**Duration**: ~2 seconds  
**Actions**: 4 (invoice workflow)  
**Demonstrates**: Dependencies and coordination

### Scenario 4: Error Handling
**Duration**: ~1 second  
**Actions**: 1 (with simulated failures)  
**Demonstrates**: Retry with exponential backoff

### Scenario 5: Rollback
**Duration**: ~2 seconds  
**Actions**: 4 (order workflow fails)  
**Demonstrates**: LIFO rollback on failure

### Scenario 6: Approval Flow
**Duration**: ~1.5 seconds  
**Actions**: 2 (high-impact actions)  
**Demonstrates**: Human-in-the-loop approval

### Scenario 7: Metrics Dashboard
**Duration**: ~0.5 seconds  
**Actions**: 0 (metrics display only)  
**Demonstrates**: Real-time metrics

**Total Demo Duration**: ~10-12 seconds

## Exported Data

The demo exports structured data at the end:

```json
{
  "timestamp": "2025-10-17T10:30:45.123Z",
  "summary": {
    "totalActions": 20,
    "successfulActions": 18,
    "failedActions": 1,
    "pendingApproval": 1,
    "successRate": "90.0%",
    "avgExecutionTime": "125.34ms"
  },
  "breakdown": {
    "byPlatform": {
      "notion": 6,
      "trello": 4,
      "slack": 5,
      "drive": 3,
      "sheets": 2
    },
    "byPriority": {
      "critical": 2,
      "high": 8,
      "normal": 8,
      "low": 2
    }
  },
  "errorHandling": {
    "retryAttempts": 2,
    "rollbackOperations": 4
  },
  "circuitBreakers": [
    {
      "platform": "notion",
      "state": "CLOSED",
      "failureCount": 0
    }
  ]
}
```

This data can be used for presentations, reports, or further analysis.

## Use Cases

### 1. Team Onboarding
Run the demo to show new team members how the orchestration layer works.

### 2. Client Presentations
Demonstrate capabilities to clients or stakeholders without touching production systems.

### 3. Development Testing
Test orchestration logic changes without invoking real APIs.

### 4. Documentation
Generate screenshots and output samples for documentation.

### 5. Training Materials
Use as a teaching tool for understanding distributed systems patterns.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Demo Runner                             │
│  - Executes 7 demo scenarios                                │
│  - Collects metrics                                          │
│  - Exports data                                              │
└──────────────────┬──────────────────────────────────────────┘
                   │
    ┌──────────────┴──────────────┐
    │                              │
    ▼                              ▼
┌─────────────────┐         ┌─────────────────┐
│  Orchestrator   │         │ Mock Executors  │
│  - Action exec  │────────▶│  - Notion       │
│  - Workflow mgmt│         │  - Trello       │
│  - Error handle │         │  - Slack        │
└─────────────────┘         │  - Drive        │
                            │  - Sheets       │
                            └─────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│           Supporting Components              │
│  - ActionRouter (validation, routing)       │
│  - PriorityQueue (priority management)      │
│  - RetryManager (exponential backoff)       │
│  - CircuitBreaker (failure detection)       │
│  - RollbackCoordinator (LIFO rollback)      │
│  - ApprovalHandler (human approval)         │
│  - MetricsCollector (telemetry)             │
└─────────────────────────────────────────────┘
```

## Customization

### Modify Demo Scenarios

Edit `demo/orchestration-demo.ts` to add custom scenarios:

```typescript
async function demoCustom_YourScenario(): Promise<void> {
  logger.header('🎯 CUSTOM DEMO: Your Scenario');
  
  const action: Action = {
    id: 'custom-1',
    type: 'your_action',
    platform: 'notion',
    priority: 'high',
    data: { ... },
  };
  
  await orchestrator.executeAction(action);
}
```

### Adjust Timing

Modify delay values to speed up or slow down the demo:

```typescript
await delay(300);  // Wait 300ms between actions
```

### Configure Mock Responses

Customize mock executor responses in `MockExecutor` class:

```typescript
private async executeNotion(action: Action): Promise<any> {
  return {
    pageId: `custom-id`,
    customField: 'custom value',
  };
}
```

## Troubleshooting

### Demo Fails to Start

```bash
# Check if ts-node is installed
npm list ts-node

# Reinstall dependencies
npm install
```

### Import Errors

```bash
# Rebuild project
npm run build
```

### Colors Not Showing

If running in an environment that doesn't support ANSI colors, colors may not display. The demo will still function correctly.

## Related Documentation

- [Architecture Documentation](../docs/ORCHESTRATION.md) - Complete system architecture
- [API Reference](../docs/ORCHESTRATION_API.md) - API documentation for team integration
- [Operational Runbook](../docs/ORCHESTRATION_RUNBOOK.md) - Operations and troubleshooting
- [Test Documentation](../docs/PROMPT-24-EXECUTOR-TESTS.md) - Testing suite documentation

## Contributing

To add new demo scenarios:

1. Create a new `demoN_ScenarioName()` function
2. Add to `runAllDemos()` sequence
3. Update this README with scenario details
4. Test with `npm run demo:orchestration`

## License

MIT License - See main project LICENSE file
