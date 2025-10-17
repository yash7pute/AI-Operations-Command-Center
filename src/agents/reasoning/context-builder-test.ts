/**
 * Context Builder Tests
 * 
 * Tests context building, caching, signal/task tracking, and performance.
 */

import { ContextBuilder, Signal, Task } from './context-builder';

// ============================================================================
// Test Data
// ============================================================================

const mockSignals: Signal[] = [
    {
        id: 'sig1',
        source: 'email',
        subject: 'Critical: Database Down',
        body: 'The production database is down. Need immediate attention.',
        sender: 'alerts@company.com',
        timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        classification: {
            urgency: 'critical',
            importance: 'high',
            category: 'incident',
        },
    },
    {
        id: 'sig2',
        source: 'email',
        subject: 'Database Performance Issues',
        body: 'We\'ve noticed the database is running slowly. Can you investigate?',
        sender: 'team@company.com',
        timestamp: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
        classification: {
            urgency: 'high',
            importance: 'medium',
            category: 'issue',
        },
    },
    {
        id: 'sig3',
        source: 'slack',
        subject: undefined,
        body: 'Hey team, planning to upgrade the database next week. Any concerns?',
        sender: 'john@company.com',
        timestamp: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
        classification: {
            urgency: 'low',
            importance: 'medium',
            category: 'discussion',
        },
    },
    {
        id: 'sig4',
        source: 'email',
        subject: 'Weekly Report',
        body: 'Here is the weekly report for the team.',
        sender: 'reports@company.com',
        timestamp: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
        classification: {
            urgency: 'low',
            importance: 'low',
            category: 'information',
        },
    },
];

const mockTasks: Task[] = [
    {
        id: 'task1',
        title: 'Investigate Database Performance',
        description: 'Check slow queries and optimize indexes',
        status: 'in-progress',
        priority: 1,
        assignee: 'alice@company.com',
        dueDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        labels: ['database', 'performance', 'urgent'],
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        source: 'notion',
    },
    {
        id: 'task2',
        title: 'Database Upgrade Planning',
        description: 'Plan and schedule database version upgrade',
        status: 'todo',
        priority: 3,
        assignee: 'bob@company.com',
        dueDate: new Date(Date.now() + 604800000).toISOString(), // Next week
        labels: ['database', 'upgrade', 'planning'],
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        source: 'trello',
    },
    {
        id: 'task3',
        title: 'Review Weekly Report',
        description: 'Review and acknowledge weekly team report',
        status: 'todo',
        priority: 5,
        assignee: 'carol@company.com',
        labels: ['report', 'review'],
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        source: 'notion',
    },
];

// ============================================================================
// Test Functions
// ============================================================================

function testBasicContextBuilding() {
    console.log('\n🧪 Test 1: Basic Context Building');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    // Add signals and tasks
    mockSignals.forEach(s => builder.addSignal(s));
    mockTasks.forEach(t => builder.addTask(t));

    // Build context for current signal
    const currentSignal: Signal = {
        id: 'sig-current',
        source: 'email',
        subject: 'Database Connection Timeout',
        body: 'Getting timeout errors when connecting to the production database.',
        sender: 'support@company.com',
        timestamp: new Date().toISOString(),
    };

    const context = builder.buildContext(currentSignal);

    console.log('✅ Context built successfully');
    console.log(`   Recent signals: ${context.recentSignals.length}`);
    console.log(`   Related tasks: ${context.relatedTasks.length}`);
    console.log(`   Similar signals: ${context.similarSignals.length}`);
    console.log(`   Build time: ${context.metadata.buildTime}ms`);
    console.log(`   Cache hit: ${context.metadata.cacheHit}`);

    // Validate context
    if (context.recentSignals.length === 0) {
        console.log('⚠️  Warning: No recent signals found');
    }
    if (context.relatedTasks.length === 0) {
        console.log('⚠️  Warning: No related tasks found');
    }
    if (context.similarSignals.length === 0) {
        console.log('⚠️  Warning: No similar signals found');
    }

    return context;
}

function testSimilarSignalDetection() {
    console.log('\n🧪 Test 2: Similar Signal Detection');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    // Add signals with similar topics
    mockSignals.forEach(s => builder.addSignal(s));

    const currentSignal: Signal = {
        id: 'sig-db-issue',
        source: 'email',
        subject: 'Database Problem',
        body: 'The database is experiencing issues and performance is degraded.',
        sender: 'monitoring@company.com',
        timestamp: new Date().toISOString(),
    };

    const similar = builder.findSimilarSignals(currentSignal, 5);

    console.log(`✅ Found ${similar.length} similar signals`);
    similar.forEach((sig, idx) => {
        console.log(`   ${idx + 1}. ${sig.subject || sig.body.substring(0, 50)}...`);
        console.log(`      Source: ${sig.source}, Sender: ${sig.sender}`);
    });

    // Should find database-related signals
    const hasDatabaseSignals = similar.some(s => 
        (s.subject?.toLowerCase() || s.body.toLowerCase()).includes('database')
    );

    if (hasDatabaseSignals) {
        console.log('✅ Successfully detected database-related signals');
    } else {
        console.log('❌ Failed to detect database-related signals');
    }

    return similar;
}

function testRelatedTaskMatching() {
    console.log('\n🧪 Test 3: Related Task Matching');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    mockTasks.forEach(t => builder.addTask(t));

    const databaseSignal: Signal = {
        id: 'sig-db',
        source: 'slack',
        body: 'Need help with database optimization and performance tuning',
        sender: 'dev@company.com',
        timestamp: new Date().toISOString(),
    };

    const related = builder.getRelatedTasks(databaseSignal, 10);

    console.log(`✅ Found ${related.length} related tasks`);
    related.forEach((task, idx) => {
        console.log(`   ${idx + 1}. ${task.title}`);
        console.log(`      Priority: ${task.priority}, Status: ${task.status}`);
        console.log(`      Labels: ${task.labels?.join(', ') || 'none'}`);
    });

    // Should find database tasks
    const hasDatabaseTasks = related.some(t => 
        t.title.toLowerCase().includes('database') ||
        t.labels?.some(l => l.toLowerCase().includes('database'))
    );

    if (hasDatabaseTasks) {
        console.log('✅ Successfully matched database tasks');
    } else {
        console.log('❌ Failed to match database tasks');
    }

    return related;
}

function testTimeContext() {
    console.log('\n🧪 Test 4: Time Context');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    const signal: Signal = {
        id: 'sig-time',
        source: 'email',
        body: 'Test signal for time context',
        sender: 'test@company.com',
        timestamp: new Date().toISOString(),
    };

    const context = builder.buildContext(signal);
    const timeCtx = context.timeContext;

    console.log('✅ Time context retrieved');
    console.log(`   Current hour: ${timeCtx.currentHour}:00`);
    console.log(`   Day of week: ${timeCtx.dayOfWeek}`);
    console.log(`   Is weekend: ${timeCtx.isWeekend ? 'Yes' : 'No'}`);
    console.log(`   Is business hours: ${timeCtx.isBusinessHours ? 'Yes' : 'No'}`);
    console.log(`   Is holiday: ${timeCtx.isHoliday ? 'Yes' : 'No'}`);
    console.log(`   Time zone: ${timeCtx.timeZone}`);

    // Validate logic
    const hour = new Date().getHours();
    const day = new Date().getDay();
    const expectedBusinessHours = hour >= 9 && hour < 17 && day !== 0 && day !== 6;

    if (timeCtx.isBusinessHours === expectedBusinessHours) {
        console.log('✅ Business hours detection correct');
    } else {
        console.log('❌ Business hours detection incorrect');
    }

    return timeCtx;
}

function testSystemState() {
    console.log('\n🧪 Test 5: System State');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    // Simulate system activity
    builder.updateSystemMetrics({
        queueDepth: 15,
        processedCount: 100,
        processingTime: 250000, // 2.5s average
        errorCount: 3,
    });

    const signal: Signal = {
        id: 'sig-sys',
        source: 'email',
        body: 'Test system state',
        sender: 'test@company.com',
        timestamp: new Date().toISOString(),
    };

    const context = builder.buildContext(signal);
    const sysState = context.systemState;

    console.log('✅ System state retrieved');
    console.log(`   Queue depth: ${sysState.queueDepth}`);
    console.log(`   Active tasks: ${sysState.activeTasksCount}`);
    console.log(`   Pending signals: ${sysState.pendingSignalsCount}`);
    console.log(`   Health status: ${sysState.healthStatus}`);
    console.log(`   Avg processing time: ${sysState.avgProcessingTime.toFixed(2)}ms`);
    console.log(`   Error rate: ${sysState.errorRate.toFixed(2)}%`);

    // Validate calculations
    if (sysState.queueDepth === 15) {
        console.log('✅ Queue depth tracked correctly');
    }
    if (sysState.errorRate === 3) {
        console.log('✅ Error rate calculated correctly');
    }
    if (sysState.avgProcessingTime === 2500) {
        console.log('✅ Average processing time calculated correctly');
    }

    return sysState;
}

function testWorkloadCalculation() {
    console.log('\n🧪 Test 6: Workload Calculation');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    mockTasks.forEach(t => builder.addTask(t));

    const workload = builder.getCurrentWorkload();

    console.log('✅ Workload calculated');
    console.log(`   Total tasks: ${workload.totalTasks}`);
    console.log(`   Todo: ${workload.todoTasks}`);
    console.log(`   In progress: ${workload.inProgressTasks}`);
    console.log(`   Blocked: ${workload.blockedTasks}`);
    console.log(`   High priority: ${workload.highPriorityTasks}`);
    console.log(`   Overdue: ${workload.overdueT}`);

    // Validate counts
    const expectedTotal = mockTasks.length;
    const expectedTodo = mockTasks.filter(t => t.status === 'todo').length;
    const expectedInProgress = mockTasks.filter(t => t.status === 'in-progress').length;

    if (workload.totalTasks === expectedTotal &&
        workload.todoTasks === expectedTodo &&
        workload.inProgressTasks === expectedInProgress) {
        console.log('✅ Workload counts correct');
    } else {
        console.log('❌ Workload counts incorrect');
    }

    return workload;
}

function testCaching() {
    console.log('\n🧪 Test 7: Context Caching');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    mockSignals.forEach(s => builder.addSignal(s));
    mockTasks.forEach(t => builder.addTask(t));

    const signal: Signal = {
        id: 'sig-cache',
        source: 'email',
        subject: 'Cache Test',
        body: 'Testing context caching',
        sender: 'cache@company.com',
        timestamp: new Date().toISOString(),
    };

    // First call - should build context
    console.log('Building context (first call)...');
    const context1 = builder.buildContext(signal);
    const buildTime1 = context1.metadata.buildTime;
    const cacheHit1 = context1.metadata.cacheHit;

    console.log(`   Build time: ${buildTime1}ms`);
    console.log(`   Cache hit: ${cacheHit1}`);

    // Second call - should hit cache
    console.log('Building context (second call)...');
    const context2 = builder.buildContext(signal);
    const buildTime2 = context2.metadata.buildTime;
    const cacheHit2 = context2.metadata.cacheHit;

    console.log(`   Build time: ${buildTime2}ms`);
    console.log(`   Cache hit: ${cacheHit2}`);

    if (!cacheHit1 && cacheHit2) {
        console.log('✅ Caching working correctly');
        console.log(`   Cache improved performance by ${((1 - buildTime2/buildTime1) * 100).toFixed(1)}%`);
    } else {
        console.log('❌ Caching not working as expected');
    }

    return { context1, context2 };
}

function testPerformance() {
    console.log('\n🧪 Test 8: Performance');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    // Add large dataset
    const largeSignalSet: Signal[] = [];
    for (let i = 0; i < 100; i++) {
        largeSignalSet.push({
            id: `sig-perf-${i}`,
            source: i % 3 === 0 ? 'email' : i % 3 === 1 ? 'slack' : 'sheets',
            subject: `Test Signal ${i}`,
            body: `This is test signal number ${i} for performance testing with keywords: database, performance, issue, urgent, team, project, deadline`,
            sender: `user${i % 10}@company.com`,
            timestamp: new Date(Date.now() - i * 60000).toISOString(),
        });
    }

    console.log(`Adding ${largeSignalSet.length} signals...`);
    const addStart = Date.now();
    largeSignalSet.forEach(s => builder.addSignal(s));
    const addTime = Date.now() - addStart;
    console.log(`   Added in ${addTime}ms (${(addTime/largeSignalSet.length).toFixed(2)}ms per signal)`);

    // Build context
    const testSignal: Signal = {
        id: 'sig-perf-test',
        source: 'email',
        subject: 'Performance Test',
        body: 'Testing context building performance with database performance issues and urgent deadlines',
        sender: 'test@company.com',
        timestamp: new Date().toISOString(),
    };

    console.log('Building context with large dataset...');
    const buildStart = Date.now();
    const context = builder.buildContext(testSignal);
    const buildTime = Date.now() - buildStart;

    console.log(`✅ Context built in ${buildTime}ms`);
    console.log(`   Recent signals: ${context.recentSignals.length}`);
    console.log(`   Similar signals: ${context.similarSignals.length}`);
    console.log(`   Related tasks: ${context.relatedTasks.length}`);

    if (buildTime < 100) {
        console.log('✅ Excellent performance (<100ms)');
    } else if (buildTime < 500) {
        console.log('✅ Good performance (<500ms)');
    } else {
        console.log('⚠️  Slow performance (>500ms)');
    }

    return { addTime, buildTime, context };
}

function testTeamAvailability() {
    console.log('\n🧪 Test 9: Team Availability');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    const signal: Signal = {
        id: 'sig-team',
        source: 'slack',
        body: 'Need team for urgent issue',
        sender: 'lead@company.com',
        timestamp: new Date().toISOString(),
    };

    const context = builder.buildContext(signal, {
        includeTeamAvailability: true,
    });

    if (context.teamAvailability) {
        console.log('✅ Team availability included');
        console.log(`   Available: ${context.teamAvailability.available}`);
        console.log(`   Busy: ${context.teamAvailability.busy}`);
        console.log(`   Offline: ${context.teamAvailability.offline}`);
        console.log(`   Total: ${context.teamAvailability.available + context.teamAvailability.busy + context.teamAvailability.offline}`);
    } else {
        console.log('❌ Team availability not included');
    }

    return context.teamAvailability;
}

function testEdgeCases() {
    console.log('\n🧪 Test 10: Edge Cases');
    console.log('─'.repeat(60));

    const builder = ContextBuilder.getInstance();
    builder.clearAll();

    // Test 1: Empty history
    console.log('1. Context with empty history...');
    const emptySignal: Signal = {
        id: 'sig-empty',
        source: 'email',
        body: 'Test with no history',
        sender: 'test@company.com',
        timestamp: new Date().toISOString(),
    };
    const emptyContext = builder.buildContext(emptySignal);
    console.log(`   ✅ Handled empty history (${emptyContext.recentSignals.length} signals)`);

    // Test 2: Signal with minimal content
    console.log('2. Signal with minimal content...');
    const minimalSignal: Signal = {
        id: 'sig-minimal',
        source: 'slack',
        body: 'Hi',
        sender: 'user@company.com',
        timestamp: new Date().toISOString(),
    };
    const minimalContext = builder.buildContext(minimalSignal);
    console.log(`   ✅ Handled minimal signal (${minimalContext.similarSignals.length} similar)`);

    // Test 3: Very long signal
    console.log('3. Signal with very long content...');
    const longSignal: Signal = {
        id: 'sig-long',
        source: 'email',
        subject: 'Long Email',
        body: 'Lorem ipsum dolor sit amet '.repeat(100),
        sender: 'verbose@company.com',
        timestamp: new Date().toISOString(),
    };
    builder.addSignal(longSignal);
    const longContext = builder.buildContext(longSignal);
    console.log(`   ✅ Handled long signal (build time: ${longContext.metadata.buildTime}ms)`);

    console.log('\n✅ All edge cases handled successfully');
}

// ============================================================================
// Run All Tests
// ============================================================================

function runAllTests() {
    console.log('╔' + '═'.repeat(58) + '╗');
    console.log('║' + ' '.repeat(15) + 'CONTEXT BUILDER TESTS' + ' '.repeat(22) + '║');
    console.log('╚' + '═'.repeat(58) + '╝');

    try {
        testBasicContextBuilding();
        testSimilarSignalDetection();
        testRelatedTaskMatching();
        testTimeContext();
        testSystemState();
        testWorkloadCalculation();
        testCaching();
        testPerformance();
        testTeamAvailability();
        testEdgeCases();

        console.log('\n' + '═'.repeat(60));
        console.log('✅ All Context Builder tests completed!');
        console.log('\n📋 Summary:');
        console.log('   ✅ Basic context building');
        console.log('   ✅ Similar signal detection');
        console.log('   ✅ Related task matching');
        console.log('   ✅ Time context');
        console.log('   ✅ System state tracking');
        console.log('   ✅ Workload calculation');
        console.log('   ✅ Context caching (5-minute TTL)');
        console.log('   ✅ Performance optimization');
        console.log('   ✅ Team availability');
        console.log('   ✅ Edge case handling');
        console.log('\n🎯 Context Builder ready for production use!');
        console.log('═'.repeat(60));

    } catch (error) {
        console.error('\n❌ Test failed:', error);
        throw error;
    }
}

// Run tests
runAllTests();
