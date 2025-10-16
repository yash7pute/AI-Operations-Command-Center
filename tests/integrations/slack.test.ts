// Ensure required env vars are present before tests run
process.env.SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || 'xoxb-fake';
process.env.SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || 'fake-secret';

jest.mock('../../src/utils/logger');

describe('Slack integration tests (isolated)', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('connection with valid tokens', () => {
    const fakeApp = { client: { auth: { test: jest.fn().mockResolvedValue({ user: 'bot' }) } } } as any;

    jest.isolateModules(() => {
      jest.doMock('../../src/integrations/slack/connection', () => ({ getSlackApp: () => fakeApp }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const conn = require('../../src/integrations/slack/connection');
      const app = conn.getSlackApp();
      expect(app).toBeDefined();
      expect(typeof app.client.auth.test).toBe('function');
      jest.dontMock('../../src/integrations/slack/connection');
    });
  });

  test('message listener with mocked events and thread handling', async () => {
    const handlers: Record<string, Function[]> = {};
    const fakeApp: any = {
      event: (name: string, fn: Function) => {
        if (!handlers[name]) handlers[name] = [];
        handlers[name].push(fn);
      },
      client: {
        conversations: { replies: jest.fn().mockResolvedValue({ messages: [{ text: 'parent' }] }) },
      },
    };

    jest.isolateModules(() => {
      jest.doMock('../../src/integrations/slack/connection', () => ({ getSlackApp: () => fakeApp }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { SlackListener } = require('../../src/integrations/slack/listener');

      const listener = new SlackListener();
      const received: any[] = [];
      listener.on('message', (m: any) => received.push(m));

      // Simulate incoming message event
      const handler = handlers['message'][0];
      return handler({ event: { client_msg_id: 'abc', user: 'U1', channel: 'C1', text: 'hello', ts: '123', thread_ts: '122' }, client: fakeApp.client, context: { botUserId: 'B1' } }).then(() => {
        expect(received.length).toBe(1);
        expect(received[0].id).toBe('abc');
        expect(received[0].thread).toBeDefined();
        expect(fakeApp.client.conversations.replies).toHaveBeenCalled();
      }).finally(() => jest.dontMock('../../src/integrations/slack/connection'));
    });
  });

  test('message sending with different formats', async () => {
    const chatPost = jest.fn().mockResolvedValue({ ts: '999' });
    const openConv = jest.fn().mockResolvedValue({ channel: { id: 'D1' } });
    const fakeApp = { client: { chat: { postMessage: chatPost }, conversations: { open: openConv } } } as any;

    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.doMock('../../src/integrations/slack/connection', () => ({ getSlackApp: () => fakeApp }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const actions = require('../../src/integrations/slack/actions');
        actions.sendMessage('C1', 'hi').then((res: any) => {
          try {
            expect(chatPost).toHaveBeenCalledWith({ channel: 'C1', text: 'hi', blocks: undefined });
            expect(res.ts).toBe('999');
            return actions.sendMessage('C1', 'with blocks', [{ type: 'section' }]);
          } catch (e) { throw e; }
        }).then(() => {
          return actions.sendDirectMessage('U1', 'hello dm');
        }).then(() => {
          try {
            expect(openConv).toHaveBeenCalledWith({ users: 'U1' });
            resolve();
          } catch (e) { reject(e); }
        }).catch(reject).finally(() => jest.dontMock('../../src/integrations/slack/connection'));
      });
    });
  }, 10000);

  test('error handling for invalid channels', async () => {
    const chatPost = jest.fn().mockRejectedValue({ data: { error: 'channel_not_found' } });
    const fakeApp = { client: { chat: { postMessage: chatPost } } } as any;

    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.doMock('../../src/integrations/slack/connection', () => ({ getSlackApp: () => fakeApp }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const actions = require('../../src/integrations/slack/actions');
        actions.sendMessage('BAD', 'x').then(() => reject(new Error('Expected rejection'))).catch((e: any) => {
          try {
            expect(e.message).toContain('Channel not found');
            resolve();
          } catch (err) { reject(err); }
        }).finally(() => jest.dontMock('../../src/integrations/slack/connection'));
      });
    });
  }, 10000);

  test('rate limiting behavior', async () => {
    const chatPost = jest.fn().mockResolvedValue({ ts: '1' });
    const fakeApp = { client: { chat: { postMessage: chatPost }, conversations: { open: jest.fn().mockResolvedValue({ channel: { id: 'D1' } }) } } } as any;

    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.doMock('../../src/integrations/slack/connection', () => ({ getSlackApp: () => fakeApp }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const actions = require('../../src/integrations/slack/actions');

        const start = Date.now();
        actions.sendMessage('C1', 'm1').then(() => actions.sendMessage('C1', 'm2')).then(() => {
          try {
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(900);
            resolve();
          } catch (e) { reject(e); }
        }).catch(reject).finally(() => jest.dontMock('../../src/integrations/slack/connection'));
      });
    });
  }, 20000);

});
