// Shared TypeScript types and interfaces
export interface AppConfig {
  gmailClientId?: string;
  gmailClientSecret?: string;
}
export interface SlackMessage {
    channel: string;
    text: string;
    attachments?: Array<{
        text: string;
        color?: string;
        fields?: Array<{ title: string; value: string; short?: boolean }>;
    }>;
}

export interface GoogleAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

export interface NotionDatabaseQuery {
    filter?: {
        property: string;
        text: {
            contains: string;
        };
    };
    sorts?: Array<{
        property: string;
        direction: 'ascending' | 'descending';
    }>;
}

export interface AppConfig {
    slackToken: string;
    googleAuth: GoogleAuthConfig;
    notionToken: string;
}