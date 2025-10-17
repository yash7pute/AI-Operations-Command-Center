# Context Builder

The **Context Builder** module provides rich contextual information for LLM-based decision-making by intelligently gathering and caching relevant data about signals, tasks, system state, and time context.

## Features

- **Recent Signal Tracking**: Maintains history of recent signals from the same source/sender
- **Similar Signal Detection**: Uses keyword extraction and overlap scoring to find related signals
- **Task Relationship Matching**: Identifies related tasks using content analysis
- **Time Context**: Business hours detection, day of week, holidays, timezone
- **System State Monitoring**: Queue depth, health status, processing metrics
- **Smart Caching**: 5-minute TTL cache to reduce overhead
- **Performance Optimization**: Fast context building (<100ms typical)
- **Team Availability**: Optional calendar integration for team status

## Installation

The Context Builder is part of the reasoning module:

```typescript
import { getContextBuilder, ContextBuilder } from './agents/reasoning';
// or
import contextBuilder from './agents/reasoning/context-builder';
```

## Quick Start

```typescript
import { getContextBuilder } from './agents/reasoning';

// Get singleton instance
const builder = getContextBuilder();

// Add signals as they arrive
builder.addSignal({
    id: 'sig123',
    source: 'email',
    subject: 'Critical: Database Down',
    body: 'Production database is unresponsive',
    sender: 'alerts@company.com',
    timestamp: new Date().toISOString(),
    classification: {
        urgency: 'critical',
        importance: 'high',
        category: 'incident',
    },
});

// Add tasks
builder.addTask({
    id: 'task456',
    title: 'Investigate Database Performance',
    status: 'in-progress',
    priority: 1,
    assignee: 'alice@company.com',
    labels: ['database', 'performance'],
    createdAt: new Date().toISOString(),
    source: 'notion',
});

// Build context for decision making
const context = builder.buildContext(signal, {
    includeTeamAvailability: true,
    maxRecentSignals: 50,
    maxRelatedTasks: 20,
});

// Use context in LLM prompts
console.log(`Recent signals: ${context.recentSignals.length}`);
console.log(`Related tasks: ${context.relatedTasks.length}`);
console.log(`Business hours: ${context.timeContext.isBusinessHours}`);
console.log(`System health: ${context.systemState.healthStatus}`);
```

## API Reference

### Types

#### Signal
```typescript
interface Signal {
    id: string;
    source: 'email' | 'slack' | 'sheets';
    subject?: string;
    body: string;
    sender?: string;
    timestamp: string;
    classification?: {
        urgency: string;
        importance: string;
        category: string;
    };
}
```

#### Task
```typescript
interface Task {
    id: string;
    title: string;
    description?: string;
    status: 'todo' | 'in-progress' | 'done' | 'blocked';
    priority: number; // 1-5
    assignee?: string;
    dueDate?: string;
    labels?: string[];
    createdAt: string;
    source: 'notion' | 'trello';
}
```

#### DecisionContext
```typescript
interface DecisionContext {
    recentSignals: Signal[];      // Recent signals from same source/sender
    relatedTasks: Task[];          // Tasks related to signal content
    similarSignals: Signal[];      // Signals with similar content
    timeContext: TimeContext;      // Current time information
    systemState: SystemState;      // System health and metrics
    teamAvailability?: TeamAvailability; // Optional team status
    metadata: {
        buildTime: number;         // Build time in milliseconds
        cacheHit: boolean;         // Whether cache was used
        timestamp: string;         // Context build timestamp
    };
}
```

### Methods

#### `buildContext(signal, options?)`

Build complete context for a signal.

**Parameters:**
- `signal: Signal` - Current signal to build context for
- `options?: object` - Optional configuration
  - `includeTeamAvailability?: boolean` - Include team status
  - `maxRecentSignals?: number` - Max recent signals (default: 50)
  - `maxRelatedTasks?: number` - Max related tasks (default: 20)

**Returns:** `DecisionContext`

**Example:**
```typescript
const context = builder.buildContext(signal, {
    includeTeamAvailability: true,
    maxRecentSignals: 30,
    maxRelatedTasks: 15,
});
```

#### `findSimilarSignals(signal, limit?)`

Find signals with similar content using keyword matching.

**Parameters:**
- `signal: Signal` - Signal to find similar ones for
- `limit?: number` - Maximum results (default: 10)

**Returns:** `Signal[]`

**Algorithm:**
1. Extract keywords from signal (3+ character words, excluding stop words)
2. Calculate keyword overlap with each historical signal
3. Return signals with >30% keyword overlap, sorted by score

**Example:**
```typescript
const similar = builder.findSimilarSignals(signal, 5);
console.log(`Found ${similar.length} similar signals`);
```

#### `getRelatedTasks(signal, limit?)`

Get tasks related to signal content.

**Parameters:**
- `signal: Signal` - Signal to find related tasks for
- `limit?: number` - Maximum results (default: 20)

**Returns:** `Task[]`

**Algorithm:**
1. Extract keywords from signal
2. Match keywords against task titles, descriptions, and labels
3. Return tasks with >20% keyword overlap, sorted by score

**Example:**
```typescript
const tasks = builder.getRelatedTasks(signal, 10);
console.log(`Found ${tasks.length} related tasks`);
```

#### `getCurrentWorkload()`

Get current task workload statistics.

**Returns:** Object with:
- `totalTasks: number` - Total tasks in registry
- `todoTasks: number` - Tasks in todo status
- `inProgressTasks: number` - Tasks in progress
- `blockedTasks: number` - Blocked tasks
- `highPriorityTasks: number` - Tasks with priority ≤2
- `overdueT: number` - Overdue incomplete tasks

**Example:**
```typescript
const workload = builder.getCurrentWorkload();
console.log(`${workload.inProgressTasks} tasks in progress`);
console.log(`${workload.overdueT} tasks overdue`);
```

#### `addSignal(signal)`

Add signal to history for context building.

**Parameters:**
- `signal: Signal` - Signal to add

**Note:** History is automatically trimmed to 100 most recent signals.

#### `addTask(task)`

Add or update task in registry.

**Parameters:**
- `task: Task` - Task to add/update

**Note:** Existing tasks with same ID are replaced.

#### `updateSystemMetrics(metrics)`

Update system performance metrics.

**Parameters:**
- `metrics: object`
  - `queueDepth?: number` - Current queue depth
  - `errorCount?: number` - Errors to add to count
  - `processedCount?: number` - Signals processed to add
  - `processingTime?: number` - Processing time to add (ms)

**Example:**
```typescript
builder.updateSystemMetrics({
    queueDepth: 15,
    processedCount: 1,
    processingTime: 250,
});
```

## Caching Strategy

### How It Works

1. **Cache Key Generation**: Combination of source, sender, and subject
2. **TTL**: 5-minute expiration
3. **Automatic Cleanup**: Every minute, expired entries are removed
4. **Cache Hit Detection**: Metadata indicates if cache was used

### Cache Benefits

- **Performance**: 80-95% faster for cached contexts
- **Reduced Load**: Less computation for repeated queries
- **Consistency**: Same signal gets same context within TTL window

### Example

```typescript
// First call - builds context (20ms)
const context1 = builder.buildContext(signal);
console.log(context1.metadata.cacheHit); // false
console.log(context1.metadata.buildTime); // ~20ms

// Second call - cache hit (1ms)
const context2 = builder.buildContext(signal);
console.log(context2.metadata.cacheHit); // true
console.log(context2.metadata.buildTime); // ~1ms
```

## Time Context

### Business Hours Detection

- **Business Hours**: Monday-Friday, 9 AM - 5 PM
- **Weekends**: Saturday and Sunday
- **Holidays**: US federal holidays (2025)

### Example

```typescript
const { timeContext } = builder.buildContext(signal);

if (!timeContext.isBusinessHours) {
    console.log('Outside business hours');
    if (timeContext.isWeekend) {
        console.log('Weekend - reduced staff');
    }
    if (timeContext.isHoliday) {
        console.log('Holiday - skeleton crew');
    }
}
```

## System State

### Health Status

- **healthy**: Error rate <10%, avg processing time <5s
- **degraded**: Error rate 10-50% or processing time 5-30s
- **down**: Error rate >50% or processing time >30s

### Metrics

```typescript
const { systemState } = builder.buildContext(signal);

console.log(`Queue: ${systemState.queueDepth} signals`);
console.log(`Active tasks: ${systemState.activeTasksCount}`);
console.log(`Health: ${systemState.healthStatus}`);
console.log(`Avg time: ${systemState.avgProcessingTime}ms`);
console.log(`Error rate: ${systemState.errorRate}%`);
```

## Integration Guide

### With Classification System

```typescript
import { getContextBuilder } from './agents/reasoning';
import { classificationPrompt } from './agents/prompts';

const builder = getContextBuilder();

// Add signal and build context
builder.addSignal(signal);
const context = builder.buildContext(signal);

// Use context in classification
const prompt = classificationPrompt(signal);
const fullPrompt = `
${prompt}

Recent Context:
- ${context.recentSignals.length} recent signals from this source
- ${context.relatedTasks.length} related tasks in progress
- System health: ${context.systemState.healthStatus}
- Time: ${context.timeContext.isBusinessHours ? 'Business hours' : 'After hours'}
`;
```

### With Action Decision

```typescript
import { actionDecisionPrompt } from './agents/prompts';

const context = builder.buildContext(signal, {
    includeTeamAvailability: true,
});

const prompt = actionDecisionPrompt(signal, classification, {
    recentActions: context.recentSignals,
    teamAvailability: context.teamAvailability,
    existingTasks: context.relatedTasks,
    timeOfDay: context.timeContext.isBusinessHours ? 'business' : 'after-hours',
});
```

### With Task Extraction

```typescript
import { taskExtractionPrompt } from './agents/prompts';

// Get workload before creating new task
const workload = builder.getCurrentWorkload();

if (workload.overdueT > 5 || workload.highPriorityTasks > 10) {
    console.log('High workload - consider deferring non-urgent tasks');
}

const prompt = taskExtractionPrompt(signal, classification);
```

## Performance Tips

### 1. Limit Signal History

Keep only relevant signals to improve matching speed:

```typescript
// Only add important signals
if (classification.urgency !== 'low') {
    builder.addSignal(signal);
}
```

### 2. Adjust Limits

Reduce limits for faster context building:

```typescript
const context = builder.buildContext(signal, {
    maxRecentSignals: 20,  // Default: 50
    maxRelatedTasks: 10,   // Default: 20
});
```

### 3. Skip Team Availability

Only include when needed:

```typescript
const context = builder.buildContext(signal, {
    includeTeamAvailability: false, // Faster
});
```

### 4. Batch System Metrics

Update metrics in batches:

```typescript
// After processing batch of signals
builder.updateSystemMetrics({
    processedCount: batchSize,
    processingTime: totalTime,
    errorCount: errors,
});
```

## Testing

Run the comprehensive test suite:

```bash
npx ts-node src/agents/reasoning/context-builder-test.ts
```

**Test Coverage:**
- ✅ Basic context building
- ✅ Similar signal detection
- ✅ Related task matching
- ✅ Time context
- ✅ System state tracking
- ✅ Workload calculation
- ✅ Context caching
- ✅ Performance optimization
- ✅ Team availability
- ✅ Edge case handling

## Best Practices

### 1. Add Signals Early

Add signals to history as soon as they're received:

```typescript
// In your signal ingestion pipeline
async function processSignal(signal: Signal) {
    builder.addSignal(signal);
    // ... rest of processing
}
```

### 2. Update Tasks Regularly

Sync task registry with Notion/Trello:

```typescript
// Periodic sync
setInterval(async () => {
    const tasks = await fetchTasksFromNotion();
    tasks.forEach(task => builder.addTask(task));
}, 5 * 60 * 1000); // Every 5 minutes
```

### 3. Monitor System Metrics

Track metrics throughout your pipeline:

```typescript
const startTime = Date.now();
try {
    await processSignal(signal);
    builder.updateSystemMetrics({
        processedCount: 1,
        processingTime: Date.now() - startTime,
    });
} catch (error) {
    builder.updateSystemMetrics({
        errorCount: 1,
    });
}
```

### 4. Use Context for Confidence

Higher confidence when good context available:

```typescript
const context = builder.buildContext(signal);

// Adjust confidence based on context
if (context.similarSignals.length >= 5) {
    confidence += 0.1; // Boost for similar past signals
}

if (context.relatedTasks.length > 0) {
    confidence += 0.05; // Boost for existing related work
}
```

## Troubleshooting

### No Similar Signals Found

**Cause**: Short signal body or uncommon keywords

**Solution**: Reduce similarity threshold or add more signals to history

```typescript
// In findSimilarSignals(), adjust threshold
.filter(item => item.score > 0.2) // Lower from 0.3
```

### Slow Context Building

**Cause**: Large signal history

**Solution**: Trim history more aggressively

```typescript
// Reduce MAX_RECENT_SIGNALS constant
const MAX_RECENT_SIGNALS = 30; // Down from 50
```

### Cache Not Working

**Cause**: Different signal IDs for same content

**Solution**: Use consistent cache keys based on content, not ID

```typescript
// Already implemented - cache key uses source/sender/subject
```

## Future Enhancements

- [ ] Integrate with Google Calendar for real team availability
- [ ] Machine learning for better signal similarity
- [ ] Configurable similarity thresholds
- [ ] Redis cache for distributed systems
- [ ] Historical trend analysis
- [ ] Anomaly detection in signal patterns
- [ ] Smart workload prediction

## License

Part of AI Operations Command Center project.
