/**
 * Action Parameter Builder Test Suite
 * Tests platform-specific parameter building
 */

import { 
    getActionParamsBuilder, 
    buildActionParams,
    validateTaskDetails,
    type TaskDetails,
    type ParamsBuilderConfig,
    type NotionTaskParams,
    type TrelloCardParams,
    type SlackNotificationParams,
    type DriveFileParams,
} from './action-params-builder';
import type { Signal } from './reasoning/context-builder';

// Test helper to create mock signals
function createMockSignal(overrides: Partial<Signal> = {}): Signal {
    return {
        id: `signal-${Date.now()}`,
        source: 'email',
        subject: 'Test Signal',
        body: 'This is a test signal body for parameter building',
        sender: 'test@example.com',
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

// Test configuration
const testConfig: ParamsBuilderConfig = {
    notionDatabaseId: 'test-notion-db-123',
    trelloDefaultListId: 'test-trello-list-456',
    slackDefaultChannel: '#test-channel',
    driveDefaultFolderId: 'test-drive-folder-789',
    priorityLabelMappings: {
        'High': 'label-high-123',
        'Medium': 'label-medium-456',
        'Low': 'label-low-789',
    },
};

async function runTests() {
    console.log('=== Action Parameter Builder Test Suite ===\n');

    const builder = getActionParamsBuilder(testConfig);
    let testsPassed = 0;
    let testsFailed = 0;

    // Test 1: Build Notion Task Parameters
    console.log('Test 1: Build Notion task parameters');
    try {
        const signal = createMockSignal({
            subject: 'Review Q4 Budget',
            body: 'Please review the Q4 budget proposal and provide feedback by EOW.',
        });

        const taskDetails: TaskDetails = {
            title: 'Review Q4 Budget Proposal',
            description: 'Review and approve the Q4 budget allocation',
            priority: 'High',
            dueDate: '2025-10-23T00:00:00.000Z',
            assignee: 'user-123',
            source: 'Email',
        };

        const result = builder.buildParams('create_task', 'notion', taskDetails, signal);

        if (result.success && result.params) {
            const params = result.params as NotionTaskParams;
            console.log('✅ Notion parameters built:', {
                databaseId: params.databaseId,
                title: params.properties.Title.title[0].text.content,
                priority: params.properties.Priority.select.name,
                status: params.properties.Status.select.name,
                source: params.properties.Source.select.name,
                hasAssignee: !!params.properties.Assignee,
            });
            testsPassed++;
        } else {
            console.log('❌ Failed to build Notion parameters:', result.error);
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 1 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 2: Build Notion Parameters with Defaults
    console.log('Test 2: Build Notion parameters with defaults');
    try {
        const signal = createMockSignal();

        const taskDetails: TaskDetails = {
            title: 'Simple Task',
        };

        const result = builder.buildParams('create_task', 'notion', taskDetails, signal);

        if (result.success && result.params) {
            const params = result.params as NotionTaskParams;
            console.log('✅ Notion defaults applied:', {
                priority: params.properties.Priority.select.name,
                status: params.properties.Status.select.name,
                warnings: result.warnings?.length || 0,
            });
            console.log('   Warnings:', result.warnings);
            testsPassed++;
        } else {
            console.log('❌ Failed:', result.error);
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 2 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 3: Build Trello Card Parameters
    console.log('Test 3: Build Trello card parameters');
    try {
        const signal = createMockSignal({
            subject: 'Implement new feature',
            body: 'Implement the new dashboard feature as discussed in the meeting.',
        });

        const taskDetails: TaskDetails = {
            title: 'Implement Dashboard Feature',
            description: 'Create responsive dashboard with real-time updates',
            priority: 'High',
            dueDate: '2025-10-30T00:00:00.000Z',
            labels: ['feature', 'frontend'],
        };

        const result = builder.buildParams('create_task', 'trello', taskDetails, signal);

        if (result.success && result.params) {
            const params = result.params as TrelloCardParams;
            console.log('✅ Trello parameters built:', {
                name: params.name,
                listId: params.listId,
                pos: params.pos,
                labelCount: params.idLabels.length,
                urlSource: params.urlSource,
            });
            testsPassed++;
        } else {
            console.log('❌ Failed to build Trello parameters:', result.error);
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 3 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 4: Build Trello Parameters - Low Priority (bottom position)
    console.log('Test 4: Build Trello card with low priority');
    try {
        const signal = createMockSignal();

        const taskDetails: TaskDetails = {
            title: 'Update Documentation',
            priority: 'Low',
        };

        const result = builder.buildParams('create_task', 'trello', taskDetails, signal);

        if (result.success && result.params) {
            const params = result.params as TrelloCardParams;
            console.log('✅ Trello low priority card:', {
                pos: params.pos,
                priority: taskDetails.priority,
            });
            if (params.pos === 'bottom') {
                console.log('   ✓ Correctly positioned at bottom');
            }
            testsPassed++;
        } else {
            console.log('❌ Failed:', result.error);
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 4 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 5: Build Slack Notification Parameters
    console.log('Test 5: Build Slack notification parameters');
    try {
        const signal = createMockSignal({
            subject: 'Server Alert',
            body: 'High CPU usage detected on production server. Immediate attention required.',
            sender: 'monitoring@company.com',
        });

        const taskDetails: TaskDetails = {
            title: '🚨 Production Server Alert',
            description: 'High CPU usage detected on production server. Immediate attention required.',
            priority: 'High',
            metadata: {
                channel: '#alerts',
            },
        };

        const result = builder.buildParams('send_notification', 'slack', taskDetails, signal);

        if (result.success && result.params) {
            const params = result.params as SlackNotificationParams;
            console.log('✅ Slack parameters built:', {
                channel: params.channel,
                blockCount: params.blocks.length,
                hasThread: !!params.thread_ts,
                text: params.text,
            });
            console.log('   Block types:', params.blocks.map(b => b.type));
            testsPassed++;
        } else {
            console.log('❌ Failed to build Slack parameters:', result.error);
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 5 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 6: Build Slack Notification with Thread
    console.log('Test 6: Build Slack notification as thread reply');
    try {
        const signal = createMockSignal();

        const taskDetails: TaskDetails = {
            title: 'Follow-up Message',
            description: 'This is a follow-up to the previous message.',
            metadata: {
                channel: '#general',
                thread_ts: '1234567890.123456',
            },
        };

        const result = builder.buildParams('send_notification', 'slack', taskDetails, signal);

        if (result.success && result.params) {
            const params = result.params as SlackNotificationParams;
            console.log('✅ Slack thread reply:', {
                channel: params.channel,
                isThread: !!params.thread_ts,
                thread_ts: params.thread_ts,
            });
            testsPassed++;
        } else {
            console.log('❌ Failed:', result.error);
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 6 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 7: Build Drive File Organization Parameters
    console.log('Test 7: Build Drive file organization parameters');
    try {
        const signal = createMockSignal({
            subject: 'Q4 Report Attachment',
            body: 'Please file the Q4 report in the appropriate folder.',
        });

        const taskDetails: TaskDetails = {
            title: 'Q4_Financial_Report.pdf',
            description: 'Q4 financial report for executive review',
            metadata: {
                fileId: 'file-abc123',
                folderId: 'folder-xyz789',
            },
        };

        const result = builder.buildParams('organize_file', 'drive', taskDetails, signal);

        if (result.success && result.params) {
            const params = result.params as DriveFileParams;
            console.log('✅ Drive parameters built:', {
                fileId: params.fileId,
                folderId: params.folderId,
                name: params.name,
                hasDescription: !!params.description,
            });
            testsPassed++;
        } else {
            console.log('❌ Failed to build Drive parameters:', result.error);
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 7 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 8: Validation - Missing Required Fields
    console.log('Test 8: Validation - missing required fields');
    try {
        const signal = createMockSignal();

        // Missing title (empty string)
        const taskDetails1: TaskDetails = {
            title: '',
            description: 'No title provided',
        };

        const result1 = builder.buildParams('create_task', 'notion', taskDetails1, signal);

        // Missing fileId for Drive
        const taskDetails2: TaskDetails = {
            title: 'Some File',
            metadata: {},
        };

        const result2 = builder.buildParams('organize_file', 'drive', taskDetails2, signal);

        if (!result1.success && !result2.success) {
            console.log('✅ Validation correctly caught missing fields:', {
                notion: result1.missingFields,
                drive: result2.missingFields,
            });
            testsPassed++;
        } else {
            console.log('❌ Validation did not catch missing fields');
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 8 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 9: Validate Task Details Function
    console.log('Test 9: Validate task details function');
    try {
        const validTask: TaskDetails = {
            title: 'Valid Task',
            priority: 'High',
            dueDate: '2025-10-30T00:00:00.000Z',
        };

        const invalidTask: TaskDetails = {
            title: '',
            priority: 'Invalid' as any,
        };

        const validation1 = validateTaskDetails('notion', validTask, testConfig);
        const validation2 = validateTaskDetails('notion', invalidTask, testConfig);

        console.log('Valid task validation:', validation1);
        console.log('Invalid task validation:', validation2);

        if (validation1.valid && !validation2.valid) {
            console.log('✅ Validation function works correctly');
            testsPassed++;
        } else {
            console.log('❌ Validation function failed');
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 9 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 10: Convenience Function - buildActionParams
    console.log('Test 10: Convenience function buildActionParams');
    try {
        const signal = createMockSignal();

        const taskDetails: TaskDetails = {
            title: 'Test Task',
            priority: 'Medium',
        };

        const result = buildActionParams(
            'create_task',
            'notion',
            taskDetails,
            signal,
            testConfig
        );

        if (result.success) {
            console.log('✅ Convenience function works:', {
                success: result.success,
                hasParams: !!result.params,
            });
            testsPassed++;
        } else {
            console.log('❌ Convenience function failed:', result.error);
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 10 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 11: Configuration Update
    console.log('Test 11: Configuration update');
    try {
        const newConfig: Partial<ParamsBuilderConfig> = {
            slackDefaultChannel: '#new-channel',
            notionDatabaseId: 'new-db-id',
        };

        builder.updateConfig(newConfig);
        const currentConfig = builder.getConfig();

        if (
            currentConfig.slackDefaultChannel === '#new-channel' &&
            currentConfig.notionDatabaseId === 'new-db-id'
        ) {
            console.log('✅ Configuration updated successfully:', {
                slackChannel: currentConfig.slackDefaultChannel,
                notionDb: currentConfig.notionDatabaseId,
            });
            testsPassed++;
        } else {
            console.log('❌ Configuration update failed');
            testsFailed++;
        }
        console.log('');
    } catch (error) {
        console.log('❌ Test 11 failed:', error);
        console.log('');
        testsFailed++;
    }

    // Test 12: Edge Cases
    console.log('Test 12: Edge cases');
    try {
        const signal = createMockSignal();

        // Very long title
        const longTitle = 'A'.repeat(300);
        const taskDetails1: TaskDetails = {
            title: longTitle,
        };

        const validation = validateTaskDetails('notion', taskDetails1, testConfig);

        // Empty description
        const taskDetails2: TaskDetails = {
            title: 'Task with empty description',
            description: '',
        };

        const result = builder.buildParams('create_task', 'notion', taskDetails2, signal);

        console.log('Long title validation warnings:', validation.warnings.length);
        console.log('Empty description handled:', result.success);

        if (validation.warnings.length > 0 && result.success) {
            console.log('✅ Edge cases handled correctly');
            testsPassed++;
        } else {
            console.log('❌ Edge cases not handled properly');
            testsFailed++;
        }
        console.log('');
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

    // Display sample parameters
    console.log('\n=== Sample Notion Parameters ===');
    const sampleSignal = createMockSignal();
    const sampleTask: TaskDetails = {
        title: 'Complete Project Documentation',
        description: 'Write comprehensive documentation for the new features',
        priority: 'High',
        dueDate: '2025-10-25T00:00:00.000Z',
        assignee: 'user-456',
        source: 'Email',
    };
    const sampleResult = builder.buildParams('create_task', 'notion', sampleTask, sampleSignal);
    console.log(JSON.stringify(sampleResult.params, null, 2));
}

// Run tests
runTests().catch(console.error);
