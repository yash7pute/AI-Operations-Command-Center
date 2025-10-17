/**
 * Output Validator Examples
 * 
 * Demonstrates how to use the Zod schemas to validate LLM outputs
 * for signal classification, action decisions, and task creation.
 */

import {
    SignalClassificationSchema,
    ActionDecisionSchema,
    TaskDetailsSchema,
    CompleteResponseSchema,
    validateOutput,
    safeValidateOutput,
    parseAndValidate,
    isValidOutput,
    getValidationErrors,
    formatValidationErrors,
    getSchemaExample,
    ValidationError,
    type SignalClassification,
    type ActionDecision,
    type TaskDetails
} from './output-validator';
import { getLLMClient } from './index';

/**
 * Example 1: Validate Signal Classification from LLM
 */
async function example1_validateSignalClassification() {
    console.log('\n=== Example 1: Validate Signal Classification ===\n');

    const llm = getLLMClient();

    // Simulate an email signal
    const emailSignal = `
Subject: URGENT: Production Database Down
From: ops-team@company.com
Time: 2:47 PM

Our production database is completely unresponsive. 
All customer-facing services are affected. Need immediate attention!
`;

    try {
        // Get LLM classification
        const response = await llm.chat([
            {
                role: 'system',
                content: `You are a signal classifier. Analyze the signal and return JSON matching this exact structure:
{
  "type": "email" | "slack" | "sheet",
  "urgency": "critical" | "high" | "medium" | "low",
  "importance": "high" | "medium" | "low",
  "category": "meeting" | "task" | "report" | "question" | "notification" | "alert",
  "confidence": 0.0-1.0,
  "reasoning": "explanation of classification"
}`
            },
            {
                role: 'user',
                content: `Classify this signal:\n${emailSignal}`
            }
        ], {
            responseFormat: 'json',
            temperature: 0.3,
            maxTokens: 300
        });

        // Validate the LLM response
        const classification = validateOutput(
            response.content,
            SignalClassificationSchema,
            'SignalClassification'
        );

        console.log('✅ Valid Classification:');
        console.log(JSON.stringify(classification, null, 2));
        console.log(`\nConfidence: ${(classification.confidence * 100).toFixed(1)}%`);
        console.log(`Urgency: ${classification.urgency}`);
        console.log(`Category: ${classification.category}`);

    } catch (error) {
        if (error instanceof ValidationError) {
            console.error('❌ Validation Failed:');
            console.error(error.getUserFriendlyMessage());
        } else {
            console.error('Error:', error);
        }
    }
}

/**
 * Example 2: Validate Action Decision
 */
async function example2_validateActionDecision() {
    console.log('\n=== Example 2: Validate Action Decision ===\n');

    const llm = getLLMClient();

    const classifiedSignal = {
        type: 'email',
        urgency: 'critical',
        importance: 'high',
        category: 'alert',
        confidence: 0.95
    };

    try {
        const response = await llm.chat([
            {
                role: 'system',
                content: `Based on the classified signal, decide what action to take. Return JSON:
{
  "action": "create_task" | "send_notification" | "update_sheet" | "file_document" | "delegate" | "ignore",
  "target": "notion" | "trello" | "slack" | "drive" | "sheets",
  "params": { key-value pairs },
  "priority": 1-5 (1=highest),
  "reasoning": "why this action",
  "requiresApproval": true/false
}`
            },
            {
                role: 'user',
                content: `Classified signal: ${JSON.stringify(classifiedSignal)}\nWhat action should we take?`
            }
        ], {
            responseFormat: 'json',
            temperature: 0.3
        });

        const decision = validateOutput(
            response.content,
            ActionDecisionSchema,
            'ActionDecision'
        );

        console.log('✅ Valid Action Decision:');
        console.log(JSON.stringify(decision, null, 2));
        console.log(`\nAction: ${decision.action} → ${decision.target}`);
        console.log(`Priority: ${decision.priority}/5`);
        console.log(`Requires Approval: ${decision.requiresApproval ? 'Yes' : 'No'}`);

    } catch (error) {
        if (error instanceof ValidationError) {
            console.error('❌ Validation Failed:');
            console.error(error.getUserFriendlyMessage());
        } else {
            console.error('Error:', error);
        }
    }
}

/**
 * Example 3: Validate Task Details
 */
async function example3_validateTaskDetails() {
    console.log('\n=== Example 3: Validate Task Details ===\n');

    const llm = getLLMClient();

    try {
        const response = await llm.chat([
            {
                role: 'system',
                content: `Generate task details for a Notion/Trello card. Return JSON:
{
  "title": "task title",
  "description": "detailed description",
  "dueDate": "ISO 8601 datetime (optional)",
  "assignee": "email@company.com (optional)",
  "labels": ["label1", "label2"],
  "project": "project name (optional)"
}`
            },
            {
                role: 'user',
                content: 'Create a task for investigating the production database outage mentioned in the alert email.'
            }
        ], {
            responseFormat: 'json',
            temperature: 0.4
        });

        const taskDetails = validateOutput(
            response.content,
            TaskDetailsSchema,
            'TaskDetails'
        );

        console.log('✅ Valid Task Details:');
        console.log(JSON.stringify(taskDetails, null, 2));
        console.log(`\nTitle: ${taskDetails.title}`);
        console.log(`Labels: ${taskDetails.labels.join(', ')}`);
        if (taskDetails.dueDate) {
            console.log(`Due: ${new Date(taskDetails.dueDate).toLocaleString()}`);
        }

    } catch (error) {
        if (error instanceof ValidationError) {
            console.error('❌ Validation Failed:');
            console.error(error.getUserFriendlyMessage());
        } else {
            console.error('Error:', error);
        }
    }
}

/**
 * Example 4: Safe Validation (No Exceptions)
 */
function example4_safeValidation() {
    console.log('\n=== Example 4: Safe Validation (No Exceptions) ===\n');

    // Invalid data (confidence > 1)
    const invalidData = {
        type: 'email',
        urgency: 'critical',
        importance: 'high',
        category: 'alert',
        confidence: 1.5, // Invalid!
        reasoning: 'This is a critical alert'
    };

    const result = safeValidateOutput(
        invalidData,
        SignalClassificationSchema,
        'SignalClassification'
    );

    if (result.success) {
        console.log('✅ Validation passed:', result.data);
    } else {
        console.log('❌ Validation failed (gracefully):');
        console.log(result.error.getUserFriendlyMessage());
        console.log('\nDetailed errors:', result.error.getDetailedErrors());
    }
}

/**
 * Example 5: Parse and Validate JSON String
 */
function example5_parseAndValidate() {
    console.log('\n=== Example 5: Parse and Validate JSON String ===\n');

    const jsonString = `{
        "action": "create_task",
        "target": "notion",
        "params": {
            "database": "incidents",
            "status": "urgent"
        },
        "priority": 1,
        "reasoning": "Critical incident requires immediate task creation for tracking",
        "requiresApproval": false
    }`;

    try {
        const decision = parseAndValidate(
            jsonString,
            ActionDecisionSchema,
            'ActionDecision'
        );

        console.log('✅ Successfully parsed and validated:');
        console.log(`Action: ${decision.action}`);
        console.log(`Target: ${decision.target}`);
        console.log(`Priority: ${decision.priority}`);

    } catch (error) {
        if (error instanceof ValidationError) {
            console.error('Validation error:', error.getUserFriendlyMessage());
        } else if (error instanceof Error) {
            console.error('Parse error:', error.message);
        }
    }
}

/**
 * Example 6: Check Validity Without Throwing
 */
function example6_checkValidity() {
    console.log('\n=== Example 6: Check Validity Without Throwing ===\n');

    const testData = [
        {
            name: 'Valid signal',
            data: {
                type: 'email',
                urgency: 'high',
                importance: 'medium',
                category: 'task',
                confidence: 0.85,
                reasoning: 'Email contains action items requiring follow-up'
            }
        },
        {
            name: 'Invalid urgency',
            data: {
                type: 'email',
                urgency: 'super-urgent', // Invalid!
                importance: 'high',
                category: 'alert',
                confidence: 0.9,
                reasoning: 'Test'
            }
        },
        {
            name: 'Missing reasoning',
            data: {
                type: 'slack',
                urgency: 'medium',
                importance: 'low',
                category: 'notification',
                confidence: 0.7
                // reasoning missing!
            }
        }
    ];

    testData.forEach(test => {
        const isValid = isValidOutput(test.data, SignalClassificationSchema);
        console.log(`${test.name}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);

        if (!isValid) {
            const errors = getValidationErrors(test.data, SignalClassificationSchema);
            if (errors) {
                console.log(formatValidationErrors(errors));
            }
        }
    });
}

/**
 * Example 7: Get Schema Examples
 */
function example7_schemaExamples() {
    console.log('\n=== Example 7: Schema Examples ===\n');

    console.log('📋 Signal Classification Example:');
    console.log(JSON.stringify(getSchemaExample('signal'), null, 2));

    console.log('\n📋 Action Decision Example:');
    console.log(JSON.stringify(getSchemaExample('action'), null, 2));

    console.log('\n📋 Task Details Example:');
    console.log(JSON.stringify(getSchemaExample('task'), null, 2));
}

/**
 * Example 8: Complete Workflow (Classification → Decision → Task)
 */
async function example8_completeWorkflow() {
    console.log('\n=== Example 8: Complete Workflow ===\n');

    const llm = getLLMClient();

    const emailSignal = {
        subject: 'Q4 Sales Report Ready',
        from: 'analytics@company.com',
        body: 'The Q4 sales report has been compiled and is ready for review. Please check the attached spreadsheet.'
    };

    try {
        // Step 1: Classify the signal
        console.log('Step 1: Classifying signal...');
        const classificationResponse = await llm.chat([
            {
                role: 'system',
                content: 'Classify this email signal. Return JSON with type, urgency, importance, category, confidence, and reasoning.'
            },
            {
                role: 'user',
                content: JSON.stringify(emailSignal)
            }
        ], {
            responseFormat: 'json',
            temperature: 0.3
        });

        const classification = validateOutput(
            classificationResponse.content,
            SignalClassificationSchema,
            'SignalClassification'
        );
        console.log('✅ Classification:', classification.category, classification.urgency);

        // Step 2: Decide action
        console.log('\nStep 2: Deciding action...');
        const decisionResponse = await llm.chat([
            {
                role: 'system',
                content: 'Based on classification, decide action. Return JSON with action, target, params, priority, reasoning, requiresApproval.'
            },
            {
                role: 'user',
                content: `Classification: ${JSON.stringify(classification)}`
            }
        ], {
            responseFormat: 'json',
            temperature: 0.3
        });

        const decision = validateOutput(
            decisionResponse.content,
            ActionDecisionSchema,
            'ActionDecision'
        );
        console.log('✅ Decision:', decision.action, '→', decision.target);

        // Step 3: Create task details if needed
        if (decision.action === 'create_task') {
            console.log('\nStep 3: Creating task details...');
            const taskResponse = await llm.chat([
                {
                    role: 'system',
                    content: 'Generate task details. Return JSON with title, description, dueDate, assignee, labels, project.'
                },
                {
                    role: 'user',
                    content: `Create task for: ${emailSignal.subject}`
                }
            ], {
                responseFormat: 'json',
                temperature: 0.4
            });

            const taskDetails = validateOutput(
                taskResponse.content,
                TaskDetailsSchema,
                'TaskDetails'
            );
            console.log('✅ Task:', taskDetails.title);

            // Validate complete response
            const completeResponse = {
                classification,
                decision,
                taskDetails
            };

            const validated = validateOutput(
                completeResponse,
                CompleteResponseSchema,
                'CompleteResponse'
            );

            console.log('\n✅ Complete validated workflow!');
            console.log('Cost:', `$${(
                classificationResponse.cost.totalCost +
                decisionResponse.cost.totalCost +
                taskResponse.cost.totalCost
            ).toFixed(6)}`);
        }

    } catch (error) {
        if (error instanceof ValidationError) {
            console.error('\n❌ Validation Error:');
            console.error(error.getUserFriendlyMessage());
        } else {
            console.error('Error:', error);
        }
    }
}

/**
 * Main function to run examples
 */
async function main() {
    console.log('🎯 Output Validator Examples\n');
    console.log('='.repeat(70));

    try {
        // Run synchronous examples first
        example4_safeValidation();
        example5_parseAndValidate();
        example6_checkValidity();
        example7_schemaExamples();

        // Uncomment to run LLM examples (requires API key)
        // await example1_validateSignalClassification();
        // await example2_validateActionDecision();
        // await example3_validateTaskDetails();
        // await example8_completeWorkflow();

        console.log('\n' + '='.repeat(70));
        console.log('✅ All examples completed!\n');

    } catch (error) {
        console.error('Fatal error:', error);
    }
}

// Run examples if executed directly
if (require.main === module) {
    main().catch(console.error);
}

export {
    example1_validateSignalClassification,
    example2_validateActionDecision,
    example3_validateTaskDetails,
    example4_safeValidation,
    example5_parseAndValidate,
    example6_checkValidity,
    example7_schemaExamples,
    example8_completeWorkflow
};
