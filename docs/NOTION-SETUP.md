# Notion Database Setup Guide

This guide will help you create a Notion database that works with the AI Operations Command Center.

## Quick Start

### 1. Create a Notion Database

1. Go to [Notion](https://www.notion.so)
2. Create a new page
3. Type `/database` and select "Table - Inline"
4. Name it "AI Tasks" or "Deadlines & Tasks"

### 2. Add Required Properties

Your database needs these properties (columns):

| Property Name | Type | Options | Description |
|--------------|------|---------|-------------|
| **Name** | Title | (default) | Task title |
| **Due Date** | Date | - | When the task is due |
| **Priority** | Select | Critical, High, Medium, Low | Task priority level |
| **Source** | Select | Gmail, Slack, Manual | Where the task came from |
| **Link** | URL | - | Link to original email/message |
| **Category** | Select | Meeting, Task, Project, Deadline, General | Task category |
| **Status** | Select | To Do, In Progress, Done | Current status |
| **AI Confidence** | Number | Format: Number, 0-100 | AI's confidence in extraction |
| **Raw Content** | Text | - | Original message content |

### 3. Configure Property Names

To add each property:
1. Click the `+` button in the table header
2. Select the property type
3. Name it exactly as shown above
4. For **Select** properties, add the options listed

#### Priority Options:
- Critical (🔴 red)
- High (🟠 orange)
- Medium (🟡 yellow)
- Low (🟢 green)

#### Source Options:
- Gmail
- Slack
- Manual

#### Category Options:
- Meeting
- Task
- Project
- Deadline
- General

#### Status Options:
- To Do (default)
- In Progress
- Done

### 4. Get Your Database ID

1. Open your database in Notion
2. Click "Share" in the top right
3. Copy the page URL. It will look like:
   ```
   https://www.notion.so/your-workspace/database-name-XXXXXXXXXXXXXXXXXXXXXXXXXXXX?v=...
   ```
4. The Database ID is the 32-character string after the database name:
   ```
   XXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```
5. Add it to your `.env` file:
   ```env
   NOTION_DATABASE_ID=your-32-character-database-id
   ```

### 5. Share Database with Integration

1. In your Notion database, click **Share**
2. Click **Add connections**
3. Select **Composio** (if you've already run `composio add notion`)
4. Click **Confirm**

This gives the Composio integration permission to create pages in your database.

## Alternative: Use This Template

You can duplicate this pre-configured template:

1. Go to: [AI Operations Database Template](https://your-template-url)
2. Click "Duplicate" in the top right
3. Follow steps 4-5 above to get your Database ID and share it

## Property Customization

If you want to use different property names, update `src/config/agent-config.ts`:

```typescript
export const NOTION_CONFIG = {
  properties: {
    title: 'Your Title Property Name',
    dueDate: 'Your Date Property Name',
    priority: 'Your Priority Property Name',
    // ... etc
  },
};
```

## Verification

Once configured, your database will automatically receive tasks when:
- ✅ You receive an email with deadlines/action items
- ✅ Someone mentions tasks in Slack
- ✅ The AI detects important dates

Test it by:
1. Starting the application: `npm start`
2. Sending yourself an email like: "Reminder: Submit project by December 31st"
3. Check your Notion database - a new task should appear within 60 seconds!

## Troubleshooting

### Database ID Not Working
- Make sure you copied the full 32-character ID
- Check that there are no spaces or extra characters
- Try getting the ID from the page URL, not the database URL

### Tasks Not Appearing
1. Check logs: `npm start` (look for "✅ Notion task created")
2. Verify database is shared with Composio integration
3. Check that property names match exactly
4. Ensure NOTION_API_KEY is set in `.env`

### Permission Errors
- Re-run: `composio add notion`
- Make sure you selected the correct workspace
- Share the database with the integration again

## Example Database View

Here's what your database might look like:

| Name | Due Date | Priority | Source | Status | AI Confidence |
|------|----------|----------|--------|--------|---------------|
| Submit Q4 Report | 2024-12-31 | High | Gmail | To Do | 95 |
| Team Sync Meeting | 2024-12-15 | Medium | Slack | To Do | 87 |
| Review PR #123 | 2024-12-14 | High | Gmail | In Progress | 92 |

## Advanced: Custom Views

Create filtered views in your Notion database:

### High Priority View
- Filter: Priority = "Critical" OR "High"
- Sort: Due Date (Ascending)

### This Week View
- Filter: Due Date = "This Week"
- Sort: Priority (Descending)

### By Source View
- Group by: Source
- Sort: Due Date (Ascending)

## Integration Status

Check if your Notion integration is working:

```bash
composio apps
```

You should see:
```
✅ notion - Connected
```

If not:
```bash
composio add notion
```

## Next Steps

After setting up your Notion database:
1. ✅ Configure Gmail monitoring in `.env`
2. ✅ Configure Slack monitoring in `.env`
3. ✅ Adjust signal patterns in `src/config/agent-config.ts`
4. ✅ Start the application: `npm start`
5. ✅ Watch tasks appear automatically!
