/**
 * Trello List Manager - Demo Test Suite
 * 
 * This file demonstrates all features of the Trello List Manager.
 * Run with: npx ts-node src/workflows/executors/__tests__/trello-list-manager.test.ts
 * 
 * Prerequisites:
 * - TRELLO_API_KEY and TRELLO_TOKEN in environment
 * - TRELLO_BOARD_ID for testing
 * - Active internet connection
 */

import * as TrelloListManager from '../trello-list-manager';
import logger from '../../../utils/logger';

// Test configuration
const TEST_BOARD_ID = process.env.TRELLO_BOARD_ID || 'your-test-board-id';

/**
 * Test 1: Get or Create List
 */
async function testGetOrCreateList() {
    console.log('\n========================================');
    console.log('TEST 1: Get or Create List');
    console.log('========================================\n');

    try {
        // Test creating/getting a new list
        const listId = await TrelloListManager.getOrCreateList(TEST_BOARD_ID, 'Test List');
        console.log('✅ List created/retrieved:', listId);

        // Test getting the same list again (should use cache)
        const cachedListId = await TrelloListManager.getOrCreateList(TEST_BOARD_ID, 'Test List');
        console.log('✅ List retrieved from cache:', cachedListId);
        console.log('   Cache hit:', listId === cachedListId);

        // Test creating another list
        const anotherListId = await TrelloListManager.getOrCreateList(TEST_BOARD_ID, 'Another Test List');
        console.log('✅ Another list created:', anotherListId);

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 2: Get Common Workflow Lists
 */
async function testGetCommonLists() {
    console.log('\n========================================');
    console.log('TEST 2: Get Common Workflow Lists');
    console.log('========================================\n');

    try {
        const lists = await TrelloListManager.getCommonLists(TEST_BOARD_ID);
        
        console.log('✅ Common workflow lists retrieved:');
        console.log('   Backlog:', lists.backlog);
        console.log('   To Do:', lists.todo);
        console.log('   In Progress:', lists.inProgress);
        console.log('   Done:', lists.done);

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 3: Smart List Selection - Priority Based
 */
async function testSmartListSelection() {
    console.log('\n========================================');
    console.log('TEST 3: Smart List Selection');
    console.log('========================================\n');

    try {
        // High priority → To Do
        const highPriorityList = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {
            priority: 1
        });
        const highListName = await TrelloListManager.getListName(highPriorityList);
        console.log('✅ Priority 1 (High) →', highListName, `(${highPriorityList})`);

        // Medium priority → Backlog
        const mediumPriorityList = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {
            priority: 3
        });
        const mediumListName = await TrelloListManager.getListName(mediumPriorityList);
        console.log('✅ Priority 3 (Medium) →', mediumListName, `(${mediumPriorityList})`);

        // Low priority → Someday
        const lowPriorityList = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {
            priority: 5
        });
        const lowListName = await TrelloListManager.getListName(lowPriorityList);
        console.log('✅ Priority 5 (Low) →', lowListName, `(${lowPriorityList})`);

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 4: Smart List Selection - Urgency Override
 */
async function testUrgencyOverride() {
    console.log('\n========================================');
    console.log('TEST 4: Urgency Override');
    console.log('========================================\n');

    try {
        // Low priority but urgent → should go to To Do
        const urgentList = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {
            priority: 5,
            urgency: 'urgent'
        });
        const urgentListName = await TrelloListManager.getListName(urgentList);
        console.log('✅ Priority 5 + Urgent →', urgentListName, `(${urgentList})`);
        console.log('   Note: Urgent items override priority and go to To Do');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 5: Custom List Selection Rules
 */
async function testCustomRules() {
    console.log('\n========================================');
    console.log('TEST 5: Custom List Selection Rules');
    console.log('========================================\n');

    try {
        // Custom rule: Priority 3 + urgent → "Hot Tasks"
        const customList = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {
            priority: 3,
            urgency: 'urgent',
            customRules: (priority, urgency) => {
                if (priority === 3 && urgency === 'urgent') {
                    return 'Hot Tasks';
                }
                return null;
            }
        });
        const customListName = await TrelloListManager.getListName(customList);
        console.log('✅ Custom rule applied →', customListName, `(${customList})`);
        console.log('   Rule: Priority 3 + Urgent → "Hot Tasks"');

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 6: Get All Lists
 */
async function testGetAllLists() {
    console.log('\n========================================');
    console.log('TEST 6: Get All Lists');
    console.log('========================================\n');

    try {
        const lists = await TrelloListManager.getAllLists(TEST_BOARD_ID);
        
        console.log(`✅ Found ${lists.length} lists on board:`);
        lists.forEach((list, index) => {
            console.log(`   ${index + 1}. ${list.name} (${list.id}) - Position: ${list.position}`);
        });

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 7: List Cache Management
 */
async function testCacheManagement() {
    console.log('\n========================================');
    console.log('TEST 7: Cache Management');
    console.log('========================================\n');

    try {
        // Create/get a list
        await TrelloListManager.getOrCreateList(TEST_BOARD_ID, 'Cache Test List');
        
        // Check cache
        const cache = TrelloListManager.getListCache();
        console.log('✅ Current cache state:');
        console.log(JSON.stringify(cache, null, 2));

        // Clear cache for board
        TrelloListManager.clearListCache(TEST_BOARD_ID);
        const cacheAfterClear = TrelloListManager.getListCache();
        console.log('\n✅ Cache after clearing board:');
        console.log(JSON.stringify(cacheAfterClear, null, 2));

        // Recreate cache
        await TrelloListManager.getOrCreateList(TEST_BOARD_ID, 'Cache Test List');
        
        // Clear all cache
        TrelloListManager.clearListCache();
        const cacheAfterFullClear = TrelloListManager.getListCache();
        console.log('\n✅ Cache after full clear:');
        console.log(JSON.stringify(cacheAfterFullClear, null, 2));

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 8: Validate Workflow Lists
 */
async function testValidateWorkflowLists() {
    console.log('\n========================================');
    console.log('TEST 8: Validate Workflow Lists');
    console.log('========================================\n');

    try {
        const isValid = await TrelloListManager.validateWorkflowLists(TEST_BOARD_ID);
        
        if (isValid) {
            console.log('✅ All workflow lists exist and are valid');
        } else {
            console.log('⚠️  Some workflow lists are missing');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 9: Get List ID by Name
 */
async function testGetListIdByName() {
    console.log('\n========================================');
    console.log('TEST 9: Get List ID by Name');
    console.log('========================================\n');

    try {
        // Create a test list first
        const createdId = await TrelloListManager.getOrCreateList(TEST_BOARD_ID, 'Name Lookup Test');
        console.log('✅ Created list:', createdId);

        // Look it up by name
        const foundId = await TrelloListManager.getListIdByName(TEST_BOARD_ID, 'Name Lookup Test');
        console.log('✅ Found list by name:', foundId);
        console.log('   IDs match:', createdId === foundId);

        // Try case-insensitive lookup
        const foundIdLower = await TrelloListManager.getListIdByName(TEST_BOARD_ID, 'name lookup test');
        console.log('✅ Case-insensitive lookup:', foundIdLower);
        console.log('   IDs match:', createdId === foundIdLower);

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Test 10: Complete Workflow Example
 */
async function testCompleteWorkflow() {
    console.log('\n========================================');
    console.log('TEST 10: Complete Workflow Example');
    console.log('========================================\n');

    console.log('Scenario: Task routing based on priority and urgency\n');

    try {
        // Task 1: High priority bug
        const bugListId = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {
            priority: 1,
            urgency: 'urgent'
        });
        const bugListName = await TrelloListManager.getListName(bugListId);
        console.log('✅ Task 1: High priority bug');
        console.log('   Priority: 1, Urgency: urgent');
        console.log(`   → Routed to: ${bugListName}`);

        // Task 2: Medium priority feature
        const featureListId = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {
            priority: 3,
            urgency: 'normal'
        });
        const featureListName = await TrelloListManager.getListName(featureListId);
        console.log('\n✅ Task 2: Medium priority feature');
        console.log('   Priority: 3, Urgency: normal');
        console.log(`   → Routed to: ${featureListName}`);

        // Task 3: Low priority tech debt
        const techDebtListId = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {
            priority: 5,
            urgency: 'low'
        });
        const techDebtListName = await TrelloListManager.getListName(techDebtListId);
        console.log('\n✅ Task 3: Low priority tech debt');
        console.log('   Priority: 5, Urgency: low');
        console.log(`   → Routed to: ${techDebtListName}`);

        // Task 4: No priority specified (default)
        const defaultListId = await TrelloListManager.smartListSelection(TEST_BOARD_ID, {});
        const defaultListName = await TrelloListManager.getListName(defaultListId);
        console.log('\n✅ Task 4: No priority specified');
        console.log('   Priority: undefined, Urgency: undefined');
        console.log(`   → Routed to: ${defaultListName} (default)`);

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  Trello List Manager - Demo Tests     ║');
    console.log('╚════════════════════════════════════════╝');

    if (TEST_BOARD_ID === 'your-test-board-id') {
        console.error('\n❌ Error: Please set TRELLO_BOARD_ID environment variable');
        console.error('   Example: export TRELLO_BOARD_ID=abc123');
        process.exit(1);
    }

    console.log('\nBoard ID:', TEST_BOARD_ID);

    // Run all tests
    await testGetOrCreateList();
    await testGetCommonLists();
    await testSmartListSelection();
    await testUrgencyOverride();
    await testCustomRules();
    await testGetAllLists();
    await testCacheManagement();
    await testValidateWorkflowLists();
    await testGetListIdByName();
    await testCompleteWorkflow();

    console.log('\n╔════════════════════════════════════════╗');
    console.log('║  All Tests Complete!                   ║');
    console.log('╚════════════════════════════════════════╝\n');
}

// Run tests if executed directly
if (require.main === module) {
    runAllTests().catch(error => {
        console.error('Test suite failed:', error);
        process.exit(1);
    });
}

export { runAllTests };
