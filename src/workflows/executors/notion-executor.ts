/**
 * Notion Executor
 * Implements createTask, updateTask, addComment using Notion SDK
 */

import { Client } from '@notionhq/client';
import logger from '../../utils/logger';
import { config } from '../../config';
import { TaskDetails, NotionCreateResult, NotionUpdateResult, NotionCommentResult, ExecutionResult } from '../../types';
import { logExecutionFailure, logExecutionSuccess, logExecutionStart } from '../execution-logger';
import { checkDuplicate } from './notion-duplicate-checker';

// Initialize Notion client
const NOTION_API_KEY = config.NOTION_API_KEY;
const NOTION_DATABASE_ID = config.NOTION_DATABASE_ID;

const notion = new Client({ auth: NOTION_API_KEY });

function safePageUrl(pageId: string) {
    // Notion uses page id without dashes for the public URL pattern
    const compact = pageId.replace(/-/g, '');
    return `https://www.notion.so/${compact}`;
}

function formatRichTextFromMarkdown(text?: string) {
    if (!text) return [];
    // Very small markdown-ish parser: **bold**, *italic*, [text](url)
    // Splits by lines into paragraphs
    const lines = text.split(/\r?\n/).filter(Boolean);
    const blocks: any[] = [];

    for (const line of lines) {
        // Basic link replace
        const parts: any[] = [];
        let remaining = line;
        const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/;
        while (true) {
            const m = remaining.match(linkRegex);
            if (!m) break;
            const [match, label, url] = m;
            const idx = remaining.indexOf(match);
            const before = remaining.slice(0, idx);
            if (before) parts.push({ type: 'text', text: before });
            parts.push({ type: 'link', text: label, url });
            remaining = remaining.slice(idx + match.length);
        }
        if (remaining) parts.push({ type: 'text', text: remaining });

        const rich_text: any[] = [];
        for (const p of parts) {
            if (p.type === 'link') {
                rich_text.push({
                    type: 'text',
                    text: { content: p.text, link: { url: p.url } },
                    annotations: { bold: false, italic: false }
                });
            } else {
                // Handle bold **text** and *italic*
                let s = p.text;
                // bold
                s = s.replace(/\*\*([^*]+)\*\*/g, (full: string, g1: string) => `__BOLD_START__${g1}__BOLD_END__`);
                // italic
                s = s.replace(/\*([^*]+)\*/g, (full: string, g1: string) => `__ITALIC_START__${g1}__ITALIC_END__`);
                // now split by markers
                const tokens = s.split(/(__BOLD_START__|__BOLD_END__|__ITALIC_START__|__ITALIC_END__)/).filter(Boolean);
                for (let i = 0; i < tokens.length; i++) {
                    const t = tokens[i];
                    if (t === '__BOLD_START__') {
                        const content = tokens[++i];
                        rich_text.push({ type: 'text', text: { content }, annotations: { bold: true, italic: false } });
                        i++; // skip __BOLD_END__
                    } else if (t === '__ITALIC_START__') {
                        const content = tokens[++i];
                        rich_text.push({ type: 'text', text: { content }, annotations: { bold: false, italic: true } });
                        i++; // skip end
                    } else if (t === '__BOLD_END__' || t === '__ITALIC_END__') {
                        // noop
                    } else {
                        rich_text.push({ type: 'text', text: { content: t }, annotations: { bold: false, italic: false } });
                    }
                }
            }
        }

        blocks.push({ type: 'paragraph', paragraph: { rich_text } });
    }

    return blocks;
}

function mapTaskDetailsToProperties(task: TaskDetails) {
    // Map common fields; property names may vary per database schema
    const properties: any = {};

    // Title property - try 'Name' which is common for Notion DBs
    properties['Name'] = {
        title: [
            { type: 'text', text: { content: task.title } }
        ]
    };

    if (task.priority) {
        properties['Priority'] = { select: { name: task.priority } };
    }

    if (task.labels && task.labels.length) {
        properties['Labels'] = { multi_select: task.labels.map((l) => ({ name: l })) };
    }

    if (task.dueDate) {
        properties['Due'] = { date: { start: task.dueDate } };
    }

    if (task.source) {
        properties['Source'] = { select: { name: task.source } };
    }

    if (task.assignee) {
        // Notion people property requires user id; we will attempt to set by email if API supports it in the workspace
        properties['Assignee'] = { people: [{ name: task.assignee }] };
    }

    if (task.status) {
        properties['Status'] = { select: { name: task.status } };
    }

    // Custom metadata fields
    if (task.metadata) {
        for (const key of Object.keys(task.metadata)) {
            properties[key] = { rich_text: [{ type: 'text', text: { content: String(task.metadata[key]) } }] };
        }
    }

    return properties;
}

export async function createTask(taskDetails: TaskDetails, params: any = {}): Promise<ExecutionResult> {
    const actionId = params.actionId || params.id || 'unknown';
    try {
        if (!NOTION_DATABASE_ID) {
            throw new Error('NOTION_DATABASE_ID not configured');
        }

        // Basic validation
        if (!taskDetails.title) {
            throw new Error('Task title is required');
        }

        // Check for duplicates (unless explicitly disabled)
        if (params.skipDuplicateCheck !== true) {
            logger.debug('Checking for duplicate task', { title: taskDetails.title });
            
            const duplicateCheck = await checkDuplicate(taskDetails.title, NOTION_DATABASE_ID);
            
            if (duplicateCheck.isDuplicate) {
                logger.warn('Duplicate task detected, skipping creation', {
                    title: taskDetails.title,
                    existingPageId: duplicateCheck.existingPageId,
                    existingPageUrl: duplicateCheck.existingPageUrl,
                    similarity: duplicateCheck.similarity,
                    matchedTitle: duplicateCheck.matchedTitle
                });
                
                await logExecutionSuccess(
                    actionId, 
                    params.correlationId || '', 
                    'create_task', 
                    'notion', 
                    taskDetails, 
                    { 
                        skipped: true,
                        reason: 'duplicate_detected',
                        existingPageId: duplicateCheck.existingPageId,
                        existingPageUrl: duplicateCheck.existingPageUrl,
                        similarity: duplicateCheck.similarity
                    }, 
                    0, 
                    params.retriedFrom, 
                    params.attemptNumber
                );
                
                return {
                    success: true,
                    data: {
                        skipped: true,
                        reason: 'duplicate_detected',
                        existingPageId: duplicateCheck.existingPageId,
                        existingPageUrl: duplicateCheck.existingPageUrl,
                        similarity: duplicateCheck.similarity,
                        matchedTitle: duplicateCheck.matchedTitle
                    },
                    executionTime: 0,
                    executorUsed: 'notion'
                };
            }
            
            logger.debug('No duplicate found, proceeding with task creation', {
                title: taskDetails.title,
                bestSimilarity: duplicateCheck.similarity
            });
        }

        const properties = mapTaskDetailsToProperties(taskDetails);

        // Prepare children blocks for description
        const children = formatRichTextFromMarkdown(taskDetails.description);

        // Log execution start for observability
        await logExecutionStart(actionId, params.correlationId || '', 'create_task', 'notion', taskDetails, params.retriedFrom, params.attemptNumber);

        const start = Date.now();
        const res = await notion.pages.create({
            parent: { database_id: NOTION_DATABASE_ID },
            properties,
            children
        } as any);

        const pageId = res.id as string;
        const url = safePageUrl(pageId);

        const executionTime = Date.now() - start;
        logger.info('Notion page created', { pageId, url });

        await logExecutionSuccess(actionId, params.correlationId || '', 'create_task', 'notion', taskDetails, { pageId, url }, executionTime, params.retriedFrom, params.attemptNumber);

        return { success: true, data: { pageId, url, properties }, executionTime, executorUsed: 'notion' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('Notion createTask error', { error: msg });
        await logExecutionFailure(actionId, params.correlationId || '', 'create_task', 'notion', taskDetails, msg, 0, params.retriedFrom, params.attemptNumber);
        return { success: false, error: msg, executorUsed: 'notion' };
    }
}

export async function updateTask(pageId: string, updates: Partial<TaskDetails>): Promise<ExecutionResult> {
    try {
        if (!pageId) throw new Error('pageId is required');

        const properties = mapTaskDetailsToProperties(updates as TaskDetails);

        const start = Date.now();
        const res = await notion.pages.update({
            page_id: pageId,
            properties
        } as any);

        const url = safePageUrl(pageId);
        const executionTime = Date.now() - start;
        logger.info('Notion page updated', { pageId });

        return { success: true, data: { pageId, url, updatedProperties: Object.keys(properties) }, executionTime, executorUsed: 'notion' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('Notion updateTask error', { error: msg, pageId });
        return { success: false, error: msg, executorUsed: 'notion' };
    }
}

export async function addComment(pageId: string, comment: string): Promise<ExecutionResult> {
    try {
        if (!pageId) throw new Error('pageId is required');
        if (!comment) throw new Error('comment is required');

        // Notion API for comments requires SDK method under 'comments' which may not be available in older SDKs; use request
        const start = Date.now();
        const res = await notion.blocks.children.append({
            block_id: pageId,
            children: [{ type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: comment } }] } }]
        } as any);

        const commentId = `comment-${Date.now()}`;
        const executionTime = Date.now() - start;
        logger.info('Notion comment added', { pageId, commentId });

        return { success: true, data: { commentId, pageId, createdAt: new Date().toISOString() }, executionTime, executorUsed: 'notion' };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error('Notion addComment error', { error: msg, pageId });
        return { success: false, error: msg, executorUsed: 'notion' };
    }
}

export default {
    createTask,
    updateTask,
    addComment
};
