/**
 * Reasoning Pipeline Test Suite
 * Tests the complete end-to-end reasoning flow
 */

import { 
    getReasoningPipeline,
    processSignal,
    processBatch,
    getPipelineMetrics,
    resetPipelineMetrics,
    type PipelineOptions,
} from './reasoning-pipeline';
import type { Signal } from './reasoning/context-builder';

// Test helper to create mock signals
function createMockSignal(overrides: Partial<Signal> = {}): Signal {
    return {
        id: `signal-${Date.now()}-${Math.random()}`,
        source: 'email',
        subject: 'Test Signal',
        body: 'This is a test signal body for pipeline testing',
        sender: 'test@example.com',
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

async function runTests() {
    console.log('=== Reasoning Pipeline Test Suite ===\n');

    const pipeline = getReasoningPipeline();
    let testsPassed = 0;
    let testsFailed = 0;

    // Reset metrics before tests
    resetPipelineMetrics();

    // Test 1: Basic Pipeline Flow
    console.log('Test 1: Complete pipeline flow with normal signal');
    try {
        const signal = createMockSignal({
            subject: 'Review Q4 Budget',
            body: 'Please review and approve the Q4 budget proposal. We need this completed by end of week.',
            sender: 'finance@company.com',
        });

        const result = await pipeline.processSignal(signal);

        console.log('Pipeline result:', {
            status: result.metadata.status,
            processingTime: result.metadata.processingTime,
            confidence: result.metadata.confidence.toFixed(2),
            requiresReview: result.metadata.requiresHumanReview,
            action: result.decision.decision.action,
            cached: result.metadata.cached,
        });

        if (result.metadata.status && result.decision.success) {
            console.log('✅ Test 1 passed - Pipeline completed successfully\n');
            testsPassed++;
        } else {
            console.log('❌ Test 1 failed - Pipeline did not complete\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 1 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 2: Cache Hit on Second Request
    console.log('Test 2: Cache hit for similar signal');
    try {
        const signal1 = createMockSignal({
            subject: 'Duplicate Test',
            body: 'This is a duplicate signal for cache testing',
        });

        // First request
        const result1 = await pipeline.processSignal(signal1);
        const firstCached = result1.metadata.cached;

        // Second request with same content
        const signal2 = createMockSignal({
            subject: 'Duplicate Test',
            body: 'This is a duplicate signal for cache testing',
        });

        const result2 = await pipeline.processSignal(signal2);
        const secondCached = result2.metadata.cached;

        console.log('Cache status:', {
            firstRequest: firstCached ? 'cached' : 'fresh',
            secondRequest: secondCached ? 'cached' : 'fresh',
        });

        if (!firstCached && secondCached) {
            console.log('✅ Test 2 passed - Cache working correctly\n');
            testsPassed++;
        } else {
            console.log('❌ Test 2 failed - Cache not working as expected\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 2 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 3: Skip Preprocessing Option
    console.log('Test 3: Skip preprocessing option');
    try {
        const signal = createMockSignal();

        const options: PipelineOptions = {
            skipPreprocessing: true,
        };

        const result = await pipeline.processSignal(signal, options);

        console.log('Preprocessing result:', {
            success: result.preprocessing.success,
            time: result.preprocessing.processingTime,
        });

        if (result.preprocessing.processingTime === 0) {
            console.log('✅ Test 3 passed - Preprocessing skipped\n');
            testsPassed++;
        } else {
            console.log('❌ Test 3 failed - Preprocessing not skipped\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 3 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 4: Batch Processing
    console.log('Test 4: Batch processing multiple signals');
    try {
        const signals: Signal[] = [
            createMockSignal({
                id: 'batch-1',
                subject: 'Meeting Request',
                body: 'Can we schedule a meeting for next week?',
            }),
            createMockSignal({
                id: 'batch-2',
                subject: 'Bug Report',
                body: 'Found a critical bug in production',
            }),
            createMockSignal({
                id: 'batch-3',
                subject: 'Status Update',
                body: 'Weekly project status update',
            }),
        ];

        const result = await pipeline.processBatch(signals);

        console.log('Batch result:', {
            total: result.stats.total,
            successful: result.stats.successful,
            failed: result.stats.failed,
            avgTime: result.stats.avgProcessingTime.toFixed(0) + 'ms',
            totalTime: result.totalTime + 'ms',
        });

        if (result.stats.successful === 3) {
            console.log('✅ Test 4 passed - Batch processing successful\n');
            testsPassed++;
        } else {
            console.log('❌ Test 4 failed - Not all signals processed\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 4 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 5: Stage Timings
    console.log('Test 5: Stage timing tracking');
    try {
        const signal = createMockSignal();
        const result = await pipeline.processSignal(signal);

        const timings = result.metadata.stageTimings;
        console.log('Stage timings:', {
            preprocessing: timings.preprocessing + 'ms',
            classification: timings.classification + 'ms',
            decision: timings.decision + 'ms',
            paramBuilding: timings.parameter_building + 'ms',
            total: result.metadata.processingTime + 'ms',
        });

        const hasTimings = 
            timings.preprocessing >= 0 &&
            timings.classification >= 0 &&
            timings.decision >= 0;

        if (hasTimings) {
            console.log('✅ Test 5 passed - Stage timings tracked\n');
            testsPassed++;
        } else {
            console.log('❌ Test 5 failed - Stage timings missing\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 5 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 6: Pipeline Metrics
    console.log('Test 6: Pipeline metrics tracking');
    try {
        const metrics = getPipelineMetrics();

        console.log('Pipeline metrics:', {
            totalProcessed: metrics.totalProcessed,
            successful: metrics.successful,
            avgConfidence: metrics.avgConfidence.toFixed(2),
            cacheHitRate: (metrics.cacheHitRate * 100).toFixed(1) + '%',
        });

        if (metrics.totalProcessed > 0) {
            console.log('✅ Test 6 passed - Metrics tracked correctly\n');
            testsPassed++;
        } else {
            console.log('❌ Test 6 failed - No metrics recorded\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 6 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 7: High Urgency Signal
    console.log('Test 7: High urgency signal handling');
    try {
        const signal = createMockSignal({
            subject: 'URGENT: Production Outage',
            body: 'Our production servers are down. Immediate action required!',
            sender: 'ops@company.com',
        });

        const result = await pipeline.processSignal(signal);

        console.log('High urgency result:', {
            classification: result.classification.classification.category,
            urgency: result.classification.classification.urgency,
            action: result.decision.decision.action,
            requiresApproval: result.decision.decision.requiresApproval,
        });

        if (result.classification.classification.urgency === 'critical' || 
            result.classification.classification.urgency === 'high') {
            console.log('✅ Test 7 passed - High urgency detected\n');
            testsPassed++;
        } else {
            console.log('❌ Test 7 failed - Urgency not properly classified\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 7 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 8: Task Details Extraction
    console.log('Test 8: Task details extraction for task creation');
    try {
        const signal = createMockSignal({
            subject: 'Create Documentation',
            body: 'We need to create comprehensive documentation for the new API. This should be completed by end of month.',
        });

        const result = await pipeline.processSignal(signal);

        console.log('Task extraction:', {
            hasTaskDetails: !!result.taskDetails,
            action: result.decision.decision.action,
            hasParams: !!result.actionParams,
        });

        if (result.decision.decision.action === 'create_task' && result.taskDetails) {
            console.log('✅ Test 8 passed - Task details extracted\n');
            testsPassed++;
        } else {
            console.log('❌ Test 8 failed - Task details not extracted properly\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 8 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 9: Action Parameters Building
    console.log('Test 9: Platform-specific parameters built');
    try {
        const signal = createMockSignal({
            subject: 'Review Code Changes',
            body: 'Please review the recent code changes in the PR',
        });

        const result = await pipeline.processSignal(signal, {
            targetPlatform: 'notion',
        });

        console.log('Parameter building:', {
            success: result.actionParams?.success,
            platform: result.actionParams?.platform,
            hasParams: !!result.actionParams?.params,
            warnings: result.actionParams?.warnings?.length || 0,
        });

        if (result.actionParams?.success && result.actionParams.params) {
            console.log('✅ Test 9 passed - Parameters built successfully\n');
            testsPassed++;
        } else {
            console.log('❌ Test 9 failed - Parameters not built\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 9 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 10: Convenience Functions
    console.log('Test 10: Convenience functions work');
    try {
        const signal = createMockSignal();

        // Test processSignal convenience function
        const result = await processSignal(signal);

        // Test getPipelineMetrics convenience function
        const metrics = getPipelineMetrics();

        if (result && metrics) {
            console.log('✅ Test 10 passed - Convenience functions work\n');
            testsPassed++;
        } else {
            console.log('❌ Test 10 failed - Convenience functions not working\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 10 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 11: Error Handling
    console.log('Test 11: Graceful error handling');
    try {
        // Create a signal that might cause issues
        const signal = createMockSignal({
            subject: '',
            body: '',
        });

        const result = await pipeline.processSignal(signal);

        console.log('Error handling:', {
            status: result.metadata.status,
            hasErrors: !!result.errors,
            errorCount: result.errors?.length || 0,
            requiresReview: result.metadata.requiresHumanReview,
        });

        // Pipeline should not crash and should flag for review
        if (result.metadata.status && result.metadata.requiresHumanReview) {
            console.log('✅ Test 11 passed - Errors handled gracefully\n');
            testsPassed++;
        } else {
            console.log('❌ Test 11 failed - Error handling not working\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 11 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 12: Metrics Reset
    console.log('Test 12: Metrics reset functionality');
    try {
        const beforeReset = getPipelineMetrics();
        resetPipelineMetrics();
        const afterReset = getPipelineMetrics();

        console.log('Reset check:', {
            beforeTotal: beforeReset.totalProcessed,
            afterTotal: afterReset.totalProcessed,
        });

        if (afterReset.totalProcessed === 0) {
            console.log('✅ Test 12 passed - Metrics reset successfully\n');
            testsPassed++;
        } else {
            console.log('❌ Test 12 failed - Metrics not reset\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 12 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Final Summary
    console.log('=== Test Summary ===');
    console.log(`Total tests: ${testsPassed + testsFailed}`);
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    console.log(`Success rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

    // Display final pipeline metrics
    console.log('\n=== Final Pipeline Metrics ===');
    const finalMetrics = getPipelineMetrics();
    console.log(JSON.stringify({
        totalProcessed: finalMetrics.totalProcessed,
        successful: finalMetrics.successful,
        failed: finalMetrics.failed,
        cacheHitRate: (finalMetrics.cacheHitRate * 100).toFixed(1) + '%',
        avgConfidence: finalMetrics.avgConfidence.toFixed(2),
        requiresReview: finalMetrics.requiresReview,
    }, null, 2));
}

// Run tests
runTests().catch(console.error);
