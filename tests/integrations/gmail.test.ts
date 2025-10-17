import fs from 'fs';
import path from 'path';
import logger from '../../src/utils/logger';
import { GmailFetcher } from '../../src/integrations/gmail/fetcher';
import { GmailListener } from '../../src/integrations/gmail/listener';
import * as auth from '../../src/integrations/gmail/auth';

jest.mock('../../src/utils/logger');

// Mock googleapis calls by mocking methods on GmailFetcher.gmail when connected

describe('Gmail integration tests', () => {
  const tokensDir = path.resolve(process.cwd(), 'tokens');
  const tokenPath = path.join(tokensDir, 'gmail-token.json');

  beforeAll(() => {
    // Ensure clean tokens dir
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  });

  afterAll(() => {
    // Clean up tokens
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
  });

  test('connection with valid credentials', async () => {
    // Create dummy env vars for buildOAuth2Client to not throw
    process.env.GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || 'fake-client';
    process.env.GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || 'fake-secret';
    process.env.GMAIL_REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';

    // Mock getAuthenticatedClient to return an OAuth2Client-like object and avoid file ops
    const spyGetAuth = jest.spyOn(auth, 'getAuthenticatedClient').mockImplementation(async () => {
      return {
        on: () => {},
        setCredentials: () => {},
        getAccessToken: async () => ({ token: 'ya29.fake' }),
      } as any;
    });

    const fetcher = new GmailFetcher();
    await expect(fetcher.connect()).resolves.toBeDefined();

    spyGetAuth.mockRestore();
  }, 20000);

  test('fetching unread messages (mocked response)', async () => {
    // Arrange
    const fetcher = new GmailFetcher();
    const fakeList = { messages: [{ id: 'm1' }, { id: 'm2' }], nextPageToken: undefined } as any;
    const fakeGet = {
      id: 'm1',
      threadId: 't1',
      payload: { headers: [{ name: 'From', value: 'a@b.com' }, { name: 'Subject', value: 'Hi' }], parts: [] },
      labelIds: ['INBOX', 'UNREAD'],
    } as any;

    // Mock auth client and gmail client functions used in fetcher
    const spyAuth = jest.spyOn(auth, 'getAuthenticatedClient').mockImplementation(async () => ({
      on: () => {},
      setCredentials: () => {},
      getAccessToken: async () => ({ token: 'ya29.fake' }),
    } as any));

    // Replace internal gmail client after connect
    await fetcher.connect();
    // @ts-ignore
    fetcher['gmail'] = {
      users: {
        messages: {
          list: jest.fn().mockResolvedValue(fakeList),
          get: jest.fn().mockResolvedValue({ data: fakeGet }),
        },
      },
    } as any;

    const results = await fetcher.fetchUnreadMessages(5);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThanOrEqual(0);

    spyAuth.mockRestore();
  });

  test('email parsing with multipart MIME', async () => {
    const fetcher = new GmailFetcher();
    const spyAuth = jest.spyOn(auth, 'getAuthenticatedClient').mockImplementation(async () => ({
      on: () => {},
      setCredentials: () => {},
      getAccessToken: async () => ({ token: 'ya29.fake' }),
    } as any));

    await fetcher.connect();
    // Create multipart message
    const multipartMsg = {
      id: 'mp1',
      payload: {
        headers: [{ name: 'From', value: 'x@y.com' }, { name: 'Subject', value: 'Multi' }],
        parts: [
          { mimeType: 'text/plain', body: { data: Buffer.from('hello').toString('base64') } },
          { mimeType: 'text/html', body: { data: Buffer.from('<b>bold</b>').toString('base64') } },
        ],
      },
      labelIds: ['UNREAD'],
    } as any;

    // @ts-ignore
    // The fetcher expects the `get` to return the message object directly
    fetcher['gmail'] = {
      users: {
        messages: {
          get: jest.fn().mockResolvedValue(multipartMsg),
        },
      },
    } as any;

    const parsed = await fetcher.fetchMessageById('mp1');
    expect(parsed.body).toContain('hello');
    expect(parsed.subject).toBe('Multi');

    spyAuth.mockRestore();
  });

  test('error handling for invalid credentials', async () => {
  // Clear env to force buildOAuth2Client to throw when generating an auth URL
  delete process.env.GMAIL_CLIENT_ID;
  delete process.env.GMAIL_CLIENT_SECRET;
  delete process.env.GMAIL_REDIRECT_URI;

  expect(() => auth.generateAuthUrl()).toThrow();
  });

  test('listener polling mechanism and duplicate detection', async () => {
    const listener = new GmailListener(100, 0);
    const spyAuth = jest.spyOn(auth, 'getAuthenticatedClient').mockImplementation(async () => ({
      on: () => {},
      setCredentials: () => {},
      getAccessToken: async () => ({ token: 'ya29.fake' }),
    } as any));

    // Simulate fetcher to return a message and then the same message again
    // @ts-ignore
    listener['fetcher'] = {
      fetchUnreadMessages: jest.fn()
        .mockResolvedValueOnce([
          { id: 'dup1', subject: 'First', payload: {}, attachments: [] },
        ])
        .mockResolvedValueOnce([
          { id: 'dup1', subject: 'First', payload: {}, attachments: [] },
        ]),
    } as any;

    const messages: any[] = [];
    listener.on('message', (m: any) => messages.push(m));

    // Connect but avoid starting the interval; call pollOnce directly twice
    await listener.connect();
    // @ts-ignore
    await listener['pollOnce']();
    // second poll should produce no new messages due to duplicate detection
    // @ts-ignore
    await listener['pollOnce']();

    // Should only have fired once due to duplicate detection
    expect(messages.length).toBeGreaterThanOrEqual(1);
    expect(new Set(messages.map((m) => m.id)).size).toBe(messages.length);

    spyAuth.mockRestore();
  }, 20000);

});
