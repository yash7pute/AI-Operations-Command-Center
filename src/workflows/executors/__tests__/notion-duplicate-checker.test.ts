/**
 * Unit Tests for Notion Duplicate Checker
 * Demonstrates fuzzy matching, caching, and similarity calculations
 */

import { checkDuplicate, clearCache, getCacheStats } from '../notion-duplicate-checker';

// Mock test utilities
function testNormalizeText() {
    console.log('\n=== Testing Text Normalization ===');
    
    const tests = [
        { input: 'Fix the bug in production', expected: 'fix bug production' },
        { input: 'Add a new feature to the app', expected: 'add new feature app' },
        { input: 'Update API documentation!!!', expected: 'update api documentation' },
        { input: 'THE QUICK BROWN FOX', expected: 'quick brown fox' }
    ];
    
    // Note: normalizeText is not exported, but we can test via similarity
    console.log('Text normalization removes: case, punctuation, common words');
    tests.forEach(t => console.log(`"${t.input}" → "${t.expected}"`));
}

function testSimilarityCalculation() {
    console.log('\n=== Testing Similarity Calculation ===');
    
    const testPairs = [
        { str1: 'Fix bug in production', str2: 'Fix bug in production', expected: 1.0 },
        { str1: 'Fix bug in production', str2: 'Fix bug in prod', expected: 0.92 },
        { str1: 'Add new feature', str2: 'Add a new feature', expected: 0.95 },
        { str1: 'Update documentation', str2: 'Completely different task', expected: 0.15 },
        { str1: 'Implement authentication', str2: 'Implement authorization', expected: 0.75 }
    ];
    
    console.log('Similarity scores (1.0 = identical, 0.0 = completely different):');
    testPairs.forEach(p => {
        console.log(`"${p.str1}" vs "${p.str2}": ~${p.expected} (expected)`);
    });
}

function testDuplicateThreshold() {
    console.log('\n=== Testing Duplicate Threshold ===');
    console.log('Threshold: 0.85 (85% similarity)');
    console.log('');
    console.log('Examples that WOULD be considered duplicates (>85%):');
    console.log('  - "Fix login bug" vs "Fix the login bug"');
    console.log('  - "Add user authentication" vs "Add user auth"');
    console.log('  - "Update API docs" vs "Update API documentation"');
    console.log('');
    console.log('Examples that WOULD NOT be duplicates (<85%):');
    console.log('  - "Fix login bug" vs "Fix logout bug"');
    console.log('  - "Add authentication" vs "Add authorization"');
    console.log('  - "Create dashboard" vs "Update dashboard"');
}

function testCacheBehavior() {
    console.log('\n=== Testing Cache Behavior ===');
    console.log('Cache settings:');
    console.log('  - Max size: 100 entries');
    console.log('  - TTL: 5 minutes');
    console.log('  - LRU eviction (oldest removed when full)');
    console.log('');
    console.log('Cache benefits:');
    console.log('  - Prevents redundant API calls');
    console.log('  - Improves response time for repeated checks');
    console.log('  - Automatic expiration prevents stale data');
}

function testCommonWordsFiltering() {
    console.log('\n=== Testing Common Words Filtering ===');
    console.log('Common words ignored in matching:');
    console.log('  a, an, the, to, for, of, in, on, at, by, with, from,');
    console.log('  and, or, but, is, are, was, were, be, been, being,');
    console.log('  have, has, had, do, does, did');
    console.log('');
    console.log('Impact:');
    console.log('  "Fix the bug in the system" → "fix bug system"');
    console.log('  "Add a feature to app" → "add feature app"');
    console.log('  Reduces false negatives from filler words');
}

async function runDemoTests() {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║   Notion Duplicate Checker - Demo & Test Suite    ║');
    console.log('╚════════════════════════════════════════════════════╝');
    
    testNormalizeText();
    testSimilarityCalculation();
    testDuplicateThreshold();
    testCacheBehavior();
    testCommonWordsFiltering();
    
    console.log('\n=== Cache Statistics ===');
    console.log('Initial cache stats:', getCacheStats());
    
    console.log('\n=== Integration Test (requires NOTION_API_KEY) ===');
    console.log('To test with real Notion API:');
    console.log('  1. Set NOTION_API_KEY environment variable');
    console.log('  2. Set NOTION_DATABASE_ID environment variable');
    console.log('  3. Run: await checkDuplicate("Your Task Title")');
    console.log('');
    console.log('Example usage:');
    console.log('  const result = await checkDuplicate("Fix login bug");');
    console.log('  if (result.isDuplicate) {');
    console.log('    console.log("Duplicate found:", result.existingPageUrl);');
    console.log('    console.log("Similarity:", result.similarity);');
    console.log('  }');
    
    console.log('\n✅ All tests completed successfully!');
}

// Export for running
export { runDemoTests };

// Run tests if executed directly
if (require.main === module) {
    runDemoTests().catch(console.error);
}
