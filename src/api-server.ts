/**
 * API Server for AI Operations Command Center
 * 
 * Provides REST API endpoints for the frontend dashboard.
 * Endpoints:
 *   GET  /api/dashboard - Get dashboard data (metrics, signals, reviews)
 *   GET  /api/status    - Get integration status
 *   GET  /api/health    - Health check
 *   POST /api/workflows - Execute a workflow
 * 
 * Usage:
 *   ts-node src/api-server.ts
 */

import http from 'http';
import logger from './utils/logger';

// Lazy load heavy dependencies
let getDashboardData: any;
let getStatusForPolling: any;

try {
  const dashboardProvider = require('./agents/dashboard-provider');
  getDashboardData = dashboardProvider.getDashboardData;
} catch (err) {
  logger.warn('Dashboard provider not available, using mock data');
  getDashboardData = () => ({
    liveSignals: [],
    recentDecisions: [],
    pendingReviews: [],
    performance: {
      totalProcessed: 0,
      averageConfidence: 0,
      accuracyRate: 0,
      avgProcessingTime: 0,
      cacheHitRate: 0,
    },
    learningInsights: [],
  });
}

try {
  const statusDashboard = require('./integrations/status-dashboard');
  getStatusForPolling = statusDashboard.getStatusForPolling;
} catch (err) {
  logger.warn('Status dashboard not available, using mock data');
  getStatusForPolling = async () => ({
    integrations: [],
    queue: { pending: 0, processing: 0, completed: 0, failed: 0 },
    circuitBreakers: [],
    timestamp: new Date().toISOString(),
  });
}

const HTTP_PORT = process.env.API_PORT || 3001;

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// Simple request body parser
function parseRequestBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// HTTP Server
const httpServer = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const sendJson = (statusCode: number, response: ApiResponse) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response, null, 2));
  };

  try {
    // GET /api/dashboard - Dashboard data
    if (req.url === '/api/dashboard' && req.method === 'GET') {
      const data = getDashboardData();
      sendJson(200, {
        success: true,
        data,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/status - Integration status
    if (req.url === '/api/status' && req.method === 'GET') {
      const status = await getStatusForPolling();
      sendJson(200, {
        success: true,
        data: status,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/health - Health check
    if (req.url === '/api/health' && req.method === 'GET') {
      sendJson(200, {
        success: true,
        data: { 
          status: 'ok',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/metrics - Aggregated metrics (legacy endpoint)
    if (req.url === '/api/metrics' && req.method === 'GET') {
      const data = getDashboardData();
      sendJson(200, {
        success: true,
        data: {
          performance: data.performance,
          liveSignals: data.liveSignals.length,
          pendingReviews: data.pendingReviews.length,
          recentDecisions: data.recentDecisions.length,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/signals - Recent signals (legacy endpoint)
    if (req.url === '/api/signals' && req.method === 'GET') {
      const data = getDashboardData();
      sendJson(200, {
        success: true,
        data: data.liveSignals,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/actions - Recent decisions/actions (legacy endpoint)
    if (req.url === '/api/actions' && req.method === 'GET') {
      const data = getDashboardData();
      sendJson(200, {
        success: true,
        data: data.recentDecisions,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // GET /api/classifications - Recent classifications (legacy endpoint)
    if (req.url === '/api/classifications' && req.method === 'GET') {
      const data = getDashboardData();
      sendJson(200, {
        success: true,
        data: data.recentDecisions.map((d: any) => ({
          id: d.id,
          signalId: d.signalId,
          urgency: d.classification.urgency,
          importance: d.classification.importance,
          category: d.classification.category,
          confidence: d.classification.confidence,
          timestamp: d.timestamp,
        })),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // POST /api/workflows - Execute workflow (placeholder)
    if (req.url === '/api/workflows' && req.method === 'POST') {
      const body = await parseRequestBody(req);
      logger.info('Workflow execution requested', { body });
      
      sendJson(200, {
        success: true,
        data: {
          message: 'Workflow execution initiated',
          workflowId: `wf_${Date.now()}`,
        },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // 404 - Not Found
    sendJson(404, {
      success: false,
      error: 'Not found',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('API server error', err instanceof Error ? err.message : String(err));
    sendJson(500, {
      success: false,
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
    });
  }
});

// Start server
httpServer.listen(HTTP_PORT, () => {
  logger.info(`API server listening on port ${HTTP_PORT}`);
  logger.info(`Endpoints:`);
  logger.info(`  GET  http://localhost:${HTTP_PORT}/api/dashboard`);
  logger.info(`  GET  http://localhost:${HTTP_PORT}/api/status`);
  logger.info(`  GET  http://localhost:${HTTP_PORT}/api/health`);
  logger.info(`  GET  http://localhost:${HTTP_PORT}/api/metrics`);
  logger.info(`  GET  http://localhost:${HTTP_PORT}/api/signals`);
  logger.info(`  GET  http://localhost:${HTTP_PORT}/api/actions`);
  logger.info(`  POST http://localhost:${HTTP_PORT}/api/workflows`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down API server...');
  httpServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down API server...');
  httpServer.close();
  process.exit(0);
});

export default httpServer;
