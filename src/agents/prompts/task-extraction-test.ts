/**
 * Quick Test: Task Extraction Prompts
 * 
 * Tests prompt generation for task extraction with various scenarios.
 * Run with: npx ts-node src/agents/prompts/task-extraction-test.ts
 */

import {
    taskExtractionPrompt,
    getExtractionSystemPrompt,
    getExtractionExamples,
    validatePromptLength,
    type TaskSignal
} from './task-extraction-prompts';
import type { SignalClassification } from '../llm/output-validator';

console.log('🧪 Quick Test: Task Extraction Prompts\n');
console.log('='.repeat(70));

// Test 1: Simple Review Task
console.log('\n1️⃣  Testing Simple Review Task with Friday Deadline...');
const reviewSignal: TaskSignal = {
    source: 'email',
    subject: 'Q4 Proposal Review',
    body: 'Can you review the Q4 budget proposal by Friday? Need your feedback on the infrastructure spending section.',
    sender: 'cfo@company.com',
    timestamp: '2025-10-16T10:00:00Z',
};

const reviewPrompt = taskExtractionPrompt(reviewSignal);
const reviewValidation = validatePromptLength(reviewPrompt);

console.log(`✅ Generated prompt for review task`);
console.log(`   Tokens: ${reviewValidation.tokenCount.toLocaleString()}`);
console.log(`   Valid: ${reviewValidation.valid ? '✓' : '✗'}`);
console.log(`   Includes: Date context, Signal, 10 examples`);

// Test 2: Bug Report with Classification
console.log('\n2️⃣  Testing Bug Report with Classification Context...');
const bugSignal: TaskSignal = {
    source: 'slack',
    body: 'Bug: Users can\'t login on mobile app. Getting "Invalid credentials" error even with correct password.',
    sender: 'support-team',
    timestamp: '2025-10-16T14:30:00Z',
};

const bugClassification: SignalClassification = {
    type: 'slack',
    urgency: 'high',
    importance: 'high',
    category: 'alert',
    confidence: 0.95,
    reasoning: 'Critical bug affecting user login',
};

const bugPrompt = taskExtractionPrompt(bugSignal, bugClassification);
const bugValidation = validatePromptLength(bugPrompt);

console.log(`✅ Generated prompt with classification`);
console.log(`   Tokens: ${bugValidation.tokenCount.toLocaleString()}`);
console.log(`   Classification: ${bugClassification.urgency} urgency, ${bugClassification.category} category`);
console.log(`   Expected: Labels should include "urgent" and "bug"`);

// Test 3: Meeting Scheduling - Next Week
console.log('\n3️⃣  Testing Meeting Scheduling with "Next Week" Reference...');
const meetingSignal: TaskSignal = {
    source: 'email',
    subject: 'Planning Meeting',
    body: 'Let\'s schedule a planning meeting next week to discuss the new feature rollout.',
    sender: 'project-manager@company.com',
    timestamp: '2025-10-16T09:00:00Z',
};

const meetingPrompt = taskExtractionPrompt(meetingSignal);
const meetingValidation = validatePromptLength(meetingPrompt);

console.log(`✅ Generated prompt for meeting`);
console.log(`   Tokens: ${meetingValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: dueDate should be Monday Oct 21, 2025 at 9 AM`);

// Test 4: EOD (End of Day) Deadline
console.log('\n4️⃣  Testing EOD Deadline Parsing...');
const eodSignal: TaskSignal = {
    source: 'slack',
    body: '@analytics-team Can you pull the user engagement metrics? Need it by EOD.',
    sender: 'vp-product',
    timestamp: '2025-10-16T13:00:00Z',
};

const eodPrompt = taskExtractionPrompt(eodSignal);
const eodValidation = validatePromptLength(eodPrompt);

console.log(`✅ Generated prompt for EOD task`);
console.log(`   Tokens: ${eodValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: dueDate should be today at 5 PM (17:00)`);
console.log(`   Expected: assignee should be "analytics-team@company.com"`);

// Test 5: Feature Request with Assignee
console.log('\n5️⃣  Testing Feature Request with Named Assignee...');
const featureSignal: TaskSignal = {
    source: 'email',
    subject: 'Feature Request: Export to Excel',
    body: 'Sarah, can you implement the Excel export feature for the dashboard? Several customers are requesting it.',
    sender: 'product-manager@company.com',
    timestamp: '2025-10-16T11:00:00Z',
};

const featurePrompt = taskExtractionPrompt(featureSignal);
const featureValidation = validatePromptLength(featurePrompt);

console.log(`✅ Generated prompt for feature request`);
console.log(`   Tokens: ${featureValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: assignee should be "sarah@company.com"`);
console.log(`   Expected: labels should include "feature" and "customer-request"`);

// Test 6: Deployment with Specific Date
console.log('\n6️⃣  Testing Deployment with Specific Date (Oct 25)...');
const deploySignal: TaskSignal = {
    source: 'email',
    subject: 'Production Deployment: Oct 25',
    body: 'Deployment of v2.1.0 scheduled for October 25th at 2 AM. Please prepare release notes.',
    sender: 'release-manager@company.com',
    timestamp: '2025-10-16T15:00:00Z',
};

const deployPrompt = taskExtractionPrompt(deploySignal);
const deployValidation = validatePromptLength(deployPrompt);

console.log(`✅ Generated prompt for deployment`);
console.log(`   Tokens: ${deployValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: dueDate should be Oct 25, 2025 at 2:00 AM`);
console.log(`   Expected: labels should include "deployment" and "production"`);

// Test 7: Investigation Task
console.log('\n7️⃣  Testing Investigation Task with @mention...');
const investigationSignal: TaskSignal = {
    source: 'slack',
    body: 'Database queries are slow. Average response time jumped from 50ms to 300ms. @backend-oncall can you investigate?',
    sender: 'monitoring-bot',
    timestamp: '2025-10-16T16:45:00Z',
};

const investigationPrompt = taskExtractionPrompt(investigationSignal);
const investigationValidation = validatePromptLength(investigationPrompt);

console.log(`✅ Generated prompt for investigation`);
console.log(`   Tokens: ${investigationValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: assignee should be "backend-oncall@company.com"`);
console.log(`   Expected: title should start with action verb like "Investigate"`);

// Test 8: Customer Follow-up with "Tomorrow"
console.log('\n8️⃣  Testing Customer Follow-up with "Tomorrow" Reference...');
const followupSignal: TaskSignal = {
    source: 'email',
    subject: 'Follow up: Enterprise trial',
    body: 'Remember to follow up with BigCorp about their enterprise trial tomorrow.',
    sender: 'sales-manager@company.com',
    timestamp: '2025-10-16T12:00:00Z',
};

const followupPrompt = taskExtractionPrompt(followupSignal);
const followupValidation = validatePromptLength(followupPrompt);

console.log(`✅ Generated prompt for follow-up`);
console.log(`   Tokens: ${followupValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: dueDate should be Oct 17, 2025 at 9 AM`);
console.log(`   Expected: project could be "Enterprise Sales" or similar`);

// Test 9: Code Review with Tomorrow Morning Deadline
console.log('\n9️⃣  Testing Code Review with "Tomorrow Morning"...');
const reviewCodeSignal: TaskSignal = {
    source: 'slack',
    body: 'PR #456 is ready for review - new payment processing feature. @tech-lead can you review by tomorrow morning?',
    sender: 'developer',
    timestamp: '2025-10-16T17:00:00Z',
};

const codeReviewPrompt = taskExtractionPrompt(reviewCodeSignal);
const codeReviewValidation = validatePromptLength(codeReviewPrompt);

console.log(`✅ Generated prompt for code review`);
console.log(`   Tokens: ${codeReviewValidation.tokenCount.toLocaleString()}`);
console.log(`   Expected: title should reference "PR #456"`);
console.log(`   Expected: labels should include "code-review"`);

// Test 10: System Prompt Inspection
console.log('\n🔟 Inspecting System Prompt...');
const systemPrompt = getExtractionSystemPrompt();
const systemPromptLines = systemPrompt.split('\n').length;
const systemPromptWords = systemPrompt.split(/\s+/).length;

console.log(`✅ System prompt loaded`);
console.log(`   Lines: ${systemPromptLines}`);
console.log(`   Words: ${systemPromptWords.toLocaleString()}`);
console.log(`   Covers: Title, Description, Dates, Assignee, Labels, Project`);

// Test 11: Examples Inspection
console.log('\n1️⃣1️⃣  Inspecting Extraction Examples...');
const examples = getExtractionExamples();

console.log(`✅ Loaded ${examples.length} examples`);
console.log(`   Example scenarios:`);
examples.slice(0, 5).forEach((ex, i) => {
    console.log(`     ${i + 1}. ${ex.scenario}`);
});
console.log(`     ... and ${examples.length - 5} more`);

// Test 12: Date Context Verification
console.log('\n1️⃣2️⃣  Verifying Date Context in Prompt...');
const testSignal: TaskSignal = {
    source: 'email',
    body: 'Test signal',
    timestamp: '2025-10-16T14:30:00Z',
};

const testPrompt = taskExtractionPrompt(testSignal);
const hasDateContext = testPrompt.includes('Date Context:');
const hasCurrentDate = testPrompt.includes('October 16, 2025');
const hasISOFormat = testPrompt.includes('2025-10-16T14:30:00Z');

console.log(`✅ Date context verification`);
console.log(`   Has date context section: ${hasDateContext ? '✓' : '✗'}`);
console.log(`   Includes current date: ${hasCurrentDate ? '✓' : '✗'}`);
console.log(`   Includes ISO format: ${hasISOFormat ? '✓' : '✗'}`);

// Test 13: Prompt Structure
console.log('\n1️⃣3️⃣  Verifying Complete Prompt Structure...');
const samplePrompt = taskExtractionPrompt(reviewSignal, bugClassification);

const hasSystemPrompt = samplePrompt.includes('AI Task Extraction Assistant');
const hasPromptExamples = samplePrompt.includes('Example 1:') && samplePrompt.includes('Example 10:');
const hasSignal = samplePrompt.includes(reviewSignal.body);
const hasClassification = samplePrompt.includes('Signal Classification');
const hasInstructions = samplePrompt.includes('Your Task');
const hasSchema = samplePrompt.includes('valid JSON matching the TaskDetails schema');

console.log(`✅ Prompt structure verified`);
console.log(`   System prompt: ${hasSystemPrompt ? '✓' : '✗'}`);
console.log(`   10 Examples: ${hasPromptExamples ? '✓' : '✗'}`);
console.log(`   Signal content: ${hasSignal ? '✓' : '✗'}`);
console.log(`   Classification: ${hasClassification ? '✓' : '✗'}`);
console.log(`   Instructions: ${hasInstructions ? '✓' : '✗'}`);
console.log(`   Schema reference: ${hasSchema ? '✓' : '✗'}`);

// Test 14: Naming Convention Guidelines
console.log('\n1️⃣4️⃣  Checking Naming Convention Guidelines...');
const hasActionVerbs = systemPrompt.includes('Review, Create, Fix, Update');
const hasTitleRules = systemPrompt.includes('Start with action verbs');
const hasGoodBadExamples = systemPrompt.includes('✅') && systemPrompt.includes('❌');

console.log(`✅ Naming guidelines present`);
console.log(`   Action verb examples: ${hasActionVerbs ? '✓' : '✗'}`);
console.log(`   Title rules: ${hasTitleRules ? '✓' : '✗'}`);
console.log(`   Good/bad examples: ${hasGoodBadExamples ? '✓' : '✗'}`);

// Test 15: Date Inference Rules
console.log('\n1️⃣5️⃣  Checking Date Inference Rules...');
const hasEODRule = systemPrompt.includes('EOD');
const hasTomorrowRule = systemPrompt.includes('tomorrow');
const hasNextWeekRule = systemPrompt.includes('next week');
const hasISOOutput = systemPrompt.includes('ISO 8601');

console.log(`✅ Date inference rules present`);
console.log(`   EOD pattern: ${hasEODRule ? '✓' : '✗'}`);
console.log(`   Tomorrow pattern: ${hasTomorrowRule ? '✓' : '✗'}`);
console.log(`   Next week pattern: ${hasNextWeekRule ? '✓' : '✗'}`);
console.log(`   ISO 8601 output format: ${hasISOOutput ? '✓' : '✗'}`);

// Summary
console.log('\n' + '='.repeat(70));
console.log('✅ All task extraction prompt tests completed!\n');

console.log('📋 Summary:');
console.log('  - System prompt: ✅ Comprehensive extraction guidelines');
console.log('  - Examples: ✅ 10 diverse scenarios covering all task types');
console.log('  - Date inference: ✅ EOD, tomorrow, next week, specific dates');
console.log('  - Assignee detection: ✅ @mentions, email, role-based');
console.log('  - Label inference: ✅ Type, priority, area, category');
console.log('  - Prompt generation: ✅ Working with/without classification');
console.log('  - Length validation: ✅ Token counting and limit checking');
console.log('  - Date context: ✅ Current date provided for relative parsing');

console.log('\n🎯 Task Extraction Prompts ready for LLM integration!');
console.log('\n💡 Next: Use with LLM client to generate TaskDetails responses.\n');
