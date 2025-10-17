jest.mock('../../src/utils/logger');

describe('Composio integration tests (Notion & Trello, retry queue)', () => {
  test('Notion page creation with various property types', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.resetModules();
        // Mock auth-manager to return a fake Notion client
        const fakeClient = {
          databases: {
            retrieve: jest.fn().mockResolvedValue({ properties: { title: { type: 'title' }, number: { type: 'number' }, tags: { type: 'multi_select' }, description: { type: 'rich_text' } } }),
            query: jest.fn().mockResolvedValue({ results: [] }),
          },
          pages: {
            create: jest.fn().mockResolvedValue({ id: 'notion-p1', url: 'https://notion.fake/page/notion-p1' }),
            retrieve: jest.fn().mockResolvedValue({ parent: { database_id: 'db1' } }),
            update: jest.fn().mockResolvedValue({ id: 'notion-p1' }),
          },
        };

        // Mock auth-manager so requiring notion-tools picks it up
        jest.doMock('../../src/integrations/composio/auth-manager', () => ({ __esModule: true, default: { getClient: jest.fn().mockResolvedValue(fakeClient) } }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const notion = require('../../src/integrations/composio/notion-tools');

        const props = {
          title: { title: [{ text: { content: 'Test Page' } }] },
          number: { number: 42 },
          tags: { multi_select: [{ name: 'alpha' }, { name: 'beta' }] },
          description: 'This is a description',
        };

        notion.createPage('db1', props).then((res: any) => {
          try {
            if (!res.success) throw new Error(`createPage failed: ${res.error}`);
            expect(res.success).toBe(true);
            expect(res.pageId).toBe('notion-p1');
            // verify the client was called with converted rich_text for description
            // the fake client is in module cache; retrieve mock calls
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const auth = require('../../src/integrations/composio/auth-manager');
            expect(auth.default.getClient).toHaveBeenCalledWith('notion');
            const client = fakeClient as any;
            expect(client.pages.create).toHaveBeenCalled();
            const calledArg = client.pages.create.mock.calls[0][0];
            expect(calledArg.parent.database_id).toBe('db1');
            expect(calledArg.properties.description.rich_text).toBeDefined();
            resolve();
          } catch (e) { reject(e); }
        }).catch(reject).finally(() => jest.dontMock('../../src/integrations/composio/auth-manager'));
      });
    });
  }, 10000);

  test('Notion property validation error handling for invalid parameter', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.resetModules();
        const fakeClient = {
          databases: { retrieve: jest.fn().mockResolvedValue({ properties: { title: { type: 'title' } } }) },
          pages: { create: jest.fn() },
        };
        jest.doMock('../../src/integrations/composio/auth-manager', () => ({ __esModule: true, default: { getClient: jest.fn().mockResolvedValue(fakeClient) } }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const notion = require('../../src/integrations/composio/notion-tools');

        const props = { badProp: { rich_text: [{ text: { content: 'x' } }] } };
        notion.createPage('db1', props).then((res: any) => {
          try {
            expect(res.success).toBe(false);
            expect(res.error).toMatch(/Property validation failed/);
            resolve();
          } catch (e) { reject(e); }
        }).catch(reject).finally(() => jest.dontMock('../../src/integrations/composio/auth-manager'));
      });
    });
  });

  test('Trello card creation with labels and due dates', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.resetModules();
        const fakeClient: any = {
          cards: {
            create: jest.fn().mockResolvedValue({ id: 'card1', shortLink: 'SL1' }),
            get: jest.fn().mockResolvedValue({ id: 'card1', idBoard: 'board1' }),
            createAttachment: jest.fn().mockResolvedValue({}),
            addComment: jest.fn().mockResolvedValue({ id: 'cm1' }),
            addLabel: jest.fn().mockResolvedValue({}),
          },
          boards: { getLabels: jest.fn().mockResolvedValue([]) },
          labels: { create: jest.fn().mockResolvedValue({ id: 'lab1' }) },
        };

        jest.doMock('../../src/integrations/composio/auth-manager', () => ({ __esModule: true, default: { getClient: jest.fn().mockResolvedValue(fakeClient) } }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const trello = require('../../src/integrations/composio/trello-tools');

        trello.createCard('list1', 'My card', 'desc', new Date('2025-12-01T12:00:00Z'), ['urgent', 'ops'], ['https://drive.fake/file']).then((res: any) => {
          try {
            if (!res.success) throw new Error(`createCard failed: ${res.error}`);
            expect(res.success).toBe(true);
            expect(res.cardId).toBe('card1');
            expect(res.url).toContain('https://trello.com/c/');
            // assert card create was called with due date
            const called = fakeClient.cards.create.mock.calls[0][0];
            expect(called.idList).toBe('list1');
            expect(called.due).toBe('2025-12-01T12:00:00.000Z');
            // labels flow: labels.create called for missing labels
            expect(fakeClient.labels.create).toHaveBeenCalled();
            resolve();
          } catch (e) { reject(e); }
        }).catch(reject).finally(() => jest.dontMock('../../src/integrations/composio/auth-manager'));
      });
    });
  }, 15000);

  test('Trello error handling for invalid parameters', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        jest.resetModules();
        const fakeClient: any = { cards: { create: jest.fn().mockRejectedValue(new Error('invalid list')) } };
        jest.doMock('../../src/integrations/composio/auth-manager', () => ({ __esModule: true, default: { getClient: jest.fn().mockResolvedValue(fakeClient) } }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const trello = require('../../src/integrations/composio/trello-tools');
        trello.createCard('badlist', 'x').then((res: any) => {
          try {
            expect(res.success).toBe(false);
            expect(res.error).toMatch(/invalid list/);
            resolve();
          } catch (e) { reject(e); }
        }).catch(reject).finally(() => jest.dontMock('../../src/integrations/composio/auth-manager'));
      });
    });
  });

  test('Retry logic and queue system for rate-limited operations', async () => {
    await new Promise<void>((resolve, reject) => {
      jest.isolateModules(() => {
        // Require a fresh retry-queue module so we can stop its interval and use it safely
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const retryQueue = require('../../src/utils/retry-queue').default;
        // Stop background timer to avoid open handles
        try { retryQueue.stop(); } catch (e) {}

        // handler that fails first time then succeeds
        let calls = 0;
        const handler = jest.fn().mockImplementation(async (params: any) => {
          calls += 1;
          if (calls === 1) throw new Error('transient error');
          return { ok: true, params };
        });

        retryQueue.registerHandler('test-op', handler);
        const id = retryQueue.enqueue({ type: 'test-op', params: { x: 1 } });

        // First run: should attempt and fail, leaving item scheduled for future
        retryQueue.processQueue().then((stats1: any) => {
          try {
            expect(stats1.attempted).toBeGreaterThanOrEqual(1);
            expect(stats1.succeeded + stats1.failed).toBeGreaterThanOrEqual(1);
            const q = retryQueue.getQueue();
            expect(q.length).toBeGreaterThanOrEqual(0);
            // find the item
            const item = q.find((it: any) => it.id === id);
            expect(item).toBeDefined();
            // bring nextAttemptAt into the past so next processQueue will retry
            item.nextAttemptAt = Date.now() - 1000;
            // persist this change in underlying queue file by saving via private method? use getQueue then modify queue property
            // There's no public save API, but getQueue returns array; to ensure processQueue sees it, we will directly mutate the internal queue via writing to file
            const fs = require('fs');
            const path = require('path');
            const dataFile = path.join(process.cwd(), 'data', 'retry-queue.json');
            fs.writeFileSync(dataFile, JSON.stringify(retryQueue.getQueue(), null, 2));

            // Second run: should pick up the item and succeed
            retryQueue.processQueue().then((stats2: any) => {
              try {
                expect(stats2.succeeded).toBeGreaterThanOrEqual(1);
                // ensure handler called at least twice (fail then success)
                expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2);
                resolve();
              } catch (e) { reject(e); }
            }).catch(reject);
          } catch (e) { reject(e); }
        }).catch(reject);
      });
    });
  }, 20000);

});
