/**
 * Trello List Manager
 * 
 * Manages Trello lists for workflow stages with intelligent list selection
 * and caching for performance optimization.
 * 
 * Features:
 * - Dynamic list creation and retrieval
 * - Smart list selection based on priority and urgency
 * - List ID caching to minimize API calls
 * - Support for common workflow stages (Backlog, To Do, In Progress, Done)
 */

import { config } from '../../config';
import logger from '../../utils/logger';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ListInfo {
    id: string;
    name: string;
    position: number;
}

export interface SmartListOptions {
    priority?: number;      // 1-5 (1=highest, 5=lowest)
    urgency?: 'urgent' | 'normal' | 'low';
    customRules?: (priority?: number, urgency?: string) => string | null;
}

// ============================================================================
// List Cache
// ============================================================================

interface ListCache {
    [boardId: string]: {
        [listName: string]: string;  // listName -> listId
    };
}

const listCache: ListCache = {};

/**
 * Get the current list cache (useful for debugging)
 */
export function getListCache(): ListCache {
    return { ...listCache };
}

/**
 * Clear the list cache for a specific board or all boards
 */
export function clearListCache(boardId?: string): void {
    if (boardId) {
        delete listCache[boardId];
        logger.debug(`Cleared list cache for board ${boardId}`);
    } else {
        Object.keys(listCache).forEach(key => delete listCache[key]);
        logger.debug('Cleared all list caches');
    }
}

// ============================================================================
// Trello API Helper
// ============================================================================

/**
 * Make a request to the Trello API
 */
async function trelloApiRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
): Promise<any> {
    const apiKey = config.TRELLO_API_KEY;
    const token = config.TRELLO_TOKEN;

    if (!apiKey || !token) {
        throw new Error('TRELLO_API_KEY and TRELLO_TOKEN must be set');
    }

    const url = new URL(`https://api.trello.com/1${endpoint}`);
    url.searchParams.append('key', apiKey);
    url.searchParams.append('token', token);

    const options: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
        },
    };

    if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(url.toString(), options);
        
        if (!response.ok) {
            const errorText = await response.text();
            logger.error('Trello API request failed', {
                endpoint,
                method,
                status: response.status,
                error: errorText,
            });
            throw new Error(`Trello API error: ${response.status} ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        logger.error('Trello API request error', { endpoint, method, error });
        throw error;
    }
}

// ============================================================================
// Core List Management Functions
// ============================================================================

/**
 * Get or create a Trello list by name
 * 
 * @param boardId - The Trello board ID
 * @param listName - The name of the list to find or create
 * @returns The list ID
 * 
 * @example
 * const listId = await getOrCreateList('board123', 'To Do');
 * console.log('List ID:', listId);
 */
export async function getOrCreateList(
    boardId: string,
    listName: string
): Promise<string> {
    // Check cache first
    if (listCache[boardId]?.[listName]) {
        logger.debug('Using cached list', { boardId, listName, listId: listCache[boardId][listName] });
        return listCache[boardId][listName];
    }

    try {
        // Fetch all lists on the board
        logger.debug('Fetching lists for board', { boardId });
        const lists: ListInfo[] = await trelloApiRequest(`/boards/${boardId}/lists`, 'GET');

        // Look for existing list with matching name (case-insensitive)
        const existingList = lists.find(
            list => list.name.toLowerCase() === listName.toLowerCase()
        );

        if (existingList) {
            // Cache and return existing list
            if (!listCache[boardId]) {
                listCache[boardId] = {};
            }
            listCache[boardId][listName] = existingList.id;
            
            logger.info('Found existing Trello list', {
                boardId,
                listName,
                listId: existingList.id,
            });
            
            return existingList.id;
        }

        // List doesn't exist, create it
        logger.info('Creating new Trello list', { boardId, listName });
        
        const newList: ListInfo = await trelloApiRequest(`/lists`, 'POST', {
            name: listName,
            idBoard: boardId,
            pos: 'bottom', // Add to end of board by default
        });

        // Cache and return new list
        if (!listCache[boardId]) {
            listCache[boardId] = {};
        }
        listCache[boardId][listName] = newList.id;

        logger.info('Created new Trello list', {
            boardId,
            listName,
            listId: newList.id,
            position: newList.position,
        });

        return newList.id;

    } catch (error) {
        logger.error('Failed to get or create list', { boardId, listName, error });
        throw error;
    }
}

/**
 * Get common workflow list IDs from config or create them dynamically
 * 
 * @param boardId - The Trello board ID
 * @returns Object containing list IDs for common workflow stages
 * 
 * @example
 * const lists = await getCommonLists('board123');
 * await createCard(lists.todo, cardData);
 */
export async function getCommonLists(boardId: string): Promise<{
    backlog: string;
    todo: string;
    inProgress: string;
    done: string;
}> {
    // Try to get from config first
    const configLists = {
        backlog: config.TRELLO_BACKLOG_LIST,
        todo: config.TRELLO_TODO_LIST,
        inProgress: config.TRELLO_IN_PROGRESS_LIST,
        done: config.TRELLO_DONE_LIST,
    };

    // If all lists are configured, return them
    if (configLists.backlog && configLists.todo && configLists.inProgress && configLists.done) {
        logger.debug('Using configured workflow lists', configLists);
        return configLists;
    }

    // Otherwise, dynamically get or create lists
    logger.info('Dynamically resolving workflow lists for board', { boardId });

    const [backlog, todo, inProgress, done] = await Promise.all([
        configLists.backlog || getOrCreateList(boardId, 'Backlog'),
        configLists.todo || getOrCreateList(boardId, 'To Do'),
        configLists.inProgress || getOrCreateList(boardId, 'In Progress'),
        configLists.done || getOrCreateList(boardId, 'Done'),
    ]);

    return { backlog, todo, inProgress, done };
}

// ============================================================================
// Smart List Selection
// ============================================================================

/**
 * Intelligently select a list based on priority and urgency
 * 
 * Rules:
 * - Priority 1-2 (High) → "To Do"
 * - Priority 3-4 (Medium) → "Backlog"
 * - Priority 5 (Low) → "Someday" (or Backlog if Someday doesn't exist)
 * - Urgent items override priority → "To Do"
 * 
 * @param boardId - The Trello board ID
 * @param options - Smart list selection options
 * @returns The selected list ID
 * 
 * @example
 * // High priority task
 * const listId = await smartListSelection('board123', { priority: 1 });
 * 
 * // Urgent task (goes to To Do regardless of priority)
 * const urgentListId = await smartListSelection('board123', { 
 *   priority: 4, 
 *   urgency: 'urgent' 
 * });
 * 
 * // Custom rules
 * const customListId = await smartListSelection('board123', {
 *   priority: 3,
 *   customRules: (p, u) => p === 3 && u === 'urgent' ? 'Hot Tasks' : null
 * });
 */
export async function smartListSelection(
    boardId: string,
    options: SmartListOptions = {}
): Promise<string> {
    const { priority, urgency, customRules } = options;

    logger.debug('Smart list selection', { boardId, priority, urgency });

    // Apply custom rules first if provided
    if (customRules) {
        const customList = customRules(priority, urgency);
        if (customList) {
            logger.info('Using custom list selection rule', { customList });
            return await getOrCreateList(boardId, customList);
        }
    }

    // Get common workflow lists
    const lists = await getCommonLists(boardId);

    // Urgent items always go to "To Do"
    if (urgency === 'urgent') {
        logger.info('Urgent item routed to To Do list', { priority, urgency });
        return lists.todo;
    }

    // Priority-based selection
    if (priority !== undefined) {
        if (priority >= 1 && priority <= 2) {
            // High priority → To Do
            logger.info('High priority routed to To Do list', { priority });
            return lists.todo;
        } else if (priority >= 3 && priority <= 4) {
            // Medium priority → Backlog
            logger.info('Medium priority routed to Backlog list', { priority });
            return lists.backlog;
        } else if (priority === 5) {
            // Low priority → Someday (or Backlog as fallback)
            try {
                const somedayList = await getOrCreateList(boardId, 'Someday');
                logger.info('Low priority routed to Someday list', { priority });
                return somedayList;
            } catch (error) {
                logger.warn('Failed to create Someday list, using Backlog', { error });
                return lists.backlog;
            }
        }
    }

    // Default: use configured default list or To Do
    const defaultListId = config.TRELLO_DEFAULT_LIST_ID || lists.todo;
    logger.info('Using default list', { defaultListId });
    return defaultListId;
}

/**
 * Get list name by ID (useful for logging and debugging)
 * 
 * @param listId - The list ID to look up
 * @returns The list name or null if not found
 */
export async function getListName(listId: string): Promise<string | null> {
    try {
        const list: ListInfo = await trelloApiRequest(`/lists/${listId}`, 'GET');
        return list.name;
    } catch (error) {
        logger.error('Failed to get list name', { listId, error });
        return null;
    }
}

/**
 * Get all lists on a board
 * 
 * @param boardId - The Trello board ID
 * @returns Array of list information
 */
export async function getAllLists(boardId: string): Promise<ListInfo[]> {
    try {
        const lists: ListInfo[] = await trelloApiRequest(`/boards/${boardId}/lists`, 'GET');
        
        // Cache all lists
        if (!listCache[boardId]) {
            listCache[boardId] = {};
        }
        lists.forEach(list => {
            listCache[boardId][list.name] = list.id;
        });

        logger.debug('Fetched all lists', { boardId, count: lists.length });
        return lists;
    } catch (error) {
        logger.error('Failed to get all lists', { boardId, error });
        throw error;
    }
}

// ============================================================================
// Advanced List Operations
// ============================================================================

/**
 * Archive a list (soft delete)
 * 
 * @param listId - The list ID to archive
 */
export async function archiveList(listId: string): Promise<void> {
    try {
        await trelloApiRequest(`/lists/${listId}/closed`, 'PUT', { value: true });
        logger.info('Archived Trello list', { listId });
    } catch (error) {
        logger.error('Failed to archive list', { listId, error });
        throw error;
    }
}

/**
 * Rename a list
 * 
 * @param listId - The list ID to rename
 * @param newName - The new name for the list
 */
export async function renameList(listId: string, newName: string): Promise<void> {
    try {
        await trelloApiRequest(`/lists/${listId}`, 'PUT', { name: newName });
        logger.info('Renamed Trello list', { listId, newName });
        
        // Clear cache since list names changed
        clearListCache();
    } catch (error) {
        logger.error('Failed to rename list', { listId, newName, error });
        throw error;
    }
}

/**
 * Move a list to a different position on the board
 * 
 * @param listId - The list ID to move
 * @param position - The new position ('top', 'bottom', or numeric position)
 */
export async function moveList(
    listId: string,
    position: 'top' | 'bottom' | number
): Promise<void> {
    try {
        await trelloApiRequest(`/lists/${listId}`, 'PUT', { pos: position });
        logger.info('Moved Trello list', { listId, position });
    } catch (error) {
        logger.error('Failed to move list', { listId, position, error });
        throw error;
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate that all required workflow lists exist on a board
 * 
 * @param boardId - The Trello board ID
 * @returns True if all lists exist, false otherwise
 */
export async function validateWorkflowLists(boardId: string): Promise<boolean> {
    try {
        const lists = await getCommonLists(boardId);
        const allExist = lists.backlog && lists.todo && lists.inProgress && lists.done;
        
        if (allExist) {
            logger.info('All workflow lists validated', { boardId, lists });
        } else {
            logger.warn('Some workflow lists missing', { boardId, lists });
        }
        
        return !!allExist;
    } catch (error) {
        logger.error('Failed to validate workflow lists', { boardId, error });
        return false;
    }
}

/**
 * Get list ID from cache or fetch it
 * Helper function that tries cache first, then API
 * 
 * @param boardId - The Trello board ID
 * @param listName - The list name to look up
 * @returns The list ID or null if not found
 */
export async function getListIdByName(
    boardId: string,
    listName: string
): Promise<string | null> {
    // Check cache
    if (listCache[boardId]?.[listName]) {
        return listCache[boardId][listName];
    }

    // Fetch from API
    try {
        const lists = await getAllLists(boardId);
        const list = lists.find(l => l.name.toLowerCase() === listName.toLowerCase());
        return list?.id || null;
    } catch (error) {
        logger.error('Failed to get list ID by name', { boardId, listName, error });
        return null;
    }
}
