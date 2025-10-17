# LLM Client Manager Documentation

## Overview

The LLM Client Manager provides a unified interface for interacting with multiple LLM providers (Groq, Together AI, OpenRouter) with automatic fallback, retry logic, token tracking, and cost estimation.

## Features

✅ **Multi-Provider Support**: Groq (Llama 3.1), Together AI, OpenRouter  
✅ **Automatic Fallback**: If primary provider fails, automatically tries fallback providers  
✅ **Retry Logic**: Exponential backoff retry (3 attempts by default)  
✅ **Token & Cost Tracking**: Automatic tracking of token usage and costs  
✅ **Streaming Support**: Real-time streaming responses  
✅ **Error Handling**: User-friendly error messages with detailed logging  
✅ **Singleton Pattern**: Global access via `getLLMClient()`  

## Setup

### 1. Environment Variables

Create a `.env` file with your API keys:

```bash
# At least one provider is required
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
TOGETHER_API_KEY=xxxxxxxxxxxxx
OPENROUTER_API_KEY=xxxxxxxxxxxxx

# Optional: Configure default provider and model
LLM_DEFAULT_PROVIDER=groq
LLM_DEFAULT_MODEL=llama-3.1-70b-versatile
```

### 2. Get API Keys

- **Groq**: https://console.groq.com/keys (Free tier available)
- **Together AI**: https://api.together.xyz/settings/api-keys (Free tier available)
- **OpenRouter**: https://openrouter.ai/keys (Pay-per-use)

## Usage Examples

### Basic Chat Completion

```typescript
import { getLLMClient } from './agents/llm';

// Get the singleton client
const llm = getLLMClient();

// Send a simple chat request
const response = await llm.chat([
  {
    role: 'system',
    content: 'You are a helpful assistant that categorizes emails.'
  },
  {
    role: 'user',
    content: 'Is this email urgent? Subject: "URGENT: Server down in production"'
  }
]);

console.log(response.content); // AI response
console.log(`Used ${response.usage.totalTokens} tokens`);
console.log(`Cost: $${response.cost.totalCost.toFixed(6)}`);
console.log(`Provider: ${response.provider}`);
console.log(`Latency: ${response.latency}ms`);
```

### Structured JSON Output

```typescript
import { getLLMClient } from './agents/llm';

const llm = getLLMClient();

const response = await llm.chat([
  {
    role: 'system',
    content: 'You are an email classifier. Return JSON with fields: urgency (urgent/normal/low), category (sales/support/billing), action (reply/delegate/archive)'
  },
  {
    role: 'user',
    content: 'Classify this email: "Hi, my payment failed and I need help ASAP!"'
  }
], {
  responseFormat: 'json',
  temperature: 0.3
});

const classification = response.content;
console.log(classification);
// {
//   "urgency": "urgent",
//   "category": "billing",
//   "action": "reply"
// }
```

### Streaming Responses

```typescript
import { getLLMClient } from './agents/llm';

const llm = getLLMClient();

await llm.chatStream(
  [
    {
      role: 'user',
      content: 'Write a detailed project plan for the AI Operations Command Center'
    }
  ],
  {
    onChunk: (chunk) => {
      if (!chunk.done) {
        process.stdout.write(chunk.content); // Stream to console
      }
    },
    onComplete: (fullContent, usage) => {
      console.log('\n\n--- Stream Complete ---');
      console.log(`Total tokens: ${usage.totalTokens}`);
    },
    onError: (error) => {
      console.error('Stream error:', error.message);
    }
  },
  {
    temperature: 0.7,
    maxTokens: 2000
  }
);
```

### Custom Configuration

```typescript
import { getLLMClient, LLMProvider } from './agents/llm';

// Configure which providers to use and their order
const llm = getLLMClient({
  providers: [LLMProvider.GROQ, LLMProvider.TOGETHER], // Groq first, Together as fallback
  retryConfig: {
    maxAttempts: 5,
    initialDelayMs: 500,
    maxDelayMs: 15000,
    backoffMultiplier: 2
  },
  enableCostTracking: true,
  enableDetailedLogging: true
});
```

### Usage Statistics

```typescript
import { getLLMClient } from './agents/llm';

const llm = getLLMClient();

// ... make several requests ...

// Get usage statistics
const stats = llm.getUsageStats();
console.log(`Total Requests: ${stats.totalRequests}`);
console.log(`Total Tokens: ${stats.totalTokens}`);
console.log(`Total Cost: $${stats.totalCost.toFixed(4)}`);
console.log(`Avg Tokens/Request: ${stats.averageTokensPerRequest.toFixed(0)}`);
console.log(`Avg Cost/Request: $${stats.averageCostPerRequest.toFixed(6)}`);

// Reset statistics
llm.resetUsageStats();
```

### Error Handling

```typescript
import { getLLMClient, LLMError, LLMErrorType } from './agents/llm';

const llm = getLLMClient();

try {
  const response = await llm.chat([
    { role: 'user', content: 'Hello!' }
  ]);
  console.log(response.content);
} catch (error) {
  if (error instanceof LLMError) {
    switch (error.type) {
      case LLMErrorType.AUTHENTICATION:
        console.error('❌ Invalid API key. Please check your .env file');
        break;
      case LLMErrorType.RATE_LIMIT:
        console.error('⏱️ Rate limit exceeded. Please wait before retrying');
        break;
      case LLMErrorType.TIMEOUT:
        console.error('⏰ Request timed out. The service may be slow');
        break;
      case LLMErrorType.NETWORK:
        console.error('🌐 Network error. Check your internet connection');
        break;
      default:
        console.error(`❌ Error: ${error.message}`);
    }
  }
}
```

### Provider-Specific Operations

```typescript
import { getLLMClient, LLMProvider } from './agents/llm';

const llm = getLLMClient();

// Check which providers are available
const available = llm.getAvailableProviders();
console.log('Available providers:', available);

// Check if a specific provider is working
const isGroqAvailable = await llm.isProviderAvailable(LLMProvider.GROQ);
console.log('Groq available:', isGroqAvailable);

// Get available models for a provider
const groqModels = llm.getAvailableModels(LLMProvider.GROQ);
console.log('Groq models:', groqModels);
```

## Advanced Options

### Chat Options

```typescript
interface LLMChatOptions {
  model?: string;                // Override default model
  temperature?: number;           // 0.0-2.0, controls randomness (default: 0.7)
  maxTokens?: number;            // Maximum tokens in response
  topP?: number;                 // Nucleus sampling (0.0-1.0)
  stream?: boolean;              // Enable streaming (use chatStream instead)
  responseFormat?: 'text' | 'json'; // Expected format
  stopSequences?: string[];      // Stop generation at these strings
  presencePenalty?: number;      // -2.0 to 2.0, penalize new tokens
  frequencyPenalty?: number;     // -2.0 to 2.0, penalize repeated tokens
  user?: string;                 // User identifier for tracking
}
```

### Example with All Options

```typescript
const response = await llm.chat([
  { role: 'system', content: 'You are a concise assistant.' },
  { role: 'user', content: 'Explain quantum computing.' }
], {
  model: 'llama-3.1-8b-instant',  // Faster, cheaper model
  temperature: 0.3,               // More focused responses
  maxTokens: 500,                 // Limit response length
  topP: 0.9,                     
  responseFormat: 'text',
  stopSequences: ['\n\n\n'],     // Stop at triple newline
  presencePenalty: 0.1,          // Slightly discourage repetition
  frequencyPenalty: 0.1,
  user: 'user-123'               // For tracking
});
```

## Model Selection Guide

### Groq Models

| Model | Speed | Quality | Cost | Use Case |
|-------|-------|---------|------|----------|
| `llama-3.1-70b-versatile` | Fast | High | Low | General purpose, complex reasoning |
| `llama-3.1-8b-instant` | Very Fast | Good | Very Low | Quick responses, simple tasks |
| `mixtral-8x7b-32768` | Fast | High | Low | Long context (32K tokens) |

### Together AI Models

| Model | Speed | Quality | Cost | Use Case |
|-------|-------|---------|------|----------|
| `Meta-Llama-3.1-70B-Instruct-Turbo` | Fast | High | Medium | High-quality responses |
| `Meta-Llama-3.1-8B-Instruct-Turbo` | Very Fast | Good | Low | Quick tasks |
| `Mixtral-8x7B-Instruct-v0.1` | Fast | High | Medium | Complex reasoning |

### OpenRouter Models

| Model | Speed | Quality | Cost | Use Case |
|-------|-------|---------|------|----------|
| `meta-llama/llama-3.1-70b-instruct` | Fast | High | Low | Open-source option |
| `anthropic/claude-3-haiku` | Fast | Very High | Medium | High-quality, fast |
| `openai/gpt-3.5-turbo` | Fast | High | Medium | General purpose |

## Cost Estimates

### Approximate Costs (per 1M tokens)

**Groq** (Cheapest):
- Llama 3.1 70B: $0.59 input / $0.79 output
- Llama 3.1 8B: $0.05 input / $0.08 output

**Together AI**:
- Llama 3.1 70B: $0.88 input / $0.88 output
- Llama 3.1 8B: $0.18 input / $0.18 output

**OpenRouter** (Most expensive but highest quality):
- Claude 3 Haiku: $0.25 input / $1.25 output
- GPT-3.5 Turbo: $0.50 input / $1.50 output

### Example: 1000 requests with 500 tokens each

Using Groq Llama 3.1 70B:
- Total tokens: 500,000
- Cost: ~$0.35
- Time: ~10 seconds (with Groq's fast inference)

## Troubleshooting

### Error: "No LLM providers configured"

**Solution**: Set at least one API key in `.env`:
```bash
GROQ_API_KEY=your_key_here
```

### Error: "Invalid API key"

**Solution**: 
1. Check your API key is correct
2. Verify no extra spaces in `.env` file
3. Get a new key from the provider's dashboard

### Error: "Rate limit exceeded"

**Solution**:
1. Wait a few minutes before retrying
2. Use a different provider (automatic fallback should handle this)
3. Upgrade to a paid plan for higher limits

### Slow responses

**Solution**:
1. Use faster models: `llama-3.1-8b-instant` instead of `llama-3.1-70b-versatile`
2. Reduce `maxTokens` to limit response length
3. Use Groq for fastest inference

## Architecture

```
src/agents/llm/
├── client-manager.ts        # Main manager with retry/fallback logic
├── providers/
│   ├── groq-provider.ts     # Groq API adapter
│   ├── together-provider.ts # Together AI adapter
│   └── openrouter-provider.ts # OpenRouter adapter
└── index.ts                 # Exports
```

## Next Steps

1. ✅ **LLM Client Manager** (COMPLETE)
2. 🔄 **Prompt Templates** (Next: Create reusable prompts for email classification, task creation, etc.)
3. 🔄 **Signal Classification Agent** (Use LLM to classify incoming signals)
4. 🔄 **Decision Engine** (Map classified signals to actions)

## Testing

See `tests/integrations/llm.test.ts` for comprehensive tests.

Run tests:
```bash
npm test -- llm.test.ts
```
