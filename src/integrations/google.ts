import { google } from 'googleapis';
import logger from '../utils/logger';

export class GoogleIntegration {
    private oauth2Client: any;

    constructor(private clientId: string, private clientSecret: string, private redirectUri: string) {
        this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    }

    async authenticate(code: string) {
        try {
            const { tokens } = await this.oauth2Client.getToken(code);
            this.oauth2Client.setCredentials(tokens);
            logger.info('GoogleIntegration authenticated');
            return tokens;
        } catch (err) {
            logger.error('GoogleIntegration authenticate failed', err instanceof Error ? err.message : String(err));
            throw err;
        }
    }

    async makeApiRequest(api: string, method: string, params: any) {
        const apiClient: any = (google as any)[api]({ version: 'v3', auth: this.oauth2Client });
        const response = await apiClient[method](params as any);
        return response.data;
    }
}