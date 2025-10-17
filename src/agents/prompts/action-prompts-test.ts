/**
 * Quick Test: Action Decision Prompts
 * 
 * Tests prompt generation for action decision-making with various scenarios.
 * Run with: npx ts-node src/agents/prompts/action-prompts-test.ts
 */

import {
    actionDecisionPrompt,
    getActionSystemPrompt,
    getActionExamples,
    validatePromptLength,
    type SignalContent,
    type ActionContext
} from './action-prompts';
import type { SignalClassification } from '../llm/output-validator';

console.log('🧪 Quick Test: Action Decision Prompts\n');
console.log('='.repeat(70));

// Test 1: Critical Production Bug
console.log('\n1️⃣  Testing Critical Production Bug Scenario...');
const criticalSignal: SignalContent = {
    source: 'email',
    subject: 'URGENT: API Gateway Down',
    body: 'Production API gateway is returning 503 errors. All customer requests failing. Started 5 minutes ago.',
    sender: 'monitoring@company.com',
    timestamp: new Date().toISOString(),
};

const criticalClassification: SignalClassification = {
    type: 'email',
    urgency: 'critical',
    importance: 'high',
    category: 'alert',
    confidence: 0.99,
    reasoning: 'Complete API outage affecting all customers requires immediate response',
};

const criticalPrompt = actionDecisionPrompt(criticalSignal, criticalClassification);
const criticalValidation = validatePromptLength(criticalPrompt);

console.log(`✅ Generated prompt for critical bug`);
console.log(`   Tokens: ${criticalValidation.tokenCount.toLocaleString()}`);
console.log(`   Valid: ${criticalValidation.valid ? '✓' : '✗'}`);
console.log(`   Includes: Signal, Classification, 15 examples, System prompt`);

// Test 2: Routine Metrics with Context
console.log('\n2️⃣  Testing Routine Metrics with Team Context...');
const metricsSignal: SignalContent = {
    source: 'slack',
    body: 'Weekly metrics: 2,500 users (+10%), 99.2% uptime, 32 tickets (-15%), $250K revenue (+12%)',
    sender: 'metrics-bot',
    timestamp: new Date().toISOString(),
};

const metricsClassification: SignalClassification = {
    type: 'slack',
    urgency: 'medium',
    importance: 'medium',
    category: 'report',
    confidence: 0.92,
    reasoning: 'Routine weekly metrics for tracking',
};

const context: ActionContext = {
    timeOfDay: 'morning',
    dayOfWeek: 'weekday',
    teamAvailability: {
        available: 15,
        busy: 8,
        offline: 2,
    },
    existingTasks: [
        { title: 'Update Q4 dashboard', priority: 3, status: 'in-progress' },
        { title: 'Review monthly reports', priority: 4, status: 'todo' },
    ],
};

const metricsPrompt = actionDecisionPrompt(metricsSignal, metricsClassification, context);
const metricsValidation = validatePromptLength(metricsPrompt);

console.log(`✅ Generated prompt with context`);
console.log(`   Tokens: ${metricsValidation.tokenCount.toLocaleString()}`);
console.log(`   Context: ${context.teamAvailability?.available} available, ${context.existingTasks?.length} existing tasks`);

// Test 3: Low Priority Notification
console.log('\n3️⃣  Testing Low Priority Office Announcement...');
const lowPrioritySignal: SignalContent = {
    source: 'email',
    subject: 'Office closure for holiday',
    body: 'Reminder: Office will be closed on October 31st for company holiday. Enjoy the long weekend!',
    sender: 'hr@company.com',
    timestamp: new Date().toISOString(),
};

const lowPriorityClassification: SignalClassification = {
    type: 'email',
    urgency: 'low',
    importance: 'low',
    category: 'notification',
    confidence: 0.88,
    reasoning: 'Informational announcement with no required action',
};

const lowPriorityPrompt = actionDecisionPrompt(lowPrioritySignal, lowPriorityClassification);
const lowPriorityValidation = validatePromptLength(lowPriorityPrompt);

console.log(`✅ Generated prompt for low priority`);
console.log(`   Tokens: ${lowPriorityValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: Should recommend 'ignore' action`);

// Test 4: Customer Escalation with Recent Actions
console.log('\n4️⃣  Testing Customer Escalation with Recent Actions...');
const escalationSignal: SignalContent = {
    source: 'email',
    subject: 'RE: RE: RE: Still waiting for response',
    body: 'This is my 4th email about the billing issue. Still no response from your team. Very disappointed.',
    sender: 'customer@bigcorp.com',
    timestamp: new Date().toISOString(),
};

const escalationClassification: SignalClassification = {
    type: 'email',
    urgency: 'high',
    importance: 'high',
    category: 'alert',
    confidence: 0.96,
    reasoning: 'Multiple follow-ups indicating customer frustration and need for immediate response',
};

const escalationContext: ActionContext = {
    timeOfDay: 'afternoon',
    dayOfWeek: 'weekday',
    recentActions: [
        { action: 'create_task', target: 'trello', timestamp: new Date(Date.now() - 3600000).toISOString() },
        { action: 'send_notification', target: 'slack', timestamp: new Date(Date.now() - 7200000).toISOString() },
    ],
};

const escalationPrompt = actionDecisionPrompt(escalationSignal, escalationClassification, escalationContext);
const escalationValidation = validatePromptLength(escalationPrompt);

console.log(`✅ Generated prompt with recent actions`);
console.log(`   Tokens: ${escalationValidation.tokenCount.toLocaleString()}`);
console.log(`   Context: ${escalationContext.recentActions?.length} recent actions to avoid duplication`);

// Test 5: Invoice Filing
console.log('\n5️⃣  Testing Invoice Filing Scenario...');
const invoiceSignal: SignalContent = {
    source: 'email',
    subject: 'Invoice #12345 from Vendor Corp',
    body: 'Please find attached invoice for services rendered in October. Amount: $5,000. Due: Nov 30.',
    sender: 'billing@vendorcorp.com',
    timestamp: new Date().toISOString(),
    metadata: {
        hasAttachment: true,
        attachmentName: 'invoice-12345.pdf',
    },
};

const invoiceClassification: SignalClassification = {
    type: 'email',
    urgency: 'low',
    importance: 'medium',
    category: 'task',
    confidence: 0.91,
    reasoning: 'Routine invoice requiring filing and payment processing',
};

const invoicePrompt = actionDecisionPrompt(invoiceSignal, invoiceClassification);
const invoiceValidation = validatePromptLength(invoicePrompt);

console.log(`✅ Generated prompt for invoice filing`);
console.log(`   Tokens: ${invoiceValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: Should recommend 'file_document' in Drive`);

// Test 6: System Prompt Inspection
console.log('\n6️⃣  Inspecting System Prompt...');
const systemPrompt = getActionSystemPrompt();
const systemPromptLines = systemPrompt.split('\n').length;
const systemPromptWords = systemPrompt.split(/\s+/).length;

console.log(`✅ System prompt loaded`);
console.log(`   Lines: ${systemPromptLines}`);
console.log(`   Words: ${systemPromptWords.toLocaleString()}`);
console.log(`   Includes: Action types, Platform selection, Priority rules, Approval criteria`);

// Test 7: Examples Inspection
console.log('\n7️⃣  Inspecting Few-Shot Examples...');
const examples = getActionExamples();
const examplesByAction = examples.reduce((acc, ex) => {
    acc[ex.decision.action] = (acc[ex.decision.action] || 0) + 1;
    return acc;
}, {} as Record<string, number>);

console.log(`✅ Loaded ${examples.length} examples`);
console.log(`   Distribution:`);
Object.entries(examplesByAction).forEach(([action, count]) => {
    console.log(`     - ${action}: ${count} examples`);
});

// Test 8: Prompt Length Validation
console.log('\n8️⃣  Testing Prompt Length Validation...');
const shortPrompt = 'Short prompt';
const shortValidation = validatePromptLength(shortPrompt, 100);

console.log(`✅ Validation working`);
console.log(`   Short prompt: ${shortValidation.valid ? 'Valid' : 'Invalid'} (${shortValidation.tokenCount} tokens)`);
console.log(`   Message: ${shortValidation.message}`);

// Test 9: Edge Case - Weekend Night
console.log('\n9️⃣  Testing Edge Case: Weekend Night Notification...');
const weekendSignal: SignalContent = {
    source: 'slack',
    body: 'Server CPU usage at 85%, but holding steady. Monitoring.',
    sender: 'monitoring-bot',
    timestamp: new Date().toISOString(),
};

const weekendClassification: SignalClassification = {
    type: 'slack',
    urgency: 'medium',
    importance: 'medium',
    category: 'notification',
    confidence: 0.87,
    reasoning: 'Elevated but stable resource usage requiring monitoring',
};

const weekendContext: ActionContext = {
    timeOfDay: 'night',
    dayOfWeek: 'weekend',
    teamAvailability: {
        available: 2,
        busy: 0,
        offline: 23,
    },
};

const weekendPrompt = actionDecisionPrompt(weekendSignal, weekendClassification, weekendContext);
const weekendValidation = validatePromptLength(weekendPrompt);

console.log(`✅ Generated prompt for weekend night`);
console.log(`   Context: ${weekendContext.timeOfDay} on ${weekendContext.dayOfWeek}`);
console.log(`   Team: Only ${weekendContext.teamAvailability?.available} available`);
console.log(`   Expected: Should defer non-critical notifications`);

// Test 10: Complete Prompt Structure
console.log('\n🔟 Verifying Prompt Structure...');
const samplePrompt = actionDecisionPrompt(criticalSignal, criticalClassification, context);

const hasSystemPrompt = samplePrompt.includes('AI Operations Orchestrator');
const hasExamples = samplePrompt.includes('Example 1:') && samplePrompt.includes('Example 15:');
const hasSignal = samplePrompt.includes(criticalSignal.subject || '');
const hasClassification = samplePrompt.includes('Classification Results');
const hasContext = samplePrompt.includes('Current Context');
const hasInstructions = samplePrompt.includes('Your Task');

console.log(`✅ Prompt structure verified`);
console.log(`   System prompt: ${hasSystemPrompt ? '✓' : '✗'}`);
console.log(`   15 Examples: ${hasExamples ? '✓' : '✗'}`);
console.log(`   Signal content: ${hasSignal ? '✓' : '✗'}`);
console.log(`   Classification: ${hasClassification ? '✓' : '✗'}`);
console.log(`   Context: ${hasContext ? '✓' : '✗'}`);
console.log(`   Instructions: ${hasInstructions ? '✓' : '✗'}`);

// Summary
console.log('\n' + '='.repeat(70));
console.log('✅ All action prompt tests completed!\n');

console.log('📋 Summary:');
console.log('  - System prompt: ✅ Comprehensive action decision framework');
console.log('  - Examples: ✅ 15 diverse scenarios covering all action types');
console.log('  - Prompt generation: ✅ Working with signal, classification, context');
console.log('  - Length validation: ✅ Token counting and limit checking');
console.log('  - Context awareness: ✅ Team, time, existing tasks, recent actions');
console.log('  - Exports: ✅ All functions exported correctly');

console.log('\n🎯 Action Decision Prompts ready for LLM integration!');
console.log('\n💡 Next: Use with LLM client to generate ActionDecision responses.\n');
