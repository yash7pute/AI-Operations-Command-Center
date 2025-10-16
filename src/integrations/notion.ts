import { Client } from '@notionhq/client';
import logger from '../utils/logger';

export class NotionIntegration {
    private notion: Client;

    constructor(apiKey: string) {
        this.notion = new Client({ auth: apiKey });
    }

    async queryDatabase(databaseId: string, filter?: any) {
        try {
            const response = await this.notion.databases.query({ database_id: databaseId, filter });
            return response;
        } catch (err) {
            logger.error('NotionIntegration queryDatabase failed', err instanceof Error ? err.message : String(err));
            throw err;
        }
    }

    async updatePage(pageId: string, properties: any) {
        try {
            const response = await this.notion.pages.update({ page_id: pageId, properties });
            return response;
        } catch (err) {
            logger.error('NotionIntegration updatePage failed', err instanceof Error ? err.message : String(err));
            throw err;
        }
    }
}