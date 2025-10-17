/**
 * Decision Agent Test Suite
 * Tests the action decision-making functionality
 */

import { getDecisionAgent } from './decision-agent';
import type { Signal } from './reasoning/context-builder';
import type { SignalClassification } from './classifier-agent';

// Test helper to create mock signals
function createMockSignal(overrides: Partial<Signal> = {}): Signal {
    return {
        id: `signal-${Date.now()}`,
        source: 'email',
        subject: 'Test Signal',
        body: 'This is a test signal body',
        sender: 'test@example.com',
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

// Test helper to create mock classifications
function createMockClassification(
    overrides: Partial<SignalClassification> = {}
): SignalClassification {
    return {
        category: 'request',
        urgency: 'medium',
        importance: 'medium',
        confidence: 0.85,
        reasoning: 'Test classification',
        suggestedActions: ['create_task'],
        requiresImmediate: false,
        ...overrides,
    };
}

async function runTests() {
    console.log('=== Decision Agent Test Suite ===\n');

    const agent = getDecisionAgent();
    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: Basic Decision Making
    console.log('Test 1: Basic decision making for request');
    try {
        const signal = createMockSignal({
            subject: 'Please review the Q4 budget proposal',
            body: 'We need to review and approve the Q4 budget by end of week. Please check the attached spreadsheet.',
            sender: 'cfo@company.com',
        });

        const classification = createMockClassification({
            category: 'request',
            urgency: 'high',
            importance: 'high',
            confidence: 0.9,
        });

        const decision = await agent.decideAction(signal, classification);

        console.log('Decision:', {
            action: decision.action,
            confidence: decision.confidence,
            requiresApproval: decision.requiresApproval,
            processingTime: decision.processingTime,
        });

        if (decision.action && decision.confidence > 0) {
            console.log('✅ Test 1 passed\n');
            testsPassed++;
        } else {
            console.log('❌ Test 1 failed: Invalid decision structure\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 1 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 2: Duplicate Detection
    console.log('Test 2: Duplicate signal detection');
    try {
        const signal1 = createMockSignal({
            subject: 'Duplicate Test Signal',
            body: 'This is a duplicate test',
            sender: 'user@example.com',
        });

        const classification = createMockClassification({
            confidence: 0.8,
        });

        // First decision
        const decision1 = await agent.decideAction(signal1, classification);
        console.log('First decision action:', decision1.action);

        // Second decision with same content (same subject/body)
        const signal2 = createMockSignal({
            id: `signal-${Date.now() + 1}`,
            subject: 'Duplicate Test Signal',
            body: 'This is a duplicate test',
            sender: 'user@example.com',
        });

        const decision2 = await agent.decideAction(signal2, classification);
        console.log('Second decision action:', decision2.action);

        if (decision2.action === 'ignore' && decision2.reasoning.includes('duplicate')) {
            console.log('✅ Test 2 passed - Duplicate detected\n');
            testsPassed++;
        } else {
            console.log('❌ Test 2 failed - Duplicate not detected\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 2 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 3: Ambiguous Signal Handling
    console.log('Test 3: Ambiguous signal handling (low confidence)');
    try {
        const signal = createMockSignal({
            subject: 'FYI',
            body: 'Just keeping you in the loop.',
            sender: 'colleague@example.com',
        });

        const classification = createMockClassification({
            category: 'information',
            urgency: 'low',
            importance: 'low',
            confidence: 0.4, // Below 0.5 threshold
        });

        const decision = await agent.decideAction(signal, classification);
        console.log('Decision for ambiguous signal:', {
            action: decision.action,
            confidence: decision.confidence,
        });

        if (decision.action === 'clarify') {
            console.log('✅ Test 3 passed - Clarification requested\n');
            testsPassed++;
        } else {
            console.log('❌ Test 3 failed - Should request clarification\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 3 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 4: Human Judgment Required (Financial)
    console.log('Test 4: Human judgment required for financial matters');
    try {
        const signal = createMockSignal({
            subject: 'Budget Approval Required',
            body: 'We need approval for the $500k budget allocation for the new project.',
            sender: 'manager@company.com',
        });

        const classification = createMockClassification({
            category: 'request',
            urgency: 'high',
            importance: 'high',
            confidence: 0.85,
        });

        const decision = await agent.decideAction(signal, classification);
        console.log('Decision for financial matter:', {
            action: decision.action,
            requiresApproval: decision.requiresApproval,
        });

        if (decision.requiresApproval === true) {
            console.log('✅ Test 4 passed - Approval required for financial matter\n');
            testsPassed++;
        } else {
            console.log('❌ Test 4 failed - Should require approval\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 4 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 5: Human Judgment Required (Legal)
    console.log('Test 5: Human judgment required for legal matters');
    try {
        const signal = createMockSignal({
            subject: 'Legal Compliance Review',
            body: 'We need to review the new compliance regulations and ensure our policies are up to date.',
            sender: 'legal@company.com',
        });

        const classification = createMockClassification({
            category: 'request',
            urgency: 'medium',
            importance: 'high',
            confidence: 0.8,
        });

        const decision = await agent.decideAction(signal, classification);
        console.log('Decision for legal matter:', {
            action: decision.action,
            requiresApproval: decision.requiresApproval,
        });

        if (decision.requiresApproval === true) {
            console.log('✅ Test 5 passed - Approval required for legal matter\n');
            testsPassed++;
        } else {
            console.log('❌ Test 5 failed - Should require approval\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 5 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 6: Processing Strategy - Immediate
    console.log('Test 6: Immediate processing for critical signals');
    try {
        const signal = createMockSignal({
            subject: 'URGENT: Server outage',
            body: 'Production server is down. Need immediate attention.',
            sender: 'devops@company.com',
        });

        const classification = createMockClassification({
            category: 'incident',
            urgency: 'critical',
            importance: 'high',
            confidence: 0.95,
        });

        const startTime = Date.now();
        const decision = await agent.decideAction(signal, classification);
        const processingTime = Date.now() - startTime;

        console.log('Critical signal decision:', {
            action: decision.action,
            processingTime,
        });

        if (decision.action && processingTime < 10000) {
            console.log('✅ Test 6 passed - Immediate processing\n');
            testsPassed++;
        } else {
            console.log('❌ Test 6 failed - Processing took too long\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 6 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 7: Batch Decision Making
    console.log('Test 7: Batch decision making for multiple signals');
    try {
        const signals = [
            {
                signal: createMockSignal({
                    id: 'batch-1',
                    subject: 'Status Update',
                    body: 'Weekly status report',
                    sender: 'team@company.com',
                }),
                classification: createMockClassification({
                    urgency: 'low',
                    importance: 'low',
                    confidence: 0.7,
                }),
            },
            {
                signal: createMockSignal({
                    id: 'batch-2',
                    subject: 'Meeting Request',
                    body: 'Can we schedule a meeting next week?',
                    sender: 'colleague@company.com',
                }),
                classification: createMockClassification({
                    urgency: 'medium',
                    importance: 'medium',
                    confidence: 0.8,
                }),
            },
            {
                signal: createMockSignal({
                    id: 'batch-3',
                    subject: 'Project Review',
                    body: 'Need to review Q3 project results',
                    sender: 'manager@company.com',
                }),
                classification: createMockClassification({
                    urgency: 'high',
                    importance: 'high',
                    confidence: 0.85,
                }),
            },
        ];

        const result = await agent.batchDecide(signals);
        console.log('Batch processing result:', {
            successful: result.successful.length,
            failed: result.failed.length,
            totalTime: result.totalTime,
        });

        if (result.successful.length === 3 && result.failed.length === 0) {
            console.log('✅ Test 7 passed - Batch processing successful\n');
            testsPassed++;
        } else {
            console.log('❌ Test 7 failed - Batch processing incomplete\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 7 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 8: Decision Statistics Tracking
    console.log('Test 8: Decision statistics tracking');
    try {
        const stats = agent.getStats();
        console.log('Decision statistics:', {
            totalDecisions: stats.totalDecisions,
            byAction: Object.keys(stats.byAction).length,
            avgConfidence: stats.avgConfidence.toFixed(2),
            approvalRate: (stats.approvalRate * 100).toFixed(1) + '%',
        });

        if (stats.totalDecisions > 0) {
            console.log('✅ Test 8 passed - Statistics tracked correctly\n');
            testsPassed++;
        } else {
            console.log('❌ Test 8 failed - No statistics recorded\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 8 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 9: Edge Cases
    console.log('Test 9: Edge cases handling');
    try {
        // Empty signal body
        const signal1 = createMockSignal({
            subject: 'Empty Body Test',
            body: '',
            sender: 'test@example.com',
        });

        const classification1 = createMockClassification();
        const decision1 = await agent.decideAction(signal1, classification1);

        // Very long signal body
        const signal2 = createMockSignal({
            subject: 'Long Body Test',
            body: 'A'.repeat(10000),
            sender: 'test@example.com',
        });

        const classification2 = createMockClassification();
        const decision2 = await agent.decideAction(signal2, classification2);

        // Special characters
        const signal3 = createMockSignal({
            subject: 'Special Chars: 你好 🚀 @#$%^&*()',
            body: 'Testing special characters: <script>alert("test")</script>',
            sender: 'test@example.com',
        });

        const classification3 = createMockClassification();
        const decision3 = await agent.decideAction(signal3, classification3);

        if (decision1.action && decision2.action && decision3.action) {
            console.log('✅ Test 9 passed - Edge cases handled\n');
            testsPassed++;
        } else {
            console.log('❌ Test 9 failed - Edge case not handled properly\n');
            testsFailed++;
        }
    } catch (error) {
        console.log('❌ Test 9 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Final Summary
    console.log('=== Test Summary ===');
    console.log(`Total tests: ${testsPassed + testsFailed}`);
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);
    console.log(`Success rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

    // Display final statistics
    console.log('\n=== Final Decision Agent Statistics ===');
    const finalStats = agent.getStats();
    console.log(JSON.stringify(finalStats, null, 2));
}

// Run tests
runTests().catch(console.error);

