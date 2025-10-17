/**
 * Agent Configuration for AI Operations Command Center
 * 
 * Defines:
 * - Signal patterns (what to look for in emails/messages)
 * - Notion database configuration
 * - Urgency and importance rules
 * - Source priorities
 * - Action configurations
 */

import type { Signal } from '../agents/reasoning/context-builder';

/**
 * Signal Pattern Configuration
 * Keywords/phrases to detect in emails and Slack messages
 */
export const SIGNAL_PATTERNS = {
  // Deadline/Date indicators
  deadlines: [
    'due by',
    'due date',
    'deadline',
    'must be completed by',
    'needs to be done by',
    'submit by',
    'by end of',
    'EOD',
    'COB',
    'before',
    'no later than',
  ],
  
  // High urgency indicators
  urgent: [
    'urgent',
    'ASAP',
    'as soon as possible',
    'critical',
    'important',
    'high priority',
    'immediate',
    'emergency',
    'time-sensitive',
  ],
  
  // Task/action indicators
  tasks: [
    'task',
    'todo',
    'action item',
    'follow up',
    'reminder',
    'don\'t forget',
    'make sure to',
    'need to',
    'have to',
  ],
  
  // Meeting/event indicators
  meetings: [
    'meeting',
    'call',
    'appointment',
    'scheduled for',
    'conference',
    'discussion',
    'sync',
    'standup',
  ],
  
  // Project/deliverable indicators
  projects: [
    'project',
    'deliverable',
    'milestone',
    'release',
    'launch',
    'sprint',
    'epic',
  ],
};

/**
 * Notion Database Configuration
 * Map signal properties to Notion properties
 */
export const NOTION_CONFIG = {
  // Database ID (user should set this in .env as NOTION_DATABASE_ID)
  databaseId: process.env.NOTION_DATABASE_ID || '',
  
  // Property mappings
  properties: {
    title: 'Name', // Notion property name for task title
    dueDate: 'Due Date', // Date property
    priority: 'Priority', // Select property (Critical, High, Medium, Low)
    source: 'Source', // Select property (Gmail, Slack, Manual)
    link: 'Link', // URL property (link to original email/message)
    category: 'Category', // Select property (Meeting, Task, Project, etc.)
    status: 'Status', // Select property (To Do, In Progress, Done)
    confidence: 'AI Confidence', // Number property (0-100)
    rawContent: 'Raw Content', // Text property (original message)
  },
  
  // Default values
  defaults: {
    status: 'To Do',
  },
};

/**
 * Gmail Configuration
 * What to monitor in Gmail
 */
export const GMAIL_CONFIG = {
  // Labels to monitor (empty = monitor all)
  monitorLabels: ['INBOX', 'IMPORTANT'],
  
  // Ignore these labels
  ignoreLabels: ['SPAM', 'TRASH', 'DRAFT'],
  
  // Only process unread emails
  unreadOnly: true,
  
  // Check interval (milliseconds)
  pollInterval: 60000, // 1 minute
  
  // Max emails to process per poll
  maxEmailsPerPoll: 10,
  
  // Mark as read after processing
  markAsReadAfterProcessing: false,
};

/**
 * Slack Configuration
 * What to monitor in Slack
 */
export const SLACK_CONFIG = {
  // Channels to monitor (empty = monitor all public channels you're in)
  monitorChannels: [] as string[],
  
  // Monitor DMs
  monitorDirectMessages: true,
  
  // Only process messages mentioning the bot
  requireMention: false,
  
  // Check interval (milliseconds)
  pollInterval: 30000, // 30 seconds
  
  // Max messages to process per poll
  maxMessagesPerPoll: 20,
  
  // Reply with confirmation
  replyWithConfirmation: true,
};

/**
 * Urgency Rules
 * Determine urgency level based on signal content
 */
export function calculateUrgency(signal: Signal): 'critical' | 'high' | 'medium' | 'low' {
  const content = `${signal.subject || ''} ${signal.body}`.toLowerCase();
  
  // Critical: Contains urgent keywords + deadline in next 24 hours
  if (SIGNAL_PATTERNS.urgent.some(keyword => content.includes(keyword.toLowerCase()))) {
    const hasNearDeadline = /today|tonight|tomorrow|within.*hours?|by.*\d{1,2}:\d{2}/i.test(content);
    if (hasNearDeadline) {
      return 'critical';
    }
    return 'high';
  }
  
  // High: Contains deadline keywords
  if (SIGNAL_PATTERNS.deadlines.some(keyword => content.includes(keyword.toLowerCase()))) {
    return 'high';
  }
  
  // Medium: Contains task/action keywords
  if (SIGNAL_PATTERNS.tasks.some(keyword => content.includes(keyword.toLowerCase()))) {
    return 'medium';
  }
  
  // Low: Everything else
  return 'low';
}

/**
 * Importance Rules
 * Determine importance level based on signal source and content
 */
export function calculateImportance(signal: Signal): 'high' | 'medium' | 'low' {
  const content = `${signal.subject || ''} ${signal.body}`.toLowerCase();
  
  // High: From specific senders or contains project keywords
  const senderLower = signal.sender?.toLowerCase() || '';
  if (senderLower && HIGH_PRIORITY_SENDERS.some(sender => 
    senderLower.includes(sender.toLowerCase())
  )) {
    return 'high';
  }
  
  if (SIGNAL_PATTERNS.projects.some(keyword => content.includes(keyword.toLowerCase()))) {
    return 'high';
  }
  
  // Medium: Meetings or multiple people involved
  if (SIGNAL_PATTERNS.meetings.some(keyword => content.includes(keyword.toLowerCase()))) {
    return 'medium';
  }
  
  // Low: Everything else
  return 'low';
}

/**
 * High Priority Senders
 * Emails from these senders are automatically marked as high importance
 */
export const HIGH_PRIORITY_SENDERS: string[] = [
  // Add your manager's email
  // 'manager@company.com',
  
  // Add important clients
  // 'client@important.com',
  
  // Add team leads
  // 'lead@company.com',
];

/**
 * Category Detection
 * Determine category based on signal content
 */
export function detectCategory(signal: Signal): string {
  const content = `${signal.subject || ''} ${signal.body}`.toLowerCase();
  
  if (SIGNAL_PATTERNS.meetings.some(keyword => content.includes(keyword.toLowerCase()))) {
    return 'Meeting';
  }
  
  if (SIGNAL_PATTERNS.projects.some(keyword => content.includes(keyword.toLowerCase()))) {
    return 'Project';
  }
  
  if (SIGNAL_PATTERNS.deadlines.some(keyword => content.includes(keyword.toLowerCase()))) {
    return 'Deadline';
  }
  
  if (SIGNAL_PATTERNS.tasks.some(keyword => content.includes(keyword.toLowerCase()))) {
    return 'Task';
  }
  
  return 'General';
}

/**
 * Date Extraction
 * Extract dates from signal content
 */
export function extractDueDate(content: string): Date | null {
  const text = content.toLowerCase();
  
  // Today
  if (/\btoday\b/.test(text)) {
    return new Date();
  }
  
  // Tomorrow
  if (/\btomorrow\b/.test(text)) {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return date;
  }
  
  // This week / next week
  if (/this week|by friday|by end of week/.test(text)) {
    const date = new Date();
    const day = date.getDay();
    const daysUntilFriday = 5 - day;
    date.setDate(date.getDate() + daysUntilFriday);
    return date;
  }
  
  // Specific date formats: MM/DD, MM/DD/YYYY, Month Day
  const datePattern = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const match = text.match(datePattern);
  if (match) {
    const month = parseInt(match[1]) - 1;
    const day = parseInt(match[2]);
    const year = match[3] ? parseInt(match[3]) : new Date().getFullYear();
    return new Date(year, month, day);
  }
  
  // Month name + day (e.g., "December 25")
  const monthPattern = /(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})/i;
  const monthMatch = text.match(monthPattern);
  if (monthMatch) {
    const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    const month = months.indexOf(monthMatch[1].toLowerCase());
    const day = parseInt(monthMatch[2]);
    const year = new Date().getFullYear();
    return new Date(year, month, day);
  }
  
  // No date found
  return null;
}

/**
 * Confidence Threshold
 * Minimum confidence score to auto-execute (0-1)
 */
export const CONFIDENCE_THRESHOLD = {
  autoExecute: 0.8, // Above this = auto execute
  requireApproval: 0.5, // Between this and autoExecute = require approval
  reject: 0.3, // Below this = reject
};

/**
 * Processing Configuration
 */
export const PROCESSING_CONFIG = {
  // Max concurrent signals to process
  maxConcurrent: 5,
  
  // Timeout for LLM requests (milliseconds)
  llmTimeout: 30000, // 30 seconds
  
  // Retry configuration
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  
  // Cache TTL (milliseconds)
  cacheTTL: 300000, // 5 minutes
};

/**
 * LLM Configuration
 */
export const LLM_CONFIG = {
  // Model to use
  model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  
  // Temperature (0 = deterministic, 1 = creative)
  temperature: 0.3,
  
  // Max tokens
  maxTokens: 1000,
  
  // System prompts
  systemPrompts: {
    classifier: `You are an AI assistant that analyzes emails and messages to extract important information.
Your task is to:
1. Identify if the message contains deadlines, important dates, or action items
2. Classify the urgency (critical, high, medium, low)
3. Extract key details (what needs to be done, when, who is involved)
4. Determine if this should be added to a task list

Be concise and accurate. Focus on actionable items.`,
    
    extractor: `Extract structured information from the following message.
Return a JSON object with:
- title: Brief task title (max 50 chars)
- description: Detailed description
- dueDate: ISO date string (YYYY-MM-DD) or null
- priority: critical/high/medium/low
- category: meeting/task/project/deadline/general
- actionRequired: boolean`,
  },
};

/**
 * Export all configuration
 */
export const agentConfig = {
  signals: SIGNAL_PATTERNS,
  notion: NOTION_CONFIG,
  gmail: GMAIL_CONFIG,
  slack: SLACK_CONFIG,
  urgencyRules: calculateUrgency,
  importanceRules: calculateImportance,
  categoryDetection: detectCategory,
  dateExtraction: extractDueDate,
  confidence: CONFIDENCE_THRESHOLD,
  processing: PROCESSING_CONFIG,
  llm: LLM_CONFIG,
  highPrioritySenders: HIGH_PRIORITY_SENDERS,
};

export default agentConfig;
