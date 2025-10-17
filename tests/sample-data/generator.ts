/**
 * Sample Data Generator
 * 
 * Generates realistic sample data for testing:
 * - Emails (Gmail messages) with 20+ diverse scenarios
 * - Slack messages with various formats
 * - Google Sheets data
 * 
 * Usage:
 *   import { loadSampleData, generateAndSaveSampleData } from './tests/sample-data/generator';
 *   
 *   // Load pre-generated samples
 *   const data = loadSampleData();
 *   
 *   // Generate fresh samples and save to disk
 *   generateAndSaveSampleData();
 */

import fs from 'fs';
import path from 'path';

// Sample email scenarios (20+ diverse cases)
export function generateSampleEmails() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  return [
    // 1. Urgent production incident
    {
      id: 'email-001',
      threadId: 'thread-001',
      from: 'ops@company.com',
      to: ['team@company.com'],
      subject: '[URGENT] Production API Down - Revenue Impact',
      body: 'CRITICAL: Payment API experiencing 500 errors. Revenue processing halted. Need immediate attention from backend team. Started 15 mins ago.',
      snippet: 'CRITICAL: Payment API experiencing 500 errors...',
      date: now.toISOString(),
      labels: ['URGENT', 'UNREAD'],
      attachments: [],
      priority: 'high',
    },
    // 2. Security alert
    {
      id: 'email-002',
      threadId: 'thread-002',
      from: 'security@company.com',
      to: ['devops@company.com'],
      subject: 'Security Alert: Unusual login activity detected',
      body: 'Multiple failed login attempts detected from IP 192.168.1.100. Potential brute force attack. Review access logs immediately.',
      snippet: 'Multiple failed login attempts detected...',
      date: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      labels: ['SECURITY', 'UNREAD'],
      attachments: [{ filename: 'access_logs.txt', mimeType: 'text/plain', size: 15000 }],
      priority: 'high',
    },
    // 3. Meeting invitation
    {
      id: 'email-003',
      threadId: 'thread-003',
      from: 'calendar@company.com',
      to: ['you@company.com'],
      subject: 'Invitation: Sprint Planning - Oct 18 @ 10:00 AM',
      body: 'You have been invited to Sprint Planning on Thursday Oct 18 at 10:00 AM EST. Join Zoom: https://zoom.us/j/123456789',
      snippet: 'You have been invited to Sprint Planning...',
      date: yesterday.toISOString(),
      labels: ['CALENDAR', 'UNREAD'],
      attachments: [{ filename: 'meeting.ics', mimeType: 'text/calendar', size: 1200 }],
      priority: 'normal',
    },
    // 4. Customer support escalation
    {
      id: 'email-004',
      threadId: 'thread-004',
      from: 'support@company.com',
      to: ['engineering@company.com'],
      subject: 'Customer Escalation: Premium client unable to export data',
      body: 'Premium customer (Acme Corp) reports export feature broken for 3 days. Ticket #4521. Client threatening to churn. Need fix ASAP.',
      snippet: 'Premium customer reports export feature broken...',
      date: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      labels: ['SUPPORT', 'UNREAD'],
      attachments: [],
      priority: 'high',
    },
    // 5. Weekly status report
    {
      id: 'email-005',
      threadId: 'thread-005',
      from: 'pm@company.com',
      to: ['team@company.com'],
      subject: 'Weekly Status Report - Oct 14',
      body: 'Summary of this week:\n- Completed: 15 tickets\n- In Progress: 8 tickets\n- Blockers: 2 (API rate limits, design review)\n- Velocity: 82 points\n\nNext week focus: Performance optimization sprint.',
      snippet: 'Summary of this week: Completed 15 tickets...',
      date: lastWeek.toISOString(),
      labels: ['REPORTS'],
      attachments: [{ filename: 'status_report.pdf', mimeType: 'application/pdf', size: 250000 }],
      priority: 'normal',
    },
    // 6. Code review request
    {
      id: 'email-006',
      threadId: 'thread-006',
      from: 'github@company.com',
      to: ['you@company.com'],
      subject: '[GitHub] PR #342: Add retry logic to payment processor',
      body: '@you requested review on PR #342. Changes: Added exponential backoff and circuit breaker to payment API calls. Please review by EOD.',
      snippet: 'requested review on PR #342...',
      date: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      labels: ['GITHUB', 'UNREAD'],
      attachments: [],
      priority: 'normal',
    },
    // 7. Invoice/billing
    {
      id: 'email-007',
      threadId: 'thread-007',
      from: 'billing@aws.com',
      to: ['finance@company.com'],
      subject: 'Your AWS Invoice for October 2025',
      body: 'Your AWS bill for October is $12,450.23. Charges breakdown: EC2 $8,200, RDS $2,100, S3 $1,500, Other $650. Due Nov 1.',
      snippet: 'Your AWS bill for October is $12,450.23...',
      date: yesterday.toISOString(),
      labels: ['BILLING'],
      attachments: [{ filename: 'invoice_oct2025.pdf', mimeType: 'application/pdf', size: 85000 }],
      priority: 'normal',
    },
    // 8. Newsletter/marketing
    {
      id: 'email-008',
      threadId: 'thread-008',
      from: 'newsletter@techcrunch.com',
      to: ['you@company.com'],
      subject: 'TC Daily: AI Startups Raise Record Funding in Q3',
      body: 'Top stories today: 1) AI startups raised $15B in Q3 2025. 2) New regulations proposed for LLM transparency. 3) Meta announces GPT-5 competitor...',
      snippet: 'Top stories today: AI startups raised $15B...',
      date: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      labels: ['NEWSLETTER'],
      attachments: [],
      priority: 'low',
    },
    // 9. Bug report from QA
    {
      id: 'email-009',
      threadId: 'thread-009',
      from: 'qa@company.com',
      to: ['dev@company.com'],
      subject: 'Bug Report: Login fails on Safari 17',
      body: 'Steps to reproduce:\n1. Open app in Safari 17\n2. Enter valid credentials\n3. Click login\n\nExpected: Redirect to dashboard\nActual: Spinner hangs, no error message\n\nSeverity: Medium\nAffects ~12% of users',
      snippet: 'Steps to reproduce: Open app in Safari 17...',
      date: new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString(),
      labels: ['BUG', 'UNREAD'],
      attachments: [{ filename: 'screenshot.png', mimeType: 'image/png', size: 420000 }],
      priority: 'normal',
    },
    // 10. Partner integration request
    {
      id: 'email-010',
      threadId: 'thread-010',
      from: 'partnerships@stripe.com',
      to: ['integrations@company.com'],
      subject: 'Stripe Connect Integration - Technical Onboarding',
      body: 'Thank you for signing up for Stripe Connect. To complete integration:\n1. Review API docs\n2. Set up webhook endpoints\n3. Schedule technical call\n\nNext steps attached.',
      snippet: 'Thank you for signing up for Stripe Connect...',
      date: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
      labels: ['PARTNERSHIPS'],
      attachments: [{ filename: 'integration_guide.pdf', mimeType: 'application/pdf', size: 1200000 }],
      priority: 'normal',
    },
    // 11. Performance degradation alert
    {
      id: 'email-011',
      threadId: 'thread-011',
      from: 'monitoring@company.com',
      to: ['oncall@company.com'],
      subject: 'Alert: API response time increased by 300%',
      body: 'Datadog Alert: /api/search endpoint avg response time jumped from 150ms to 600ms. Started 20 mins ago. Check database indexes and query plans.',
      snippet: 'API response time increased by 300%...',
      date: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      labels: ['MONITORING', 'UNREAD'],
      attachments: [],
      priority: 'high',
    },
    // 12. Routine update
    {
      id: 'email-012',
      threadId: 'thread-012',
      from: 'devops@company.com',
      to: ['all@company.com'],
      subject: 'Scheduled Maintenance: Database upgrade Sunday 2 AM',
      body: 'We will upgrade PostgreSQL from v14 to v15 this Sunday at 2 AM EST. Expected downtime: 30 minutes. Rollback plan in place.',
      snippet: 'Database upgrade this Sunday at 2 AM EST...',
      date: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
      labels: ['MAINTENANCE'],
      attachments: [],
      priority: 'normal',
    },
    // 13. Feature request from sales
    {
      id: 'email-013',
      threadId: 'thread-013',
      from: 'sales@company.com',
      to: ['product@company.com'],
      subject: 'Enterprise Client Request: SSO with Okta',
      body: 'Fortune 500 prospect (deal size $500K ARR) requires Okta SSO integration before signing. Timeline: need by end of Q4. Can we prioritize?',
      snippet: 'Enterprise client requires Okta SSO integration...',
      date: new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString(),
      labels: ['FEATURE_REQUEST'],
      attachments: [],
      priority: 'high',
    },
    // 14. Automated CI/CD notification
    {
      id: 'email-014',
      threadId: 'thread-014',
      from: 'ci@company.com',
      to: ['dev@company.com'],
      subject: '✅ Build #1234 succeeded - Deploy to staging',
      body: 'Build #1234 completed successfully.\nBranch: feature/payment-retry\nCommit: abc123f\nDuration: 8m 32s\nDeployed to staging environment.',
      snippet: 'Build #1234 completed successfully...',
      date: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      labels: ['CI'],
      attachments: [],
      priority: 'low',
    },
    // 15. Legal/compliance notice
    {
      id: 'email-015',
      threadId: 'thread-015',
      from: 'legal@company.com',
      to: ['engineering@company.com'],
      subject: 'Action Required: GDPR Data Retention Policy Update',
      body: 'New GDPR requirements mandate user data deletion within 30 days of account closure. Please update data retention policies and implement automated cleanup by Nov 15.',
      snippet: 'New GDPR requirements mandate user data deletion...',
      date: new Date(now.getTime() - 96 * 60 * 60 * 1000).toISOString(),
      labels: ['LEGAL', 'UNREAD'],
      attachments: [{ filename: 'gdpr_requirements.pdf', mimeType: 'application/pdf', size: 340000 }],
      priority: 'high',
    },
    // 16. Customer feedback (positive)
    {
      id: 'email-016',
      threadId: 'thread-016',
      from: 'feedback@company.com',
      to: ['product@company.com'],
      subject: 'Customer Testimonial: "This feature saved us 20 hours/week"',
      body: 'Customer (TechCorp Inc) shared amazing feedback: "The new automation feature is a game changer. Our team saves 20 hours per week. Worth every penny!"\n\nCan we feature this on the website?',
      snippet: 'Customer shared amazing feedback about automation...',
      date: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      labels: ['FEEDBACK'],
      attachments: [],
      priority: 'low',
    },
    // 17. Vendor outage notification
    {
      id: 'email-017',
      threadId: 'thread-017',
      from: 'status@sendgrid.com',
      to: ['tech@company.com'],
      subject: 'SendGrid Incident: Email delivery delays',
      body: 'We are experiencing delays in email delivery due to infrastructure issues. Current delay: 15-30 minutes. Our team is working on resolution. Updates: status.sendgrid.com',
      snippet: 'Experiencing delays in email delivery...',
      date: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      labels: ['VENDOR', 'UNREAD'],
      attachments: [],
      priority: 'normal',
    },
    // 18. Onboarding new hire
    {
      id: 'email-018',
      threadId: 'thread-018',
      from: 'hr@company.com',
      to: ['engineering@company.com'],
      subject: 'New Hire Starting Monday: Sarah Chen - Senior Backend Engineer',
      body: 'Please welcome Sarah Chen joining as Senior Backend Engineer on Monday Oct 21. Setup:\n- GitHub access\n- AWS credentials\n- Slack workspace\n- Assign onboarding buddy\n\nContact: sarah.chen@company.com',
      snippet: 'Please welcome Sarah Chen joining as Senior Backend...',
      date: new Date(now.getTime() - 120 * 60 * 60 * 1000).toISOString(),
      labels: ['HR'],
      attachments: [],
      priority: 'normal',
    },
    // 19. API rate limit warning
    {
      id: 'email-019',
      threadId: 'thread-019',
      from: 'api@company.com',
      to: ['backend@company.com'],
      subject: 'Warning: Approaching API rate limit (80% used)',
      body: 'Your application has used 80% of monthly API quota (8,000 / 10,000 requests). Current usage trend suggests you will hit limit by Oct 25. Consider upgrading plan or optimizing calls.',
      snippet: 'Approaching API rate limit: 80% used...',
      date: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      labels: ['API', 'UNREAD'],
      attachments: [],
      priority: 'normal',
    },
    // 20. Knowledge sharing
    {
      id: 'email-020',
      threadId: 'thread-020',
      from: 'tech-lead@company.com',
      to: ['engineering@company.com'],
      subject: 'Tech Talk Recording: Building Resilient Microservices',
      body: 'Recording from yesterday\'s tech talk now available. Topics covered:\n- Circuit breakers\n- Retry strategies\n- Chaos engineering\n\nSlides and code examples attached. Great session!',
      snippet: 'Recording from tech talk now available...',
      date: new Date(now.getTime() - 20 * 60 * 60 * 1000).toISOString(),
      labels: ['LEARNING'],
      attachments: [
        { filename: 'slides.pdf', mimeType: 'application/pdf', size: 5200000 },
        { filename: 'code_examples.zip', mimeType: 'application/zip', size: 15000 },
      ],
      priority: 'low',
    },
    // 21. Database backup failure
    {
      id: 'email-021',
      threadId: 'thread-021',
      from: 'backup@company.com',
      to: ['dba@company.com'],
      subject: '❌ Database Backup Failed - Production DB',
      body: 'CRITICAL: Automated backup for production database failed at 3:00 AM. Error: Insufficient disk space on backup server. Last successful backup: 2 days ago. Action required immediately.',
      snippet: 'Database backup failed: Insufficient disk space...',
      date: new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(),
      labels: ['DATABASE', 'CRITICAL', 'UNREAD'],
      attachments: [],
      priority: 'high',
    },
    // 22. Dependency security vulnerability
    {
      id: 'email-022',
      threadId: 'thread-022',
      from: 'dependabot@github.com',
      to: ['security@company.com'],
      subject: '🔒 Security Alert: Critical vulnerability in lodash 4.17.15',
      body: 'Dependabot found a critical security vulnerability:\n\nPackage: lodash\nVersion: 4.17.15\nSeverity: Critical (CVSS 9.1)\nCVE: CVE-2025-12345\n\nRecommended: Upgrade to lodash 4.17.21 immediately.\nAffected repos: 5 repositories',
      snippet: 'Critical security vulnerability in lodash...',
      date: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      labels: ['SECURITY', 'DEPENDABOT', 'UNREAD'],
      attachments: [],
      priority: 'high',
    },
    // 23. Design review request
    {
      id: 'email-023',
      threadId: 'thread-023',
      from: 'design@company.com',
      to: ['product@company.com', 'engineering@company.com'],
      subject: 'Design Review: New Dashboard Mockups',
      body: 'Hi team! Completed mockups for the new analytics dashboard. Key changes:\n- Simplified navigation\n- Dark mode support\n- Customizable widgets\n\nFigma link: https://figma.com/file/abc123\nReview by Friday please!',
      snippet: 'Completed mockups for new analytics dashboard...',
      date: new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString(),
      labels: ['DESIGN'],
      attachments: [],
      priority: 'normal',
    },
  ];
}

// Sample Slack messages
export function generateSampleSlackMessages() {
  const now = new Date();

  return [
    {
      id: 'slack-001',
      channel: 'C01ABC123',
      channelName: '#general',
      user: 'U01USER01',
      userName: 'Alice Johnson',
      text: 'Good morning team! 🌅 Sprint planning starts in 30 minutes.',
      timestamp: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: 'wave', count: 5 }, { emoji: 'coffee', count: 3 }],
    },
    {
      id: 'slack-002',
      channel: 'C02DEF456',
      channelName: '#incidents',
      user: 'U02USER02',
      userName: 'Bob Smith',
      text: '🚨 Production alert: API latency spiking. Investigating now.',
      timestamp: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: 'eyes', count: 8 }],
      attachments: [
        {
          title: 'Datadog Alert',
          text: 'p99 latency: 2.5s (threshold: 500ms)',
          color: 'danger',
        },
      ],
    },
    {
      id: 'slack-003',
      channel: 'C02DEF456',
      channelName: '#incidents',
      user: 'U03USER03',
      userName: 'Carol Lee',
      text: 'Found the issue - database connection pool exhausted. Scaling up now.',
      timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
      threadTs: 'slack-002',
      reactions: [{ emoji: 'rocket', count: 4 }],
    },
    {
      id: 'slack-004',
      channel: 'C03GHI789',
      channelName: '#dev-backend',
      user: 'U04USER04',
      userName: 'David Kim',
      text: 'PR ready for review: https://github.com/company/repo/pull/342\n\nAdds retry logic with exponential backoff to payment processor.',
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: '+1', count: 2 }],
    },
    {
      id: 'slack-005',
      channel: 'C04JKL012',
      channelName: '#customer-success',
      user: 'U05USER05',
      userName: 'Emma Davis',
      text: 'Just got off call with Acme Corp - they LOVE the new export feature! 🎉',
      timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: 'tada', count: 12 }, { emoji: 'heart', count: 8 }],
    },
    {
      id: 'slack-006',
      channel: 'C01ABC123',
      channelName: '#general',
      user: 'U06USER06',
      userName: 'Frank Wilson',
      text: 'Reminder: Team lunch at 12:30 PM today at the pizza place down the street 🍕',
      timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: 'pizza', count: 15 }],
    },
    {
      id: 'slack-007',
      channel: 'C05MNO345',
      channelName: '#design',
      user: 'U07USER07',
      userName: 'Grace Martinez',
      text: 'New dashboard mockups ready for review!\n\nFigma: https://figma.com/file/dashboard-v2\n\nKey changes:\n• Simplified nav\n• Dark mode\n• Widget customization',
      timestamp: new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: 'art', count: 6 }, { emoji: 'fire', count: 4 }],
      attachments: [
        {
          title: 'Dashboard V2 Mockup',
          imageUrl: 'https://figma.com/preview/dashboard.png',
        },
      ],
    },
    {
      id: 'slack-008',
      channel: 'C06PQR678',
      channelName: '#security',
      user: 'U08USER08',
      userName: 'Henry Zhang',
      text: '⚠️ Dependabot alert: Critical vulnerability in lodash. PR to upgrade: https://github.com/company/repo/pull/345',
      timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: 'lock', count: 3 }],
    },
    {
      id: 'slack-009',
      channel: 'C07STU901',
      channelName: '#random',
      user: 'U09USER09',
      userName: 'Irene Chen',
      text: 'Anyone else getting Slack notifications twice today? Or is it just me? 🤔',
      timestamp: new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: 'thinking_face', count: 7 }],
    },
    {
      id: 'slack-010',
      channel: 'C08VWX234',
      channelName: '#announcements',
      user: 'U10USER10',
      userName: 'Jack Thompson',
      text: '📢 Welcome Sarah Chen to the team! She\'s joining as Senior Backend Engineer starting Monday. Say hi! 👋',
      timestamp: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
      threadTs: null,
      reactions: [{ emoji: 'wave', count: 25 }, { emoji: 'tada', count: 18 }],
    },
  ];
}

// Sample Google Sheets data
export function generateSampleSheetsData() {
  return {
    spreadsheetId: 'sample-spreadsheet-123',
    spreadsheetTitle: 'Operations Dashboard',
    sheets: [
      {
        sheetId: 0,
        title: 'Tasks',
        data: {
          range: 'Tasks!A1:F20',
          values: [
            ['Task ID', 'Title', 'Assignee', 'Status', 'Priority', 'Due Date'],
            ['T-001', 'Fix payment API bug', 'Alice Johnson', 'In Progress', 'High', '2025-10-18'],
            ['T-002', 'Design dashboard mockups', 'Grace Martinez', 'Complete', 'Medium', '2025-10-15'],
            ['T-003', 'Implement SSO with Okta', 'Bob Smith', 'Not Started', 'High', '2025-11-01'],
            ['T-004', 'Database performance optimization', 'David Kim', 'In Progress', 'Medium', '2025-10-20'],
            ['T-005', 'Update GDPR compliance docs', 'Carol Lee', 'In Review', 'High', '2025-10-22'],
            ['T-006', 'Add retry logic to email service', 'Frank Wilson', 'Complete', 'Low', '2025-10-12'],
            ['T-007', 'Onboard new hire Sarah Chen', 'Emma Davis', 'In Progress', 'Medium', '2025-10-21'],
            ['T-008', 'Upgrade PostgreSQL to v15', 'Henry Zhang', 'Planned', 'Medium', '2025-10-20'],
            ['T-009', 'Fix Safari login bug', 'Alice Johnson', 'In Progress', 'Medium', '2025-10-19'],
            ['T-010', 'Security audit Q4', 'Henry Zhang', 'Not Started', 'High', '2025-11-15'],
          ],
        },
      },
      {
        sheetId: 1,
        title: 'Metrics',
        data: {
          range: 'Metrics!A1:E10',
          values: [
            ['Date', 'API Requests', 'Error Rate %', 'Avg Response Time (ms)', 'Active Users'],
            ['2025-10-10', '125000', '0.2', '145', '8450'],
            ['2025-10-11', '132000', '0.3', '152', '8620'],
            ['2025-10-12', '128000', '0.1', '138', '8390'],
            ['2025-10-13', '145000', '0.4', '168', '9120'],
            ['2025-10-14', '138000', '0.2', '155', '8890'],
            ['2025-10-15', '142000', '0.3', '162', '9050'],
            ['2025-10-16', '151000', '0.5', '198', '9340'],
            ['2025-10-17', '148000', '0.2', '149', '9180'],
          ],
        },
      },
      {
        sheetId: 2,
        title: 'Incidents',
        data: {
          range: 'Incidents!A1:G15',
          values: [
            ['Incident ID', 'Date', 'Severity', 'Service', 'Description', 'Status', 'Resolution Time (hrs)'],
            ['INC-001', '2025-10-15', 'Critical', 'Payment API', 'API returning 500 errors', 'Resolved', '2.5'],
            ['INC-002', '2025-10-14', 'High', 'Auth Service', 'Login failures on Safari', 'In Progress', '-'],
            ['INC-003', '2025-10-12', 'Medium', 'Email Service', 'Delivery delays', 'Resolved', '4.0'],
            ['INC-004', '2025-10-11', 'Low', 'Monitoring', 'False positive alerts', 'Resolved', '1.0'],
            ['INC-005', '2025-10-17', 'High', 'Database', 'Connection pool exhausted', 'Resolved', '0.5'],
            ['INC-006', '2025-10-16', 'Medium', 'API Gateway', 'Rate limit exceeded', 'Resolved', '1.5'],
            ['INC-007', '2025-10-13', 'Critical', 'Backup Service', 'Backup failed - disk full', 'Resolved', '3.0'],
          ],
        },
      },
      {
        sheetId: 3,
        title: 'Customer Feedback',
        data: {
          range: 'Customer Feedback!A1:E12',
          values: [
            ['Date', 'Customer', 'Rating', 'Category', 'Feedback'],
            ['2025-10-17', 'Acme Corp', '5', 'Feature', 'Export feature is amazing! Saves us 20hrs/week'],
            ['2025-10-16', 'TechStart Inc', '4', 'Performance', 'Dashboard loads fast now, much better!'],
            ['2025-10-15', 'Global LLC', '2', 'Bug', 'Safari login still broken, frustrating'],
            ['2025-10-14', 'DataCo', '5', 'Support', 'Support team resolved our issue in 30 minutes'],
            ['2025-10-13', 'CloudNet', '3', 'Feature', 'Need SSO integration for enterprise deployment'],
            ['2025-10-12', 'StartupXYZ', '5', 'UX', 'New UI design is clean and intuitive'],
            ['2025-10-11', 'FinanceHub', '4', 'API', 'API documentation could be more detailed'],
            ['2025-10-10', 'DevShop', '5', 'Integration', 'Slack integration works perfectly'],
          ],
        },
      },
    ],
  };
}

/**
 * Load pre-generated sample data from JSON files
 */
export function loadSampleData() {
  const dataDir = path.join(__dirname);
  
  const emails = JSON.parse(fs.readFileSync(path.join(dataDir, 'emails.json'), 'utf-8'));
  const messages = JSON.parse(fs.readFileSync(path.join(dataDir, 'messages.json'), 'utf-8'));
  const sheets = JSON.parse(fs.readFileSync(path.join(dataDir, 'sheets.json'), 'utf-8'));

  return { emails, messages, sheets };
}

/**
 * Generate fresh sample data and save to JSON files
 */
export function generateAndSaveSampleData() {
  const dataDir = path.join(__dirname);
  
  // Ensure directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const emails = generateSampleEmails();
  const messages = generateSampleSlackMessages();
  const sheets = generateSampleSheetsData();

  fs.writeFileSync(path.join(dataDir, 'emails.json'), JSON.stringify(emails, null, 2));
  fs.writeFileSync(path.join(dataDir, 'messages.json'), JSON.stringify(messages, null, 2));
  fs.writeFileSync(path.join(dataDir, 'sheets.json'), JSON.stringify(sheets, null, 2));

  console.log('✅ Sample data generated and saved to:');
  console.log('   - tests/sample-data/emails.json');
  console.log('   - tests/sample-data/messages.json');
  console.log('   - tests/sample-data/sheets.json');

  return { emails, messages, sheets };
}

/**
 * Demo mode helpers - use sample data instead of real APIs
 */
export const demoMode = {
  /**
   * Get a sample email by ID or scenario type
   */
  getEmail(idOrType?: string) {
    const emails = generateSampleEmails();
    if (!idOrType) return emails[0];
    
    const byId = emails.find(e => e.id === idOrType);
    if (byId) return byId;
    
    // Search by keyword in subject or labels
    const byType = emails.find(e => 
      e.subject.toLowerCase().includes(idOrType.toLowerCase()) ||
      e.labels.some(l => l.toLowerCase().includes(idOrType.toLowerCase()))
    );
    return byType || emails[0];
  },

  /**
   * Get sample emails matching criteria
   */
  filterEmails(criteria: { priority?: string; label?: string; unread?: boolean }) {
    const emails = generateSampleEmails();
    return emails.filter(e => {
      if (criteria.priority && e.priority !== criteria.priority) return false;
      if (criteria.label && !e.labels.includes(criteria.label)) return false;
      if (criteria.unread !== undefined && criteria.unread !== e.labels.includes('UNREAD')) return false;
      return true;
    });
  },

  /**
   * Get a sample Slack message
   */
  getSlackMessage(channelOrId?: string) {
    const messages = generateSampleSlackMessages();
    if (!channelOrId) return messages[0];
    
    const byId = messages.find(m => m.id === channelOrId);
    if (byId) return byId;
    
    const byChannel = messages.find(m => m.channelName === channelOrId || m.channel === channelOrId);
    return byChannel || messages[0];
  },

  /**
   * Get sample Sheets data
   */
  getSheetsData(sheetName?: string) {
    const data = generateSampleSheetsData();
    if (!sheetName) return data;
    
    const sheet = data.sheets.find(s => s.title === sheetName);
    return sheet?.data || data.sheets[0].data;
  },
};

// Run generator if executed directly
if (require.main === module) {
  generateAndSaveSampleData();
}

export default {
  generateSampleEmails,
  generateSampleSlackMessages,
  generateSampleSheetsData,
  loadSampleData,
  generateAndSaveSampleData,
  demoMode,
};
