/**
 * Response Cache - Example Usage
 * 
 * Demonstrates how to use the ResponseCache for efficient LLM response caching
 */

import {
  getResponseCache,
  cacheResponse,
  getCachedResponse,
  getCacheEfficiency,
  getResponseCacheStats,
  markCacheFeedback,
  invalidateCacheBySource,
  warmCache,
  addWarmingPattern,
  loadCacheFromDisk,
  saveResponseCacheToDisk,
  type CacheKeyComponents,
  type WarmingPattern,
} from './index';

// ============================================================================
// Example 1: Basic Cache Usage
// ============================================================================

async function basicCacheUsage() {
  console.log('\n=== Example 1: Basic Cache Usage ===\n');
  
  // First request - cache miss
  const keyComponents: CacheKeyComponents = {
    prompt: 'Classify this email: "URGENT: Server is down"',
    model: 'gpt-4',
    temperature: 0.7,
  };
  
  let response = getCachedResponse(keyComponents);
  
  if (!response) {
    console.log('Cache miss - calling LLM...');
    // Simulate LLM call
    response = JSON.stringify({
      urgency: 'critical',
      category: 'incident',
      reasoning: 'Server downtime requires immediate attention',
    });
    
    // Cache the response
    await cacheResponse(
      keyComponents,
      response,
      undefined,
      'classification',
      { signalId: 'sig-123', source: 'email' }
    );
    console.log('Response cached');
  } else {
    console.log('Cache hit!');
  }
  
  console.log('Response:', response);
  
  // Second identical request - cache hit
  const response2 = getCachedResponse(keyComponents);
  console.log('\nSecond request - Cache hit:', response2 !== null);
}

// ============================================================================
// Example 2: Different TTLs for Different Types
// ============================================================================

async function ttlExample() {
  console.log('\n=== Example 2: Different TTLs ===\n');
  
  // Classification - 1 hour TTL
  const classificationKey: CacheKeyComponents = {
    prompt: 'Classify: "Meeting reminder"',
    model: 'gpt-4',
    temperature: 0.7,
  };
  
  await cacheResponse(
    classificationKey,
    '{"urgency":"low","category":"information"}',
    undefined,
    'classification'
  );
  console.log('Classification cached with 1 hour TTL');
  
  // Decision - 30 minute TTL
  const decisionKey: CacheKeyComponents = {
    prompt: 'Decide action for incident signal',
    model: 'gpt-4',
    temperature: 0.7,
  };
  
  await cacheResponse(
    decisionKey,
    '{"action":"create_task","platform":"notion"}',
    undefined,
    'decision'
  );
  console.log('Decision cached with 30 minute TTL');
  
  // Custom TTL - 10 minutes
  const customKey: CacheKeyComponents = {
    prompt: 'Temporary response',
    model: 'gpt-4',
    temperature: 0.7,
  };
  
  await cacheResponse(
    customKey,
    '{"result":"temporary"}',
    10 * 60 * 1000, // 10 minutes
    'other'
  );
  console.log('Custom response cached with 10 minute TTL');
}

// ============================================================================
// Example 3: Cache Invalidation Based on Feedback
// ============================================================================

async function feedbackInvalidation() {
  console.log('\n=== Example 3: Feedback-Based Invalidation ===\n');
  
  const keyComponents: CacheKeyComponents = {
    prompt: 'Classify: "Quarterly report ready"',
    model: 'gpt-4',
    temperature: 0.7,
  };
  
  // Cache initial response
  await cacheResponse(
    keyComponents,
    '{"urgency":"high","category":"information"}',
    undefined,
    'classification',
    { signalId: 'sig-200' }
  );
  console.log('Response cached');
  
  // Mark as correct - keeps cache
  markCacheFeedback(keyComponents, 'correct');
  console.log('Marked as correct - cache retained');
  
  let cached = getCachedResponse(keyComponents);
  console.log('Cache still available:', cached !== null);
  
  // Re-cache for next test
  await cacheResponse(
    keyComponents,
    '{"urgency":"high","category":"information"}',
    undefined,
    'classification',
    { signalId: 'sig-200' }
  );
  
  // Mark as incorrect - invalidates cache
  markCacheFeedback(keyComponents, 'incorrect');
  console.log('Marked as incorrect - cache invalidated');
  
  cached = getCachedResponse(keyComponents);
  console.log('Cache available after incorrect feedback:', cached !== null);
}

// ============================================================================
// Example 4: Source-Based Invalidation
// ============================================================================

async function sourceInvalidation() {
  console.log('\n=== Example 4: Source-Based Invalidation ===\n');
  
  // Cache multiple responses from same source
  const sources = ['email', 'slack', 'sheets'];
  
  for (let i = 0; i < 3; i++) {
    for (const source of sources) {
      const key: CacheKeyComponents = {
        prompt: `Classify signal ${i} from ${source}`,
        model: 'gpt-4',
        temperature: 0.7,
      };
      
      await cacheResponse(
        key,
        `{"urgency":"medium","category":"request"}`,
        undefined,
        'classification',
        { source }
      );
    }
  }
  
  console.log('Cached 9 responses (3 per source)');
  
  // Check initial stats
  let stats = getResponseCacheStats();
  console.log('Total cache entries:', stats.totalEntries);
  
  // Invalidate all email responses
  const invalidated = invalidateCacheBySource('email');
  console.log(`\nInvalidated ${invalidated} email entries`);
  
  stats = getResponseCacheStats();
  console.log('Remaining cache entries:', stats.totalEntries);
}

// ============================================================================
// Example 5: Cache Warming
// ============================================================================

async function cacheWarmingExample() {
  console.log('\n=== Example 5: Cache Warming ===\n');
  
  // Define common patterns
  const patterns: WarmingPattern[] = [
    {
      id: 'urgent-incident',
      type: 'common_signal',
      priority: 10,
      promptTemplate: 'Classify: Server incident notification',
      model: 'gpt-4',
      temperature: 0.7,
      precomputedResponse: JSON.stringify({
        urgency: 'critical',
        category: 'incident',
        reasoning: 'Server incidents require immediate attention',
      }),
    },
    {
      id: 'meeting-reminder',
      type: 'common_signal',
      priority: 5,
      promptTemplate: 'Classify: Meeting reminder notification',
      model: 'gpt-4',
      temperature: 0.7,
      precomputedResponse: JSON.stringify({
        urgency: 'low',
        category: 'information',
        reasoning: 'Routine meeting reminder',
      }),
    },
    {
      id: 'status-update',
      type: 'frequent_sender',
      priority: 7,
      promptTemplate: 'Classify: Daily status update',
      model: 'gpt-4',
      temperature: 0.7,
      precomputedResponse: JSON.stringify({
        urgency: 'low',
        category: 'information',
        reasoning: 'Routine status update',
      }),
    },
  ];
  
  // Add warming patterns
  patterns.forEach(pattern => addWarmingPattern(pattern));
  console.log('Added 3 warming patterns');
  
  // Warm cache
  const warmed = await warmCache();
  console.log(`Warmed ${warmed} cache entries`);
  
  // Verify cache hits
  const testKey: CacheKeyComponents = {
    prompt: 'Classify: Server incident notification',
    model: 'gpt-4',
    temperature: 0.7,
  };
  
  const cached = getCachedResponse(testKey);
  console.log('Pre-warmed entry available:', cached !== null);
}

// ============================================================================
// Example 6: Cache Efficiency Monitoring
// ============================================================================

async function efficiencyMonitoring() {
  console.log('\n=== Example 6: Cache Efficiency Monitoring ===\n');
  
  // Simulate usage pattern
  const prompts = [
    'Classify: Server alert',
    'Classify: Meeting reminder',
    'Classify: Status update',
    'Classify: Server alert', // Repeat
    'Classify: Meeting reminder', // Repeat
    'Classify: Bug report',
    'Classify: Server alert', // Repeat
  ];
  
  console.log('Simulating 7 requests (3 unique, 4 cache hits)...\n');
  
  for (let i = 0; i < prompts.length; i++) {
    const key: CacheKeyComponents = {
      prompt: prompts[i],
      model: 'gpt-4',
      temperature: 0.7,
    };
    
    const cached = getCachedResponse(key);
    
    if (!cached) {
      // Simulate LLM call
      await cacheResponse(
        key,
        `{"urgency":"medium","category":"request"}`,
        undefined,
        'classification'
      );
      console.log(`Request ${i + 1}: Cache MISS - LLM called`);
    } else {
      console.log(`Request ${i + 1}: Cache HIT - used cached response`);
    }
  }
  
  // Get efficiency metrics
  const efficiency = getCacheEfficiency();
  
  console.log('\nCache Efficiency Metrics:');
  console.log(`- Hit Rate: ${(efficiency.hitRate * 100).toFixed(1)}%`);
  console.log(`- Tokens Saved: ${efficiency.tokensSaved}`);
  console.log(`- Cost Saved: $${efficiency.costSaved.toFixed(4)}`);
  console.log(`- API Calls Avoided: ${efficiency.apiCallsAvoided}`);
  console.log(`- Time Saved: ${efficiency.timeSaved}ms`);
  console.log(`- Memory Usage: ${efficiency.memoryUsageMB.toFixed(2)} MB`);
  console.log(`- Efficiency Score: ${efficiency.efficiencyScore.toFixed(1)}/100`);
  
  // Get detailed stats
  const stats = getResponseCacheStats();
  
  console.log('\nDetailed Statistics:');
  console.log(`- Total Hits: ${stats.totalHits}`);
  console.log(`- Total Misses: ${stats.totalMisses}`);
  console.log(`- Total Entries: ${stats.totalEntries}`);
  console.log(`- Active Entries: ${stats.activeEntries}`);
  console.log(`- Hot Entries: ${stats.hotEntriesCount}`);
  console.log(`- Avg Hit Count: ${stats.avgHitCount.toFixed(2)}`);
}

// ============================================================================
// Example 7: Persistence (Save/Load)
// ============================================================================

async function persistenceExample() {
  console.log('\n=== Example 7: Cache Persistence ===\n');
  
  // Create some hot cache entries (high hit count)
  const hotKey: CacheKeyComponents = {
    prompt: 'Classify: Very common signal pattern',
    model: 'gpt-4',
    temperature: 0.7,
  };
  
  await cacheResponse(
    hotKey,
    '{"urgency":"medium","category":"request"}',
    undefined,
    'classification'
  );
  
  // Simulate hits to make it hot
  for (let i = 0; i < 6; i++) {
    getCachedResponse(hotKey);
  }
  
  console.log('Created hot cache entry (6 hits)');
  
  // Save to disk
  const saved = await saveResponseCacheToDisk();
  console.log(`Saved ${saved} hot entries to disk`);
  
  // Clear cache
  const cache = getResponseCache();
  cache.clearCache();
  console.log('Cache cleared from memory');
  
  // Load from disk
  const loaded = await loadCacheFromDisk();
  console.log(`Loaded ${loaded} entries from disk`);
  
  // Verify hot entry is available
  const restored = getCachedResponse(hotKey);
  console.log('Hot entry restored:', restored !== null);
}

// ============================================================================
// Example 8: Temperature Sensitivity
// ============================================================================

async function temperatureSensitivity() {
  console.log('\n=== Example 8: Temperature Sensitivity ===\n');
  
  const baseKey = {
    prompt: 'Classify: Ambiguous signal',
    model: 'gpt-4',
  };
  
  // Cache with temperature 0.7
  await cacheResponse(
    { ...baseKey, temperature: 0.7 },
    '{"urgency":"medium"}',
    undefined,
    'classification'
  );
  console.log('Cached with temperature 0.7');
  
  // Try to retrieve with different temperature
  const hit1 = getCachedResponse({ ...baseKey, temperature: 0.7 });
  const hit2 = getCachedResponse({ ...baseKey, temperature: 0.9 });
  
  console.log('Retrieved with temp 0.7:', hit1 !== null);
  console.log('Retrieved with temp 0.9:', hit2 !== null);
  console.log('\nNote: Different temperatures produce different cache keys');
}

// ============================================================================
// Example 9: Real-Time Statistics
// ============================================================================

async function realTimeStats() {
  console.log('\n=== Example 9: Real-Time Statistics ===\n');
  
  const cache = getResponseCache();
  
  // Initial state
  let stats = getResponseCacheStats();
  console.log('Initial Cache State:');
  console.log(`- Entries: ${stats.totalEntries}`);
  console.log(`- Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  
  // Add some entries
  for (let i = 0; i < 5; i++) {
    await cacheResponse(
      { prompt: `Test ${i}`, model: 'gpt-4', temperature: 0.7 },
      `{"result": "${i}"}`,
      undefined,
      'classification'
    );
  }
  
  stats = getResponseCacheStats();
  console.log('\nAfter Adding 5 Entries:');
  console.log(`- Entries: ${stats.totalEntries}`);
  console.log(`- Tokens Saved: ${stats.totalTokensSaved}`);
  
  // Generate some hits
  for (let i = 0; i < 5; i++) {
    getCachedResponse({ prompt: `Test ${i}`, model: 'gpt-4', temperature: 0.7 });
  }
  
  stats = getResponseCacheStats();
  console.log('\nAfter 5 Cache Hits:');
  console.log(`- Total Hits: ${stats.totalHits}`);
  console.log(`- Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
  console.log(`- Tokens Saved: ${stats.totalTokensSaved}`);
  console.log(`- Cost Saved: $${stats.estimatedCostSaved.toFixed(4)}`);
}

// ============================================================================
// Run All Examples
// ============================================================================

async function runAllExamples() {
  try {
    await basicCacheUsage();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await ttlExample();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await feedbackInvalidation();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await sourceInvalidation();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await cacheWarmingExample();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await efficiencyMonitoring();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await persistenceExample();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await temperatureSensitivity();
    await new Promise(resolve => setTimeout(resolve, 500));
    
    await realTimeStats();
    
    console.log('\n\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('Error running examples:', error);
  } finally {
    // Cleanup
    const cache = getResponseCache();
    cache.stopCleanupTimer();
  }
}

// Run if executed directly
if (require.main === module) {
  runAllExamples();
}

export {
  basicCacheUsage,
  ttlExample,
  feedbackInvalidation,
  sourceInvalidation,
  cacheWarmingExample,
  efficiencyMonitoring,
  persistenceExample,
  temperatureSensitivity,
  realTimeStats,
};
