/**
 * Trello Card Creator Executor
 * Integrates with Composio Trello tools to create and manage cards
 */

import logger from '../../utils/logger';
import { config } from '../../config';
import { TaskDetails, ExecutionResult } from '../../types';
import { logExecutionStart, logExecutionSuccess, logExecutionFailure } from '../execution-logger';
import { smartListSelection, getOrCreateList } from './trello-list-manager';

// Trello API configuration
const TRELLO_API_KEY = config.TRELLO_API_KEY;
const TRELLO_TOKEN = config.TRELLO_TOKEN;
const TRELLO_DEFAULT_LIST_ID = config.TRELLO_DEFAULT_LIST_ID;
const TRELLO_BOARD_ID = config.TRELLO_BOARD_ID;

// Priority to position mapping (higher priority = lower position = top of list)
const PRIORITY_POSITIONS: Record<string, number> = {
    'High': 0,
    'Medium': 100,
    'Low': 200
};

// Color mapping for priority labels
const PRIORITY_COLORS: Record<string, string> = {
    'High': 'red',
    'Medium': 'yellow',
    'Low': 'blue'
};

// Cache for created labels (to avoid recreating)
interface LabelCache {
    [key: string]: string; // label name -> label ID
}
const labelCache: LabelCache = {};

/**
 * Makes a Trello API request
 * @param endpoint - API endpoint (e.g., '/cards')
 * @param method - HTTP method
 * @param data - Request body
 * @returns API response
 */
async function trelloApiRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any
): Promise<any> {
    if (!TRELLO_API_KEY || !TRELLO_TOKEN) {
        throw new Error('Trello API credentials not configured (TRELLO_API_KEY, TRELLO_TOKEN)');
    }

    const baseUrl = 'https://api.trello.com/1';
    const url = new URL(`${baseUrl}${endpoint}`);
    
    // Add authentication to query params
    url.searchParams.append('key', TRELLO_API_KEY);
    url.searchParams.append('token', TRELLO_TOKEN);

    const options: RequestInit = {
        method,
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
        // For POST/PUT, add data to body
        options.body = JSON.stringify(data);
    } else if (data && method === 'GET') {
        // For GET, add data as query params
        Object.keys(data).forEach(key => {
            url.searchParams.append(key, String(data[key]));
        });
    }

    try {
        const response = await fetch(url.toString(), options);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Trello API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    } catch (error) {
        logger.error('Trello API request failed', {
            endpoint,
            method,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

/**
 * Gets or creates a label on the Trello board
 * @param boardId - Board ID
 * @param labelName - Label name
 * @param color - Label color
 * @returns Label ID
 */
async function getOrCreateLabel(boardId: string, labelName: string, color?: string): Promise<string> {
    // Check cache first
    if (labelCache[labelName]) {
        logger.debug('Using cached label', { labelName, labelId: labelCache[labelName] });
        return labelCache[labelName];
    }

    try {
        // Get all labels on the board
        const labels = await trelloApiRequest(`/boards/${boardId}/labels`, 'GET');
        
        // Find existing label
        const existingLabel = labels.find((l: any) => l.name === labelName);
        if (existingLabel) {
            labelCache[labelName] = existingLabel.id;
            logger.debug('Found existing label', { labelName, labelId: existingLabel.id });
            return existingLabel.id;
        }

        // Create new label
        const newLabel = await trelloApiRequest('/labels', 'POST', {
            name: labelName,
            color: color || 'blue',
            idBoard: boardId
        });

        labelCache[labelName] = newLabel.id;
        logger.info('Created new Trello label', { labelName, labelId: newLabel.id, color });
        return newLabel.id;

    } catch (error) {
        logger.error('Failed to get or create label', {
            labelName,
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
}

/**
 * Maps TaskDetails priority to Trello label
 * @param priority - Priority level
 * @param boardId - Board ID
 * @returns Label ID
 */
async function getPriorityLabelId(priority: string, boardId: string): Promise<string> {
    const labelName = `Priority: ${priority}`;
    const color = PRIORITY_COLORS[priority] || 'blue';
    return await getOrCreateLabel(boardId, labelName, color);
}

/**
 * Maps TaskDetails source to Trello label
 * @param source - Source platform
 * @param boardId - Board ID
 * @returns Label ID
 */
async function getSourceLabelId(source: string, boardId: string): Promise<string> {
    const labelName = `From: ${source}`;
    return await getOrCreateLabel(boardId, labelName, 'green');
}

/**
 * Creates a Trello card from TaskDetails
 * @param taskDetails - Task information
 * @param params - Additional parameters (listId, boardId, sourceLink, etc.)
 * @returns Execution result with card ID and URL
 */
export async function createCard(taskDetails: TaskDetails, params: any = {}): Promise<ExecutionResult> {
    const actionId = params.actionId || params.id || 'unknown';
    const startTime = Date.now();

    try {
        // Validate configuration
        const boardId = params.boardId || TRELLO_BOARD_ID;

        if (!boardId) {
            throw new Error('Trello board ID not provided and TRELLO_BOARD_ID not configured');
        }

        // Validate required fields
        if (!taskDetails.title) {
            throw new Error('Task title is required');
        }

        // Determine list ID using smart list selection if not provided
        let listId = params.listId;
        if (!listId) {
            // Use smart list selection based on priority and urgency
            const priority = taskDetails.priority 
                ? (taskDetails.priority === 'High' ? 1 : taskDetails.priority === 'Medium' ? 3 : 5)
                : undefined;
            
            const urgency = params.urgency || (taskDetails.labels?.includes('urgent') ? 'urgent' : 'normal');
            
            listId = await smartListSelection(boardId, { priority, urgency });
            
            logger.info('Smart list selection', {
                title: taskDetails.title,
                priority: taskDetails.priority,
                urgency,
                selectedListId: listId
            });
        }

        logger.info('Creating Trello card', {
            title: taskDetails.title,
            listId,
            priority: taskDetails.priority
        });

        // Log execution start
        await logExecutionStart(
            actionId,
            params.correlationId || '',
            'create_card',
            'trello',
            taskDetails,
            params.retriedFrom,
            params.attemptNumber
        );

        // Collect label IDs
        const labelIds: string[] = [];

        // Add priority label
        if (taskDetails.priority) {
            try {
                const priorityLabelId = await getPriorityLabelId(taskDetails.priority, boardId);
                labelIds.push(priorityLabelId);
            } catch (error) {
                logger.warn('Failed to create priority label', {
                    priority: taskDetails.priority,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // Add source label
        if (taskDetails.source) {
            try {
                const sourceLabelId = await getSourceLabelId(taskDetails.source, boardId);
                labelIds.push(sourceLabelId);
            } catch (error) {
                logger.warn('Failed to create source label', {
                    source: taskDetails.source,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        // Add custom labels
        if (taskDetails.labels && taskDetails.labels.length > 0) {
            for (const label of taskDetails.labels) {
                try {
                    const labelId = await getOrCreateLabel(boardId, label);
                    labelIds.push(labelId);
                } catch (error) {
                    logger.warn('Failed to create custom label', {
                        label,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }

        // Determine card position based on priority (higher priority = top)
        const position = taskDetails.priority
            ? PRIORITY_POSITIONS[taskDetails.priority] || 100
            : 100;

        // Prepare card data
        const cardData: any = {
            name: taskDetails.title,
            desc: taskDetails.description || '',
            idList: listId,
            pos: position
        };

        // Add due date if provided
        if (taskDetails.dueDate) {
            cardData.due = taskDetails.dueDate;
        }

        // Add labels
        if (labelIds.length > 0) {
            cardData.idLabels = labelIds.join(',');
        }

        // Create the card
        const card = await trelloApiRequest('/cards', 'POST', cardData);

        logger.info('Trello card created', {
            cardId: card.id,
            cardUrl: card.url,
            title: taskDetails.title,
            position
        });

        // Attach source link if provided
        if (params.sourceLink) {
            try {
                await trelloApiRequest(`/cards/${card.id}/attachments`, 'POST', {
                    url: params.sourceLink
                });
                logger.debug('Source link attached to card', {
                    cardId: card.id,
                    sourceLink: params.sourceLink
                });
            } catch (error) {
                logger.warn('Failed to attach source link', {
                    cardId: card.id,
                    sourceLink: params.sourceLink,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        const executionTime = Date.now() - startTime;

        // Log execution success
        await logExecutionSuccess(
            actionId,
            params.correlationId || '',
            'create_card',
            'trello',
            taskDetails,
            {
                cardId: card.id,
                url: card.url,
                shortUrl: card.shortUrl,
                position
            },
            executionTime,
            params.retriedFrom,
            params.attemptNumber
        );

        return {
            success: true,
            data: {
                cardId: card.id,
                url: card.url,
                shortUrl: card.shortUrl,
                position,
                labelIds
            },
            executionTime,
            executorUsed: 'trello'
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const executionTime = Date.now() - startTime;

        logger.error('Failed to create Trello card', {
            title: taskDetails.title,
            error: errorMessage,
            executionTime
        });

        await logExecutionFailure(
            actionId,
            params.correlationId || '',
            'create_card',
            'trello',
            taskDetails,
            errorMessage,
            executionTime,
            params.retriedFrom,
            params.attemptNumber
        );

        return {
            success: false,
            error: errorMessage,
            executionTime,
            executorUsed: 'trello'
        };
    }
}

/**
 * Moves a Trello card to a different list
 * @param cardId - Card ID to move
 * @param newListId - Target list ID
 * @param params - Additional parameters
 * @returns Execution result
 */
export async function moveCard(cardId: string, newListId: string, params: any = {}): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
        if (!cardId) {
            throw new Error('Card ID is required');
        }

        if (!newListId) {
            throw new Error('New list ID is required');
        }

        logger.info('Moving Trello card', { cardId, newListId });

        // Move the card
        const updatedCard = await trelloApiRequest(`/cards/${cardId}`, 'PUT', {
            idList: newListId
        });

        const executionTime = Date.now() - startTime;

        logger.info('Trello card moved successfully', {
            cardId,
            newListId,
            cardUrl: updatedCard.url,
            executionTime
        });

        return {
            success: true,
            data: {
                cardId: updatedCard.id,
                url: updatedCard.url,
                listId: newListId
            },
            executionTime,
            executorUsed: 'trello'
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const executionTime = Date.now() - startTime;

        logger.error('Failed to move Trello card', {
            cardId,
            newListId,
            error: errorMessage,
            executionTime
        });

        return {
            success: false,
            error: errorMessage,
            executionTime,
            executorUsed: 'trello'
        };
    }
}

/**
 * Adds a checklist to a Trello card
 * @param cardId - Card ID
 * @param items - Checklist items
 * @param params - Additional parameters (checklistName)
 * @returns Execution result
 */
export async function addChecklist(cardId: string, items: string[], params: any = {}): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
        if (!cardId) {
            throw new Error('Card ID is required');
        }

        if (!items || items.length === 0) {
            throw new Error('Checklist items are required');
        }

        const checklistName = params.checklistName || 'Subtasks';

        logger.info('Adding checklist to Trello card', {
            cardId,
            checklistName,
            itemCount: items.length
        });

        // Create the checklist
        const checklist = await trelloApiRequest('/checklists', 'POST', {
            idCard: cardId,
            name: checklistName
        });

        logger.debug('Checklist created', {
            checklistId: checklist.id,
            cardId
        });

        // Add items to the checklist
        const checkItemIds: string[] = [];
        for (const item of items) {
            try {
                const checkItem = await trelloApiRequest(`/checklists/${checklist.id}/checkItems`, 'POST', {
                    name: item
                });
                checkItemIds.push(checkItem.id);
                logger.debug('Checklist item added', {
                    checkItemId: checkItem.id,
                    itemName: item
                });
            } catch (error) {
                logger.warn('Failed to add checklist item', {
                    item,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        const executionTime = Date.now() - startTime;

        logger.info('Checklist added successfully', {
            cardId,
            checklistId: checklist.id,
            itemsAdded: checkItemIds.length,
            executionTime
        });

        return {
            success: true,
            data: {
                checklistId: checklist.id,
                checklistName: checklist.name,
                itemCount: checkItemIds.length,
                checkItemIds
            },
            executionTime,
            executorUsed: 'trello'
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const executionTime = Date.now() - startTime;

        logger.error('Failed to add checklist to Trello card', {
            cardId,
            error: errorMessage,
            executionTime
        });

        return {
            success: false,
            error: errorMessage,
            executionTime,
            executorUsed: 'trello'
        };
    }
}

/**
 * Clears the label cache
 * Useful for testing or when labels are modified externally
 */
export function clearLabelCache(): void {
    Object.keys(labelCache).forEach(key => delete labelCache[key]);
    logger.info('Trello label cache cleared');
}

/**
 * Gets the current label cache
 * @returns Label cache
 */
export function getLabelCache(): LabelCache {
    return { ...labelCache };
}

export default {
    createCard,
    moveCard,
    addChecklist,
    clearLabelCache,
    getLabelCache
};
