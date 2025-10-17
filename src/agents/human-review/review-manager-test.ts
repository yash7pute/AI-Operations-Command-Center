/**
 * Human-in-the-Loop Review Manager Tests
 * 
 * Tests the review management system for human approval workflows.
 */

import { 
  ReviewManager, 
  getReviewManager,
  queueForReview,
  getReviewQueue,
  approveAction,
  rejectAction,
  getReviewStats,
  type ReviewItem,
  type ReviewReason,
  type RiskLevel,
} from './review-manager';
import type { ReasoningResult } from '../reasoning-pipeline';
import type { Signal } from '../reasoning/context-builder';

// ==================== Test Configuration ====================

const TEST_CONFIG = {
  queueFilePath: './data/test-review-queue.json',
  persistToDisk: false, // Disable for tests
  enableAutoExpiration: true,
  lowRiskExpirationMs: 100, // 100ms for testing
  mediumRiskExpirationMs: 200,
  highRiskExpirationMs: 500,
  enableSlackNotifications: false, // Disable for tests
  slackChannel: '#test-review',
  slackWebhookUrl: '',
  dashboardBaseUrl: 'http://localhost:3000',
  maxQueueSize: 100,
  cleanupInterval: 10000,
};

// ==================== Mock Data Helpers ====================

function createMockSignal(overrides?: Partial<Signal>): Signal {
  return {
    id: `signal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    source: 'email',
    subject: 'Test Signal Subject',
    body: 'This is a test signal body with some content.',
    sender: 'test@example.com',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function createMockReasoningResult(
  signalOverrides?: Partial<Signal>,
  confidence: number = 0.8
): ReasoningResult {
  const signal = createMockSignal(signalOverrides);
  
  return {
    signal,
    preprocessing: {
      signal: {
        original: signal,
        cleaned: {
          subject: signal.subject || '',
          body: signal.body || '',
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
        entities: {
          people: [],
          dates: [],
          monetaryAmounts: [],
          urls: [],
          fileReferences: [],
          actionItems: [],
        },
        metadata: {
          wordCount: 10,
          hasAttachments: false,
          language: 'en',
          detectedLanguageConfidence: 0.95,
          sentenceCount: 2,
          hasQuotedReply: false,
          hasSignature: false,
          cleaningApplied: ['whitespace', 'formatting'],
        },
      },
      processingTime: 10,
      success: true,
    },
    classification: {
      classification: {
        category: 'request',
        urgency: 'medium',
        importance: 'medium',
        confidence: confidence,
        reasoning: 'Test classification',
        suggestedActions: ['create_task'],
        requiresImmediate: false,
      },
      processingTime: 50,
      success: true,
      cached: false,
    },
    decision: {
      decision: {
        decisionId: `decision-${Date.now()}`,
        signalId: signal.id,
        action: 'create_task',
        actionParams: {},
        requiresApproval: confidence < 0.7,
        reasoning: 'Test decision',
        confidence: confidence,
        timestamp: new Date().toISOString(),
        validation: {
          valid: true,
          warnings: [],
          blockers: [],
          adjustments: {},
          validatedAt: new Date().toISOString(),
          rulesApplied: [],
        },
        processingTime: 100,
      },
      processingTime: 100,
      success: true,
    },
    metadata: {
      processingTime: 160,
      confidence: confidence,
      cached: false,
      warningCount: 0,
      requiresHumanReview: confidence < 0.7,
      status: 'success',
      stageTimings: {
        preprocessing: 10,
        classification: 50,
        caching: 0,
        decision: 100,
        task_extraction: 0,
        parameter_building: 0,
        validation: 0,
      },
    },
  };
}

// ==================== Test Suite ====================

async function runTests() {
  console.log('\n========================================');
  console.log('Human-in-the-Loop Review Manager Tests');
  console.log('========================================\n');
  
  let passedTests = 0;
  let totalTests = 0;
  
  // Helper function to run a test
  async function test(name: string, fn: () => Promise<void>) {
    totalTests++;
    try {
      await fn();
      console.log(`✓ Test ${totalTests}: ${name}`);
      passedTests++;
    } catch (error) {
      console.error(`✗ Test ${totalTests}: ${name}`);
      console.error(`  Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  // Get a fresh manager instance for testing
  const manager = ReviewManager.getInstance(TEST_CONFIG);
  
  // Test 1: Queue item for review
  await test('Queue item for review', async () => {
    const reasoningResult = createMockReasoningResult(
      { subject: 'Low confidence decision' },
      0.6 // Low confidence
    );
    
    const reasons: ReviewReason[] = ['low_confidence'];
    const reviewItem = await manager.queueForReview(reasoningResult, reasons);
    
    if (!reviewItem.reviewId) {
      throw new Error('Review ID not generated');
    }
    if (reviewItem.status !== 'pending') {
      throw new Error('Review status should be pending');
    }
    if (reviewItem.riskLevel !== 'medium') {
      throw new Error('Risk level should be medium for confidence 0.6');
    }
    if (!reviewItem.reviewUrl) {
      throw new Error('Review URL not generated');
    }
  });
  
  // Test 2: Get review queue
  await test('Get review queue', async () => {
    const queue = manager.getReviewQueue();
    
    if (queue.length === 0) {
      throw new Error('Queue should have at least one item');
    }
    if (queue[0].status !== 'pending') {
      throw new Error('First item should be pending');
    }
  });
  
  // Test 3: Get review queue filtered by status
  await test('Get review queue filtered by status', async () => {
    const pendingQueue = manager.getReviewQueue({ status: 'pending' });
    
    if (pendingQueue.length === 0) {
      throw new Error('Should have pending items');
    }
    
    const allPending = pendingQueue.every(item => item.status === 'pending');
    if (!allPending) {
      throw new Error('All items should be pending');
    }
  });
  
  // Test 4: Queue high-impact item
  await test('Queue high-impact item', async () => {
    const reasoningResult = createMockReasoningResult(
      { subject: 'Financial transaction requires approval' },
      0.9
    );
    
    const reasons: ReviewReason[] = ['high_impact', 'requires_approval'];
    const reviewItem = await manager.queueForReview(reasoningResult, reasons);
    
    if (reviewItem.riskLevel !== 'critical') {
      throw new Error('High-impact items should be critical risk');
    }
    if (reviewItem.reason.length !== 2) {
      throw new Error('Should have 2 reasons');
    }
  });
  
  // Test 5: Approve action without modifications
  await test('Approve action without modifications', async () => {
    const queue = manager.getReviewQueue({ status: 'pending' });
    if (queue.length === 0) {
      throw new Error('Need items in queue to test approval');
    }
    
    const reviewId = queue[0].reviewId;
    const approvedItem = await manager.approveAction(reviewId, 'test-approver@example.com');
    
    if (approvedItem.status !== 'approved') {
      throw new Error('Item should be approved');
    }
    if (approvedItem.approver !== 'test-approver@example.com') {
      throw new Error('Approver should be set');
    }
    if (!approvedItem.reviewedAt) {
      throw new Error('Reviewed timestamp should be set');
    }
  });
  
  // Test 6: Approve action with modifications
  await test('Approve action with modifications', async () => {
    const reasoningResult = createMockReasoningResult(
      { subject: 'Needs approval with changes' },
      0.65
    );
    
    const reviewItem = await manager.queueForReview(reasoningResult, ['low_confidence']);
    
    const modifications = {
      action: 'escalate' as const,
      reasoning: 'Modified by human reviewer',
    };
    
    const approvedItem = await manager.approveAction(
      reviewItem.reviewId,
      'test-approver@example.com',
      modifications
    );
    
    if (!approvedItem.modifications) {
      throw new Error('Modifications should be present');
    }
    if (approvedItem.modifications.action !== 'escalate') {
      throw new Error('Action should be modified');
    }
  });
  
  // Test 7: Reject action
  await test('Reject action', async () => {
    const reasoningResult = createMockReasoningResult(
      { subject: 'This should be rejected' },
      0.5
    );
    
    const reviewItem = await manager.queueForReview(
      reasoningResult, 
      ['conflicting_classification']
    );
    
    const rejectedItem = await manager.rejectAction(
      reviewItem.reviewId,
      'test-reviewer@example.com',
      'Not appropriate action for this signal'
    );
    
    if (rejectedItem.status !== 'rejected') {
      throw new Error('Item should be rejected');
    }
    if (!rejectedItem.rejectionReason) {
      throw new Error('Rejection reason should be set');
    }
    if (rejectedItem.reviewer !== 'test-reviewer@example.com') {
      throw new Error('Reviewer should be set');
    }
  });
  
  // Test 8: Auto-expire low-risk item
  await test('Auto-expire low-risk item', async () => {
    const reasoningResult = createMockReasoningResult(
      { subject: 'Low risk item - will auto-expire' },
      0.8
    );
    
    const reviewItem = await manager.queueForReview(
      reasoningResult, 
      ['requires_approval'],
      'low' // Explicit low risk
    );
    
    // Wait for expiration (100ms)
    await new Promise(resolve => setTimeout(resolve, 150));
    
    const { autoApproved, autoRejected } = await manager.autoExpire();
    
    const wasAutoApproved = autoApproved.some(item => item.reviewId === reviewItem.reviewId);
    if (!wasAutoApproved) {
      throw new Error('Low-risk item should be auto-approved after expiration');
    }
    
    const updatedItem = manager.getReviewItem(reviewItem.reviewId);
    if (!updatedItem || updatedItem.status !== 'auto_approved') {
      throw new Error('Item status should be auto_approved');
    }
  });
  
  // Test 9: Auto-expire time-sensitive item (reject)
  await test('Auto-expire time-sensitive item (reject)', async () => {
    const reasoningResult = createMockReasoningResult(
      { subject: 'URGENT: Time-sensitive task with deadline' },
      0.4 // Low confidence -> high risk
    );
    
    const reviewItem = await manager.queueForReview(
      reasoningResult,
      ['low_confidence', 'high_impact'],
      'high'
    );
    
    // Wait for expiration (500ms for high risk)
    await new Promise(resolve => setTimeout(resolve, 550));
    
    const { autoApproved, autoRejected } = await manager.autoExpire();
    
    const wasAutoRejected = autoRejected.some(item => item.reviewId === reviewItem.reviewId);
    if (!wasAutoRejected) {
      throw new Error('Time-sensitive high-risk item should be auto-rejected');
    }
    
    const updatedItem = manager.getReviewItem(reviewItem.reviewId);
    if (!updatedItem || updatedItem.status !== 'auto_rejected') {
      throw new Error('Item status should be auto_rejected');
    }
  });
  
  // Test 10: Review queue sorting by urgency
  await test('Review queue sorting by urgency', async () => {
    // Clear queue first
    await manager.clearCompletedReviews();
    
    // Queue items with different risk levels
    await manager.queueForReview(
      createMockReasoningResult({ subject: 'Low risk' }, 0.8),
      ['requires_approval'],
      'low'
    );
    
    await manager.queueForReview(
      createMockReasoningResult({ subject: 'Critical risk' }, 0.5),
      ['high_impact'],
      'critical'
    );
    
    await manager.queueForReview(
      createMockReasoningResult({ subject: 'Medium risk' }, 0.7),
      ['low_confidence'],
      'medium'
    );
    
    await manager.queueForReview(
      createMockReasoningResult({ subject: 'High risk' }, 0.6),
      ['conflicting_classification'],
      'high'
    );
    
    const queue = manager.getReviewQueue({ status: 'pending' });
    
    if (queue.length < 4) {
      throw new Error('Should have at least 4 items');
    }
    
    // Check order: critical > high > medium > low
    if (queue[0].riskLevel !== 'critical') {
      throw new Error('First item should be critical');
    }
    if (queue[1].riskLevel !== 'high') {
      throw new Error('Second item should be high');
    }
    if (queue[2].riskLevel !== 'medium') {
      throw new Error('Third item should be medium');
    }
    if (queue[3].riskLevel !== 'low') {
      throw new Error('Fourth item should be low');
    }
  });
  
  // Test 11: Review statistics
  await test('Review statistics', async () => {
    const stats = manager.getReviewStats();
    
    if (stats.queueDepth === 0) {
      throw new Error('Queue depth should be > 0');
    }
    if (stats.pendingCount < 0) {
      throw new Error('Pending count should be >= 0');
    }
    if (stats.approvedCount < 0) {
      throw new Error('Approved count should be >= 0');
    }
    if (stats.rejectedCount < 0) {
      throw new Error('Rejected count should be >= 0');
    }
    if (!stats.since) {
      throw new Error('Stats should have start time');
    }
    if (!stats.lastUpdated) {
      throw new Error('Stats should have last updated time');
    }
    
    // Check distributions
    if (!stats.riskDistribution) {
      throw new Error('Risk distribution should be present');
    }
    if (!stats.reasonDistribution) {
      throw new Error('Reason distribution should be present');
    }
    
    // Check rates
    if (stats.approvalRate < 0 || stats.approvalRate > 100) {
      throw new Error('Approval rate should be between 0 and 100');
    }
  });
  
  // Test 12: Filter queue by risk level
  await test('Filter queue by risk level', async () => {
    const criticalItems = manager.getReviewQueue({ riskLevel: 'critical' });
    
    const allCritical = criticalItems.every(item => item.riskLevel === 'critical');
    if (!allCritical) {
      throw new Error('All filtered items should be critical');
    }
  });
  
  // Test 13: Filter queue by reason
  await test('Filter queue by reason', async () => {
    const highImpactItems = manager.getReviewQueue({ reason: 'high_impact' });
    
    const allHaveReason = highImpactItems.every(item => 
      item.reason.includes('high_impact')
    );
    if (!allHaveReason) {
      throw new Error('All filtered items should have high_impact reason');
    }
  });
  
  // Test 14: Reject already processed item (should fail)
  await test('Reject already processed item (should fail)', async () => {
    const approvedQueue = manager.getReviewQueue({ status: 'approved' });
    if (approvedQueue.length === 0) {
      // Skip this test if no approved items
      return;
    }
    
    const reviewId = approvedQueue[0].reviewId;
    
    try {
      await manager.rejectAction(reviewId, 'test@example.com', 'Should fail');
      throw new Error('Should not allow rejecting already approved item');
    } catch (error) {
      if (error instanceof Error && !error.message.includes('already approved')) {
        throw error;
      }
      // Expected error
    }
  });
  
  // Test 15: Clear completed reviews
  await test('Clear completed reviews', async () => {
    const initialQueueSize = manager.getReviewQueue().length;
    const clearedCount = await manager.clearCompletedReviews();
    
    const newQueueSize = manager.getReviewQueue().length;
    
    if (newQueueSize !== manager.getReviewQueue({ status: 'pending' }).length) {
      throw new Error('Queue should only contain pending items after clearing');
    }
    
    if (clearedCount < 0) {
      throw new Error('Cleared count should be >= 0');
    }
  });
  
  // Test 16: Convenience functions
  await test('Convenience functions', async () => {
    const reasoningResult = createMockReasoningResult(
      { subject: 'Test convenience functions' },
      0.65
    );
    
    // Test queueForReview function
    const reviewItem = await queueForReview(
      reasoningResult,
      ['low_confidence']
    );
    
    if (!reviewItem.reviewId) {
      throw new Error('queueForReview should return review item');
    }
    
    // Test getReviewQueue function
    const queue = getReviewQueue();
    if (queue.length === 0) {
      throw new Error('getReviewQueue should return items');
    }
    
    // Test approveAction function
    const approved = await approveAction(
      reviewItem.reviewId,
      'test@example.com'
    );
    if (approved.status !== 'approved') {
      throw new Error('approveAction should approve item');
    }
    
    // Test getReviewStats function
    const stats = getReviewStats();
    if (!stats.queueDepth) {
      throw new Error('getReviewStats should return stats with queueDepth');
    }
  });
  
  // Test 17: Risk level determination
  await test('Risk level determination', async () => {
    // Test critical risk
    const criticalResult = createMockReasoningResult({ subject: 'Critical' }, 0.8);
    const criticalItem = await manager.queueForReview(
      criticalResult,
      ['high_impact', 'policy_violation']
    );
    if (criticalItem.riskLevel !== 'critical') {
      throw new Error('Should be critical risk for high_impact + policy_violation');
    }
    
    // Test high risk
    const highResult = createMockReasoningResult({ subject: 'High' }, 0.4);
    const highItem = await manager.queueForReview(
      highResult,
      ['conflicting_classification']
    );
    if (highItem.riskLevel !== 'high') {
      throw new Error('Should be high risk for low confidence + conflicting');
    }
    
    // Test medium risk
    const mediumResult = createMockReasoningResult({ subject: 'Medium' }, 0.6);
    const mediumItem = await manager.queueForReview(
      mediumResult,
      ['low_confidence']
    );
    if (mediumItem.riskLevel !== 'medium') {
      throw new Error('Should be medium risk for confidence 0.6');
    }
    
    // Test low risk
    const lowResult = createMockReasoningResult({ subject: 'Low' }, 0.9);
    const lowItem = await manager.queueForReview(
      lowResult,
      ['requires_approval']
    );
    if (lowItem.riskLevel !== 'low') {
      throw new Error('Should be low risk for high confidence');
    }
  });
  
  // ==================== Summary ====================
  
  console.log('\n========================================');
  console.log('Test Summary');
  console.log('========================================');
  console.log(`Total Tests: ${totalTests}`);
  console.log(`Passed: ${passedTests}`);
  console.log(`Failed: ${totalTests - passedTests}`);
  console.log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('========================================\n');
  
  // Final stats
  const finalStats = manager.getReviewStats();
  console.log('Final Review Queue Statistics:');
  console.log(`  Queue Depth: ${finalStats.queueDepth}`);
  console.log(`  Pending: ${finalStats.pendingCount}`);
  console.log(`  Approved: ${finalStats.approvedCount}`);
  console.log(`  Rejected: ${finalStats.rejectedCount}`);
  console.log(`  Auto-Approved: ${finalStats.autoApprovedCount}`);
  console.log(`  Auto-Rejected: ${finalStats.autoRejectedCount}`);
  console.log(`  Approval Rate: ${finalStats.approvalRate.toFixed(1)}%`);
  console.log(`  Average Wait Time: ${(finalStats.averageWaitTime / 1000).toFixed(2)}s`);
  console.log('\nRisk Distribution:');
  Object.entries(finalStats.riskDistribution).forEach(([risk, count]) => {
    console.log(`  ${risk}: ${count}`);
  });
  console.log('\nReason Distribution:');
  Object.entries(finalStats.reasonDistribution).forEach(([reason, count]) => {
    if (count > 0) {
      console.log(`  ${reason}: ${count}`);
    }
  });
  
  // Cleanup
  await manager.shutdown();
  
  process.exit(passedTests === totalTests ? 0 : 1);
}

// Run tests
runTests().catch((error) => {
  console.error('Test execution failed:', error);
  process.exit(1);
});
