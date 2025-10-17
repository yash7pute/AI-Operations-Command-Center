# Trello List Manager - Quick Reference

## 🚀 Quick Start

```typescript
import * as ListManager from './workflows/executors/trello-list-manager';

// Get or create a list
const listId = await ListManager.getOrCreateList('board123', 'To Do');

// Smart routing based on priority
const smartListId = await ListManager.smartListSelection('board123', {
    priority: 1,  // 1-5 (1=highest)
    urgency: 'urgent'
});

// Get all workflow lists
const lists = await ListManager.getCommonLists('board123');
// Returns: { backlog, todo, inProgress, done }
```

---

## 📚 Function Reference

### Core Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `getOrCreateList(boardId, listName)` | Get list ID, create if missing | `Promise<string>` |
| `getCommonLists(boardId)` | Get all workflow lists | `Promise<{ backlog, todo, inProgress, done }>` |
| `smartListSelection(boardId, options)` | Route based on priority/urgency | `Promise<string>` |
| `getAllLists(boardId)` | Get all lists on board | `Promise<ListInfo[]>` |
| `getListName(listId)` | Get list name by ID | `Promise<string \| null>` |
| `getListIdByName(boardId, listName)` | Find list ID by name | `Promise<string \| null>` |
| `validateWorkflowLists(boardId)` | Check if workflow complete | `Promise<boolean>` |

### Advanced Functions

| Function | Purpose | Returns |
|----------|---------|---------|
| `archiveList(listId)` | Archive (hide) list | `Promise<void>` |
| `renameList(listId, newName)` | Rename list | `Promise<void>` |
| `moveList(listId, position)` | Move list position | `Promise<void>` |
| `getListCache()` | Get cache state | `ListCache` |
| `clearListCache(boardId?)` | Clear cache | `void` |

---

## 🎯 Smart List Selection Rules

### Priority Mapping
```
Priority 1 → To Do
Priority 2 → To Do
Priority 3 → Backlog
Priority 4 → Backlog
Priority 5 → Someday
```

### Urgency Override
```
Urgent + Any Priority → To Do
```

### Custom Rules
```typescript
customRules: (priority, urgency) => {
    if (priority === 3 && urgency === 'urgent') {
        return 'Hot Tasks';
    }
    return null; // Use default rules
}
```

---

## 💡 Common Patterns

### Pattern 1: Create Card with Smart Routing
```typescript
// Let list manager decide the list
const listId = await smartListSelection(boardId, { priority: 1 });
await createCard(taskDetails, { listId });
```

### Pattern 2: Ensure Lists Exist
```typescript
// Check and create if needed
const isValid = await validateWorkflowLists(boardId);
if (!isValid) {
    await getCommonLists(boardId); // Creates missing
}
```

### Pattern 3: Lookup List by Name
```typescript
// Case-insensitive lookup
const listId = await getListIdByName(boardId, 'to do');
if (listId) {
    await createCard(taskDetails, { listId });
}
```

### Pattern 4: Warm Cache for Performance
```typescript
// Load all lists into cache at startup
await getAllLists(boardId);
// Now all subsequent calls use cache
```

---

## ⚙️ Configuration

### Required
```bash
TRELLO_API_KEY=your-key
TRELLO_TOKEN=your-token
TRELLO_BOARD_ID=board-id
```

### Optional (Auto-created if missing)
```bash
TRELLO_BACKLOG_LIST=list-id
TRELLO_TODO_LIST=list-id
TRELLO_IN_PROGRESS_LIST=list-id
TRELLO_DONE_LIST=list-id
```

---

## 🐛 Troubleshooting

### Problem: List not found
**Solution**: Use `getOrCreateList()` instead of manual lookup
```typescript
// ❌ Bad
const lists = await getAllLists(boardId);
const list = lists.find(l => l.name === 'My List');

// ✅ Good
const listId = await getOrCreateList(boardId, 'My List');
```

### Problem: Cache stale after external changes
**Solution**: Clear cache
```typescript
clearListCache(boardId);
// or
clearListCache(); // Clear all
```

### Problem: Custom list routing not working
**Solution**: Check custom rule return value
```typescript
customRules: (priority, urgency) => {
    // Must return string or null
    if (condition) return 'List Name'; // ✅
    return null; // ✅ Falls back to defaults
    // Don't return undefined ❌
}
```

---

## 📊 Performance Tips

1. **Warm the cache at startup**
   ```typescript
   await getAllLists(boardId);
   ```

2. **Use config variables for known lists**
   ```bash
   TRELLO_TODO_LIST=known-list-id
   ```

3. **Batch operations after cache warm**
   ```typescript
   await getAllLists(boardId); // Warm cache
   for (const task of tasks) {
       await smartListSelection(boardId, task); // Fast
   }
   ```

4. **Clear cache only when needed**
   ```typescript
   // After renaming/deleting lists externally
   clearListCache(boardId);
   ```

---

## 🎓 Best Practices

### ✅ DO
- Use `smartListSelection()` for automatic routing
- Call `getCommonLists()` to ensure workflow exists
- Use case-insensitive list names
- Validate workflow with `validateWorkflowLists()`
- Warm cache for batch operations

### ❌ DON'T
- Hardcode list IDs (use config or dynamic lookup)
- Clear cache unnecessarily (performance hit)
- Assume lists exist (use getOrCreate)
- Use case-sensitive comparisons
- Ignore validation errors

---

## 📖 Examples

### Example 1: Bug Triage System
```typescript
async function triageBug(bug: Bug) {
    const priority = bug.severity === 'critical' ? 1 : 3;
    const urgency = bug.severity === 'critical' ? 'urgent' : 'normal';
    
    const listId = await smartListSelection(boardId, { 
        priority, 
        urgency 
    });
    
    await createCard({
        title: bug.title,
        description: bug.description,
        priority: bug.severity
    }, { listId });
}
```

### Example 2: Sprint Planning
```typescript
async function addToSprint(tasks: Task[], sprintNumber: number) {
    const sprintList = await getOrCreateList(
        boardId, 
        `Sprint ${sprintNumber}`
    );
    
    for (const task of tasks) {
        await createCard(task, { listId: sprintList });
    }
}
```

### Example 3: SLA-Based Routing
```typescript
async function routeTicket(ticket: Ticket) {
    const listId = await smartListSelection(boardId, {
        urgency: ticket.sla < 4 ? 'urgent' : 'normal',
        customRules: (p, u) => {
            if (ticket.tier === 'enterprise' && u === 'urgent') {
                return 'VIP Support';
            }
            return null;
        }
    });
    
    await createCard(ticket, { listId });
}
```

---

## 🔗 Related Documentation
- [Prompt 6: Trello Card Creator](./PROMPT-6-TRELLO-EXECUTOR.md)
- [Prompt 7: Full Implementation](./PROMPT-7-TRELLO-LIST-MANAGER.md)
