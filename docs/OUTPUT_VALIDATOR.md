# Output Validator Documentation

## Overview

The Output Validator uses **Zod** to validate and type-check LLM responses, ensuring structured outputs match expected schemas. This is critical for maintaining data integrity when working with LLM-generated content.

## Features

✅ **Type-safe schemas** for signal classification, action decisions, and task details  
✅ **Automatic validation** with helpful error messages  
✅ **JSON parsing** and validation in one step  
✅ **Safe validation** (returns result object instead of throwing)  
✅ **Partial validation** for progressive data collection  
✅ **Schema examples** for testing and documentation  

---

## Schemas

### 1. SignalClassification

Classifies operational signals (emails, Slack messages, Sheets changes).

```typescript
{
  type: "email" | "slack" | "sheet",
  urgency: "critical" | "high" | "medium" | "low",
  importance: "high" | "medium" | "low",
  category: "meeting" | "task" | "report" | "question" | "notification" | "alert",
  confidence: number, // 0-1
  reasoning: string   // 10-500 characters
}
```

**Example:**
```typescript
import { SignalClassificationSchema, validateOutput } from './agents/llm';

const classification = validateOutput(llmResponse, SignalClassificationSchema);
console.log(classification.urgency); // "critical"
console.log(classification.confidence); // 0.95
```

---

### 2. ActionDecision

Decides what action to take based on a classified signal.

```typescript
{
  action: "create_task" | "send_notification" | "update_sheet" | "file_document" | "delegate" | "ignore",
  target: "notion" | "trello" | "slack" | "drive" | "sheets",
  params: Record<string, unknown>, // Flexible params object
  priority: number,    // 1-5 (1 = highest)
  reasoning: string,   // 10-500 characters
  requiresApproval: boolean
}
```

**Example:**
```typescript
import { ActionDecisionSchema, validateOutput } from './agents/llm';

const decision = validateOutput(llmResponse, ActionDecisionSchema);
console.log(decision.action);  // "create_task"
console.log(decision.target);  // "notion"
console.log(decision.priority); // 1
```

---

### 3. TaskDetails

Details for creating tasks in Notion, Trello, etc.

```typescript
{
  title: string,       // 3-200 characters
  description: string, // 10-2000 characters
  dueDate?: string,    // Optional ISO 8601 datetime
  assignee?: string,   // Optional email address
  labels: string[],    // Max 10 labels
  project?: string     // Optional, 1-100 characters
}
```

**Example:**
```typescript
import { TaskDetailsSchema, validateOutput } from './agents/llm';

const task = validateOutput(llmResponse, TaskDetailsSchema);
console.log(task.title);        // "Fix Production Outage"
console.log(task.dueDate);      // "2025-10-17T18:00:00Z"
console.log(task.labels);       // ["urgent", "production"]
```

---

### 4. CompleteResponse

Combines all three schemas for end-to-end workflows.

```typescript
{
  classification: SignalClassification,
  decision: ActionDecision,
  taskDetails?: TaskDetails  // Optional
}
```

---

## Core Functions

### validateOutput()

Validates data against a schema. **Throws** ValidationError on failure.

```typescript
function validateOutput<T>(
  data: unknown,
  schema: ZodSchema<T>,
  schemaName?: string
): T
```

**Usage:**
```typescript
import { validateOutput, SignalClassificationSchema } from './agents/llm';

try {
  const result = validateOutput(
    llmResponse.content,
    SignalClassificationSchema,
    'SignalClassification'
  );
  console.log('Valid:', result);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(error.getUserFriendlyMessage());
  }
}
```

---

### safeValidateOutput()

Validates without throwing. Returns `{ success: true, data }` or `{ success: false, error }`.

```typescript
function safeValidateOutput<T>(
  data: unknown,
  schema: ZodSchema<T>,
  schemaName?: string
): { success: true; data: T } | { success: false; error: ValidationError }
```

**Usage:**
```typescript
import { safeValidateOutput, ActionDecisionSchema } from './agents/llm';

const result = safeValidateOutput(data, ActionDecisionSchema);

if (result.success) {
  console.log('Valid:', result.data);
} else {
  console.error('Invalid:', result.error.getUserFriendlyMessage());
}
```

---

### parseAndValidate()

Parses JSON string and validates in one step.

```typescript
function parseAndValidate<T>(
  jsonString: string,
  schema: ZodSchema<T>,
  schemaName?: string
): T
```

**Usage:**
```typescript
import { parseAndValidate, TaskDetailsSchema } from './agents/llm';

const jsonResponse = '{"title": "Fix bug", "description": "...", ...}';

try {
  const task = parseAndValidate(jsonResponse, TaskDetailsSchema);
  console.log(task.title);
} catch (error) {
  console.error('Parse or validation failed:', error.message);
}
```

---

### isValidOutput()

Checks if data is valid without throwing. Returns `true` or `false`.

```typescript
function isValidOutput<T>(data: unknown, schema: ZodSchema<T>): boolean
```

**Usage:**
```typescript
import { isValidOutput, SignalClassificationSchema } from './agents/llm';

if (isValidOutput(data, SignalClassificationSchema)) {
  console.log('Data is valid!');
} else {
  console.log('Data is invalid');
}
```

---

### getValidationErrors()

Gets validation errors without throwing. Returns array of errors or `null`.

```typescript
function getValidationErrors<T>(
  data: unknown,
  schema: ZodSchema<T>
): ZodIssue[] | null
```

**Usage:**
```typescript
import { getValidationErrors, SignalClassificationSchema } from './agents/llm';

const errors = getValidationErrors(data, SignalClassificationSchema);

if (errors) {
  errors.forEach(err => {
    console.log(`${err.path.join('.')}: ${err.message}`);
  });
}
```

---

### formatValidationErrors()

Formats validation errors into human-readable text.

```typescript
function formatValidationErrors(errors: ZodIssue[]): string
```

**Usage:**
```typescript
import { getValidationErrors, formatValidationErrors, SignalClassificationSchema } from './agents/llm';

const errors = getValidationErrors(data, SignalClassificationSchema);
if (errors) {
  console.log(formatValidationErrors(errors));
  // Output:
  // • urgency: Expected 'critical' | 'high' | 'medium' | 'low', received 'super-urgent'
  // • confidence: Number must be less than or equal to 1
}
```

---

### getSchemaExample()

Gets example data for a schema (useful for testing).

```typescript
function getSchemaExample(
  schemaName: 'signal' | 'action' | 'task'
): object
```

**Usage:**
```typescript
import { getSchemaExample } from './agents/llm';

const example = getSchemaExample('signal');
console.log(example);
// {
//   type: 'email',
//   urgency: 'high',
//   importance: 'high',
//   category: 'alert',
//   confidence: 0.92,
//   reasoning: '...'
// }
```

---

## ValidationError Class

Custom error class with helpful methods.

### Methods

**getUserFriendlyMessage()** - Get formatted error message
```typescript
console.log(error.getUserFriendlyMessage());
// Validation failed for SignalClassification:
//   - urgency: Invalid enum value
//   - confidence: Number must be <= 1
```

**getDetailedErrors()** - Get structured error array
```typescript
const details = error.getDetailedErrors();
// [
//   { field: 'urgency', message: '...', received: 'invalid-value' },
//   { field: 'confidence', message: '...', received: 1.5 }
// ]
```

---

## Complete Workflow Example

```typescript
import { getLLMClient } from './agents/llm';
import {
  SignalClassificationSchema,
  ActionDecisionSchema,
  TaskDetailsSchema,
  validateOutput
} from './agents/llm';

async function processSignal(emailContent: string) {
  const llm = getLLMClient();

  // 1. Classify the signal
  const classificationResponse = await llm.chat([
    {
      role: 'system',
      content: 'Classify this email. Return JSON with type, urgency, importance, category, confidence, reasoning.'
    },
    {
      role: 'user',
      content: emailContent
    }
  ], {
    responseFormat: 'json',
    temperature: 0.3
  });

  const classification = validateOutput(
    classificationResponse.content,
    SignalClassificationSchema,
    'SignalClassification'
  );

  console.log('Classification:', classification.category, classification.urgency);

  // 2. Decide action
  const decisionResponse = await llm.chat([
    {
      role: 'system',
      content: 'Decide action based on classification. Return JSON with action, target, params, priority, reasoning, requiresApproval.'
    },
    {
      role: 'user',
      content: JSON.stringify(classification)
    }
  ], {
    responseFormat: 'json',
    temperature: 0.3
  });

  const decision = validateOutput(
    decisionResponse.content,
    ActionDecisionSchema,
    'ActionDecision'
  );

  console.log('Decision:', decision.action, '→', decision.target);

  // 3. Create task if needed
  if (decision.action === 'create_task') {
    const taskResponse = await llm.chat([
      {
        role: 'system',
        content: 'Generate task details. Return JSON with title, description, dueDate, assignee, labels, project.'
      },
      {
        role: 'user',
        content: `Create task for: ${emailContent.substring(0, 100)}`
      }
    ], {
      responseFormat: 'json',
      temperature: 0.4
    });

    const task = validateOutput(
      taskResponse.content,
      TaskDetailsSchema,
      'TaskDetails'
    );

    console.log('Task created:', task.title);

    return { classification, decision, task };
  }

  return { classification, decision };
}
```

---

## Prompt Templates for LLM

### Signal Classification Prompt

```typescript
const CLASSIFICATION_PROMPT = `You are a signal classifier. Analyze the signal and return JSON matching this structure:
{
  "type": "email" | "slack" | "sheet",
  "urgency": "critical" | "high" | "medium" | "low",
  "importance": "high" | "medium" | "low",
  "category": "meeting" | "task" | "report" | "question" | "notification" | "alert",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Urgency levels:
- critical: Immediate action required (production down, security breach)
- high: Urgent but not critical (important deadline, key stakeholder)
- medium: Important but can wait (routine tasks, updates)
- low: Informational (FYI, nice-to-know)

Categories:
- alert: System alerts, incidents, emergencies
- task: Action items, TODOs
- meeting: Meeting requests, calendar invites
- report: Status updates, reports, analytics
- question: Questions requiring response
- notification: FYI, updates, announcements`;
```

### Action Decision Prompt

```typescript
const ACTION_PROMPT = `Based on the classified signal, decide what action to take. Return JSON:
{
  "action": "create_task" | "send_notification" | "update_sheet" | "file_document" | "delegate" | "ignore",
  "target": "notion" | "trello" | "slack" | "drive" | "sheets",
  "params": { key-value pairs specific to the action },
  "priority": 1-5 (1=highest),
  "reasoning": "why this action",
  "requiresApproval": true/false
}

Action guidelines:
- create_task: For actionable items requiring tracking (→ Notion/Trello)
- send_notification: For urgent updates (→ Slack)
- update_sheet: For data/metrics updates (→ Sheets)
- file_document: For reports/documents (→ Drive)
- delegate: For items needing human decision
- ignore: For spam, irrelevant content

Priority (1-5):
1 = Critical, do immediately
2 = High, do today
3 = Medium, do this week
4 = Low, do when possible
5 = Minimal, nice to have`;
```

### Task Details Prompt

```typescript
const TASK_PROMPT = `Generate task details for a Notion/Trello card. Return JSON:
{
  "title": "clear, action-oriented title (3-200 chars)",
  "description": "detailed description with context (10-2000 chars)",
  "dueDate": "ISO 8601 datetime (optional)",
  "assignee": "email@company.com (optional)",
  "labels": ["label1", "label2"],
  "project": "project/workspace name (optional)"
}

Guidelines:
- Title: Start with action verb (Fix, Update, Review, etc.)
- Description: Include context, steps, expected outcome
- Due date: Use ISO 8601 format (2025-10-17T18:00:00Z)
- Labels: Use for categorization (urgent, bug, feature, etc.)`;
```

---

## Error Handling Best Practices

### 1. Always Validate LLM Responses

```typescript
// ❌ DON'T: Trust LLM output directly
const data = llmResponse.content;
processData(data); // Might fail if structure is wrong

// ✅ DO: Validate before using
const validData = validateOutput(llmResponse.content, MySchema);
processData(validData); // Type-safe!
```

### 2. Use Safe Validation for User-Facing Features

```typescript
// ✅ Good for APIs/user interfaces
const result = safeValidateOutput(data, schema);

if (!result.success) {
  return {
    error: result.error.getUserFriendlyMessage(),
    status: 400
  };
}

return { data: result.data, status: 200 };
```

### 3. Log Validation Errors

```typescript
try {
  const data = validateOutput(response, schema, 'MySchema');
  logger.info('Validation succeeded', { data });
} catch (error) {
  if (error instanceof ValidationError) {
    logger.error('Validation failed', {
      schema: error.schema,
      errors: error.getDetailedErrors()
    });
  }
  throw error;
}
```

---

## Testing

```typescript
import { SignalClassificationSchema, isValidOutput } from './agents/llm';

describe('Signal Classification', () => {
  it('should validate correct data', () => {
    const validData = {
      type: 'email',
      urgency: 'high',
      importance: 'medium',
      category: 'task',
      confidence: 0.85,
      reasoning: 'This is a valid classification'
    };

    expect(isValidOutput(validData, SignalClassificationSchema)).toBe(true);
  });

  it('should reject invalid urgency', () => {
    const invalidData = {
      type: 'email',
      urgency: 'super-urgent', // Invalid!
      importance: 'high',
      category: 'alert',
      confidence: 0.9,
      reasoning: 'Test'
    };

    expect(isValidOutput(invalidData, SignalClassificationSchema)).toBe(false);
  });
});
```

---

## TypeScript Integration

All schemas export TypeScript types:

```typescript
import type { 
  SignalClassification, 
  ActionDecision, 
  TaskDetails 
} from './agents/llm';

// Use in function signatures
function processClassification(classification: SignalClassification) {
  // TypeScript knows all fields and types!
  console.log(classification.urgency); // ✅ Type-safe
  console.log(classification.invalid); // ❌ TypeScript error
}

// Use in interfaces
interface WorkflowResult {
  classification: SignalClassification;
  decision: ActionDecision;
  task?: TaskDetails;
}
```

---

## Next Steps

1. ✅ Output Validator created
2. 🔄 **Next**: Create Signal Classifier Agent (uses these schemas)
3. 🔄 **Next**: Create Decision Engine (uses these schemas)
4. 🔄 **Next**: Create Prompt Templates (optimized for these schemas)

---

## Files

- `src/agents/llm/output-validator.ts` - Main validator implementation
- `src/agents/llm/validator-examples.ts` - Usage examples
- `docs/OUTPUT_VALIDATOR.md` - This documentation

---

## Summary

The Output Validator ensures **data integrity** and **type safety** when working with LLM outputs. It provides:

✅ Strong typing with Zod schemas  
✅ Automatic validation  
✅ Helpful error messages  
✅ Multiple validation strategies (throw vs. safe)  
✅ JSON parsing + validation  
✅ Schema examples for testing  

**Always validate LLM outputs before using them in your application!**
