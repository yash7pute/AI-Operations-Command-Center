# 🤖 AI Operations Command Center

**Status**: 🚧 **In Development** - Core Features Complete  
**Version**: 0.9.0  
**Last Updated**: October 17, 2025

An intelligent workflow automation system powered by AI that orchestrates multi-platform integrations with advanced agent-based architecture, comprehensive error handling, and robust testing infrastructure.

## 🎯 Project Overview

The AI Operations Command Center is a comprehensive TypeScript application that provides:
- **Multi-Platform Integration**: Notion, Slack, Google Drive, Google Sheets, Trello, Gmail
- **AI-Powered Agents**: Intelligent task management, notifications, data organization, and analytics
- **Workflow Automation**: Multi-step workflows with rollback, idempotency, and recovery
- **Enterprise-Grade**: Error handling, logging, monitoring, and performance tracking
- **Extensive Testing**: 357+ passing tests covering integrations, workflows, and error handling

## 📊 Quick Stats

- **Total Code Lines**: 20,000+
- **Test Cases**: 386 total (357 passing, 92.5% pass rate)
- **Platforms Integrated**: 6 (Notion, Slack, Google Drive, Sheets, Trello, Gmail)
- **AI Agents**: 5+ specialized agents
- **Documentation**: 17,900+ lines (39+ files)
- **Test Suites**: 19 total (11 passing, 8 require additional setup)

## 🏗️ Project Structure

```
AI-Operations-Command-Center/
├── src/
│   ├── index.ts                    # Application entry point
│   ├── agents/                     # AI Agent System
│   │   ├── BaseAgent.ts           # Base agent framework
│   │   ├── TaskManagerAgent.ts    # Task prioritization & delegation
│   │   ├── NotificationAgent.ts   # Smart notifications
│   │   ├── DataOrganizerAgent.ts  # File management & cleanup
│   │   └── AnalyticsAgent.ts      # Metrics & insights
│   ├── integrations/              # Platform Integrations
│   │   ├── notion.ts              # Notion API (tasks, databases)
│   │   ├── slack.ts               # Slack API (messaging, UI)
│   │   ├── google.ts              # Google Drive & Sheets
│   │   ├── trello.ts              # Trello API (cards, boards)
│   │   └── email.ts               # Gmail integration
│   ├── workflows/                 # Workflow Orchestration
│   │   ├── index.ts               # Core workflow engine
│   │   ├── approval.ts            # Interactive approvals
│   │   └── scheduled.ts           # Cron-based workflows
│   ├── services/                  # AI Services
│   │   ├── openai.ts              # GPT-4 integration
│   │   └── contextBuilder.ts      # Conversation management
│   ├── utils/                     # Utilities
│   │   ├── logger.ts              # Structured logging
│   │   ├── validator.ts           # Input validation
│   │   ├── errorHandler.ts        # Error management
│   │   └── metricsCollector.ts    # Performance monitoring
│   ├── types/                     # TypeScript Definitions
│   │   └── index.ts               # Shared types
│   └── config/                    # Configuration
│       └── index.ts               # Environment management
├── tests/                         # Comprehensive Testing
│   └── workflows/
│       ├── executors.test.ts      # 36 executor unit tests
│       ├── workflows.test.ts      # 17 workflow integration tests
│       └── error-handling.test.ts # 23 error handling tests
├── demo/                          # Interactive Demo
│   ├── orchestration-demo.ts      # Full feature demonstration
│   └── README.md                  # Demo documentation
├── docs/                          # Documentation (15,700+ lines)
│   ├── ORCHESTRATION.md           # Architecture documentation
│   ├── ORCHESTRATION_API.md       # API reference
│   ├── ORCHESTRATION_RUNBOOK.md   # Operational runbook
│   ├── PROMPT-24-EXECUTOR-TESTS.md
│   ├── PROMPT-25-WORKFLOW-TESTS.md
│   ├── PROMPT-26-ERROR-HANDLING-TESTS.md
│   ├── PROJECT-FINAL-SUMMARY.md
│   ├── SESSION-12-PROMPT-27-28-SUMMARY.md
│   └── [30+ additional docs]
├── package.json                   # Dependencies & scripts
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- API keys for platforms you want to integrate

### Required Dependencies

The project requires several npm packages. Some are already installed, others are optional based on features you want to use:

**Already Installed:**
- Core: `@notionhq/client`, `@slack/bolt`, `googleapis`, `axios`, `winston`, `dotenv`
- Testing: `jest`, `ts-jest`, `@jest/globals`
- Development: `typescript`, `ts-node`, `ts-node-dev`

**Optional (for LLM features):**
```bash
npm install groq-sdk openai tiktoken zod
```

**Optional (for Composio integration):**
```bash
npm install composio-sdk
```

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd AI-Operations-Command-Center
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install optional LLM packages (if needed):**
   ```bash
   npm install groq-sdk openai tiktoken zod
   ```

4. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. **Run tests (core features):**
   ```bash
   npm test
   ```

6. **Run interactive demo (if LLM packages installed):**
   ```bash
   npm run demo:orchestration
   ```

7. **Start the application:**
   ```bash
   npm run dev  # Development mode
   # or
   npm run build && npm start  # Production mode
   ```

## 🔑 Environment Variables

Required environment variables in `.env`:

```env
# AI Services
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4

# Integrations
NOTION_API_KEY=secret_...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...
TRELLO_API_KEY=...
TRELLO_TOKEN=...
EMAIL_USER=...
EMAIL_PASSWORD=...

# Workflow Settings
MAX_WORKFLOW_STEPS=20
WORKFLOW_TIMEOUT_MS=300000
ENABLE_ROLLBACK=true
ENABLE_IDEMPOTENCY=true

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
```

## ✨ Key Features

### 🎬 Interactive Demo
**Try the orchestration demo** to see all features in action:
```bash
npm run demo:orchestration
```

The demo showcases:
- **Action Routing** - Different action types → appropriate executors
- **Priority Queue** - Urgent actions jump the queue
- **Multi-Step Workflow** - Invoice processing across platforms
- **Error Handling** - Automatic retry with exponential backoff
- **Rollback** - Failed workflows automatically undo changes
- **Approval Flow** - Human-in-the-loop for high-impact actions
- **Metrics Dashboard** - Real-time performance monitoring

🎯 **Demo runs in ~10 seconds** with color-coded output and no real API calls  
📊 **Generates summary**: "20 actions executed, 18 succeeded, 1 required approval, avg time 125ms"

[📖 View Demo Documentation](./demo/README.md)

### 1. Multi-Platform Integration
- **Notion** - Task management, database operations
- **Slack** - Messaging, notifications, interactive UI
- **Google Drive** - File storage and organization
- **Google Sheets** - Data logging and reporting
- **Trello** - Card management and boards
- **Gmail** - Email automation

### 2. AI-Powered Agents
- **Task Manager Agent** - Intelligent task prioritization and delegation
- **Notification Agent** - Context-aware smart notifications
- **Data Organizer Agent** - Automatic file organization and cleanup
- **Analytics Agent** - Insights generation and reporting
- **Base Agent Framework** - Extensible agent architecture

### 3. Workflow Automation
- **Multi-Step Workflows** - Complex process orchestration
- **Approval Workflows** - Interactive Slack-based approvals
- **Scheduled Workflows** - Cron-based automation
- **Rollback Support** - Automatic failure recovery
- **Idempotency** - Safe retries without duplication
- **State Management** - Persistent workflow state

### 4. Enterprise Features
- **Error Handling** - Centralized error management with retry logic
- **Logging** - Structured logging with multiple levels
- **Monitoring** - Performance metrics and dashboards
- **Validation** - Input sanitization and validation
- **Testing** - 53 comprehensive tests (100% passing)

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Specific Test Suites
```bash
# Executor unit tests
npm test -- executors.test.ts

# Workflow integration tests
npm test -- workflows.test.ts

# Specific workflow
npm test -- -t "Invoice Processing Workflow"
```

### Test Coverage
```bash
npm test -- --coverage
```

### Test Statistics
- **Total Tests**: 386
- **Passing Tests**: 357 (92.5%)
- **Integration Tests**: Full system integration, Gmail, Slack
- **Agent Tests**: Classifier, Dashboard Provider, Learning System
- **Workflow Tests**: Error handling, Retry logic, Circuit breaker, Fallback, Rollback
- **Known Issues**: 
  - 29 tests require additional setup (Composio SDK, Drive API authentication)
  - Some Drive executor tests need proper Google API credentials
  - 4 Composio integration tests need composio-sdk package

## 📚 Documentation

Comprehensive documentation available in `/docs` (17,900+ lines, 39 files):

### Architecture & Operations
- **ORCHESTRATION.md** - Complete architecture documentation (2,800+ lines)
- **ORCHESTRATION_API.md** - API reference for all agents (3,200+ lines)
- **ORCHESTRATION_RUNBOOK.md** - Operational runbook with troubleshooting (2,200+ lines)

### Testing Documentation
- **PROMPT-24-EXECUTOR-TESTS.md** - Executor unit tests guide
- **PROMPT-25-WORKFLOW-TESTS.md** - Workflow integration tests guide
- **PROMPT-26-ERROR-HANDLING-TESTS.md** - Error handling tests guide
- **ERROR-HANDLING-QUICK-START.md** - Quick reference for error patterns

### Project Summaries
- **PROJECT-FINAL-SUMMARY.md** - Complete project overview
- **SESSION-12-PROMPT-27-28-SUMMARY.md** - Documentation session summary
- **SESSION-15-PROMPT-29-30-SUMMARY.md** - Runbook and demo session summary
- **FINAL-STATUS-PROMPT-25.md** - Session 12 workflow summary
- **FINAL-STATUS-PROMPT-26.md** - Session 13 error handling summary

### Quick Start Guides & Demo
- **demo/README.md** - Interactive demo documentation (1,000+ lines)
- **WORKFLOW-TESTS-QUICK-START.md** - Quick reference for workflows
- **[30+ additional docs]** - Individual prompt documentation

## 🔧 Usage Examples

### Example 1: Invoice Processing Workflow
```typescript
import { InvoiceProcessingWorkflow, WorkflowStateManager } from './workflows';

const stateManager = new WorkflowStateManager();
const workflow = new InvoiceProcessingWorkflow(stateManager);

const result = await workflow.execute('invoice-001', {
  fileName: 'invoice.pdf',
  content: '<PDF content>',
  amount: 5000.00,
  vendor: 'Acme Corp'
});
// ✅ File uploaded to Drive
// ✅ Accounting sheet updated
// ✅ Finance team notified
```

### Example 2: Bug Report Workflow
```typescript
import { BugReportWorkflow, WorkflowStateManager } from './workflows';

const workflow = new BugReportWorkflow(new WorkflowStateManager());

const result = await workflow.execute('bug-001', {
  title: 'Login button not working',
  description: 'Users cannot click login on mobile',
  priority: 'critical',
  reporter: 'support@company.com'
});
// ✅ Trello card created with red priority label
// ✅ Dev team notified on Slack
// ✅ Bug tracking sheet updated
```

### Example 3: Meeting Request Workflow
```typescript
import { MeetingRequestWorkflow, WorkflowStateManager } from './workflows';

const workflow = new MeetingRequestWorkflow(new WorkflowStateManager());

const result = await workflow.execute('meeting-001', {
  title: 'Sprint Planning',
  agenda: '1. Review backlog\n2. Assign tasks',
  attendees: ['@alice', '@bob', '@charlie'],
  date: '2025-10-25',
  time: '10:00'
});
// ✅ Notion task created
// ✅ All attendees notified via Slack DM
```

## 🚀 Deployment

### Docker
```bash
docker build -t ai-operations .
docker run -p 3000:3000 ai-operations
```

### AWS Lambda
```bash
npm run package
serverless deploy
```

### Traditional Server
```bash
npm run build
pm2 start dist/index.js --name ai-operations
```

See `docs/PROJECT-FINAL-SUMMARY.md` for detailed deployment instructions.

## 📈 Performance

All tests complete efficiently with mocked APIs:

| Category | Tests | Avg Time |
|----------|-------|----------|
| Full System Integration | 35 | ~1s each |
| Agent Tests | 90+ | <100ms |
| Workflow/Error Handling | 30+ | <100ms |
| Integration Tests | 10+ | ~90s suite |
| Total Suite | 386 tests | ~130s |

Real-world API latencies will be higher (500ms-5s per operation).

## 🛠️ Development

### Build
```bash
npm run build
```
**Note**: Building requires optional LLM packages (groq-sdk, openai, tiktoken, zod) for full functionality. Install them first or comment out LLM-related imports if not needed.

### Development Mode
```bash
npm run dev
```

### Testing
```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern="classifier.test.ts"

# Run with coverage
npm test -- --coverage
```

## 🤝 Contributing

This project is actively being developed. Contributions are welcome!

1. Review documentation in `/docs`
2. Follow existing code patterns
3. Add tests for new features
4. Run tests before submitting PRs
5. Update documentation as needed

## 📝 Known Issues & Roadmap

### Current Limitations
- **Build Errors**: 142 TypeScript errors due to missing LLM packages (optional features)
- **Test Failures**: 29 tests require additional setup (Composio SDK, Google Drive credentials)
- **Missing Dependencies**: Optional packages needed for LLM features (groq-sdk, openai, tiktoken, zod)

### Roadmap
- [ ] Add proper Google Drive API authentication examples
- [ ] Complete Composio SDK integration
- [ ] Add frontend dashboard (planned)
- [ ] Improve error handling for missing API keys
- [ ] Add more comprehensive integration examples

## 📝 License

MIT License - See LICENSE file for details

## 🎉 Project Status

**Status**: 🚧 **In Active Development**

- ✅ Core workflow orchestration complete
- ✅ 6 platform integrations implemented
- ✅ 5+ AI agents developed
- ✅ 357+ tests passing (92.5%)
- ✅ Comprehensive documentation (39+ files)
- 🚧 Optional LLM features (require additional packages)
- 🚧 Frontend dashboard (planned)
- 🚧 Full production deployment guide (in progress)

---

**Created**: October 17, 2025  
**Last Updated**: October 17, 2025  
**Version**: 0.9.0  
**Status**: 🚧 Core Features Complete - Optional Features Pending

## 📚 Additional Information

### Architecture
The project follows a modular architecture:
- **src/agents/**: AI-powered agents for classification, learning, and dashboard management
- **src/integrations/**: Platform-specific integrations (Notion, Slack, Google, Trello, Gmail)
- **src/workflows/**: Workflow orchestration, routing, retry logic, and error handling
- **src/utils/**: Shared utilities for logging, validation, and error handling
- **src/types/**: TypeScript type definitions
- **tests/**: Comprehensive test suites

### Getting Help
- Check documentation in `/docs` folder
- Review test files for usage examples
- Examine integration tests for workflow patterns
- See `.env.example` for required configuration

### Quick Start for Development
```bash
# 1. Install dependencies
npm install

# 2. Optional: Install LLM packages
npm install groq-sdk openai tiktoken zod

# 3. Copy and configure environment
cp .env.example .env

# 4. Run tests to verify setup
npm test

# 5. Start development server
npm run dev
```