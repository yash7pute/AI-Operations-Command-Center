import logger from '../../utils/logger';
import notionTools from './notion-tools';
import trelloTools from './trello-tools';

type ToolName = 'notion.createPage' | 'notion.updatePage' | 'notion.queryDatabase' | 'trello.createCard' | 'trello.moveCard' | 'trello.addComment' | 'trello.getCard';

interface ExecResult {
  success: boolean;
  data?: any;
  error?: string;
}

// Simple FIFO queue with single-worker for rate-limiting per process
const queue: Array<() => Promise<void>> = [];
let running = false;

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const wrapped = async () => {
      try {
        const r = await fn();
        resolve(r);
      } catch (err) {
        reject(err);
      }
    };
    queue.push(wrapped);
    processQueue();
  });
}

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const job = queue.shift();
    if (!job) continue;
    try {
      await job();
      // minimal spacing between jobs to avoid bursts
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      // job already handled errors
    }
  }
  running = false;
}

async function retryWithBackoff<T>(fn: () => Promise<T>, attempts = 3, baseMs = 500): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const wait = baseMs * Math.pow(2, i);
      logger.warn('Execution failed, will retry', { attempt: i + 1, wait, error: err?.message || String(err) });
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// Basic rollback map: stores create operations that can be rolled back
const rollbackActions: Array<{ undo: () => Promise<void>; meta?: any }> = [];

async function executeTool(toolName: ToolName, params: any): Promise<ExecResult> {
  const start = Date.now();
  try {
    // pre-execution validation
    const validation = validateParams(toolName, params);
    if (!validation.success) return validation;

    // enqueue the execution to respect rate limits
    const result = await enqueue(async () => {
      // route
      switch (toolName) {
        case 'notion.createPage': {
          // create -> can rollback by deleting page
          const res = await retryWithBackoff(() => notionTools.createPage(params.databaseId, params.properties));
          if (res.success && res.pageId) {
            rollbackActions.push({ undo: async () => {
              try { await notionTools.updatePage(res.pageId!, { _archived: true }); } catch (e) { logger.warn('Rollback: failed to archive page', { pageId: res.pageId }); }
            }, meta: { tool: toolName, pageId: res.pageId } });
          }
          return res as ExecResult;
        }
        case 'notion.updatePage': {
          const res = await retryWithBackoff(() => notionTools.updatePage(params.pageId, params.properties));
          return res as ExecResult;
        }
        case 'notion.queryDatabase': {
          const res = await retryWithBackoff(() => notionTools.queryDatabase(params.databaseId, params.filter, params.sort));
          return res as ExecResult;
        }
        case 'trello.createCard': {
          const res = await retryWithBackoff(() => trelloTools.createCard(params.listId, params.name, params.desc, params.due, params.labels, params.attachments));
          if (res.success && res.cardId) {
            rollbackActions.push({ undo: async () => {
              try { const client = await (await import('./auth-manager')).default.getClient('trello'); await client.cards.delete(res.cardId); } catch (e) { logger.warn('Rollback: failed to delete trello card', { cardId: res.cardId }); }
            }, meta: { tool: toolName, cardId: res.cardId } });
          }
          return res as ExecResult;
        }
        case 'trello.moveCard': {
          const res = await retryWithBackoff(() => trelloTools.moveCard(params.cardId, params.newListId));
          return res as ExecResult;
        }
        case 'trello.addComment': {
          const res = await retryWithBackoff(() => trelloTools.addComment(params.cardId, params.text));
          return res as ExecResult;
        }
        case 'trello.getCard': {
          const res = await retryWithBackoff(() => trelloTools.getCard(params.cardId));
          return res as ExecResult;
        }
        default:
          return { success: false, error: `Unknown tool ${toolName}` };
      }
    });

    const elapsed = Date.now() - start;
    logger.info('Tool executed', { tool: toolName, success: result.success, elapsed });
    return result as ExecResult;
  } catch (err: any) {
    const elapsed = Date.now() - start;
    logger.error('Tool execution failed', { tool: toolName, error: err?.message || String(err), elapsed });
    return { success: false, error: err?.message || String(err) };
  }
}

function validateParams(toolName: ToolName, params: any): ExecResult {
  try {
    switch (toolName) {
      case 'notion.createPage':
        if (!params?.databaseId) return { success: false, error: 'databaseId is required' };
        if (!params?.properties) return { success: false, error: 'properties are required' };
        break;
      case 'notion.updatePage':
        if (!params?.pageId) return { success: false, error: 'pageId is required' };
        if (!params?.properties) return { success: false, error: 'properties are required' };
        break;
      case 'notion.queryDatabase':
        if (!params?.databaseId) return { success: false, error: 'databaseId is required' };
        break;
      case 'trello.createCard':
        if (!params?.listId) return { success: false, error: 'listId is required' };
        if (!params?.name) return { success: false, error: 'name is required' };
        break;
      case 'trello.moveCard':
        if (!params?.cardId) return { success: false, error: 'cardId is required' };
        if (!params?.newListId) return { success: false, error: 'newListId is required' };
        break;
      case 'trello.addComment':
        if (!params?.cardId) return { success: false, error: 'cardId is required' };
        if (!params?.text) return { success: false, error: 'text is required' };
        break;
      case 'trello.getCard':
        if (!params?.cardId) return { success: false, error: 'cardId is required' };
        break;
      default:
        return { success: false, error: `Unknown tool ${toolName}` };
    }
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

async function rollbackLast() {
  const item = rollbackActions.pop();
  if (!item) return { success: false, error: 'Nothing to rollback' };
  try {
    await item.undo();
    logger.info('Rollback executed', { meta: item.meta });
    return { success: true };
  } catch (err: any) {
    logger.error('Rollback failed', { meta: item.meta, error: err?.message || String(err) });
    return { success: false, error: err?.message || String(err) };
  }
}

export default { executeTool, rollbackLast };
