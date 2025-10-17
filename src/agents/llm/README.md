# LLM Module - Quick Start Guide

## 🎯 What You've Built

A production-ready LLM Client Manager that:
- ✅ Supports 3 providers (Groq, Together AI, OpenRouter)
- ✅ Automatic fallback if primary provider fails
- ✅ Exponential backoff retry (3 attempts)
- ✅ Token usage & cost tracking
- ✅ Streaming support
- ✅ Comprehensive error handling
- ✅ Singleton pattern for easy access

## 🚀 Quick Start (5 minutes)

### Step 1: Get an API Key

**Option A: Groq (Recommended - Free & Fast)**
1. Go to https://console.groq.com/keys
2. Sign up / Log in
3. Click "Create API Key"
4. Copy the key (starts with `gsk_...`)

**Option B: Together AI (Alternative)**
1. Go to https://api.together.xyz/settings/api-keys
2. Sign up and get free credits
3. Copy the API key

**Option C: OpenRouter (Fallback)**
1. Go to https://openrouter.ai/keys
2. Sign up and add credits
3. Copy the API key

### Step 2: Configure Environment

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Add your API key to `.env`:
```bash
# Add at least one of these:
GROQ_API_KEY=gsk_your_key_here
TOGETHER_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here
```

### Step 3: Test It!

```bash
# Run the quick test
npx ts-node src/agents/llm/quick-test.ts
```

You should see:
```
✅ Found 1 provider(s): groq
✅ Response: "2+2 equals 4."
✅ All tests passed!
```

## 📝 Basic Usage

```typescript
import { getLLMClient } from './agents/llm';

// Get the client (singleton)
const llm = getLLMClient();

// Simple chat
const response = await llm.chat([
  { role: 'user', content: 'Hello!' }
]);

console.log(response.content);
```

## 🎓 Next Steps for Member 2

Now that you have the LLM Client Manager working, here's what to build next:

### Day 2-3: Intelligence Layer

1. **Create Prompt Templates** (`src/agents/llm/prompts.ts`)
   - Signal classification prompts
   - Email urgency detection
   - Task creation prompts
   - Context analysis prompts

2. **Build Signal Classifier** (`src/agents/signal-classifier.ts`)
   - Use LLM to classify signals as urgent/important/routine
   - Return structured JSON with confidence scores
   - Handle Gmail, Slack, Sheets signals

3. **Create Decision Engine** (`src/agents/decision-engine.ts`)
   - Map classified signals to actions
   - Decide: Create Notion task vs Trello card vs Drive file
   - Add confidence scoring (< 0.7 = human review needed)

### Example: Signal Classifier

```typescript
import { getLLMClient } from './llm';

async function classifySignal(signal: any) {
  const llm = getLLMClient();
  
  const response = await llm.chat([
    {
      role: 'system',
      content: `You classify operational signals. Return JSON with:
- urgency: "critical" | "high" | "medium" | "low"
- category: "incident" | "support" | "sales" | "general"
- action: "create_task" | "notify_team" | "archive"
- confidence: 0.0-1.0`
    },
    {
      role: 'user',
      content: `Classify: ${JSON.stringify(signal)}`
    }
  ], {
    responseFormat: 'json',
    temperature: 0.3
  });
  
  return response.content;
}
```

## 📚 Documentation

- **Full Documentation**: `docs/LLM_CLIENT_MANAGER.md`
- **Examples**: `src/agents/llm/examples.ts`
- **Quick Test**: `src/agents/llm/quick-test.ts`

## 🔥 Pro Tips

1. **Use Groq for speed**: Llama 3.1 on Groq is incredibly fast (< 1 second)
2. **Lower temperature for consistency**: Use 0.2-0.3 for classification tasks
3. **Always use JSON mode**: Set `responseFormat: 'json'` for structured data
4. **Track costs**: Call `llm.getUsageStats()` to monitor spending
5. **Handle errors gracefully**: Wrap in try/catch and check error types

## ⚡ Performance

**Typical Response Times:**
- Groq Llama 3.1 70B: 500-1500ms
- Groq Llama 3.1 8B: 200-500ms (use for simple tasks)
- Together AI: 1000-2000ms
- OpenRouter: 1500-3000ms

**Costs (per 1000 requests with ~500 tokens each):**
- Groq: $0.30-0.50
- Together AI: $0.40-0.60
- OpenRouter: $0.50-2.00

## 🐛 Troubleshooting

### "No LLM providers configured"
➡️ Add an API key to `.env`

### "Invalid API key"
➡️ Check for typos, regenerate key if needed

### "Rate limit exceeded"
➡️ Wait a few minutes, or add a second provider for automatic fallback

### Slow responses
➡️ Use `llama-3.1-8b-instant` for faster (but slightly lower quality) responses

## ✅ What's Complete

- [x] Multi-provider support (Groq, Together AI, OpenRouter)
- [x] Automatic retry with exponential backoff
- [x] Provider fallback mechanism
- [x] Token usage tracking
- [x] Cost estimation
- [x] Streaming support
- [x] Comprehensive error handling
- [x] Singleton pattern
- [x] Full documentation
- [x] Usage examples
- [x] Quick test script

## 🎯 Day 1 Complete! 

**Time to celebrate! 🎉** You've built a robust, production-ready LLM client manager.

**Tomorrow (Day 2):** Build the intelligence layer using this foundation.

---

**Questions?** Check `docs/LLM_CLIENT_MANAGER.md` or run the examples in `src/agents/llm/examples.ts`
