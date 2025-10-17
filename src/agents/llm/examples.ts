/**
 * LLM Client Manager Usage Examples
 * 
 * This file demonstrates all the features of the LLM Client Manager.
 * Run with: npm run dev
 */

import { getLLMClient, LLMProvider, LLMError, LLMErrorType } from './index';
import logger from '../../utils/logger';

/**
 * Example 1: Basic Chat Completion
 */
async function example1_basicChat() {
    console.log('\n=== Example 1: Basic Chat ===\n');
    
    const llm = getLLMClient();
    
    try {
        const response = await llm.chat([
            {
                role: 'system',
                content: 'You are a helpful assistant that provides concise answers.'
            },
            {
                role: 'user',
                content: 'What is the capital of France?'
            }
        ]);
        
        console.log('Response:', response.content);
        console.log(`Provider: ${response.provider}`);
        console.log(`Model: ${response.model}`);
        console.log(`Tokens: ${response.usage.totalTokens}`);
        console.log(`Cost: $${response.cost.totalCost.toFixed(6)}`);
        console.log(`Latency: ${response.latency}ms`);
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Example 2: Email Classification with JSON Output
 */
async function example2_emailClassification() {
    console.log('\n=== Example 2: Email Classification (JSON) ===\n');
    
    const llm = getLLMClient();
    
    const emailContent = `
Subject: URGENT: Production Server Down!
From: ops-team@company.com

Our main production server (prod-app-01) has been down for 15 minutes.
Customers are unable to access the application. Need immediate attention!

Error: Connection refused on port 443
Last seen: 2:47 PM
    `;
    
    try {
        const response = await llm.chat([
            {
                role: 'system',
                content: `You are an email classifier. Analyze emails and return JSON with:
- urgency: "critical" | "high" | "medium" | "low"
- category: "incident" | "support" | "sales" | "general"
- priority: 1-5 (1 is highest)
- suggestedAction: string describing what to do
- confidence: 0.0-1.0`
            },
            {
                role: 'user',
                content: `Classify this email:\n${emailContent}`
            }
        ], {
            responseFormat: 'json',
            temperature: 0.3, // Lower temperature for more consistent results
            maxTokens: 300
        });
        
        console.log('Classification Result:');
        console.log(JSON.stringify(response.content, null, 2));
        console.log(`\nCost: $${response.cost.totalCost.toFixed(6)}`);
    } catch (error) {
        console.error('Error:', error);
    }
}

/**
 * Example 3: Streaming Response
 */
async function example3_streaming() {
    console.log('\n=== Example 3: Streaming Response ===\n');
    
    const llm = getLLMClient();
    
    console.log('Generating project plan (streaming)...\n');
    
    await llm.chatStream(
        [
            {
                role: 'user',
                content: 'Write a brief 5-step plan for building an email monitoring system.'
            }
        ],
        {
            onChunk: (chunk: any) => {
                if (!chunk.done) {
                    process.stdout.write(chunk.content);
                }
            },
            onComplete: (fullContent: any, usage: any) => {
                console.log('\n\n--- Stream Complete ---');
                console.log(`Total tokens: ${usage.totalTokens}`);
            },
            onError: (error: any) => {
                console.error('Stream error:', error.message);
            }
        },
        {
            temperature: 0.7,
            maxTokens: 500
        }
    );
}

/**
 * Example 4: Automatic Fallback
 */
async function example4_fallback() {
    console.log('\n=== Example 4: Automatic Provider Fallback ===\n');
    
    // Configure with multiple providers
    const llm = getLLMClient({
        providers: [LLMProvider.GROQ, LLMProvider.TOGETHER, LLMProvider.OPENROUTER],
        enableDetailedLogging: true
    });
    
    console.log('Available providers:', llm.getAvailableProviders());
    
    try {
        const response = await llm.chat([
            {
                role: 'user',
                content: 'Say hello!'
            }
        ]);
        
        console.log(`Success! Provider used: ${response.provider}`);
        console.log('Response:', response.content);
    } catch (error) {
        console.error('All providers failed:', error);
    }
}

/**
 * Example 5: Usage Statistics Tracking
 */
async function example5_usageTracking() {
    console.log('\n=== Example 5: Usage Statistics ===\n');
    
    const llm = getLLMClient();
    llm.resetUsageStats(); // Start fresh
    
    // Make several requests
    const prompts = [
        'What is AI?',
        'Explain machine learning in one sentence.',
        'What is the difference between AI and ML?'
    ];
    
    for (const prompt of prompts) {
        await llm.chat([
            { role: 'user', content: prompt }
        ], {
            maxTokens: 100
        });
    }
    
    // Get statistics
    const stats = llm.getUsageStats();
    console.log('\n📊 Usage Statistics:');
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Total Tokens: ${stats.totalTokens.toLocaleString()}`);
    console.log(`Total Cost: $${stats.totalCost.toFixed(4)}`);
    console.log(`Avg Tokens/Request: ${stats.averageTokensPerRequest.toFixed(0)}`);
    console.log(`Avg Cost/Request: $${stats.averageCostPerRequest.toFixed(6)}`);
}

/**
 * Example 6: Error Handling
 */
async function example6_errorHandling() {
    console.log('\n=== Example 6: Error Handling ===\n');
    
    const llm = getLLMClient();
    
    try {
        // Try with an invalid model
        const response = await llm.chat([
            { role: 'user', content: 'Hello' }
        ], {
            model: 'this-model-does-not-exist'
        });
    } catch (error) {
        if (error instanceof LLMError) {
            console.log(`Error Type: ${error.type}`);
            console.log(`Provider: ${error.provider || 'N/A'}`);
            console.log(`Message: ${error.message}`);
            
            // Handle specific error types
            switch (error.type) {
                case LLMErrorType.AUTHENTICATION:
                    console.log('💡 Tip: Check your API keys in .env file');
                    break;
                case LLMErrorType.RATE_LIMIT:
                    console.log('💡 Tip: Wait a few minutes or upgrade your plan');
                    break;
                case LLMErrorType.MODEL_NOT_FOUND:
                    console.log('💡 Tip: Use llm.getAvailableModels() to see valid models');
                    break;
                case LLMErrorType.TIMEOUT:
                    console.log('💡 Tip: The service may be slow, try again later');
                    break;
                default:
                    console.log('💡 Tip: Check the error message for details');
            }
        }
    }
}

/**
 * Example 7: Model Comparison
 */
async function example7_modelComparison() {
    console.log('\n=== Example 7: Model Comparison ===\n');
    
    const llm = getLLMClient();
    const prompt = 'Explain what a REST API is in one sentence.';
    
    const models = [
        'llama-3.1-70b-versatile',  // High quality
        'llama-3.1-8b-instant'      // Fast & cheap
    ];
    
    for (const model of models) {
        console.log(`\nTesting model: ${model}`);
        const startTime = Date.now();
        
        try {
            const response = await llm.chat([
                { role: 'user', content: prompt }
            ], { model });
            
            console.log(`Response: ${response.content}`);
            console.log(`Tokens: ${response.usage.totalTokens}, Cost: $${response.cost.totalCost.toFixed(6)}, Time: ${response.latency}ms`);
        } catch (error) {
            console.error(`Failed: ${error}`);
        }
    }
}

/**
 * Example 8: Signal Prioritization (Real Use Case)
 */
async function example8_signalPrioritization() {
    console.log('\n=== Example 8: Signal Prioritization (Real Use Case) ===\n');
    
    const llm = getLLMClient();
    
    const signals = [
        {
            type: 'email',
            subject: 'Weekly team sync notes',
            sender: 'colleague@company.com',
            preview: 'Here are the notes from today\'s meeting...'
        },
        {
            type: 'slack',
            channel: '#alerts',
            message: '🚨 CPU usage at 95% on prod-server-01',
            sender: 'monitoring-bot'
        },
        {
            type: 'sheets',
            sheet: 'Q4 Sales Pipeline',
            change: 'New row added: $500K deal - Hot lead from enterprise client',
            user: 'sales@company.com'
        }
    ];
    
    for (const signal of signals) {
        const response = await llm.chat([
            {
                role: 'system',
                content: `You are a signal prioritization AI. Analyze signals and return JSON with:
- priority: "critical" | "high" | "medium" | "low"
- reasoning: brief explanation
- suggestedAction: what to do
- shouldNotify: boolean`
            },
            {
                role: 'user',
                content: `Analyze this signal:\n${JSON.stringify(signal, null, 2)}`
            }
        ], {
            responseFormat: 'json',
            temperature: 0.2,
            maxTokens: 200
        });
        
        console.log(`\nSignal: ${signal.type} - ${signal.subject || signal.message || signal.change}`);
        console.log('Analysis:', JSON.stringify(response.content, null, 2));
    }
}

/**
 * Main function to run all examples
 */
async function main() {
    console.log('🚀 LLM Client Manager Examples\n');
    console.log('='.repeat(60));
    
    try {
        // Run examples one by one
        // await example1_basicChat();
        // await example2_emailClassification();
        // await example3_streaming();
        // await example4_fallback();
        // await example5_usageTracking();
        // await example6_errorHandling();
        // await example7_modelComparison();
        await example8_signalPrioritization();
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ All examples completed!\n');
        
        // Show final stats
        const llm = getLLMClient();
        const stats = llm.getUsageStats();
        console.log('📊 Final Statistics:');
        console.log(`Total Requests: ${stats.totalRequests}`);
        console.log(`Total Tokens: ${stats.totalTokens.toLocaleString()}`);
        console.log(`Total Cost: $${stats.totalCost.toFixed(4)}`);
        
    } catch (error) {
        console.error('Fatal error:', error);
    }
}

// Run examples if executed directly
if (require.main === module) {
    main().catch(console.error);
}

// Export for use in other files
export {
    example1_basicChat,
    example2_emailClassification,
    example3_streaming,
    example4_fallback,
    example5_usageTracking,
    example6_errorHandling,
    example7_modelComparison,
    example8_signalPrioritization
};
