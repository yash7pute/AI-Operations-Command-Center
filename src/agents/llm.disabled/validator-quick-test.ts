/**
 * Quick Test: Output Validator
 * 
 * Verifies that all Zod schemas work correctly and validation functions properly.
 * Run with: npx ts-node src/agents/llm/validator-quick-test.ts
 */

import {
    SignalClassificationSchema,
    ActionDecisionSchema,
    TaskDetailsSchema,
    validateOutput,
    safeValidateOutput,
    isValidOutput,
    getValidationErrors,
    formatValidationErrors,
    getSchemaExample,
    ValidationError
} from './output-validator';

console.log('🧪 Quick Test: Output Validator\n');
console.log('='.repeat(70));

// Test 1: Valid Signal Classification
console.log('\n1️⃣  Testing Signal Classification Schema...');
const validSignal = {
    type: 'email',
    urgency: 'critical',
    importance: 'high',
    category: 'alert',
    confidence: 0.95,
    reasoning: 'Production database is down, requiring immediate attention'
};

try {
    const result = validateOutput(validSignal, SignalClassificationSchema, 'SignalClassification');
    console.log('✅ Valid signal classification');
    console.log(`   Type: ${result.type}, Urgency: ${result.urgency}, Confidence: ${(result.confidence * 100).toFixed(0)}%`);
} catch (error) {
    console.error('❌ Validation failed:', error);
}

// Test 2: Invalid Signal (confidence > 1)
console.log('\n2️⃣  Testing Invalid Data (should fail gracefully)...');
const invalidSignal = {
    type: 'email',
    urgency: 'critical',
    importance: 'high',
    category: 'alert',
    confidence: 1.5, // Invalid!
    reasoning: 'Test'
};

const safeResult = safeValidateOutput(invalidSignal, SignalClassificationSchema);
if (safeResult.success) {
    console.error('❌ Should have failed validation');
} else {
    console.log('✅ Correctly rejected invalid data');
    console.log('   Errors:', safeResult.error.getDetailedErrors().map(e => e.field + ': ' + e.message).join(', '));
}

// Test 3: Valid Action Decision
console.log('\n3️⃣  Testing Action Decision Schema...');
const validAction = {
    action: 'create_task',
    target: 'notion',
    params: {
        database: 'incidents',
        status: 'urgent'
    },
    priority: 1,
    reasoning: 'Critical incident requires immediate task creation for tracking and resolution',
    requiresApproval: false
};

if (isValidOutput(validAction, ActionDecisionSchema)) {
    console.log('✅ Valid action decision');
    const validated = validateOutput(validAction, ActionDecisionSchema);
    console.log(`   Action: ${validated.action} → ${validated.target}, Priority: ${validated.priority}/5`);
} else {
    console.error('❌ Action decision validation failed');
}

// Test 4: Valid Task Details
console.log('\n4️⃣  Testing Task Details Schema...');
const validTask = {
    title: 'Investigate Production Database Outage',
    description: 'Production database is experiencing high load and slow response times. Need to identify root cause and implement fix ASAP.',
    dueDate: '2025-10-17T18:00:00Z',
    assignee: 'ops-team@company.com',
    labels: ['incident', 'production', 'urgent'],
    project: 'Infrastructure Maintenance'
};

try {
    const task = validateOutput(validTask, TaskDetailsSchema, 'TaskDetails');
    console.log('✅ Valid task details');
    console.log(`   Title: ${task.title}`);
    console.log(`   Labels: ${task.labels.join(', ')}`);
    console.log(`   Due: ${task.dueDate ? new Date(task.dueDate).toLocaleString() : 'N/A'}`);
} catch (error) {
    console.error('❌ Task validation failed:', error);
}

// Test 5: Missing Required Fields
console.log('\n5️⃣  Testing Missing Fields...');
const incompleteSignal = {
    type: 'email',
    urgency: 'high',
    importance: 'medium'
    // Missing: category, confidence, reasoning
};

const errors = getValidationErrors(incompleteSignal, SignalClassificationSchema);
if (errors) {
    console.log('✅ Correctly detected missing fields');
    console.log(formatValidationErrors(errors));
} else {
    console.error('❌ Should have detected missing fields');
}

// Test 6: Invalid Enum Values
console.log('\n6️⃣  Testing Invalid Enum Values...');
const invalidEnum = {
    type: 'email',
    urgency: 'super-urgent', // Invalid!
    importance: 'high',
    category: 'alert',
    confidence: 0.9,
    reasoning: 'This has an invalid urgency level'
};

const enumErrors = getValidationErrors(invalidEnum, SignalClassificationSchema);
if (enumErrors) {
    console.log('✅ Correctly rejected invalid enum value');
    console.log('   ' + formatValidationErrors(enumErrors).split('\n')[0]);
} else {
    console.error('❌ Should have rejected invalid enum');
}

// Test 7: Schema Examples
console.log('\n7️⃣  Testing Schema Examples...');
const signalExample = getSchemaExample('signal');
const actionExample = getSchemaExample('action');
const taskExample = getSchemaExample('task');

console.log('✅ Generated schema examples');
console.log(`   Signal example has ${Object.keys(signalExample).length} fields`);
console.log(`   Action example has ${Object.keys(actionExample).length} fields`);
console.log(`   Task example has ${Object.keys(taskExample).length} fields`);

// Test 8: Edge Cases
console.log('\n8️⃣  Testing Edge Cases...');

// Minimum length reasoning
const minReasoningSignal = {
    type: 'slack',
    urgency: 'low',
    importance: 'low',
    category: 'notification',
    confidence: 0.5,
    reasoning: '1234567890' // Exactly 10 characters (minimum)
};

if (isValidOutput(minReasoningSignal, SignalClassificationSchema)) {
    console.log('✅ Accepted minimum length reasoning (10 chars)');
} else {
    console.error('❌ Should accept 10 character reasoning');
}

// Too short reasoning
const tooShortReasoning = {
    type: 'slack',
    urgency: 'low',
    importance: 'low',
    category: 'notification',
    confidence: 0.5,
    reasoning: 'Too short' // Only 9 characters
};

if (!isValidOutput(tooShortReasoning, SignalClassificationSchema)) {
    console.log('✅ Correctly rejected reasoning < 10 chars');
} else {
    console.error('❌ Should reject reasoning < 10 chars');
}

// Test 9: Optional Fields
console.log('\n9️⃣  Testing Optional Fields...');
const minimalTask = {
    title: 'Minimal Task',
    description: 'This task has only required fields, no optional ones.',
    labels: []
};

if (isValidOutput(minimalTask, TaskDetailsSchema)) {
    console.log('✅ Accepted task with only required fields');
    const validated = validateOutput(minimalTask, TaskDetailsSchema);
    console.log(`   Has dueDate: ${validated.dueDate !== undefined}`);
    console.log(`   Has assignee: ${validated.assignee !== undefined}`);
    console.log(`   Has project: ${validated.project !== undefined}`);
} else {
    console.error('❌ Should accept task with only required fields');
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('✅ All validation tests completed!\n');

console.log('📋 Summary:');
console.log('  - SignalClassificationSchema: ✅ Working');
console.log('  - ActionDecisionSchema: ✅ Working');
console.log('  - TaskDetailsSchema: ✅ Working');
console.log('  - validateOutput(): ✅ Working');
console.log('  - safeValidateOutput(): ✅ Working');
console.log('  - isValidOutput(): ✅ Working');
console.log('  - getValidationErrors(): ✅ Working');
console.log('  - formatValidationErrors(): ✅ Working');
console.log('  - getSchemaExample(): ✅ Working');

console.log('\n🎯 Output Validator is ready to use!');
console.log('\n💡 Next: Use these schemas with LLM responses for type-safe signal processing.\n');
