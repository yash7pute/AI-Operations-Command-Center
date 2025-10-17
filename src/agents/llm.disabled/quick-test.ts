/**
 * Quick Test Script for LLM Client Manager
 * 
 * This is a simple test to verify the LLM client manager is working correctly.
 * Before running:
 * 1. Copy .env.example to .env
 * 2. Add at least one API key (GROQ_API_KEY, TOGETHER_API_KEY, or OPENROUTER_API_KEY)
 * 
 * Run with: npx ts-node src/agents/llm/quick-test.ts
 */

import dotenv from 'dotenv';
import { getLLMClient } from './index';

// Load environment variables
dotenv.config();

async function quickTest() {
    console.log('🧪 Quick Test: LLM Client Manager\n');
    console.log('='.repeat(60));
    
    try {
        // Initialize client
        console.log('\n1️⃣  Initializing LLM client...');
        const llm = getLLMClient();
        
        const availableProviders = llm.getAvailableProviders();
        console.log(`✅ Found ${availableProviders.length} provider(s): ${availableProviders.join(', ')}`);
        
        if (availableProviders.length === 0) {
            console.error('\n❌ No providers available!');
            console.log('\n📝 Setup Instructions:');
            console.log('1. Copy .env.example to .env');
            console.log('2. Add at least one API key:');
            console.log('   - GROQ_API_KEY=your_key_here (Get from: https://console.groq.com/keys)');
            console.log('   - TOGETHER_API_KEY=your_key_here (Get from: https://api.together.xyz/settings/api-keys)');
            console.log('   - OPENROUTER_API_KEY=your_key_here (Get from: https://openrouter.ai/keys)');
            process.exit(1);
        }
        
        // Test basic chat
        console.log('\n2️⃣  Testing basic chat...');
        const response = await llm.chat([
            {
                role: 'system',
                content: 'You are a helpful assistant. Respond in one short sentence.'
            },
            {
                role: 'user',
                content: 'What is 2+2?'
            }
        ], {
            maxTokens: 50
        });
        
        console.log(`✅ Response: "${response.content}"`);
        console.log(`   Provider: ${response.provider}`);
        console.log(`   Model: ${response.model}`);
        console.log(`   Tokens: ${response.usage.totalTokens}`);
        console.log(`   Cost: $${response.cost.totalCost.toFixed(6)}`);
        console.log(`   Latency: ${response.latency}ms`);
        
        // Test JSON response
        console.log('\n3️⃣  Testing JSON response...');
        const jsonResponse = await llm.chat([
            {
                role: 'system',
                content: 'You are a classifier. Return JSON with fields: sentiment (positive/negative/neutral) and confidence (0-1).'
            },
            {
                role: 'user',
                content: 'I love this product! It works great!'
            }
        ], {
            responseFormat: 'json',
            temperature: 0.3,
            maxTokens: 100
        });
        
        console.log('✅ JSON Response:', JSON.stringify(jsonResponse.content, null, 2));
        
        // Show usage statistics
        console.log('\n4️⃣  Usage Statistics:');
        const stats = llm.getUsageStats();
        console.log(`   Total Requests: ${stats.totalRequests}`);
        console.log(`   Total Tokens: ${stats.totalTokens}`);
        console.log(`   Total Cost: $${stats.totalCost.toFixed(6)}`);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests passed! LLM Client Manager is working correctly.\n');
        
    } catch (error: any) {
        console.error('\n❌ Test failed!');
        console.error('Error:', error.message);
        
        if (error.type) {
            console.error('Error Type:', error.type);
            
            if (error.type === 'authentication') {
                console.log('\n💡 Tip: Check your API key in the .env file');
            }
        }
        
        process.exit(1);
    }
}

// Run the test
quickTest().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
