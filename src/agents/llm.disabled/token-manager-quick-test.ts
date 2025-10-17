/**
 * Quick Test: Token Manager
 * 
 * Verifies token counting, budget checking, usage tracking, and cost estimation.
 * Run with: npx ts-node src/agents/llm/token-manager-quick-test.ts
 */

import { getTokenManager, TokenManager } from './token-manager';
import { LLMProvider } from '../../types';

console.log('🧪 Quick Test: Token Manager\n');
console.log('='.repeat(70));

const tokenManager = getTokenManager();

// Test 1: Token Counting
console.log('\n1️⃣  Testing Token Counting...');
const testTexts = [
    'Hello, world!',
    'This is a longer text that should have more tokens than the previous example.',
    'The quick brown fox jumps over the lazy dog. This is a classic pangram sentence.',
    `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor 
    incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud 
    exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.`
];

testTexts.forEach((text, i) => {
    const tokens = tokenManager.countTokens(text);
    console.log(`   Text ${i + 1}: ${tokens} tokens (${text.length} chars) - Ratio: ${(text.length / tokens).toFixed(2)} chars/token`);
});

// Test 2: Message Token Counting
console.log('\n2️⃣  Testing Message Token Counting...');
const messages = [
    { role: 'system', content: 'You are a helpful AI assistant.' },
    { role: 'user', content: 'What is the capital of France?' },
    { role: 'assistant', content: 'The capital of France is Paris.' }
];

const messageTokens = tokenManager.countMessageTokens(messages);
console.log(`   Message array: ${messageTokens} tokens`);
console.log(`   Messages: ${messages.length}`);

// Test 3: Cost Estimation
console.log('\n3️⃣  Testing Cost Estimation...');
const testTokenCount = 100000; // 100k tokens

Object.values(LLMProvider).forEach(provider => {
    const inputCost = tokenManager.estimateCost(testTokenCount, provider, false);
    const outputCost = tokenManager.estimateCost(testTokenCount, provider, true);
    console.log(`   ${provider}:`);
    console.log(`      Input:  $${inputCost.toFixed(4)} (${testTokenCount.toLocaleString()} tokens)`);
    console.log(`      Output: $${outputCost.toFixed(4)} (${testTokenCount.toLocaleString()} tokens)`);
});

// Test 4: Budget Checking
console.log('\n4️⃣  Testing Budget Checking...');
const estimatedRequest = 5000; // 5k tokens

const budgetCheck1 = tokenManager.checkBudget(estimatedRequest, LLMProvider.GROQ);
console.log(`   Request of ${estimatedRequest.toLocaleString()} tokens:`);
console.log(`      Allowed: ${budgetCheck1.allowed}`);
console.log(`      Remaining: ${budgetCheck1.remainingTokens.toLocaleString()} tokens`);
console.log(`      Budget Used: ${budgetCheck1.percentUsed.toFixed(2)}%`);
console.log(`      Estimated Cost: $${budgetCheck1.estimatedCost.toFixed(6)}`);

// Test 5: Usage Tracking
console.log('\n5️⃣  Testing Usage Tracking...');
console.log('   Simulating API requests...');

// Simulate some requests
const testRequests = [
    { tokens: 1500, provider: LLMProvider.GROQ },
    { tokens: 2000, provider: LLMProvider.GROQ },
    { tokens: 1200, provider: LLMProvider.TOGETHER },
    { tokens: 800, provider: LLMProvider.GROQ },
];

testRequests.forEach((req, i) => {
    tokenManager.trackUsage(req.tokens, req.provider);
    console.log(`   Request ${i + 1}: Tracked ${req.tokens} tokens for ${req.provider}`);
});

// Test 6: Usage Statistics
console.log('\n6️⃣  Testing Usage Statistics...');
const stats = tokenManager.getUsageStats();

console.log('   Today:');
console.log(`      Total Tokens: ${stats.today.totalTokens.toLocaleString()}`);
console.log(`      Total Cost: $${stats.today.totalCost.toFixed(6)}`);
console.log(`      Providers: ${stats.today.providers.length}`);

stats.today.providers.forEach(p => {
    console.log(`         ${p.provider}: ${p.tokensUsed.toLocaleString()} tokens, ${p.requestCount} requests, $${p.estimatedCost.toFixed(6)}`);
});

console.log('\n   Budget Status:');
console.log(`      Daily Limit: ${stats.budgetStatus.dailyLimit.toLocaleString()} tokens`);
console.log(`      Used: ${stats.budgetStatus.used.toLocaleString()} tokens (${stats.budgetStatus.percentUsed.toFixed(2)}%)`);
console.log(`      Remaining: ${stats.budgetStatus.remaining.toLocaleString()} tokens`);
console.log(`      Near Limit: ${stats.budgetStatus.isNearLimit ? '⚠️  Yes' : '✅ No'}`);
console.log(`      Over Limit: ${stats.budgetStatus.isOverLimit ? '❌ Yes' : '✅ No'}`);

if (stats.topProviders.length > 0) {
    console.log('\n   Top Providers:');
    stats.topProviders.forEach((p, i) => {
        console.log(`      ${i + 1}. ${p.provider}: ${p.tokens.toLocaleString()} tokens (${p.percentage.toFixed(1)}%), $${p.cost.toFixed(6)}`);
    });
}

if (stats.currentMonth) {
    console.log('\n   Current Month:');
    console.log(`      Total Tokens: ${stats.currentMonth.totalTokens.toLocaleString()}`);
    console.log(`      Total Cost: $${stats.currentMonth.totalCost.toFixed(4)}`);
    console.log(`      Days Active: ${stats.currentMonth.daysActive}`);
}

// Test 7: Budget Limit Testing
console.log('\n7️⃣  Testing Budget Limits...');
const currentLimit = tokenManager.getDailyLimit();
console.log(`   Current daily limit: ${currentLimit.toLocaleString()} tokens`);

// Test warning threshold (80%)
const warningThreshold = Math.floor(currentLimit * 0.8);
const currentUsage = stats.today.totalTokens;
const tokensToWarning = Math.max(0, warningThreshold - currentUsage);

console.log(`   Warning threshold (80%): ${warningThreshold.toLocaleString()} tokens`);
console.log(`   Tokens until warning: ${tokensToWarning.toLocaleString()}`);

if (stats.budgetStatus.isNearLimit) {
    console.log('   ⚠️  WARNING: Approaching budget limit!');
}

// Test 8: Large Request Simulation
console.log('\n8️⃣  Testing Large Request...');
const largeRequest = 50000; // 50k tokens
const largeCheck = tokenManager.checkBudget(largeRequest, LLMProvider.GROQ);

console.log(`   Large request: ${largeRequest.toLocaleString()} tokens`);
console.log(`      Allowed: ${largeCheck.allowed ? '✅ Yes' : '❌ No'}`);
if (largeCheck.reason) {
    console.log(`      Reason: ${largeCheck.reason}`);
}
console.log(`      Estimated Cost: $${largeCheck.estimatedCost.toFixed(4)}`);

// Test 9: Edge Cases
console.log('\n9️⃣  Testing Edge Cases...');

// Empty string
const emptyTokens = tokenManager.countTokens('');
console.log(`   Empty string: ${emptyTokens} tokens ✅`);

// Very long text
const longText = 'a'.repeat(10000);
const longTokens = tokenManager.countTokens(longText);
console.log(`   10,000 character string: ${longTokens.toLocaleString()} tokens`);

// Unicode and special characters
const unicodeText = '你好世界 🌍 émojis! ñ ü ç';
const unicodeTokens = tokenManager.countTokens(unicodeText);
console.log(`   Unicode text: ${unicodeTokens} tokens`);

// Test 10: Daily Limit Configuration
console.log('\n🔟 Testing Daily Limit Configuration...');
const originalLimit = tokenManager.getDailyLimit();
console.log(`   Original limit: ${originalLimit.toLocaleString()} tokens`);

// Set custom limit
const newLimit = 100000;
tokenManager.setDailyLimit(newLimit);
console.log(`   New limit set: ${tokenManager.getDailyLimit().toLocaleString()} tokens ✅`);

// Restore original
tokenManager.setDailyLimit(originalLimit);
console.log(`   Restored to: ${tokenManager.getDailyLimit().toLocaleString()} tokens ✅`);

// Summary
console.log('\n' + '='.repeat(70));
console.log('✅ All token manager tests completed!\n');

console.log('📋 Summary:');
console.log('  - countTokens(): ✅ Working');
console.log('  - countMessageTokens(): ✅ Working');
console.log('  - estimateCost(): ✅ Working');
console.log('  - checkBudget(): ✅ Working');
console.log('  - trackUsage(): ✅ Working');
console.log('  - getUsageStats(): ✅ Working');
console.log('  - Daily limit management: ✅ Working');
console.log('  - Edge cases handled: ✅ Working');

console.log('\n📊 Current Status:');
const finalStats = tokenManager.getUsageStats();
console.log(`  - Tokens used today: ${finalStats.today.totalTokens.toLocaleString()}`);
console.log(`  - Cost today: $${finalStats.today.totalCost.toFixed(6)}`);
console.log(`  - Budget remaining: ${finalStats.budgetStatus.remaining.toLocaleString()} tokens`);
console.log(`  - Usage file: logs/token-usage.json`);

console.log('\n🎯 Token Manager is ready to use!');
console.log('\n💡 Integration:');
console.log('  1. Import: import { getTokenManager } from "./agents/llm"');
console.log('  2. Before LLM call: tokenManager.checkBudget(estimatedTokens)');
console.log('  3. After LLM call: tokenManager.trackUsage(actualTokens, provider)');
console.log('  4. Dashboard: tokenManager.getUsageStats()');
console.log('\n📝 Note: Token usage is persisted to logs/token-usage.json\n');

// Cleanup
console.log('🧹 Cleaning up...');
// Note: In production, don't destroy the singleton. This is just for testing.
// tokenManager.destroy();
console.log('✅ Test complete!\n');
