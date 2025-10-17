/**
 * Feedback Tracker Tests
 * 
 * Comprehensive end-to-end testing for the Decision Feedback Tracker
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { FeedbackTracker, getFeedbackTracker } from './feedback-tracker';
import type { 
  FeedbackRecord, 
  FeedbackOutcome, 
  FeedbackStats,
  LearningReport,
  LearningInsight,
  FeedbackExport
} from './feedback-tracker';
import type { 
  ReasoningResult, 
  PreprocessResult,
  ClassificationResult,
  DecisionResult,
  ParameterBuildResult
} from '../reasoning-pipeline';
import type { Signal } from '../reasoning/context-builder';
import type { SignalClassification } from '../classifier-agent';
import type { ActionDecision } from '../decision-agent';
import type { PreprocessedSignal } from '../preprocessing/signal-processor';

// ============================================================================
// Mock Helpers
// ============================================================================

/**
 * Create mock signal
 */
function createMockSignal(overrides?: Partial<Signal>): Signal {
  return {
    id: 'signal-123',
    source: 'email',
    timestamp: new Date().toISOString(),
    body: 'Test email body',
    subject: 'Test Subject',
    sender: 'test@example.com',
    ...overrides,
  };
}

/**
 * Create mock reasoning result
 */
function createMockReasoningResult(
  signalOverrides?: Partial<Signal>,
  confidence: number = 0.8,
  category: SignalClassification['category'] = 'request',
  action: ActionDecision['action'] = 'create_task'
): ReasoningResult {
  const signal = createMockSignal(signalOverrides);
  
  const preprocessed: PreprocessedSignal = {
    original: signal,
    cleaned: {
      subject: signal.subject || 'Test',
      body: signal.body,
      extractedData: {
        emails: [],
        phoneNumbers: [],
        urls: [],
        dates: [],
        times: [],
        monetaryAmounts: [],
        fileReferences: [],
        mentions: [],
      },
    },
    metadata: {
      wordCount: 10,
      hasAttachments: false,
      language: 'en',
      detectedLanguageConfidence: 0.95,
      sentenceCount: 2,
      hasQuotedReply: false,
      hasSignature: false,
      cleaningApplied: [],
    },
    entities: {
      people: [],
      dates: [],
      monetaryAmounts: [],
      urls: [],
      fileReferences: [],
      actionItems: [],
    },
  };
  
  const classification: SignalClassification = {
    category,
    urgency: 'medium',
    importance: 'medium',
    reasoning: 'Test reasoning',
    suggestedActions: ['create_task'],
    confidence,
    requiresImmediate: false,
  };
  
  const decision: ActionDecision = {
    decisionId: 'decision-123',
    signalId: signal.id,
    action,
    actionParams: { title: 'Test Task' },
    reasoning: 'Test decision reasoning',
    confidence,
    requiresApproval: false,
    validation: {
      valid: true,
      warnings: [],
      blockers: [],
      adjustments: {},
      validatedAt: new Date().toISOString(),
      rulesApplied: [],
    },
    timestamp: new Date().toISOString(),
    processingTime: 150,
  };
  
  const preprocessing: PreprocessResult = {
    signal: preprocessed,
    processingTime: 50,
    success: true,
  };
  
  const classificationResult: ClassificationResult = {
    classification,
    processingTime: 100,
    success: true,
    cached: false,
  };
  
  const decisionResult: DecisionResult = {
    decision,
    processingTime: 150,
    success: true,
  };
  
  return {
    signal,
    preprocessing,
    classification: classificationResult,
    decision: decisionResult,
    metadata: {
      processingTime: 300,
      confidence,
      cached: false,
      warningCount: 0,
      requiresHumanReview: false,
      status: 'success',
      stageTimings: {
        preprocessing: 50,
        classification: 100,
        caching: 0,
        decision: 150,
        task_extraction: 0,
        parameter_building: 0,
        validation: 0,
      },
    },
  };
}

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_FEEDBACK_FILE = path.join(__dirname, 'test-feedback.jsonl');
const TEST_CONFIG = {
  feedbackFilePath: TEST_FEEDBACK_FILE,
  enablePersistence: true,
  maxFeedbackInMemory: 100,
  insightThreshold: 3,
  confidenceThreshold: 0.7,
  autoGenerateInsights: false,
};

// ============================================================================
// Tests
// ============================================================================

async function runTests() {
  console.log('\n=== Feedback Tracker Tests ===\n');
  
  let testCount = 0;
  let passCount = 0;
  
  // Cleanup before tests
  try {
    await fs.unlink(TEST_FEEDBACK_FILE);
  } catch (e) {
    // File doesn't exist, that's fine
  }
  
  // Test 1: Record feedback
  testCount++;
  console.log(`Test ${testCount}: Record feedback for success outcome`);
  try {
    const tracker = FeedbackTracker.getInstance(TEST_CONFIG);
    await tracker.clearAllFeedback();
    
    const reasoningResult = createMockReasoningResult();
    const record = await tracker.recordFeedback(reasoningResult, 'success');
    
    if (!record.feedbackId) throw new Error('No feedbackId');
    if (record.outcome !== 'success') throw new Error('Wrong outcome');
    if (record.signalId !== 'signal-123') throw new Error('Wrong signalId');
    if (record.decision.action !== 'create_task') throw new Error('Wrong action');
    
    console.log('✓ Success feedback recorded correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 2: Record feedback with modifications
  testCount++;
  console.log(`Test ${testCount}: Record feedback with modifications`);
  try {
    const tracker = getFeedbackTracker();
    
    const reasoningResult = createMockReasoningResult();
    const modifications: Partial<ActionDecision> = {
      action: 'send_notification',
      actionParams: { title: 'Modified' },
    };
    
    const record = await tracker.recordFeedback(reasoningResult, 'modified', {
      modifications,
      userFeedback: 'Action should be notification, not task',
      reviewerId: 'user-1',
    });
    
    if (record.outcome !== 'modified') throw new Error('Wrong outcome');
    if (!record.modifications) throw new Error('No modifications');
    if (record.modifications.action !== 'send_notification') throw new Error('Wrong modified action');
    if (record.userFeedback !== 'Action should be notification, not task') throw new Error('Wrong feedback');
    if (record.reviewerId !== 'user-1') throw new Error('Wrong reviewerId');
    
    console.log('✓ Modified feedback recorded with modifications\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 3: Record feedback with error
  testCount++;
  console.log(`Test ${testCount}: Record feedback with error message`);
  try {
    const tracker = getFeedbackTracker();
    
    const reasoningResult = createMockReasoningResult();
    const record = await tracker.recordFeedback(reasoningResult, 'failure', {
      errorMessage: 'Task creation failed due to invalid parameters',
    });
    
    if (record.outcome !== 'failure') throw new Error('Wrong outcome');
    if (!record.errorMessage) throw new Error('No error message');
    if (record.errorMessage !== 'Task creation failed due to invalid parameters') throw new Error('Wrong error message');
    
    console.log('✓ Failure feedback recorded with error\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 4: Get feedback statistics
  testCount++;
  console.log(`Test ${testCount}: Get feedback statistics`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Record multiple feedback items
    await tracker.recordFeedback(createMockReasoningResult(), 'success');
    await tracker.recordFeedback(createMockReasoningResult(), 'success');
    await tracker.recordFeedback(createMockReasoningResult(), 'failure');
    await tracker.recordFeedback(createMockReasoningResult(), 'modified');
    await tracker.recordFeedback(createMockReasoningResult(), 'rejected');
    
    const stats = tracker.getFeedbackStats();
    
    if (stats.totalFeedback !== 5) throw new Error(`Expected 5 total, got ${stats.totalFeedback}`);
    if (stats.successCount !== 2) throw new Error(`Expected 2 success, got ${stats.successCount}`);
    if (stats.failureCount !== 1) throw new Error(`Expected 1 failure, got ${stats.failureCount}`);
    if (stats.modifiedCount !== 1) throw new Error(`Expected 1 modified, got ${stats.modifiedCount}`);
    if (stats.rejectedCount !== 1) throw new Error(`Expected 1 rejected, got ${stats.rejectedCount}`);
    if (Math.abs(stats.successRate - 40) > 0.1) throw new Error(`Expected 40% success rate, got ${stats.successRate}`);
    
    console.log('✓ Statistics calculated correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 5: Statistics by category
  testCount++;
  console.log(`Test ${testCount}: Statistics by category`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Record feedback for different categories
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'request'), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'request'), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'request'), 'failure');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'question'), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'question'), 'rejected');
    
    const stats = tracker.getFeedbackStats();
    
    if (!stats.successByCategory['request']) throw new Error('No request category stats');
    if (stats.successByCategory['request'].total !== 3) throw new Error('Wrong request total');
    if (stats.successByCategory['request'].success !== 2) throw new Error('Wrong request success count');
    if (Math.abs(stats.successByCategory['request'].successRate - 66.67) > 0.1) throw new Error('Wrong request success rate');
    
    if (!stats.successByCategory['question']) throw new Error('No question category stats');
    if (stats.successByCategory['question'].total !== 2) throw new Error('Wrong question total');
    if (stats.successByCategory['question'].success !== 1) throw new Error('Wrong question success count');
    
    console.log('✓ Category statistics calculated correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 6: Statistics by action
  testCount++;
  console.log(`Test ${testCount}: Statistics by action type`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Record feedback for different actions
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'request', 'create_task'), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'request', 'create_task'), 'modified');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'question', 'send_notification'), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'question', 'send_notification'), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'incident', 'escalate'), 'failure');
    
    const stats = tracker.getFeedbackStats();
    
    if (!stats.successByAction['create_task']) throw new Error('No create_task stats');
    if (stats.successByAction['create_task'].total !== 2) throw new Error('Wrong create_task total');
    if (stats.successByAction['create_task'].modified !== 1) throw new Error('Wrong modified count');
    
    if (!stats.successByAction['send_notification']) throw new Error('No send_notification stats');
    if (stats.successByAction['send_notification'].success !== 2) throw new Error('Wrong notification success');
    if (Math.abs(stats.successByAction['send_notification'].successRate - 100) > 0.1) throw new Error('Wrong notification rate');
    
    console.log('✓ Action statistics calculated correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 7: Confidence distribution
  testCount++;
  console.log(`Test ${testCount}: Confidence distribution statistics`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // High confidence (> 0.8)
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.9), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.85), 'failure');
    
    // Medium confidence (0.5-0.8)
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.7), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.6), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.65), 'failure');
    
    // Low confidence (< 0.5)
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.4), 'rejected');
    
    const stats = tracker.getFeedbackStats();
    
    if (stats.confidenceDistribution.high.total !== 2) throw new Error('Wrong high confidence count');
    if (stats.confidenceDistribution.medium.total !== 3) throw new Error('Wrong medium confidence count');
    if (stats.confidenceDistribution.low.total !== 1) throw new Error('Wrong low confidence count');
    
    if (Math.abs(stats.confidenceDistribution.high.successRate - 50) > 0.1) throw new Error('Wrong high confidence rate');
    if (Math.abs(stats.confidenceDistribution.medium.successRate - 66.67) > 0.1) throw new Error('Wrong medium confidence rate');
    
    console.log('✓ Confidence distribution calculated correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 8: Common failure reasons
  testCount++;
  console.log(`Test ${testCount}: Analyze common failure reasons`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    await tracker.recordFeedback(createMockReasoningResult(), 'failure', {
      errorMessage: 'Invalid parameters',
    });
    await tracker.recordFeedback(createMockReasoningResult(), 'failure', {
      errorMessage: 'Invalid parameters',
    });
    await tracker.recordFeedback(createMockReasoningResult(), 'failure', {
      errorMessage: 'Network timeout',
    });
    
    const stats = tracker.getFeedbackStats();
    
    if (stats.commonFailureReasons.length === 0) throw new Error('No failure reasons');
    if (stats.commonFailureReasons[0].reason !== 'Invalid parameters') throw new Error('Wrong top reason');
    if (stats.commonFailureReasons[0].count !== 2) throw new Error('Wrong reason count');
    
    console.log('✓ Failure reasons analyzed correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 9: Frequently modified actions
  testCount++;
  console.log(`Test ${testCount}: Analyze frequently modified actions`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'request', 'create_task'), 'modified');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'request', 'create_task'), 'modified');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'request', 'create_task'), 'modified');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'question', 'send_notification'), 'modified');
    
    const stats = tracker.getFeedbackStats();
    
    if (stats.frequentlyModifiedActions.length === 0) throw new Error('No modified actions');
    if (stats.frequentlyModifiedActions[0].action !== 'create_task') throw new Error('Wrong top action');
    if (stats.frequentlyModifiedActions[0].count !== 3) throw new Error('Wrong modification count');
    
    console.log('✓ Modified actions analyzed correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 10: Problem senders
  testCount++;
  console.log(`Test ${testCount}: Identify problem senders`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Sender with high failure rate
    await tracker.recordFeedback(createMockReasoningResult({ sender: 'bad@example.com' }), 'failure');
    await tracker.recordFeedback(createMockReasoningResult({ sender: 'bad@example.com' }), 'failure');
    await tracker.recordFeedback(createMockReasoningResult({ sender: 'bad@example.com' }), 'success');
    
    // Sender with good rate
    await tracker.recordFeedback(createMockReasoningResult({ sender: 'good@example.com' }), 'success');
    await tracker.recordFeedback(createMockReasoningResult({ sender: 'good@example.com' }), 'success');
    await tracker.recordFeedback(createMockReasoningResult({ sender: 'good@example.com' }), 'success');
    
    const stats = tracker.getFeedbackStats();
    
    if (stats.problemSenders.length === 0) throw new Error('No problem senders identified');
    if (stats.problemSenders[0].sender !== 'bad@example.com') throw new Error('Wrong problem sender');
    if (Math.abs(stats.problemSenders[0].failureRate - 66.67) > 0.1) throw new Error('Wrong failure rate');
    
    console.log('✓ Problem senders identified correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 11: Generate insights - urgent senders
  testCount++;
  console.log(`Test ${testCount}: Generate insights for urgent senders`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Sender with mostly urgent emails
    for (let i = 0; i < 5; i++) {
      const reasoningResult = createMockReasoningResult({ sender: 'urgent@example.com' });
      reasoningResult.classification.classification.urgency = 'high';
      await tracker.recordFeedback(reasoningResult, 'success');
    }
    
    const insights = await tracker.generateInsights();
    
    const urgentInsights = insights.filter(i => i.type === 'sender' && i.title.includes('urgent@example.com'));
    if (urgentInsights.length === 0) throw new Error('No urgent sender insight');
    if (!urgentInsights[0].recommendation.includes('priority')) throw new Error('Wrong recommendation');
    
    console.log('✓ Urgent sender insights generated\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 12: Generate insights - approval categories
  testCount++;
  console.log(`Test ${testCount}: Generate insights for approval categories`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Category that always needs approval
    for (let i = 0; i < 5; i++) {
      const reasoningResult = createMockReasoningResult(undefined, 0.8, 'incident');
      reasoningResult.decision.decision.requiresApproval = true;
      await tracker.recordFeedback(reasoningResult, 'success');
    }
    
    const insights = await tracker.generateInsights();
    
    const approvalInsights = insights.filter(i => i.type === 'decision' && i.title.includes('incident'));
    if (approvalInsights.length === 0) throw new Error('No approval category insight');
    if (!approvalInsights[0].recommendation.includes('approval')) throw new Error('Wrong recommendation');
    
    console.log('✓ Approval category insights generated\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 13: Generate insights - modified actions
  testCount++;
  console.log(`Test ${testCount}: Generate insights for frequently modified actions`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Action that's frequently modified
    for (let i = 0; i < 5; i++) {
      await tracker.recordFeedback(
        createMockReasoningResult(undefined, 0.8, 'request', 'ignore'),
        'modified'
      );
    }
    
    const insights = await tracker.generateInsights();
    
    const modifiedInsights = insights.filter(i => i.type === 'decision' && i.title.includes('ignore'));
    if (modifiedInsights.length === 0) throw new Error('No modified action insight');
    if (modifiedInsights[0].priority !== 'high') throw new Error('Should be high priority');
    
    console.log('✓ Modified action insights generated\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 14: Generate learning report
  testCount++;
  console.log(`Test ${testCount}: Generate learning report`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Create diverse feedback data
    for (let i = 0; i < 10; i++) {
      await tracker.recordFeedback(createMockReasoningResult(), i < 7 ? 'success' : 'failure');
    }
    
    const report = await tracker.generateLearningReport();
    
    if (!report.reportId) throw new Error('No report ID');
    if (report.summary.totalFeedback !== 10) throw new Error('Wrong total feedback');
    if (Math.abs(report.summary.overallSuccessRate - 70) > 0.1) throw new Error('Wrong success rate');
    if (!report.insights) throw new Error('No insights');
    if (!report.patterns) throw new Error('No patterns');
    if (!report.recommendations) throw new Error('No recommendations');
    
    console.log('✓ Learning report generated correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 15: Export for retraining
  testCount++;
  console.log(`Test ${testCount}: Export feedback for retraining`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    // Create varied feedback
    await tracker.recordFeedback(createMockReasoningResult({ subject: 'Success 1' }, 0.9), 'success');
    await tracker.recordFeedback(createMockReasoningResult({ subject: 'Success 2' }, 0.85), 'success');
    await tracker.recordFeedback(createMockReasoningResult({ subject: 'Failure' }, 0.7), 'failure', {
      errorMessage: 'Test error',
    });
    await tracker.recordFeedback(createMockReasoningResult({ subject: 'Modified' }, 0.75), 'modified', {
      modifications: { action: 'send_notification' },
      userFeedback: 'Should be different',
    });
    await tracker.recordFeedback(createMockReasoningResult({ subject: 'Rejected' }, 0.6), 'rejected');
    
    const exportData = await tracker.exportForRetraining({
      minConfidence: 0.7,
      includeRejected: false,
    });
    
    if (!exportData.exportId) throw new Error('No export ID');
    if (exportData.successfulExamples.length !== 2) throw new Error('Wrong success count');
    if (exportData.failedExamples.length !== 1) throw new Error('Wrong failure count');
    if (exportData.modifiedExamples.length !== 1) throw new Error('Wrong modified count');
    if (exportData.recordCount !== 4) throw new Error('Wrong total (should exclude rejected)');
    
    if (!exportData.modifiedExamples[0].userFeedback) throw new Error('Missing user feedback');
    if (!exportData.failedExamples[0].errorReason) throw new Error('Missing error reason');
    
    console.log('✓ Export for retraining generated correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 16: JSONL persistence
  testCount++;
  console.log(`Test ${testCount}: JSONL persistence`);
  try {
    // Cleanup first
    try {
      await fs.unlink(TEST_FEEDBACK_FILE);
    } catch (e) {
      // File doesn't exist, that's fine
    }
    
    const tracker = FeedbackTracker.getInstance({
      ...TEST_CONFIG,
      enablePersistence: true,
    });
    await tracker.clearAllFeedback();
    
    // Record some feedback
    await tracker.recordFeedback(createMockReasoningResult(), 'success');
    await tracker.recordFeedback(createMockReasoningResult(), 'failure');
    
    // Wait a bit for file write
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check file exists
    const fileContent = await fs.readFile(TEST_FEEDBACK_FILE, 'utf-8');
    const lines = fileContent.trim().split('\n');
    
    if (lines.length !== 2) throw new Error('Wrong number of lines');
    
    const record1 = JSON.parse(lines[0]);
    const record2 = JSON.parse(lines[1]);
    
    if (!record1.feedbackId) throw new Error('No feedbackId in line 1');
    if (!record2.feedbackId) throw new Error('No feedbackId in line 2');
    if (record1.outcome !== 'success') throw new Error('Wrong outcome in line 1');
    if (record2.outcome !== 'failure') throw new Error('Wrong outcome in line 2');
    
    console.log('✓ JSONL persistence works correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 17: Load from JSONL
  testCount++;
  console.log(`Test ${testCount}: Load feedback from JSONL file`);
  try {
    // Create new tracker that should load from file
    const newTracker = FeedbackTracker.getInstance({
      ...TEST_CONFIG,
      enablePersistence: true,
    });
    
    // Wait for async load
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const stats = newTracker.getFeedbackStats();
    
    if (stats.totalFeedback < 2) throw new Error('Feedback not loaded from file');
    
    console.log('✓ Feedback loaded from JSONL correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 18: Filter feedback
  testCount++;
  console.log(`Test ${testCount}: Filter feedback by various criteria`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.9, 'request'), 'success');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.8, 'question'), 'failure');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.7, 'request'), 'modified');
    await tracker.recordFeedback(createMockReasoningResult(undefined, 0.4, 'incident'), 'rejected');
    
    // Filter by outcome
    const successRecords = tracker.getAllFeedback({ outcome: 'success' });
    if (successRecords.length !== 1) throw new Error('Wrong success filter count');
    
    // Filter by category
    const taskRecords = tracker.getAllFeedback({ category: 'request' });
    if (taskRecords.length !== 2) throw new Error('Wrong category filter count');
    
    // Filter by confidence
    const highConfRecords = tracker.getAllFeedback({ minConfidence: 0.75 });
    if (highConfRecords.length !== 2) throw new Error('Wrong confidence filter count');
    
    console.log('✓ Filtering works correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 19: Stats caching
  testCount++;
  console.log(`Test ${testCount}: Statistics caching`);
  try {
    const tracker = getFeedbackTracker();
    await tracker.clearAllFeedback();
    
    await tracker.recordFeedback(createMockReasoningResult(), 'success');
    
    const stats1 = tracker.getFeedbackStats();
    const stats2 = tracker.getFeedbackStats();
    
    // Should return same object (cached)
    if (stats1 !== stats2) throw new Error('Stats not cached');
    
    // After new feedback, cache should be invalidated
    await tracker.recordFeedback(createMockReasoningResult(), 'failure');
    const stats3 = tracker.getFeedbackStats();
    
    if (stats1 === stats3) throw new Error('Cache not invalidated');
    if (stats3.totalFeedback !== 2) throw new Error('Wrong total after cache invalidation');
    
    console.log('✓ Statistics caching works correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Test 20: Memory limit enforcement
  testCount++;
  console.log(`Test ${testCount}: Enforce memory limit`);
  try {
    const smallLimitTracker = FeedbackTracker.getInstance({
      ...TEST_CONFIG,
      maxFeedbackInMemory: 5,
      enablePersistence: false,
    });
    await smallLimitTracker.clearAllFeedback();
    
    // Add more feedback than limit
    for (let i = 0; i < 10; i++) {
      await smallLimitTracker.recordFeedback(createMockReasoningResult(), 'success');
    }
    
    const stats = smallLimitTracker.getFeedbackStats();
    
    // Should only have 5 in memory
    if (stats.totalFeedback !== 5) throw new Error(`Expected 5 in memory, got ${stats.totalFeedback}`);
    
    console.log('✓ Memory limit enforced correctly\n');
    passCount++;
  } catch (error) {
    console.log(`✗ Failed: ${error}\n`);
  }
  
  // Cleanup
  try {
    await fs.unlink(TEST_FEEDBACK_FILE);
  } catch (e) {
    // Ignore cleanup errors
  }
  
  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testCount}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${testCount - passCount}`);
  console.log(`Success Rate: ${((passCount / testCount) * 100).toFixed(1)}%\n`);
  
  if (passCount === testCount) {
    console.log('✓ All tests passed!\n');
  } else {
    console.log('✗ Some tests failed\n');
    process.exit(1);
  }
}

// Run tests
runTests().catch((error) => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
