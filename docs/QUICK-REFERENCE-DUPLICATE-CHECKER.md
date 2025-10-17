# Notion Duplicate Checker - Quick Reference

## 🚀 Quick Start

```typescript
import { checkDuplicate } from './workflows/executors/notion-duplicate-checker';

// Basic check
const result = await checkDuplicate('Fix login bug');
console.log(result.isDuplicate);  // true or false
console.log(result.similarity);   // 0.0 to 1.0
console.log(result.existingPageUrl);  // if duplicate
```

## 📋 API Reference

### `checkDuplicate(taskTitle, databaseId?)`
Checks if a task title already exists in Notion database.

**Parameters:**
- `taskTitle` (string, required) - Title to check
- `databaseId` (string, optional) - Database ID (uses env default if omitted)

**Returns:** `Promise<DuplicateCheckResult>`
```typescript
{
  isDuplicate: boolean;
  existingPageId?: string;
  existingPageUrl?: string;
  similarity: number;          // 0.0 to 1.0
  matchedTitle?: string;
}
```

### `clearCache()`
Clears the duplicate check cache.
```typescript
clearCache();
```

### `getCacheStats()`
Returns cache statistics.
```typescript
const stats = getCacheStats();
// { size: 45, oldestEntryAge: 123456 }
```

## 🎯 Common Patterns

### Pattern 1: Check Before Creating
```typescript
const check = await checkDuplicate('Fix bug');
if (!check.isDuplicate) {
  await createTask({ title: 'Fix bug' });
}
```

### Pattern 2: Automatic (Recommended)
```typescript
// Duplicate check happens automatically
const result = await NotionExecutor.createTask({
  title: 'Fix bug'
});

if (result.data.skipped) {
  console.log('Duplicate:', result.data.existingPageUrl);
}
```

### Pattern 3: Force Creation
```typescript
// Skip duplicate check
const result = await NotionExecutor.createTask(
  { title: 'Fix bug' },
  { skipDuplicateCheck: true }
);
```

### Pattern 4: Cache Management
```typescript
// Check cache status
const stats = getCacheStats();
console.log(`Cache: ${stats.size}/100`);

// Clear cache if needed
if (stats.size > 90) {
  clearCache();
}
```

## 📊 Similarity Scores

| Score | Meaning | Action |
|-------|---------|--------|
| 1.00 | Identical | Block |
| 0.90-0.99 | Nearly identical | Block |
| 0.85-0.89 | Very similar | Block |
| 0.70-0.84 | Somewhat similar | Allow |
| 0.50-0.69 | Different | Allow |
| < 0.50 | Very different | Allow |

## 🔧 Configuration

### Environment Variables
```bash
NOTION_API_KEY=secret_xxx
NOTION_DATABASE_ID=abc123def456
```

### Constants (in code)
```typescript
DUPLICATE_THRESHOLD = 0.85     // 85% similarity
MAX_CACHE_SIZE = 100           // Max cached entries
CACHE_TTL_MS = 300000          // 5 minutes
```

## 🎨 Examples

### Example 1: Simple Check
```typescript
const result = await checkDuplicate('Update documentation');

if (result.isDuplicate) {
  console.log(`Found duplicate: ${result.matchedTitle}`);
  console.log(`Similarity: ${(result.similarity * 100).toFixed(1)}%`);
  console.log(`URL: ${result.existingPageUrl}`);
} else {
  console.log('No duplicate found');
}
```

### Example 2: Multiple Checks
```typescript
const titles = [
  'Fix login bug',
  'Add new feature',
  'Update API docs'
];

for (const title of titles) {
  const check = await checkDuplicate(title);
  console.log(`${title}: ${check.isDuplicate ? '❌ Duplicate' : '✅ Unique'}`);
}
```

### Example 3: Error Handling
```typescript
try {
  const result = await checkDuplicate('Fix bug');
  // ... use result
} catch (error) {
  // Fail-open: errors return isDuplicate: false
  // But you can still log/handle errors
  console.error('Duplicate check failed:', error);
}
```

## 📈 Performance Tips

1. **Let it cache**: Don't clear cache unnecessarily
2. **Batch operations**: Group similar tasks to benefit from cache
3. **Use default DB**: Omit databaseId to use cached default
4. **Monitor stats**: Check getCacheStats() periodically

## 🐛 Troubleshooting

### "Database ID not configured"
**Solution:** Set `NOTION_DATABASE_ID` environment variable

### Low cache hit rate
**Solution:** Check if databaseId varies (different DBs = no cache hits)

### Slow performance
**Solution:** 
1. Check cache stats: `getCacheStats()`
2. Reduce page_size in code if database is huge
3. Ensure NOTION_API_KEY is valid

### False positives (non-duplicates flagged)
**Solution:** Lower threshold in code (e.g., 0.90 instead of 0.85)

### False negatives (duplicates missed)
**Solution:** Lower threshold in code (e.g., 0.80 instead of 0.85)

## 🔍 Debugging

### Enable debug logging
```typescript
// Set LOG_LEVEL=debug in environment
process.env.LOG_LEVEL = 'debug';
```

### Check what's cached
```typescript
const stats = getCacheStats();
console.log('Cache entries:', stats.size);
console.log('Oldest entry age:', stats.oldestEntryAge, 'ms');
```

### Test similarity calculation
```typescript
// Use the demo test file
npx ts-node src/workflows/executors/__tests__/notion-duplicate-checker.test.ts
```

## 📚 Related Files

- **Implementation**: `src/workflows/executors/notion-duplicate-checker.ts`
- **Integration**: `src/workflows/executors/notion-executor.ts`
- **Types**: `src/types/index.ts` (DuplicateCheckResult)
- **Tests**: `src/workflows/executors/__tests__/notion-duplicate-checker.test.ts`
- **Docs**: `docs/PROMPT-5-NOTION-DUPLICATE-CHECKER.md`

## 🎯 Best Practices

1. ✅ **Use automatic checking** (default behavior in NotionExecutor)
2. ✅ **Log duplicate detections** (automatically done)
3. ✅ **Let cache work** (don't clear unnecessarily)
4. ✅ **Handle skipped tasks** (check result.data.skipped)
5. ✅ **Monitor performance** (use getCacheStats)

6. ❌ **Don't bypass check** unless necessary
7. ❌ **Don't modify threshold** without testing
8. ❌ **Don't cache indefinitely** (5-min TTL is good)
9. ❌ **Don't ignore errors** (log for monitoring)

---

**Version**: 1.0.0  
**Last Updated**: October 16, 2025  
**Status**: Production Ready ✅
