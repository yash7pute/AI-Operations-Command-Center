/**
 * Slack Executor - Demo Test Suite
 * 
 * This file demonstrates all features of the Slack Notification Sender.
 * Run with: npx ts-node src/workflows/executors/__tests__/slack-executor.test.ts
 * 
 * Prerequisites:
 * - SLACK_BOT_TOKEN in environment
 * - SLACK_NOTIFICATIONS_CHANNEL configured
 * - Bot must be added to channel
 * - Active internet connection
 */

import * as SlackExecutor from '../slack-executor';
import logger from '../../../utils/logger';

// Test configuration
const TEST_CHANNEL = process.env.SLACK_NOTIFICATIONS_CHANNEL || 'your-test-channel-id';

/**
 * Test 1: Basic Notification
 */
async function testBasicNotification() {
    console.log('\n========================================');
    console.log('TEST 1: Basic Notification');
    console.log('========================================\n');

    try {
        const result = await SlackExecutor.sendNotification(
            'This is a test notification from the AI Operations Command Center',
            {
                channel: TEST_CHANNEL,
                actionId: 'test-1'
            }
        );

        if (result.success) {
            console.log('✅ Basic notification sent');
            console.log('   Message TS:', result.data?.messageTs);
            console.log('   Channel:', result.data?.channel);
        } else {
            console.error('❌ Failed:', result.error);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 2: Rich Formatted Notification
 */
async function testRichNotification() {
    console.log('\n========================================');
    console.log('TEST 2: Rich Formatted Notification');
    console.log('========================================\n');

    try {
        const result = await SlackExecutor.sendNotification(
            'Signal processed and action taken',
            {
                channel: TEST_CHANNEL,
                priority: 'High',
                source: 'Email',
                subject: 'Customer Bug Report: Login Issues',
                keyPoints: [
                    'Multiple users reporting login failures',
                    'Issue started after recent deployment',
                    'Affecting premium tier customers',
                    'Potential revenue impact estimated at $5K/day'
                ],
                actionTaken: 'Created high-priority Trello card in Engineering board',
                taskUrl: 'https://trello.com/c/abc123',
                signalUrl: 'https://mail.google.com/mail/u/0/#inbox/abc123',
                actionId: 'test-2',
                correlationId: 'test-corr-2'
            }
        );

        if (result.success) {
            console.log('✅ Rich notification sent');
            console.log('   Features shown:');
            console.log('   - Priority indicator (🟡 High)');
            console.log('   - Source information');
            console.log('   - Key points list');
            console.log('   - Action taken');
            console.log('   - Task and signal links');
        } else {
            console.error('❌ Failed:', result.error);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 3: Task Created Notification
 */
async function testTaskCreatedNotification() {
    console.log('\n========================================');
    console.log('TEST 3: Task Created Notification');
    console.log('========================================\n');

    try {
        const result = await SlackExecutor.sendTaskCreated(
            {
                title: 'Implement OAuth 2.0 Authentication',
                description: 'Add OAuth 2.0 support for Google and Microsoft accounts to improve user login experience and security.',
                priority: 'High',
                source: 'Email',
                assignee: 'john@example.com',
                dueDate: '2025-12-31',
                labels: ['backend', 'security', 'authentication']
            },
            'https://trello.com/c/oauth-task',
            {
                channel: TEST_CHANNEL,
                actionId: 'test-3',
                correlationId: 'test-corr-3'
            }
        );

        if (result.success) {
            console.log('✅ Task created notification sent');
            console.log('   Includes:');
            console.log('   - ✅ Task Created header');
            console.log('   - Task title and description');
            console.log('   - Priority, source, assignee');
            console.log('   - Due date and labels');
            console.log('   - Primary button to view task');
        } else {
            console.error('❌ Failed:', result.error);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 4: Approval Request
 */
async function testApprovalRequest() {
    console.log('\n========================================');
    console.log('TEST 4: Approval Request');
    console.log('========================================\n');

    try {
        const result = await SlackExecutor.sendApprovalRequest(
            {
                correlationId: 'approval-test-corr',
                action: 'create_task',
                target: 'trello',
                confidence: 0.75,
                reasoning: 'Signal mentions database migration which requires careful planning. Suggesting task creation with senior engineer review.',
                params: {
                    title: 'Plan database migration to PostgreSQL 15',
                    priority: 'High',
                    assignee: 'senior-dba@example.com',
                    labels: ['database', 'migration', 'high-risk']
                }
            },
            {
                channel: TEST_CHANNEL,
                actionId: 'test-4'
            }
        );

        if (result.success) {
            console.log('✅ Approval request sent');
            console.log('   Features:');
            console.log('   - ⚠️ Warning indicator');
            console.log('   - Action and confidence level');
            console.log('   - Reasoning explanation');
            console.log('   - Parameter preview');
            console.log('   - Approve/Reject buttons');
        } else {
            console.error('❌ Failed:', result.error);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 5: Priority Indicators
 */
async function testPriorityIndicators() {
    console.log('\n========================================');
    console.log('TEST 5: Priority Indicators');
    console.log('========================================\n');

    const priorities = ['Critical', 'High', 'Medium', 'Low'];

    for (const priority of priorities) {
        try {
            const result = await SlackExecutor.sendNotification(
                `Testing ${priority} priority indicator`,
                {
                    channel: TEST_CHANNEL,
                    priority: priority,
                    subject: `${priority} Priority Test`,
                    actionId: `test-5-${priority.toLowerCase()}`
                }
            );

            if (result.success) {
                const indicators: Record<string, string> = {
                    'Critical': '🔴',
                    'High': '🟡',
                    'Medium': '🟢',
                    'Low': '⚪'
                };
                console.log(`✅ ${indicators[priority]} ${priority} priority notification sent`);
            } else {
                console.error(`❌ ${priority} failed:`, result.error);
            }

            // Small delay between messages for rate limiting
            await new Promise(resolve => setTimeout(resolve, 1100));

        } catch (error) {
            console.error(`❌ ${priority} test failed:`, error);
        }
    }
}

/**
 * Test 6: Add Reactions
 */
async function testReactions() {
    console.log('\n========================================');
    console.log('TEST 6: Add Reactions');
    console.log('========================================\n');

    try {
        // First send a message
        const msgResult = await SlackExecutor.sendNotification(
            'Testing reaction features',
            {
                channel: TEST_CHANNEL,
                subject: 'Reaction Test Message',
                actionId: 'test-6'
            }
        );

        if (!msgResult.success) {
            console.error('❌ Failed to send test message');
            return;
        }

        const messageTs = msgResult.data?.messageTs;
        if (!messageTs) {
            console.error('❌ No message timestamp returned');
            return;
        }

        console.log('✅ Test message sent');
        console.log('   Message TS:', messageTs);

        // Add reactions
        const reactions = ['eyes', 'white_check_mark', 'rocket'];
        
        for (const emoji of reactions) {
            const reactionResult = await SlackExecutor.addReaction(
                TEST_CHANNEL,
                messageTs,
                emoji
            );

            if (reactionResult.success) {
                console.log(`✅ Added reaction: :${emoji}:`);
            } else {
                console.error(`❌ Failed to add :${emoji}:`, reactionResult.error);
            }

            // Small delay for rate limiting
            await new Promise(resolve => setTimeout(resolve, 1100));
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 7: Rate Limiting
 */
async function testRateLimiting() {
    console.log('\n========================================');
    console.log('TEST 7: Rate Limiting');
    console.log('========================================\n');

    console.log('Sending 5 messages rapidly to test rate limiting...\n');

    const startTime = Date.now();
    const results: boolean[] = [];

    for (let i = 1; i <= 5; i++) {
        const msgStartTime = Date.now();
        
        const result = await SlackExecutor.sendNotification(
            `Rate limit test message ${i}/5`,
            {
                channel: TEST_CHANNEL,
                subject: `Test Message ${i}`,
                actionId: `test-7-${i}`
            }
        );

        const msgEndTime = Date.now();
        const msgDuration = msgEndTime - msgStartTime;

        if (result.success) {
            console.log(`✅ Message ${i} sent (${msgDuration}ms)`);
            results.push(true);
        } else {
            console.error(`❌ Message ${i} failed:`, result.error);
            results.push(false);
        }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r).length;

    console.log('\n📊 Rate Limiting Results:');
    console.log(`   Total time: ${totalTime}ms`);
    console.log(`   Average: ${(totalTime / 5).toFixed(0)}ms per message`);
    console.log(`   Success rate: ${successCount}/5`);
    console.log(`   Expected: ~1000ms per message (rate limit)`);
    
    if (totalTime >= 4000 && totalTime <= 6000) {
        console.log('✅ Rate limiting working correctly');
    } else {
        console.log('⚠️  Rate limiting may need adjustment');
    }
}

/**
 * Test 8: Thread Reply
 */
async function testThreadReply() {
    console.log('\n========================================');
    console.log('TEST 8: Thread Reply');
    console.log('========================================\n');

    try {
        // Send parent message
        const parentResult = await SlackExecutor.sendNotification(
            'Parent message for thread test',
            {
                channel: TEST_CHANNEL,
                subject: 'Thread Test Parent',
                actionId: 'test-8-parent'
            }
        );

        if (!parentResult.success) {
            console.error('❌ Failed to send parent message');
            return;
        }

        const threadTs = parentResult.data?.messageTs;
        console.log('✅ Parent message sent');
        console.log('   Thread TS:', threadTs);

        // Send reply in thread
        const replyResult = await SlackExecutor.sendNotification(
            'This is a reply in the thread',
            {
                channel: TEST_CHANNEL,
                subject: 'Thread Reply',
                threadTs: threadTs,
                actionId: 'test-8-reply'
            }
        );

        if (replyResult.success) {
            console.log('✅ Thread reply sent');
            console.log('   Creates organized conversation');
        } else {
            console.error('❌ Failed to send reply:', replyResult.error);
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 9: Complete Workflow Example
 */
async function testCompleteWorkflow() {
    console.log('\n========================================');
    console.log('TEST 9: Complete Workflow Example');
    console.log('========================================\n');

    console.log('Simulating complete signal → task → notification flow\n');

    try {
        // Step 1: Signal detected notification
        console.log('Step 1: Signal detected...');
        const signalResult = await SlackExecutor.sendNotification(
            'New signal detected',
            {
                channel: TEST_CHANNEL,
                priority: 'High',
                source: 'Email',
                subject: 'Production Error: Payment Processing Down',
                keyPoints: [
                    'Payment gateway returning 500 errors',
                    'Affecting all customers',
                    'Started 15 minutes ago'
                ],
                actionId: 'workflow-signal'
            }
        );

        if (!signalResult.success) {
            console.error('❌ Signal notification failed');
            return;
        }

        const threadTs = signalResult.data?.messageTs;
        console.log('✅ Signal notification sent\n');

        // Step 2: Add "processing" reaction
        await new Promise(resolve => setTimeout(resolve, 1100));
        console.log('Step 2: Adding processing indicator...');
        await SlackExecutor.addReaction(TEST_CHANNEL, threadTs!, 'eyes');
        console.log('✅ Added 👀 reaction\n');

        // Step 3: Task created notification (in thread)
        await new Promise(resolve => setTimeout(resolve, 1100));
        console.log('Step 3: Task created...');
        const taskResult = await SlackExecutor.sendTaskCreated(
            {
                title: 'URGENT: Fix payment gateway errors',
                description: 'Payment processing is down. All customers affected.',
                priority: 'High',
                source: 'Email',
                assignee: 'oncall-engineer@example.com',
                labels: ['production', 'critical', 'payments']
            },
            'https://trello.com/c/payment-fix',
            {
                channel: TEST_CHANNEL,
                threadTs: threadTs,
                actionId: 'workflow-task'
            }
        );

        if (taskResult.success) {
            console.log('✅ Task notification sent (in thread)\n');
        }

        // Step 4: Add "done" reaction
        await new Promise(resolve => setTimeout(resolve, 1100));
        console.log('Step 4: Marking as complete...');
        await SlackExecutor.addReaction(TEST_CHANNEL, threadTs!, 'white_check_mark');
        console.log('✅ Added ✅ reaction\n');

        console.log('🎉 Complete workflow demonstrated!');
        console.log('   Check Slack channel for:');
        console.log('   1. Signal notification with rich formatting');
        console.log('   2. 👀 Processing indicator');
        console.log('   3. Task created notification (threaded)');
        console.log('   4. ✅ Completion indicator');

    } catch (error) {
        console.error('❌ Workflow test failed:', error);
    }
}

/**
 * Test 10: Error Handling
 */
async function testErrorHandling() {
    console.log('\n========================================');
    console.log('TEST 10: Error Handling');
    console.log('========================================\n');

    try {
        // Test with invalid channel
        console.log('Testing with invalid channel...');
        const result = await SlackExecutor.sendNotification(
            'This should fail',
            {
                channel: 'invalid-channel-id',
                actionId: 'test-10-error'
            }
        );

        if (!result.success) {
            console.log('✅ Error handled gracefully');
            console.log('   Error:', result.error);
            console.log('   System continues operating');
        } else {
            console.log('⚠️  Expected error but got success');
        }

    } catch (error) {
        console.log('✅ Exception caught and handled');
        console.log('   Error:', error);
    }
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  Slack Executor - Demo Tests          ║');
    console.log('╚════════════════════════════════════════╝');

    if (TEST_CHANNEL === 'your-test-channel-id') {
        console.error('\n❌ Error: Please set SLACK_NOTIFICATIONS_CHANNEL environment variable');
        console.error('   Example: export SLACK_NOTIFICATIONS_CHANNEL=C1234567890');
        process.exit(1);
    }

    console.log('\nChannel:', TEST_CHANNEL);
    console.log('\n⚠️  Note: These tests will send real messages to Slack');
    console.log('Make sure the bot is added to the channel!\n');

    // Run all tests
    await testBasicNotification();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testRichNotification();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testTaskCreatedNotification();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testApprovalRequest();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testPriorityIndicators();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testReactions();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testRateLimiting();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testThreadReply();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testCompleteWorkflow();
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await testErrorHandling();

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  All Tests Complete!                   ║');
    console.log('╚════════════════════════════════════════╝\n');
}

// Run tests if executed directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

export { runAllTests };
