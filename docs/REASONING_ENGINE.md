# LLM Reasoning Engine Architecture

## Overview

The LLM Reasoning Engine is the cognitive core of the AI Operations Command Center, responsible for intelligently analyzing incoming signals, classifying their urgency and importance, and making autonomous decisions about appropriate actions.

### Purpose
- **Analyze Signals**: Process raw data from multiple sources (Gmail, Slack, Google Sheets)
- **Classify Urgency/Importance**: Determine priority and categorization using LLM-powered analysis
- **Decide Actions**: Make intelligent decisions about what actions to take based on signal content and context

### Components
1. **Signal Classifier** - Analyzes and categorizes incoming signals
2. **Decision Agent** - Determines appropriate actions based on classifications
3. **Task Extractor** - Extracts structured task details from natural language
4. **Learning System** - Improves performance through feedback and pattern recognition

### Data Flow
```
Signal → Preprocess → Classify → Decide → Extract → Validate → Publish

┌─────────────┐
│ Raw Signal  │ (Email, Slack, Sheet)
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Preprocessing  │ (Normalize, Extract Metadata)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Classification │ (LLM: Urgency, Importance, Category)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Decision Agent │ (LLM: Action Type, Target, Priority)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Task Extraction │ (LLM: Title, Description, Due Date)
└────────┬────────┘  (Only for create_task actions)
         │
         ▼
┌─────────────────┐
│   Validation    │ (Business Rules, Confidence Check)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Publish      │ (Send to Action Orchestrator)
└─────────────────┘
```

---

## Core Components

### 1. Signal Classifier

The Signal Classifier is responsible for analyzing raw signals and determining their priority characteristics.

**Location**: `src/agents/signal-classifier.ts`

#### Input
- **Raw Signal**: Unprocessed data from integration sources
  ```typescript
  interface Signal {
    id: string;
    source: 'gmail' | 'slack' | 'sheets';
    type: 'email' | 'message' | 'update';
    content: string;
    metadata: Record<string, any>;
    timestamp: Date;
  }
  ```

#### Processing Steps
1. **Preprocessing**: Normalize content, extract metadata, clean formatting
2. **LLM Call**: Send to language model with classification prompt
3. **Output Validation**: Verify JSON structure and required fields
4. **Confidence Scoring**: Combine LLM confidence with quality factors

#### Output
```typescript
interface SignalClassification {
  urgency: 'critical' | 'high' | 'medium' | 'low';
  importance: 'high' | 'medium' | 'low';
  category: string; // 'bug', 'feature', 'question', 'update', etc.
  confidence: number; // 0.0 to 1.0
  reasoning: string; // LLM's explanation
  suggestedActions?: string[];
  metadata: {
    processingTime: number;
    model: string;
    cached: boolean;
  };
}
```

#### Classification Prompt Template
```typescript
// Location: src/agents/signal-classifier.ts, lines 150-180
const CLASSIFICATION_PROMPT = `
You are an AI assistant that classifies operational signals.

Analyze the following signal and classify it:

**Signal Source**: {source}
**Signal Type**: {type}
**Content**:
{content}

**Metadata**:
{metadata}

Classify this signal based on:
1. **Urgency**: How quickly does this need attention?
   - critical: Immediate action required (system down, security breach)
   - high: Action needed within hours (bugs, important requests)
   - medium: Action needed within days (features, improvements)
   - low: Can wait or is informational

2. **Importance**: How significant is this for the business?
   - high: Major impact on operations, revenue, or users
   - medium: Notable impact on team or product
   - low: Minor impact or routine matter

3. **Category**: What type of signal is this?
   (bug, feature, question, update, notification, task, etc.)

Return JSON:
{
  "urgency": "critical|high|medium|low",
  "importance": "high|medium|low",
  "category": "string",
  "confidence": 0.95,
  "reasoning": "Brief explanation",
  "suggestedActions": ["action1", "action2"]
}
`;
```

**Example Input/Output**:
```typescript
// Input
{
  source: 'gmail',
  type: 'email',
  content: 'URGENT: Production API returning 500 errors for 15 minutes. Users cannot log in.',
  metadata: { from: 'alerts@company.com', subject: 'Production Alert' }
}

// Output
{
  urgency: 'critical',
  importance: 'high',
  category: 'bug',
  confidence: 0.98,
  reasoning: 'Production outage affecting user authentication requires immediate attention',
  suggestedActions: ['create_task', 'notify_team', 'trigger_incident']
}
```

#### Confidence Scoring
The confidence score is calculated by combining multiple factors:

```typescript
// Location: src/agents/signal-classifier.ts, lines 220-250
function calculateConfidence(
  llmConfidence: number,
  qualityFactors: QualityFactors
): number {
  const weights = {
    llm: 0.6,           // Base LLM confidence
    clarity: 0.15,      // Content clarity (length, structure)
    metadata: 0.15,     // Metadata completeness
    consistency: 0.1,   // Internal consistency of classification
  };

  const clarityScore = Math.min(1.0, qualityFactors.contentLength / 100);
  const metadataScore = qualityFactors.metadataCompleteness;
  const consistencyScore = qualityFactors.categoryMatchesUrgency ? 1.0 : 0.7;

  return (
    llmConfidence * weights.llm +
    clarityScore * weights.clarity +
    metadataScore * weights.metadata +
    consistencyScore * weights.consistency
  );
}
```

#### Caching
- **TTL**: 1 hour for identical signals
- **Cache Key**: Hash of (source + type + content + normalized metadata)
- **Hit Rate Target**: > 50%
- **Implementation**: `src/utils/cache.ts`

```typescript
// Cache hit example
const cacheKey = hashSignal(signal);
const cached = classificationCache.get(cacheKey);
if (cached && Date.now() - cached.timestamp < 3600000) {
  return { ...cached.classification, metadata: { ...cached.metadata, cached: true } };
}
```

---

### 2. Decision Agent

The Decision Agent determines what action to take based on the signal classification and current context.

**Location**: `src/agents/decision-agent.ts`

#### Input
- **Signal**: Original signal data
- **Classification**: Output from Signal Classifier
- **Context**: Recent signals, existing tasks, system state

```typescript
interface DecisionContext {
  signal: Signal;
  classification: SignalClassification;
  recentSignals: Signal[];
  existingTasks: Task[];
  systemState: SystemState;
}
```

#### Processing Steps
1. **Context Building**: Gather relevant historical data and system state
2. **LLM Decision Call**: Request action decision with full context
3. **Business Rules Validation**: Apply hardcoded rules and constraints
4. **Approval Check**: Determine if human approval is required

#### Output
```typescript
interface ActionDecision {
  action: ActionType; // 'create_task' | 'notify_slack' | 'update_sheet' | 'no_action'
  targetPlatform: 'notion' | 'slack' | 'sheets' | null;
  parameters: Record<string, any>;
  priority: 'critical' | 'high' | 'medium' | 'low';
  requiresApproval: boolean;
  reasoning: string;
  confidence: number;
  metadata: {
    processingTime: number;
    model: string;
    rulesApplied: string[];
  };
}
```

#### Decision Prompt Template
```typescript
// Location: src/agents/decision-agent.ts, lines 180-230
const DECISION_PROMPT = `
You are an AI decision agent for an operations command center.

**Signal Classification**:
- Urgency: {urgency}
- Importance: {importance}
- Category: {category}
- Reasoning: {reasoning}

**Signal Content**:
{content}

**Current Context**:
- Recent similar signals: {recentCount}
- Existing tasks: {taskCount}
- System load: {systemLoad}
- Time: {currentTime} ({dayOfWeek})

**Available Actions**:
1. **create_task**: Create a task in Notion
2. **notify_slack**: Send notification to Slack channel
3. **update_sheet**: Update Google Sheet with information
4. **no_action**: No action needed (informational only)

**Decision Rules**:
- Critical urgency → Always create task + notify Slack
- Weekend non-critical → Defer to Monday unless urgent
- Duplicate signals → Consolidate into single task
- Low confidence → Require human approval

Decide the best action and return JSON:
{
  "action": "create_task",
  "targetPlatform": "notion",
  "parameters": {
    "urgency": "high",
    "notifyChannel": "#alerts"
  },
  "priority": "high",
  "requiresApproval": false,
  "reasoning": "Explanation of decision",
  "confidence": 0.92
}
`;
```

**Example Input/Output**:
```typescript
// Input
{
  signal: { /* Production API error signal */ },
  classification: { urgency: 'critical', importance: 'high', category: 'bug' },
  recentSignals: [], // No duplicates
  existingTasks: [], // No existing task for this issue
  systemState: { load: 'normal', dayOfWeek: 'Tuesday' }
}

// Output
{
  action: 'create_task',
  targetPlatform: 'notion',
  parameters: {
    urgency: 'critical',
    importance: 'high',
    category: 'bug',
    notifyChannel: '#incidents'
  },
  priority: 'critical',
  requiresApproval: false,
  reasoning: 'Production outage requires immediate task creation and team notification',
  confidence: 0.95
}
```

#### Business Rules
Hardcoded rules applied after LLM decision:

```typescript
// Location: src/agents/decision-agent.ts, lines 280-340
const BUSINESS_RULES = [
  {
    name: 'no_duplicates',
    condition: (context) => hasSimilarRecentSignal(context),
    action: (decision) => ({ ...decision, action: 'no_action', reasoning: 'Duplicate signal detected' })
  },
  {
    name: 'weekend_handling',
    condition: (context) => isWeekend() && context.classification.urgency !== 'critical',
    action: (decision) => ({ ...decision, parameters: { ...decision.parameters, deferUntil: nextMonday() } })
  },
  {
    name: 'approval_threshold',
    condition: (context) => context.classification.confidence < 0.7,
    action: (decision) => ({ ...decision, requiresApproval: true })
  },
  {
    name: 'critical_always_notify',
    condition: (context) => context.classification.urgency === 'critical',
    action: (decision) => ({
      ...decision,
      parameters: { ...decision.parameters, notifyChannel: '#incidents', notifyOncall: true }
    })
  }
];
```

#### Context Awareness
The Decision Agent maintains awareness of system state:

- **Recent Signals**: Last 100 signals (1 hour window) for duplicate detection
- **Existing Tasks**: Active tasks in Notion to avoid duplicates
- **System State**: Current load, error rates, processing queue depth
- **Historical Patterns**: Common signal patterns and typical responses

---

### 3. Task Extractor

The Task Extractor transforms natural language signals into structured task details for Notion.

**Location**: `src/agents/task-extractor.ts`

#### Input
- **Signal**: Original signal data
- **Classification**: Signal classification
- **Decision**: Action decision (only processes `create_task` actions)

```typescript
interface ExtractionInput {
  signal: Signal;
  classification: SignalClassification;
  decision: ActionDecision;
}
```

#### Processing Steps
1. **Content Analysis**: Extract key information from signal content
2. **LLM Extraction Call**: Request structured task details
3. **Date Parsing**: Convert relative/natural dates to absolute dates
4. **Assignee Inference**: Determine appropriate assignee based on content and metadata

#### Output
```typescript
interface TaskDetails {
  title: string;
  description: string;
  dueDate?: Date;
  labels: string[];
  assignee?: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  metadata: {
    extractedFrom: string; // Signal ID
    confidence: number;
    processingTime: number;
  };
}
```

#### Task Extraction Prompt Template
```typescript
// Location: src/agents/task-extractor.ts, lines 120-170
const EXTRACTION_PROMPT = `
You are an AI assistant that extracts structured task information from signals.

**Signal Content**:
{content}

**Classification**:
- Urgency: {urgency}
- Importance: {importance}
- Category: {category}

**Signal Metadata**:
{metadata}

Extract the following task details:

1. **Title**: Clear, concise task title (5-10 words)
2. **Description**: Detailed description with context and requirements
3. **Due Date**: When should this be completed? (consider urgency)
4. **Labels**: Relevant tags (e.g., 'bug', 'feature', 'urgent', 'backend')
5. **Assignee**: Who should handle this? (based on content/metadata)

**Date Parsing Guidelines**:
- "today" → Current date
- "tomorrow" → Current date + 1 day
- "next week" → Current date + 7 days
- "urgent" → Within 24 hours
- "asap" → Within 4 hours
- Specific dates → Parse and convert

**Assignee Inference**:
- Bug reports → Engineering lead
- Feature requests → Product manager
- Infrastructure → DevOps team
- Security → Security team
- Unknown → Unassigned

Return JSON:
{
  "title": "Fix production API 500 errors",
  "description": "Production API returning 500 errors...",
  "dueDate": "2025-10-18T12:00:00Z",
  "labels": ["bug", "critical", "backend", "api"],
  "assignee": "engineering-lead",
  "priority": "critical"
}
`;
```

**Example Input/Output**:
```typescript
// Input
{
  signal: {
    content: 'URGENT: Production API errors. Need to fix by EOD tomorrow.',
    metadata: { from: 'alerts@company.com', tags: ['backend', 'api'] }
  },
  classification: { urgency: 'critical', importance: 'high', category: 'bug' },
  decision: { action: 'create_task', priority: 'critical' }
}

// Output
{
  title: 'Fix Production API 500 Errors',
  description: 'Production API returning 500 errors affecting user authentication. Reported by monitoring system. Requires immediate investigation and fix.',
  dueDate: new Date('2025-10-18T17:00:00Z'), // EOD tomorrow
  labels: ['bug', 'critical', 'backend', 'api', 'production'],
  assignee: 'engineering-lead',
  priority: 'critical'
}
```

#### Smart Date Parsing
The Task Extractor includes intelligent date parsing:

```typescript
// Location: src/agents/task-extractor.ts, lines 220-280
function parseRelativeDate(dateStr: string, urgency: string): Date {
  const now = new Date();
  const lowerStr = dateStr.toLowerCase();

  // Urgency-based defaults
  if (!dateStr || dateStr === 'asap') {
    return urgency === 'critical' 
      ? addHours(now, 4)  // 4 hours for critical
      : addHours(now, 24); // 24 hours for high
  }

  // Relative dates
  if (lowerStr.includes('today')) return endOfDay(now);
  if (lowerStr.includes('tomorrow')) return endOfDay(addDays(now, 1));
  if (lowerStr.includes('next week')) return endOfDay(addDays(now, 7));
  if (lowerStr.includes('next month')) return endOfDay(addDays(now, 30));

  // Time-based
  if (lowerStr.includes('urgent')) return addHours(now, 24);
  if (lowerStr.includes('this week')) return endOfWeek(now);

  // Specific date parsing
  const parsed = parseISO(dateStr) || parseDate(dateStr);
  return parsed || addDays(now, 7); // Default: 1 week
}
```

#### Assignee Inference
Automatic assignee determination based on signal characteristics:

```typescript
// Location: src/agents/task-extractor.ts, lines 300-340
function inferAssignee(
  signal: Signal,
  classification: SignalClassification
): string | undefined {
  const content = signal.content.toLowerCase();
  const category = classification.category.toLowerCase();

  // Category-based mapping
  const categoryMap: Record<string, string> = {
    'bug': 'engineering-lead',
    'security': 'security-team',
    'infrastructure': 'devops-team',
    'feature': 'product-manager',
    'performance': 'engineering-lead',
    'deployment': 'devops-team'
  };

  // Keyword-based detection
  if (content.includes('database') || content.includes('sql')) return 'database-team';
  if (content.includes('frontend') || content.includes('ui')) return 'frontend-team';
  if (content.includes('api') || content.includes('backend')) return 'backend-team';
  if (content.includes('deploy') || content.includes('release')) return 'devops-team';

  // Metadata-based (email from field, Slack mentions)
  if (signal.metadata.assignee) return signal.metadata.assignee;
  if (signal.metadata.mentions?.length > 0) return signal.metadata.mentions[0];

  return categoryMap[category] || undefined; // Unassigned if no match
}
```

---

### 4. Learning System

The Learning System continuously improves the reasoning engine through feedback and pattern recognition.

**Location**: `src/agents/learning-system.ts`

#### Feedback Tracking
Records outcomes of all decisions:

```typescript
interface FeedbackRecord {
  signalId: string;
  classification: SignalClassification;
  decision: ActionDecision;
  outcome: 'success' | 'failure' | 'modified' | 'rejected';
  modifications?: {
    field: string;
    original: any;
    corrected: any;
    reason: string;
  }[];
  feedback?: string;
  timestamp: Date;
}

// Location: src/agents/learning-system.ts, lines 80-120
class LearningSystem {
  async recordFeedback(record: FeedbackRecord): Promise<void> {
    // Store in feedback-history.jsonl
    await this.feedbackStore.append(record);
    
    // Update accuracy metrics
    this.updateAccuracyMetrics(record);
    
    // Trigger pattern analysis if threshold reached
    if (this.feedbackStore.size % 100 === 0) {
      await this.analyzePatterns();
    }
  }
}
```

#### Pattern Recognition
Identifies recurring patterns in signals:

```typescript
// Location: src/agents/learning-system.ts, lines 150-210
interface RecognizedPattern {
  id: string;
  pattern: {
    sourceType?: string;
    category?: string;
    keywords: string[];
    urgencyPattern?: string;
  };
  frequency: number;
  typicalOutcome: {
    action: ActionType;
    accuracy: number;
    avgConfidence: number;
  };
  suggestions: string[];
}

async function analyzePatterns(): Promise<RecognizedPattern[]> {
  const recentFeedback = await this.feedbackStore.getRecent(1000);
  
  // Group by similar characteristics
  const patterns = groupByPattern(recentFeedback);
  
  // Calculate pattern statistics
  return patterns.map(p => ({
    id: generatePatternId(p),
    pattern: p.characteristics,
    frequency: p.signals.length,
    typicalOutcome: {
      action: p.mostCommonAction,
      accuracy: p.successRate,
      avgConfidence: p.avgConfidence
    },
    suggestions: generateSuggestions(p)
  }));
}
```

#### Prompt Optimization
Improves prompts based on feedback:

```typescript
// Location: src/agents/learning-system.ts, lines 240-300
class PromptOptimizer {
  async optimizePrompt(
    promptType: 'classification' | 'decision' | 'extraction',
    feedback: FeedbackRecord[]
  ): Promise<OptimizedPrompt> {
    // Analyze failures
    const failures = feedback.filter(f => f.outcome === 'failure' || f.outcome === 'modified');
    
    // Identify common issues
    const issues = this.identifyCommonIssues(failures);
    
    // Generate prompt improvements
    const improvements = this.generateImprovements(issues);
    
    // Create new prompt variant
    const newPrompt = this.applyImprovements(
      this.getCurrentPrompt(promptType),
      improvements
    );
    
    return {
      type: promptType,
      version: this.getNextVersion(promptType),
      prompt: newPrompt,
      improvements: improvements,
      expectedImpact: this.estimateImpact(issues, improvements)
    };
  }
}
```

#### A/B Testing
Tests new prompts before full rollout:

```typescript
// Location: src/agents/learning-system.ts, lines 330-390
class ABTestManager {
  private activeTests: Map<string, ABTest> = new Map();
  
  async startTest(
    promptType: string,
    controlPrompt: string,
    variantPrompt: string,
    sampleSize: number = 100
  ): Promise<string> {
    const testId = generateTestId();
    
    this.activeTests.set(testId, {
      id: testId,
      promptType,
      control: { prompt: controlPrompt, results: [] },
      variant: { prompt: variantPrompt, results: [] },
      sampleSize,
      startTime: new Date(),
      status: 'running'
    });
    
    return testId;
  }
  
  getPromptForSignal(promptType: string, signalId: string): string {
    const test = this.getActiveTest(promptType);
    if (!test) return this.getDefaultPrompt(promptType);
    
    // 50/50 split (deterministic based on signal ID)
    const useVariant = parseInt(signalId, 36) % 2 === 0;
    
    const selectedPrompt = useVariant ? test.variant.prompt : test.control.prompt;
    
    // Track which group this signal belongs to
    this.trackAssignment(test.id, signalId, useVariant ? 'variant' : 'control');
    
    return selectedPrompt;
  }
  
  async evaluateTest(testId: string): Promise<TestResults> {
    const test = this.activeTests.get(testId);
    if (!test) throw new Error('Test not found');
    
    const controlAccuracy = calculateAccuracy(test.control.results);
    const variantAccuracy = calculateAccuracy(test.variant.results);
    
    const improvement = ((variantAccuracy - controlAccuracy) / controlAccuracy) * 100;
    const significant = isStatisticallySignificant(test.control.results, test.variant.results);
    
    return {
      testId,
      controlAccuracy,
      variantAccuracy,
      improvement,
      significant,
      recommendation: improvement > 5 && significant ? 'rollout_variant' : 'keep_control'
    };
  }
}
```

---

## Prompt Templates

### Classification Prompt
**Location**: `src/agents/signal-classifier.ts`, lines 150-180

**Purpose**: Classify signals by urgency, importance, and category

**Input Variables**:
- `{source}`: Signal source (gmail, slack, sheets)
- `{type}`: Signal type (email, message, update)
- `{content}`: Signal content
- `{metadata}`: Additional metadata

**Example Output**:
```json
{
  "urgency": "high",
  "importance": "medium",
  "category": "bug",
  "confidence": 0.89,
  "reasoning": "Bug report from customer with clear reproduction steps",
  "suggestedActions": ["create_task", "notify_team"]
}
```

### Decision Prompt
**Location**: `src/agents/decision-agent.ts`, lines 180-230

**Purpose**: Decide what action to take based on classification

**Input Variables**:
- `{urgency}`, `{importance}`, `{category}`: Classification results
- `{content}`: Signal content
- `{recentCount}`: Number of similar recent signals
- `{taskCount}`: Number of existing tasks
- `{systemLoad}`: Current system load
- `{currentTime}`, `{dayOfWeek}`: Temporal context

**Example Output**:
```json
{
  "action": "create_task",
  "targetPlatform": "notion",
  "parameters": {
    "urgency": "high",
    "notifyChannel": "#engineering"
  },
  "priority": "high",
  "requiresApproval": false,
  "reasoning": "High urgency bug requires task creation",
  "confidence": 0.91
}
```

### Task Extraction Prompt
**Location**: `src/agents/task-extractor.ts`, lines 120-170

**Purpose**: Extract structured task details from signal

**Input Variables**:
- `{content}`: Signal content
- `{urgency}`, `{importance}`, `{category}`: Classification
- `{metadata}`: Signal metadata

**Example Output**:
```json
{
  "title": "Fix Login Button Not Responding on Mobile",
  "description": "Users report that tapping login button on mobile Safari does nothing. Issue appears to be CSS z-index problem with overlay.",
  "dueDate": "2025-10-20T17:00:00Z",
  "labels": ["bug", "frontend", "mobile", "high-priority"],
  "assignee": "frontend-team",
  "priority": "high"
}
```

---

## Configuration

### LLM Provider Settings
```typescript
// Location: src/config/llm.ts
const LLM_CONFIG = {
  primary: {
    provider: 'groq',
    model: 'llama-3.1-70b-versatile',
    apiKey: process.env.GROQ_API_KEY,
    maxTokens: 500000, // 500k tokens/day
    rateLimit: {
      requestsPerMinute: 30,
      tokensPerMinute: 6000
    }
  },
  fallback: {
    provider: 'together',
    model: 'meta-llama/Llama-3-70b-chat-hf',
    apiKey: process.env.TOGETHER_API_KEY,
    maxTokens: 500000,
    rateLimit: {
      requestsPerMinute: 20,
      tokensPerMinute: 4000
    }
  },
  retryConfig: {
    maxRetries: 3,
    backoff: 'exponential', // 1s, 2s, 4s
    fallbackOnFailure: true
  }
};
```

### Token Limits
- **Daily Limit**: 500k tokens per provider (1M total with fallback)
- **Per Request**: Max 4096 tokens input, 1024 tokens output
- **Monitoring**: Track usage via `/api/metrics/tokens`
- **Alerts**: Warning at 80%, error at 95%

### Confidence Thresholds
```typescript
// Location: src/config/thresholds.ts
const CONFIDENCE_THRESHOLDS = {
  autoExecute: 0.85,      // Auto-execute decisions above this
  requireApproval: 0.70,  // Require human approval below this
  flagForReview: 0.50,    // Flag for review below this
  reject: 0.30            // Reject and log below this
};

// Usage in Decision Agent
if (decision.confidence >= CONFIDENCE_THRESHOLDS.autoExecute) {
  return { ...decision, requiresApproval: false };
} else if (decision.confidence >= CONFIDENCE_THRESHOLDS.requireApproval) {
  return { ...decision, requiresApproval: true };
} else if (decision.confidence >= CONFIDENCE_THRESHOLDS.flagForReview) {
  await this.flagForManualReview(decision);
  return { ...decision, action: 'no_action', requiresApproval: true };
} else {
  await this.logRejection(decision, 'Low confidence');
  return { ...decision, action: 'no_action', reasoning: 'Confidence too low' };
}
```

### Cache Configuration
```typescript
// Location: src/config/cache.ts
const CACHE_CONFIG = {
  classification: {
    ttl: 3600000,  // 1 hour
    maxSize: 10000,
    strategy: 'lru' // Least Recently Used
  },
  decision: {
    ttl: 1800000,  // 30 minutes
    maxSize: 5000,
    strategy: 'lru'
  },
  taskExtraction: {
    ttl: 1800000,  // 30 minutes
    maxSize: 3000,
    strategy: 'lru'
  }
};
```

### Batch Processing
```typescript
// Location: src/config/processing.ts
const BATCH_CONFIG = {
  maxBatchSize: 10,           // Max signals per batch
  batchTimeout: 5000,         // 5 seconds max wait time
  concurrentBatches: 3,       // Process 3 batches in parallel
  priorityBatching: true,     // Group by priority
  
  // Batch processing enabled for non-critical signals
  batchableUrgencies: ['low', 'medium']
};
```

---

## Performance Metrics

### Target Metrics
```typescript
interface PerformanceTargets {
  processingTime: {
    target: 3000,      // 3 seconds per signal
    p95: 5000,         // 95th percentile: 5 seconds
    p99: 8000          // 99th percentile: 8 seconds
  };
  accuracy: {
    target: 0.90,      // 90% accuracy based on feedback
    classification: 0.92,
    decision: 0.88,
    extraction: 0.91
  };
  tokenEfficiency: {
    cacheHitRate: 0.50,  // 50% cache hit rate
    avgTokensPerSignal: 2000,
    tokenSavingsFromCache: 0.60  // 60% reduction when cached
  };
  throughput: {
    signalsPerMinute: 20,  // Sustained throughput
    peakCapacity: 50,      // Peak handling capacity
    queueDepthLimit: 100   // Max queued signals before backpressure
  };
}
```

### Real-time Monitoring
```typescript
// Location: src/utils/performance-monitor.ts
class PerformanceMonitor {
  private metrics = {
    totalProcessed: 0,
    totalErrors: 0,
    avgProcessingTime: 0,
    cacheHitRate: 0,
    accuracyRate: 0,
    currentThroughput: 0
  };

  recordProcessing(signalId: string, startTime: number): void {
    const duration = Date.now() - startTime;
    
    this.metrics.totalProcessed++;
    this.metrics.avgProcessingTime = 
      (this.metrics.avgProcessingTime * (this.metrics.totalProcessed - 1) + duration) / 
      this.metrics.totalProcessed;
    
    // Alert if exceeding target
    if (duration > 3000) {
      this.alertSlowProcessing(signalId, duration);
    }
  }

  getCurrentMetrics(): PerformanceMetrics {
    return {
      ...this.metrics,
      timestamp: new Date(),
      health: this.calculateHealth()
    };
  }
}
```

### Accuracy Tracking
Accuracy is measured through feedback:

```typescript
// Location: src/agents/learning-system.ts
function calculateAccuracy(feedback: FeedbackRecord[]): AccuracyMetrics {
  const total = feedback.length;
  const successful = feedback.filter(f => f.outcome === 'success').length;
  const modified = feedback.filter(f => f.outcome === 'modified').length;
  
  return {
    overall: successful / total,
    withModifications: (successful + modified) / total,
    byComponent: {
      classification: calculateComponentAccuracy(feedback, 'classification'),
      decision: calculateComponentAccuracy(feedback, 'decision'),
      extraction: calculateComponentAccuracy(feedback, 'extraction')
    },
    trend: calculateTrend(feedback)
  };
}
```

---

## Integration Points

### Input Integration
**Subscribes to Member 1's EventHub events**:

```typescript
// Location: src/integrations/event-hub.ts
class ReasoningEngineIntegration {
  constructor(
    private classifier: SignalClassifier,
    private decisionAgent: DecisionAgent,
    private taskExtractor: TaskExtractor
  ) {
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    // Subscribe to signal events
    EventHub.on('signal:received', this.handleSignal.bind(this));
    EventHub.on('signal:preprocessing:complete', this.handlePreprocessed.bind(this));
    
    // Subscribe to feedback events
    EventHub.on('action:completed', this.handleFeedback.bind(this));
    EventHub.on('action:failed', this.handleFailure.bind(this));
  }

  private async handleSignal(signal: Signal): Promise<void> {
    try {
      // Classify
      const classification = await this.classifier.classify(signal);
      EventHub.emit('signal:classified', { signal, classification });
      
      // Decide
      const decision = await this.decisionAgent.decide(signal, classification);
      EventHub.emit('signal:decision', { signal, classification, decision });
      
      // Extract (if needed)
      if (decision.action === 'create_task') {
        const taskDetails = await this.taskExtractor.extract(signal, classification, decision);
        EventHub.emit('task:extracted', { signal, taskDetails });
      }
      
      // Publish to orchestrator
      await this.publishToOrchestrator(signal, classification, decision);
      
    } catch (error) {
      EventHub.emit('reasoning:error', { signal, error });
      this.handleError(signal, error);
    }
  }
}
```

### Output Integration
**Publishes to Member 3's Action Orchestrator**:

```typescript
// Location: src/integrations/action-orchestrator.ts
interface ActionPayload {
  signalId: string;
  classification: SignalClassification;
  decision: ActionDecision;
  taskDetails?: TaskDetails;
  timestamp: Date;
}

class ActionOrchestratorClient {
  async publishAction(payload: ActionPayload): Promise<void> {
    // Validate before publishing
    this.validatePayload(payload);
    
    // Publish to action queue
    await ActionQueue.enqueue({
      id: generateActionId(),
      type: payload.decision.action,
      platform: payload.decision.targetPlatform,
      parameters: {
        ...payload.decision.parameters,
        ...(payload.taskDetails || {})
      },
      priority: payload.decision.priority,
      requiresApproval: payload.decision.requiresApproval,
      metadata: {
        signalId: payload.signalId,
        confidence: payload.decision.confidence,
        timestamp: payload.timestamp
      }
    });
    
    logger.info('Action published to orchestrator', {
      actionId: payload.signalId,
      action: payload.decision.action
    });
  }
}
```

### Dashboard Integration
**Provides metrics to Member 4's Dashboard**:

```typescript
// Location: src/api/metrics.ts
router.get('/api/metrics/reasoning', async (req, res) => {
  const metrics = {
    performance: performanceMonitor.getCurrentMetrics(),
    accuracy: await learningSystem.getAccuracyMetrics(),
    throughput: await getThroughputMetrics(),
    caching: getCacheMetrics(),
    llm: getLLMUsageMetrics()
  };
  
  res.json(metrics);
});

// Real-time updates via WebSocket
io.on('connection', (socket) => {
  const interval = setInterval(() => {
    socket.emit('reasoning:metrics', {
      timestamp: Date.now(),
      metrics: performanceMonitor.getCurrentMetrics()
    });
  }, 5000); // Every 5 seconds
  
  socket.on('disconnect', () => clearInterval(interval));
});
```

---

## Error Handling

### LLM API Failure
```typescript
// Location: src/agents/base-agent.ts
async function callLLMWithRetry(
  prompt: string,
  config: LLMConfig
): Promise<LLMResponse> {
  let lastError: Error;
  
  // Try primary provider with retries
  for (let i = 0; i < 3; i++) {
    try {
      return await this.primaryProvider.complete(prompt, config);
    } catch (error) {
      lastError = error;
      logger.warn(`Primary LLM attempt ${i + 1} failed`, { error });
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
  
  // Try fallback provider
  try {
    logger.info('Switching to fallback LLM provider');
    return await this.fallbackProvider.complete(prompt, config);
  } catch (error) {
    logger.error('Fallback LLM also failed', { error });
  }
  
  // Flag for manual review
  await this.flagForManualReview({
    prompt,
    error: lastError,
    reason: 'All LLM providers failed'
  });
  
  throw new Error('LLM processing failed after all retries');
}
```

### Invalid Output
```typescript
// Location: src/agents/validators.ts
async function validateAndRetry(
  output: any,
  schema: JSONSchema,
  retryFn: () => Promise<any>
): Promise<any> {
  // Validate against schema
  const validation = validateJSON(output, schema);
  
  if (validation.valid) {
    return output;
  }
  
  // Log validation error
  logger.warn('LLM output validation failed', {
    errors: validation.errors,
    output
  });
  
  // Retry with adjusted prompt
  try {
    const adjustedPrompt = this.adjustPromptForErrors(validation.errors);
    const retryOutput = await retryFn();
    
    const retryValidation = validateJSON(retryOutput, schema);
    if (retryValidation.valid) {
      return retryOutput;
    }
  } catch (error) {
    logger.error('Retry also produced invalid output', { error });
  }
  
  // Flag for review
  await this.flagForManualReview({
    output,
    validationErrors: validation.errors,
    reason: 'Invalid LLM output format'
  });
  
  throw new ValidationError('LLM output validation failed');
}
```

### Low Confidence
```typescript
// Location: src/agents/decision-agent.ts
if (decision.confidence < CONFIDENCE_THRESHOLDS.requireApproval) {
  logger.info('Low confidence decision, queuing for approval', {
    signalId: signal.id,
    confidence: decision.confidence
  });
  
  // Queue for human approval
  await approvalQueue.enqueue({
    type: 'low_confidence_decision',
    signal,
    classification,
    decision,
    requester: 'reasoning-engine',
    reason: `Confidence ${decision.confidence} below threshold ${CONFIDENCE_THRESHOLDS.requireApproval}`
  });
  
  // Set approval flag
  decision.requiresApproval = true;
  decision.metadata.approvalReason = 'low_confidence';
  
  return decision;
}
```

### Validation Failure
```typescript
// Location: src/agents/validators.ts
async function handleValidationFailure(
  signal: Signal,
  decision: ActionDecision,
  error: ValidationError
): Promise<void> {
  // Log error with context
  logger.error('Decision validation failed', {
    signalId: signal.id,
    decision,
    error: error.message,
    validationErrors: error.details
  });
  
  // Notify via Slack
  await slackClient.sendMessage({
    channel: '#ai-ops-alerts',
    text: `⚠️ Reasoning Engine Validation Failure`,
    attachments: [{
      color: 'danger',
      fields: [
        { title: 'Signal ID', value: signal.id, short: true },
        { title: 'Source', value: signal.source, short: true },
        { title: 'Error', value: error.message, short: false },
        { title: 'Decision', value: JSON.stringify(decision, null, 2), short: false }
      ]
    }]
  });
  
  // Reject and flag for review
  await this.rejectDecision(signal, decision, error);
  await this.flagForManualReview({
    signal,
    decision,
    error,
    reason: 'Validation failure'
  });
}
```

---

## Monitoring & Debugging

### Structured Logging
```typescript
// Location: src/utils/logger.ts
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'reasoning-engine' },
  transports: [
    // Separate files by component
    new winston.transports.File({ 
      filename: 'logs/reasoning-error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/reasoning-combined.log' 
    }),
    // Daily rotation
    new DailyRotateFile({
      filename: 'logs/reasoning-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

// Structured logging example
logger.info('Signal classified', {
  signalId: signal.id,
  source: signal.source,
  classification: {
    urgency: classification.urgency,
    importance: classification.importance,
    category: classification.category,
    confidence: classification.confidence
  },
  processingTime: Date.now() - startTime
});
```

### Metrics Endpoint
```typescript
// Location: src/api/metrics.ts
router.get('/api/metrics', async (req, res) => {
  const metrics = {
    reasoning: {
      totalProcessed: performanceMonitor.metrics.totalProcessed,
      totalErrors: performanceMonitor.metrics.totalErrors,
      avgProcessingTime: performanceMonitor.metrics.avgProcessingTime,
      accuracyRate: await learningSystem.getAccuracyRate(),
      cacheHitRate: cacheManager.getHitRate(),
      throughput: performanceMonitor.getCurrentThroughput()
    },
    llm: {
      provider: llmManager.getCurrentProvider(),
      tokensUsed: llmManager.getTokensUsed(),
      tokensRemaining: llmManager.getTokensRemaining(),
      requestCount: llmManager.getRequestCount(),
      errorRate: llmManager.getErrorRate()
    },
    components: {
      classifier: classifierMetrics.getMetrics(),
      decisionAgent: decisionAgentMetrics.getMetrics(),
      taskExtractor: taskExtractorMetrics.getMetrics(),
      learningSystem: learningSystemMetrics.getMetrics()
    },
    health: {
      status: healthCheck.getStatus(),
      uptime: process.uptime(),
      lastError: performanceMonitor.getLastError()
    }
  };
  
  res.json(metrics);
});
```

### Feedback History
```typescript
// Location: logs/feedback-history.jsonl
// JSONL format (one JSON object per line)
{
  "timestamp": "2025-10-17T10:30:00Z",
  "signalId": "sig_123",
  "classification": { "urgency": "high", "importance": "medium", "category": "bug" },
  "decision": { "action": "create_task", "confidence": 0.87 },
  "outcome": "success",
  "processingTime": 2341
}
{
  "timestamp": "2025-10-17T10:31:15Z",
  "signalId": "sig_124",
  "classification": { "urgency": "medium", "importance": "low", "category": "question" },
  "decision": { "action": "notify_slack", "confidence": 0.72 },
  "outcome": "modified",
  "modifications": [
    { "field": "action", "original": "notify_slack", "corrected": "no_action", "reason": "Not urgent enough" }
  ],
  "feedback": "Should not have sent notification",
  "processingTime": 1893
}
```

### Performance Monitoring
```typescript
// Location: src/utils/performance-monitor.ts
class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private alerts: AlertManager;

  monitorProcessing(signalId: string, callback: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    
    return callback()
      .then(() => {
        const duration = Date.now() - startTime;
        this.recordSuccess(signalId, duration);
        
        // Alert if slow
        if (duration > 3000) {
          this.alerts.warn('Slow processing detected', { signalId, duration });
        }
      })
      .catch(error => {
        const duration = Date.now() - startTime;
        this.recordFailure(signalId, duration, error);
        
        // Alert on error
        this.alerts.error('Processing failed', { signalId, error, duration });
        
        throw error;
      });
  }

  getRealtimeMetrics(): RealtimeMetrics {
    const now = Date.now();
    const last1min = this.getMetricsSince(now - 60000);
    const last5min = this.getMetricsSince(now - 300000);
    
    return {
      current: {
        throughput: last1min.count / 60, // per second
        avgLatency: last1min.avgDuration,
        errorRate: last1min.errors / last1min.count
      },
      recent: {
        throughput: last5min.count / 300,
        avgLatency: last5min.avgDuration,
        errorRate: last5min.errors / last5min.count
      },
      health: this.calculateHealthScore(last1min, last5min)
    };
  }
}
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Reasoning Engine                             │
└─────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   EventHub   │ (Member 1: Signal Sources)
    │              │
    └───────┬──────┘
            │ signal:received
            │
            ▼
    ┌───────────────────────────┐
    │   Signal Preprocessing    │
    │   - Normalize content     │
    │   - Extract metadata      │
    │   - Detect duplicates     │
    └───────────┬───────────────┘
                │
                ▼
    ┌────────────────────────────────────────────┐
    │        Signal Classifier                   │
    │  ┌─────────────────────────────────────┐  │
    │  │ 1. Check cache (1hr TTL)            │  │
    │  │ 2. Call LLM (Groq/Together)         │  │
    │  │ 3. Parse JSON response              │  │
    │  │ 4. Calculate confidence             │  │
    │  │ 5. Cache result                     │  │
    │  └─────────────────────────────────────┘  │
    └────────────┬───────────────────────────────┘
                 │ SignalClassification
                 │ (urgency, importance, category)
                 ▼
    ┌────────────────────────────────────────────┐
    │         Decision Agent                     │
    │  ┌─────────────────────────────────────┐  │
    │  │ 1. Build context (recent signals)   │  │
    │  │ 2. Call LLM with classification     │  │
    │  │ 3. Apply business rules             │  │
    │  │ 4. Check approval threshold         │  │
    │  │ 5. Cache decision (30min TTL)       │  │
    │  └─────────────────────────────────────┘  │
    └────────────┬───────────────────────────────┘
                 │ ActionDecision
                 │ (action, platform, params)
                 ▼
           ┌─────────────┐
           │ create_task?│
           └─────┬───┬───┘
                 │   │ No  ──────────┐
              Yes│   │                │
                 ▼   │                │
    ┌────────────────────────┐        │
    │    Task Extractor      │        │
    │  ┌──────────────────┐  │        │
    │  │ 1. Call LLM      │  │        │
    │  │ 2. Parse dates   │  │        │
    │  │ 3. Infer assignee│  │        │
    │  │ 4. Format output │  │        │
    │  └──────────────────┘  │        │
    └────────────┬───────────┘        │
                 │ TaskDetails        │
                 ▼                    │
    ┌────────────────────────┐        │
    │   Validation Layer     │◄───────┘
    │  - Business rules      │
    │  - Confidence check    │
    │  - Approval logic      │
    └────────────┬───────────┘
                 │
                 ▼
    ┌────────────────────────────────────────┐
    │      Action Queue                      │
    │   (To Member 3: Action Orchestrator)   │
    └────────────┬───────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────┐
    │        Learning System                 │
    │  ┌──────────────────────────────────┐  │
    │  │ Feedback Loop:                   │  │
    │  │ 1. Track outcomes                │  │
    │  │ 2. Analyze patterns              │  │
    │  │ 3. Optimize prompts              │  │
    │  │ 4. A/B test improvements         │  │
    │  └──────────────────────────────────┘  │
    └────────────────────────────────────────┘
                 │
                 ▼
    ┌────────────────────────────────────────┐
    │       Dashboard Provider               │
    │     (To Member 4: Dashboard UI)        │
    │  - Real-time metrics                   │
    │  - Accuracy tracking                   │
    │  - Performance monitoring              │
    └────────────────────────────────────────┘


Legend:
  ┌─────┐
  │ Box │  Component
  └─────┘
  
    │     Data flow
    ▼     Direction
    
  ┌────┐
  │ ?? │  Decision point
  └────┘
```

---

## Data Flow Example: Email to Task

```
Step 1: Signal Received
========================
Input: Email from alerts@company.com
Subject: "Production API Error"
Body: "500 errors on /api/auth endpoint affecting 20% of users"
Timestamp: 2025-10-17T10:30:00Z

        ↓

Step 2: Preprocessing
====================
Normalized Content: "Production API Error: 500 errors on /api/auth 
                     endpoint affecting 20% of users"
Metadata Extracted:
  - source: gmail
  - from: alerts@company.com
  - keywords: ['production', 'api', 'error', '500', 'auth']
  - userImpact: 20%

        ↓

Step 3: Classification (LLM Call #1)
====================================
Prompt: "Classify this signal: [content + metadata]"
LLM Response:
{
  "urgency": "critical",
  "importance": "high",
  "category": "bug",
  "confidence": 0.96,
  "reasoning": "Production API failure affecting users requires 
                immediate attention",
  "suggestedActions": ["create_task", "notify_team"]
}
Cache: Stored with key hash(content) for 1 hour
Processing Time: 1.2 seconds

        ↓

Step 4: Decision (LLM Call #2)
==============================
Context Built:
  - Recent signals: 0 similar in last hour
  - Existing tasks: 0 for this issue
  - System state: Normal load
  - Time: Tuesday 10:30 AM

Prompt: "Decide action for [classification + context]"
LLM Response:
{
  "action": "create_task",
  "targetPlatform": "notion",
  "parameters": {
    "urgency": "critical",
    "notifyChannel": "#incidents",
    "notifyOncall": true
  },
  "priority": "critical",
  "requiresApproval": false,
  "reasoning": "Critical production issue needs immediate task",
  "confidence": 0.94
}

Business Rules Applied:
  ✓ No duplicates found
  ✓ Critical urgency → auto-notify #incidents
  ✓ High confidence (0.94) → no approval needed

Processing Time: 1.8 seconds

        ↓

Step 5: Task Extraction (LLM Call #3)
=====================================
Prompt: "Extract task details from [signal + classification]"
LLM Response:
{
  "title": "Fix Production API 500 Errors on Auth Endpoint",
  "description": "Production API returning 500 errors on /api/auth
                  endpoint. Currently affecting 20% of users who 
                  cannot authenticate. Reported by monitoring system
                  at 10:30 AM.",
  "dueDate": "2025-10-17T14:30:00Z", // 4 hours (critical)
  "labels": ["bug", "critical", "backend", "api", "production"],
  "assignee": "backend-team",
  "priority": "critical"
}

Date Parsing: "critical urgency" → 4 hours from now
Assignee Inference: "api" + "backend" keywords → backend-team
Processing Time: 1.5 seconds

        ↓

Step 6: Validation
==================
Business Rules Check:
  ✓ Title length valid (5-80 chars)
  ✓ Due date in future
  ✓ Priority matches urgency
  ✓ Required fields present

Confidence Check:
  ✓ Overall confidence: 0.94
  ✓ Above auto-execute threshold (0.85)
  ✓ No approval required

        ↓

Step 7: Publish to Action Queue
===============================
Action Payload:
{
  "id": "action_xyz789",
  "type": "create_task",
  "platform": "notion",
  "priority": "critical",
  "requiresApproval": false,
  "parameters": {
    "title": "Fix Production API 500 Errors on Auth Endpoint",
    "description": "...",
    "dueDate": "2025-10-17T14:30:00Z",
    "labels": ["bug", "critical", "backend", "api", "production"],
    "assignee": "backend-team",
    "urgency": "critical",
    "notifyChannel": "#incidents",
    "notifyOncall": true
  },
  "metadata": {
    "signalId": "sig_123",
    "confidence": 0.94,
    "processingTime": 4500 // 4.5 seconds total
  }
}

Sent to: Member 3's Action Orchestrator
Status: Queued for execution

        ↓

Step 8: Learning System Tracking
================================
Feedback Record Created:
{
  "signalId": "sig_123",
  "classification": { ... },
  "decision": { ... },
  "outcome": "pending", // Will be updated when action completes
  "timestamp": "2025-10-17T10:30:04Z"
}

Stored in: logs/feedback-history.jsonl
Awaiting: Action completion feedback

        ↓

Step 9: Dashboard Update
========================
Real-time Metrics Published:
{
  "currentProcessing": [
    {
      "signalId": "sig_123",
      "status": "publishing",
      "progress": 100,
      "classification": { ... },
      "decision": { ... }
    }
  ],
  "recentDecisions": [
    {
      "signalId": "sig_123",
      "action": "create_task",
      "confidence": 0.94,
      "outcome": "pending"
    }
  ],
  "performanceMetrics": {
    "totalProcessed": 1247,
    "avgProcessingTime": 4200,
    "accuracyRate": 0.91,
    "throughput": 18.5 // signals/minute
  }
}

Sent to: Member 4's Dashboard via WebSocket
Update Frequency: Real-time + 5-second polling fallback

========================
TOTAL PROCESSING TIME: 4.5 seconds
========================
```

---

## Related Documentation

- **Integration Guide**: See `docs/INTEGRATION.md` for detailed integration patterns
- **API Reference**: See `docs/API.md` for complete API documentation
- **Deployment Guide**: See `docs/DEPLOYMENT.md` for production deployment
- **Dashboard Provider**: See `docs/PROMPT-30-SUMMARY.md` for dashboard integration
- **Action Orchestrator**: See Member 3's documentation for action execution
- **Signal Sources**: See Member 1's documentation for input integrations

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-17 | Initial documentation | AI Ops Team |

---

**Last Updated**: October 17, 2025  
**Status**: Complete ✅  
**Reviewer**: Prompt 31 Implementation
