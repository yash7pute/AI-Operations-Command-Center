import { google } from 'googleapis';
import logger from '../utils/logger';

export class GoogleIntegration {
    private oauth2Client: any;

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    }

    async authenticate(code: string) {
        const { tokens } = await this.oauth2Client.getToken(code);
        this.oauth2Client.setCredentials(tokens);
        return tokens;
    }

    async makeApiRequest(api: string, method: string, params: any) {
        // Example: api = 'sheets', method = 'spreadsheets.values.get'
        const apiClient = (google as any)[api];
        if (typeof apiClient !== 'function' && typeof apiClient !== 'object') {
            throw new Error(`Unknown Google API client: ${api}`);
        }
        // If apiClient is a factory, call it with version; otherwise assume it's ready
        const client = typeof apiClient === 'function' ? apiClient({ version: 'v4' }) : apiClient;
        const parts = method.split('.');
        let fn: any = client;
        for (const p of parts) fn = fn[p];
        if (typeof fn !== 'function') throw new Error('Invalid method');
        const response = await fn(params);
        return response.data;
    }

    static createGoogleClients() {
        const sheets = google.sheets({ version: 'v4' });
        const drive = google.drive({ version: 'v3' });
        logger.info('Google clients placeholder created');
        return { sheets, drive };
    }
}