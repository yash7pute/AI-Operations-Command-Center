import logger from '../../utils/logger';
import authManager from './auth-manager';
import { config } from '../../config';

// NOTE: we're assuming composio-sdk provides a Tool Router that can return an authenticated Notion client
// Adapt calls to the actual SDK. This file uses a Notion-like client interface (pages.create, pages.update, databases.query, retrieve)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const composio = require('composio-sdk');

type NotionProperties = Record<string, any>;

interface OperationResult {
  success: boolean;
  pageId?: string;
  data?: any;
  error?: string;
}

async function getNotionClient() {
  try {
    return await authManager.getClient('notion');
  } catch (err: any) {
    logger.error('Notion client unavailable', { error: err?.message || String(err) });
    throw new Error('Notion client not authenticated. Call authenticateApp("notion")');
  }
}

async function fetchDatabaseSchema(client: any, databaseId: string) {
  try {
    const db = await client.databases.retrieve({ database_id: databaseId });
    return db.properties as NotionProperties;
  } catch (err: any) {
    logger.error('Failed to retrieve Notion database schema', { databaseId, error: err?.message || String(err) });
    throw new Error(`Invalid database ID or insufficient permissions: ${databaseId}`);
  }
}

function validatePropertiesAgainstSchema(props: NotionProperties, schema: NotionProperties) {
  const errors: string[] = [];
  for (const key of Object.keys(props)) {
    if (!schema[key]) {
      errors.push(`Property '${key}' is not defined in target database`);
    }
    // Further type checks can be added here based on schema[key].type
  }
  return errors;
}

function buildNotionRichText(text: string) {
  // Simple conversion: split by newlines into paragraphs
  const lines = (text || '').split(/\r?\n/);
  return lines.map((l) => ({ type: 'text', text: { content: l } }));
}

export async function createPage(databaseId: string, properties: NotionProperties): Promise<OperationResult> {
  try {
    const client = await getNotionClient();
    const schema = await fetchDatabaseSchema(client, databaseId);

    // prepare properties, handle description rich text if present
    const propCopy: NotionProperties = { ...properties };
    if (propCopy.description && typeof propCopy.description === 'string') {
      propCopy.description = { rich_text: buildNotionRichText(propCopy.description) };
    }

    const errors = validatePropertiesAgainstSchema(propCopy, schema);
    if (errors.length) {
      const msg = `Property validation failed: ${errors.join('; ')}`;
      logger.error(msg, { databaseId });
      return { success: false, error: msg };
    }

    const body: any = { parent: { database_id: databaseId }, properties: propCopy };
    const res = await client.pages.create(body);
    logger.info('Notion page created', { pageId: res.id });
    return { success: true, pageId: res.id, data: res };
  } catch (err: any) {
    logger.error('Failed to create Notion page', { databaseId, error: err?.message || String(err) });
    return { success: false, error: err?.message || String(err) };
  }
}

export async function updatePage(pageId: string, properties: NotionProperties): Promise<OperationResult> {
  try {
    const client = await getNotionClient();
    // best-effort: fetch page to determine its parent database for schema
    const page = await client.pages.retrieve({ page_id: pageId });
    const parentDb = page.parent && page.parent.database_id;
    if (!parentDb) {
      const msg = 'Page does not belong to a database; cannot validate properties';
      logger.error(msg, { pageId });
      return { success: false, error: msg };
    }
    const schema = await fetchDatabaseSchema(client, parentDb);

    const propCopy: NotionProperties = { ...properties };
    if (propCopy.description && typeof propCopy.description === 'string') {
      propCopy.description = { rich_text: buildNotionRichText(propCopy.description) };
    }

    const errors = validatePropertiesAgainstSchema(propCopy, schema);
    if (errors.length) {
      const msg = `Property validation failed: ${errors.join('; ')}`;
      logger.error(msg, { pageId });
      return { success: false, error: msg };
    }

    const res = await client.pages.update({ page_id: pageId, properties: propCopy });
    logger.info('Notion page updated', { pageId });
    return { success: true, pageId, data: res };
  } catch (err: any) {
    logger.error('Failed to update Notion page', { pageId, error: err?.message || String(err) });
    return { success: false, error: err?.message || String(err) };
  }
}

export async function queryDatabase(databaseId: string, filter?: any, sort?: any): Promise<OperationResult> {
  try {
    const client = await getNotionClient();
    // Validate db exists
    await fetchDatabaseSchema(client, databaseId);

    const body: any = { database_id: databaseId } as any;
    if (filter) body.filter = filter;
    if (sort) body.sorts = sort;

    const res = await client.databases.query(body);
    logger.info('Notion database queried', { databaseId, results: res.results?.length || 0 });
    return { success: true, data: res };
  } catch (err: any) {
    logger.error('Failed to query Notion database', { databaseId, error: err?.message || String(err) });
    return { success: false, error: err?.message || String(err) };
  }
}

export default { createPage, updatePage, queryDatabase };
