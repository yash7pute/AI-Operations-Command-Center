import { Client } from '@notionhq/client';
import logger from '../utils/logger';

export function createNotionClient() {
  const client = new Client({ auth: process.env.NOTION_API_KEY });
  logger.info('Notion client placeholder created');
  return client;
}
import { Client } from '@notionhq/client';

export class NotionIntegration {
    private notion: Client;

    constructor(apiKey: string) {
        this.notion = new Client({ auth: apiKey });
    }

    async queryDatabase(databaseId: string, filter?: any) {
        const response = await this.notion.databases.query({
            database_id: databaseId,
            filter: filter,
        });
        return response;
    }

    async updatePage(pageId: string, properties: any) {
        const response = await this.notion.pages.update({
            page_id: pageId,
            properties: properties,
        });
        return response;
    }
}