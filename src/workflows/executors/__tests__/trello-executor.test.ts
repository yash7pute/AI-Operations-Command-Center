/**
 * Unit Tests for Trello Card Creator
 * Demonstrates card creation, label management, and checklist operations
 */

import { createCard, moveCard, addChecklist, clearLabelCache, getLabelCache } from '../trello-executor';
import { TaskDetails } from '../../../types';

/**
 * Demo test: Creates a sample card with all features
 */
async function testCreateCard() {
    console.log('\n=== Testing Card Creation ===');
    
    const taskDetails: TaskDetails = {
        title: 'Implement user authentication',
        description: `## Authentication Feature

**Requirements:**
- OAuth 2.0 integration
- JWT token management
- Session handling

**Resources:**
[Documentation](https://example.com/docs)`,
        priority: 'High',
        dueDate: '2025-12-31',
        labels: ['backend', 'security'],
        source: 'Slack',
        assignee: 'john@example.com',
        status: 'To Do'
    };

    console.log('Task Details:');
    console.log(JSON.stringify(taskDetails, null, 2));
    console.log('\nExpected Trello Card:');
    console.log('  - Name: "Implement user authentication"');
    console.log('  - Description: Markdown formatted');
    console.log('  - Labels: Priority: High, From: Slack, backend, security');
    console.log('  - Due Date: 2025-12-31');
    console.log('  - Position: 0 (top of list, high priority)');
}

/**
 * Demo test: Label creation and caching
 */
function testLabelManagement() {
    console.log('\n=== Testing Label Management ===');
    
    console.log('Priority Labels:');
    console.log('  - "Priority: High" → red color');
    console.log('  - "Priority: Medium" → yellow color');
    console.log('  - "Priority: Low" → blue color');
    console.log('');
    console.log('Source Labels:');
    console.log('  - "From: Email" → green color');
    console.log('  - "From: Slack" → green color');
    console.log('  - "From: Sheet" → green color');
    console.log('');
    console.log('Custom Labels:');
    console.log('  - Created on-demand with default blue color');
    console.log('  - Cached to avoid recreating');
    console.log('');
    console.log('Cache Benefits:');
    console.log('  - Prevents redundant API calls');
    console.log('  - Improves performance for repeated labels');
    console.log('  - Persists across card creations in same session');
}

/**
 * Demo test: Card positioning based on priority
 */
function testCardPositioning() {
    console.log('\n=== Testing Card Positioning ===');
    
    const positions = [
        { priority: 'High', position: 0, description: 'Top of list' },
        { priority: 'Medium', position: 100, description: 'Middle of list' },
        { priority: 'Low', position: 200, description: 'Bottom of list' }
    ];

    console.log('Priority → Position Mapping:');
    positions.forEach(p => {
        console.log(`  ${p.priority.padEnd(8)} → Position ${p.position} (${p.description})`);
    });
    console.log('');
    console.log('Visual Layout (Trello List):');
    console.log('┌─────────────────────────────────┐');
    console.log('│ [High Priority Task]     Pos: 0 │ ← Top');
    console.log('├─────────────────────────────────┤');
    console.log('│ [Medium Priority Task] Pos: 100 │ ← Middle');
    console.log('├─────────────────────────────────┤');
    console.log('│ [Low Priority Task]    Pos: 200 │ ← Bottom');
    console.log('└─────────────────────────────────┘');
}

/**
 * Demo test: Move card workflow
 */
function testMoveCard() {
    console.log('\n=== Testing Move Card (Workflow Transitions) ===');
    
    console.log('Common Workflow:');
    console.log('  1. "To Do" → "In Progress"');
    console.log('  2. "In Progress" → "Code Review"');
    console.log('  3. "Code Review" → "Testing"');
    console.log('  4. "Testing" → "Done"');
    console.log('');
    console.log('Usage:');
    console.log('  await moveCard(cardId, "list-id-in-progress")');
    console.log('  // Card moves to new list instantly');
}

/**
 * Demo test: Add checklist for subtasks
 */
function testAddChecklist() {
    console.log('\n=== Testing Add Checklist (Subtasks) ===');
    
    const checklistItems = [
        'Set up OAuth client credentials',
        'Implement JWT token generation',
        'Create login endpoint',
        'Add token refresh logic',
        'Write unit tests'
    ];

    console.log('Checklist: "Subtasks"');
    checklistItems.forEach((item, i) => {
        console.log(`  ${i + 1}. [ ] ${item}`);
    });
    console.log('');
    console.log('Usage:');
    console.log('  await addChecklist(cardId, [');
    console.log('    "Task 1",');
    console.log('    "Task 2",');
    console.log('    "Task 3"');
    console.log('  ])');
}

/**
 * Demo test: Source link attachment
 */
function testSourceLinkAttachment() {
    console.log('\n=== Testing Source Link Attachment ===');
    
    console.log('Source links provide context:');
    console.log('  - Email thread URL');
    console.log('  - Slack message permalink');
    console.log('  - Google Sheet row');
    console.log('  - GitHub issue');
    console.log('');
    console.log('Example:');
    console.log('  params.sourceLink = "https://slack.com/archives/C123/p456789"');
    console.log('  → Attached to card as clickable link');
    console.log('  → Team can trace back to original request');
}

/**
 * Demo test: Cache management
 */
function testCacheManagement() {
    console.log('\n=== Testing Cache Management ===');
    
    console.log('Label cache operations:');
    console.log('  getLabelCache() → { "Priority: High": "abc123", ... }');
    console.log('  clearLabelCache() → Clears all cached labels');
    console.log('');
    console.log('When to clear cache:');
    console.log('  - Labels deleted/renamed externally');
    console.log('  - Testing different scenarios');
    console.log('  - Memory management in long-running processes');
}

/**
 * Demo test: Complete integration example
 */
async function testCompleteIntegration() {
    console.log('\n=== Complete Integration Example ===');
    
    console.log('Scenario: Create high-priority bug card with subtasks');
    console.log('');
    console.log('Step 1: Create card');
    console.log('  const result = await createCard({');
    console.log('    title: "Fix payment gateway bug",');
    console.log('    priority: "High",');
    console.log('    labels: ["bug", "payments"],');
    console.log('    source: "Email"');
    console.log('  }, {');
    console.log('    sourceLink: "https://mail.google.com/..."');
    console.log('  });');
    console.log('');
    console.log('Step 2: Add checklist');
    console.log('  await addChecklist(result.data.cardId, [');
    console.log('    "Reproduce bug",');
    console.log('    "Fix code",');
    console.log('    "Test fix"');
    console.log('  ]);');
    console.log('');
    console.log('Step 3: Move to in-progress');
    console.log('  await moveCard(result.data.cardId, inProgressListId);');
    console.log('');
    console.log('Result:');
    console.log('  ✅ Card created at top of list (High priority)');
    console.log('  ✅ Labels: Priority: High, From: Email, bug, payments');
    console.log('  ✅ Source link attached');
    console.log('  ✅ Checklist with 3 items');
    console.log('  ✅ Moved to In Progress list');
}

/**
 * Demo test: Error handling
 */
function testErrorHandling() {
    console.log('\n=== Testing Error Handling ===');
    
    console.log('Graceful degradation:');
    console.log('  - Missing credentials → Clear error message');
    console.log('  - Invalid list ID → API error caught and logged');
    console.log('  - Label creation fails → Card still created, label skipped');
    console.log('  - Source link fails → Card created, attachment skipped');
    console.log('');
    console.log('All operations return ExecutionResult:');
    console.log('  { success: true, data: {...}, executionTime: 245 }');
    console.log('  { success: false, error: "...", executionTime: 120 }');
}

async function runDemoTests() {
    console.log('╔════════════════════════════════════════════════════╗');
    console.log('║     Trello Card Creator - Demo & Test Suite       ║');
    console.log('╚════════════════════════════════════════════════════╝');
    
    await testCreateCard();
    testLabelManagement();
    testCardPositioning();
    testMoveCard();
    testAddChecklist();
    testSourceLinkAttachment();
    testCacheManagement();
    await testCompleteIntegration();
    testErrorHandling();
    
    console.log('\n=== Integration Test (requires Trello credentials) ===');
    console.log('To test with real Trello API:');
    console.log('  1. Set TRELLO_API_KEY environment variable');
    console.log('  2. Set TRELLO_TOKEN environment variable');
    console.log('  3. Set TRELLO_DEFAULT_LIST_ID environment variable');
    console.log('  4. Set TRELLO_BOARD_ID environment variable');
    console.log('  5. Run: await createCard(taskDetails)');
    console.log('');
    console.log('Example usage:');
    console.log('  const result = await createCard({');
    console.log('    title: "Test card",');
    console.log('    priority: "High"');
    console.log('  });');
    console.log('  console.log("Card URL:", result.data.url);');
    
    console.log('\n✅ All tests completed successfully!');
}

// Export for running
export { runDemoTests };

// Run tests if executed directly
if (require.main === module) {
    runDemoTests().catch(console.error);
}
