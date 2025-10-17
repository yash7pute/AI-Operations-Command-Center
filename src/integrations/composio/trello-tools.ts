import logger from '../../utils/logger';
import authManager from './auth-manager';
import fileManager from '../drive/file-manager';

// NOTE: Assumes composio-sdk Tool Router provides an authenticated Trello client with Trello-like API
// eslint-disable-next-line @typescript-eslint/no-var-requires
const composio = require('composio-sdk');

interface CreateCardResult {
  success: boolean;
  cardId?: string;
  url?: string;
  data?: any;
  error?: string;
}

async function getTrelloClient() {
  try {
    return await authManager.getClient('trello');
  } catch (err: any) {
    logger.error('Trello client unavailable', { error: err?.message || String(err) });
    throw new Error('Trello client not authenticated. Call authenticateApp("trello")');
  }
}

async function ensureLabelExists(client: any, boardId: string, labelName: string, color = 'blue') {
  try {
    // list labels on board
    const labels = await client.boards.getLabels({ id: boardId });
    const found = labels.find((l: any) => l.name === labelName);
    if (found) return found;
    // create label
    const created = await client.labels.create({ idBoard: boardId, name: labelName, color });
    logger.info('Created Trello label', { boardId, label: labelName });
    return created;
  } catch (err: any) {
    logger.error('Failed to ensure label exists', { boardId, labelName, error: err?.message || String(err) });
    throw err;
  }
}

export async function createCard(listId: string, name: string, desc?: string, due?: string | Date, labels: string[] = [], attachments: string[] = []): Promise<CreateCardResult> {
  try {
    const client = await getTrelloClient();

    const cardBody: any = { idList: listId, name, desc: desc || '' };
    if (due) cardBody.due = typeof due === 'string' ? due : due.toISOString();

    // create card
    const card = await client.cards.create(cardBody);
    logger.info('Created Trello card', { cardId: card.id });

    // attach labels if needed (requires board id)
    if (labels && labels.length) {
      // fetch card to get board id
      const cardFull = await client.cards.get(card.id);
      const boardId = cardFull.idBoard;
      for (const lab of labels) {
        try {
          const l = await ensureLabelExists(client, boardId, lab);
          await client.cards.addLabel({ idCard: card.id, idLabel: l.id });
        } catch (err: any) {
          logger.warn('Failed to add label to Trello card', { cardId: card.id, label: lab, error: err?.message || String(err) });
        }
      }
    }

    // attachments: if drive links provided, add as attachments
    for (const a of attachments) {
      try {
        await client.cards.createAttachment({ idCard: card.id, url: a });
      } catch (err: any) {
        logger.warn('Failed to attach URL to Trello card', { cardId: card.id, url: a, error: err?.message || String(err) });
      }
    }

    return { success: true, cardId: card.id, url: `https://trello.com/c/${card.shortLink}`, data: card };
  } catch (err: any) {
    logger.error('Failed to create Trello card', { error: err?.message || String(err) });
    return { success: false, error: err?.message || String(err) };
  }
}

export async function moveCard(cardId: string, newListId: string) {
  try {
    const client = await getTrelloClient();
    const updated = await client.cards.update({ id: cardId, idList: newListId });
    logger.info('Moved Trello card', { cardId, newListId });
    return { success: true, data: updated, url: `https://trello.com/c/${updated.shortLink}` };
  } catch (err: any) {
    logger.error('Failed to move Trello card', { cardId, newListId, error: err?.message || String(err) });
    return { success: false, error: err?.message || String(err) };
  }
}

export async function addComment(cardId: string, text: string) {
  try {
    const client = await getTrelloClient();
    const comment = await client.cards.addComment({ id: cardId, text });
    logger.info('Added comment to Trello card', { cardId, commentId: comment.id });
    return { success: true, data: comment };
  } catch (err: any) {
    logger.error('Failed to add comment to Trello card', { cardId, error: err?.message || String(err) });
    return { success: false, error: err?.message || String(err) };
  }
}

export async function getCard(cardId: string) {
  try {
    const client = await getTrelloClient();
    const card = await client.cards.get(cardId);
    logger.info('Fetched Trello card', { cardId });
    return { success: true, data: card, url: `https://trello.com/c/${card.shortLink}` };
  } catch (err: any) {
    logger.error('Failed to fetch Trello card', { cardId, error: err?.message || String(err) });
    return { success: false, error: err?.message || String(err) };
  }
}

export default { createCard, moveCard, addComment, getCard };
