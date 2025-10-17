import type { Signal, Classification, Action, Metrics } from '../types'

export const createMockSignals = (count: number): Signal[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `sig-${i}`,
    source: ['Gmail', 'Slack', 'Sheets'][i % 3] as 'Gmail' | 'Slack' | 'Sheets',
    subject: `Signal ${i + 1}`,
    preview: `Preview of signal ${i + 1}`,
    timestamp: new Date(Date.now() - i * 1000 * 60).toISOString(),
    status: ['Processing', 'Classified', 'Action Taken', 'Error'][i % 4] as 'Processing' | 'Classified' | 'Action Taken' | 'Error',
    urgency: ['Critical', 'High', 'Medium', 'Low'][i % 4] as 'Critical' | 'High' | 'Medium' | 'Low'
  }))

export const createMockClassifications = (signals: Signal[]): Classification[] =>
  signals.map((s, i) => ({
    id: `cls-${i}`,
    signalId: s.id,
    urgency: ['Critical', 'High', 'Medium', 'Low'][i % 4],
    confidence: Math.round(Math.random() * 100),
    reasoning: `Reasoning for classification ${i + 1}`
  }))

export const createMockActions = (classifications: Classification[]): Action[] =>
  classifications.map((c, i) => ({
    id: `act-${i}`,
    signalId: c.signalId,
    type: ['approve', 'modify', 'reject'][i % 3] as 'approve' | 'modify' | 'reject',
    timestamp: Date.now() - i * 1000 * 30,
    status: ['pending', 'completed', 'failed'][i % 3] as 'pending' | 'completed' | 'failed',
    description: `Action ${i + 1} description`,
    platform: ['Notion', 'Trello', 'Slack', 'Drive', 'Sheets'][i % 5] as 'Notion' | 'Trello' | 'Slack' | 'Drive' | 'Sheets',
    resourceLink: `https://example.com/resource/${i}`
  }))

export const createMockMetrics = (): Metrics => ({
  signalsToday: 120,
  tasksCreated: 87,
  successRate: 95.5,
  avgTime: 2.3,
  pendingApprovals: 5,
  queueDepth: 12,
  urgencyBreakdown: [
    { label: 'Critical', value: 10 },
    { label: 'High', value: 30 },
    { label: 'Medium', value: 50 },
    { label: 'Low', value: 30 }
  ],
  categoryDistribution: [
    { category: 'Tasks', count: 45 },
    { category: 'Alerts', count: 30 },
    { category: 'Reports', count: 25 }
  ],
  confidenceHistogram: [
    { bucket: '0-20', count: 5 },
    { bucket: '20-40', count: 10 },
    { bucket: '40-60', count: 20 },
    { bucket: '60-80', count: 35 },
    { bucket: '80-100', count: 50 }
  ],
  accuracyOverTime: [
    { time: '00:00', accuracy: 92 },
    { time: '04:00', accuracy: 94 },
    { time: '08:00', accuracy: 95 },
    { time: '12:00', accuracy: 96 },
    { time: '16:00', accuracy: 95 },
    { time: '20:00', accuracy: 93 }
  ],
  actionsByPlatform: [
    { platform: 'Notion', value: 35 },
    { platform: 'Trello', value: 25 },
    { platform: 'Slack', value: 20 },
    { platform: 'Drive', value: 15 },
    { platform: 'Sheets', value: 10 }
  ],
  topPatterns: [
    'High priority email → Create task',
    'Bug report → Create Trello card',
    'Meeting request → Schedule event'
  ],
  accuracyDelta: 2.5
})
