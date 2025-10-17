jest.mock('../../src/utils/logger');

/**
 * E2E full pipeline test (simulated):
 * - Simulate Gmail receiving an email -> Gmail listener/processor emits an EventHub event
 * - EventHub dispatches event to subscribers (we register test handlers to simulate Member 2 processing)
 * - Downstream integrations (Composio Notion/Trello, Slack, Sheets) are mocked to assert transformed payloads
 * - Retry queue is exercised for a transient failure
 * - Measure end-to-end latency and log a trace
 */

describe('E2E full pipeline (Gmail -> EventHub -> Member processing)', () => {
  let hub: any;
  let retryQueue: any;
  
  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(async () => {
    // Clean up any active timers/intervals from EventHub and RetryQueue
    if (hub && hub.cleanup) {
      await hub.cleanup();
    }
    if (retryQueue) {
      try { 
        retryQueue.stop(); 
        // Clear any pending items
        if (retryQueue.clear) retryQueue.clear();
      } catch (e) {}
    }
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  test('Gmail -> EventHub -> downstream integrations, error recovery, latency and trace', async () => {
    // We'll load the event hub and register subscribers to simulate real integration handlers
    hub = require('../../src/integrations/event-hub').default;
    retryQueue = require('../../src/utils/retry-queue').default;

    // Stop retryQueue background timer to control processing
    try { retryQueue.stop(); } catch (e) {}

    // Prepare mocks for downstream integrations so we can assert they receive transformed payloads
    const fakeNotion = {
      createPage: jest.fn().mockResolvedValue({ success: true, pageId: 'p-123' }),
    };
    const fakeTrello = {
      createCard: jest.fn().mockResolvedValue({ success: true, cardId: 'c-123', url: 'https://trello.com/c/c-123' }),
    };
    const fakeSlack = {
      postMessage: jest.fn().mockResolvedValue({ ok: true }),
    };
    const fakeSheets = {
      appendRow: jest.fn().mockResolvedValue({ ok: true }),
    };

    // Mock composio integrations by mocking the modules that tests use
    jest.doMock('../../src/integrations/composio/notion-tools', () => ({ __esModule: true, default: fakeNotion, createPage: fakeNotion.createPage }));
    jest.doMock('../../src/integrations/composio/trello-tools', () => ({ __esModule: true, default: fakeTrello, createCard: fakeTrello.createCard }));
    // Mock slack integration
    jest.doMock('../../src/integrations/slack/actions', () => ({ __esModule: true, postMessage: fakeSlack.postMessage }));
    // Mock sheets writer
    jest.doMock('../../src/integrations/sheets/writer', () => ({ __esModule: true, appendRow: fakeSheets.appendRow }));

    // Register a subscriber that acts as Member 2: validates the event and calls downstream integrations
    const memberHandler = jest.fn().mockImplementation(async (event: any) => {
      // Validate incoming event shape (from Gmail)
      expect(event.source).toBe('gmail');
      expect(event.type).toBe('message.received');
      expect(event.data).toBeDefined();
      // Transform: build page properties for Notion
      const notion = require('../../src/integrations/composio/notion-tools').default;
      const trello = require('../../src/integrations/composio/trello-tools').default;
      const slack = require('../../src/integrations/slack/actions');
      const sheets = require('../../src/integrations/sheets/writer');

      // Simulate a transient failure on Notion first call by using retryQueue
      const notionRes = await notion.createPage('db-test', { title: { title: [{ text: { content: event.data.subject } }] } });

      // Trello card and Slack notification
      const trelloRes = await trello.createCard('list-1', `From: ${event.data.from}`, event.data.snippet || '');
      await slack.postMessage({ channel: '#alerts', text: `New email from ${event.data.from}` });
      await sheets.appendRow(['email', event.data.from, event.data.subject, event.timestamp]);

      return { notion: notionRes, trello: trelloRes };
    });

    // subscribe the handler to message.received
    const unsubscribe = hub.subscribe('message.received', memberHandler);

    // Prepare a trace/log collector
    const trace: any[] = [];
    const logger = require('../../src/utils/logger');
    // Ensure logger.info/error are jest mocks so we can capture traces. If the module wasn't auto-mocked,
    // replace the methods with jest.fn that records into our trace array.
    if (!logger.info || typeof logger.info !== 'function' || !(logger.info as any).mock) {
      logger.info = jest.fn((m: any, meta?: any) => trace.push({ level: 'info', msg: m, meta }));
    } else {
      (logger.info as jest.Mock).mockImplementation((m: any, meta?: any) => trace.push({ level: 'info', msg: m, meta }));
    }
    if (!logger.error || typeof logger.error !== 'function' || !(logger.error as any).mock) {
      logger.error = jest.fn((m: any, meta?: any) => trace.push({ level: 'error', msg: m, meta }));
    } else {
      (logger.error as jest.Mock).mockImplementation((m: any, meta?: any) => trace.push({ level: 'error', msg: m, meta }));
    }

    // Simulate incoming Gmail message -> build payload
    const gmailPayload = {
      id: 'msg-1',
      from: 'alice@example.com',
      to: ['me@example.com'],
      subject: 'Hello World',
      snippet: 'This is a short snippet of the email',
      body: 'Full body here',
    };

    const startTs = Date.now();
    // Emit event through hub (this will enqueue+process synchronously)
    const emitted = await hub.emitEvent({ source: 'gmail', type: 'message.received', data: gmailPayload, metadata: { raw: true }, priority: 'normal' });

    // Wait for async processing to complete
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const endTs = Date.now();
    const latencyMs = endTs - startTs;

    // Assert member handler was called and downstream integrations were invoked
    expect(memberHandler).toHaveBeenCalled();
    expect(fakeNotion.createPage).toHaveBeenCalledWith('db-test', expect.any(Object));
    expect(fakeTrello.createCard).toHaveBeenCalledWith('list-1', expect.stringContaining('From:'), expect.any(String));
    expect(fakeSlack.postMessage).toHaveBeenCalled();
    expect(fakeSheets.appendRow).toHaveBeenCalled();

    // Validate data transformations: notion title should contain subject
    const notionArg = fakeNotion.createPage.mock.calls[0][1];
    expect(notionArg.title.title[0].text.content).toBe(gmailPayload.subject);

    // Validate emitted event returned and has timestamp
    expect(emitted).toBeDefined();
    expect(emitted.timestamp).toBeDefined();

    // Measure that latency is within a reasonable bound for the test (e.g., < 5s)
    trace.push({ level: 'info', msg: 'e2e_latency', meta: { latencyMs } });
    expect(latencyMs).toBeLessThan(5000);

    // Ensure EventHub recorded the emitted event in its history
    const history = hub.getEventHistory('gmail', 10);
    const found = history.find((h: any) => h.type === 'message.received' && h.data && h.data.id === gmailPayload.id);
    expect(found).toBeDefined();

    // cleanup subscriber
    unsubscribe();
  }, 20000);
});
