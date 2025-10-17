/**
 * Status Dashboard Server Example
 * 
 * Demonstrates how to expose the status dashboard via HTTP and WebSocket.
 * 
 * Usage:
 *   ts-node src/integrations/status-dashboard-server.ts
 * 
 * Endpoints:
 *   GET  /api/status        - Polling endpoint (returns JSON)
 *   WS   ws://localhost:3001 - WebSocket for real-time updates
 */

import http from 'http';
import WebSocket from 'ws';
import { getStatusForPolling, attachWebSocketHandler } from './status-dashboard';
import logger from '../utils/logger';

const HTTP_PORT = 3001;
const WS_PORT = 3002;

// HTTP Server for polling endpoint
const httpServer = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/api/status' && req.method === 'GET') {
    try {
      const status = await getStatusForPolling();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status, null, 2));
    } catch (err) {
      logger.error('Failed to get status', err instanceof Error ? err.message : String(err));
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  } else if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

httpServer.listen(HTTP_PORT, () => {
  logger.info(`Status dashboard HTTP server listening on port ${HTTP_PORT}`);
  logger.info(`Polling endpoint: http://localhost:${HTTP_PORT}/api/status`);
});

// WebSocket Server for real-time updates
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws: WebSocket) => {
  logger.info('WebSocket client connected');
  attachWebSocketHandler(ws);

  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
  });
});

logger.info(`Status dashboard WebSocket server listening on port ${WS_PORT}`);
logger.info(`WebSocket endpoint: ws://localhost:${WS_PORT}`);

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down status dashboard server...');
  httpServer.close();
  wss.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down status dashboard server...');
  httpServer.close();
  wss.close();
  process.exit(0);
});
