/**
 * LLM Output Validator
 * 
 * Uses Zod to validate and type-check LLM responses.
 * Ensures structured outputs match expected schemas for signal classification,
 * action decisions, and task details.
 * 
 * Features:
 * - Type-safe schema definitions
 * - Comprehensive validation with helpful error messages
 * - Export schemas for reuse across codebase
 * - Parse and validate JSON outputs from LLM
 */

import { z } from 'zod';
import logger from '../../utils/logger';

// ============================================================================
// Signal Classification Schema
// ============================================================================

/**
 * Schema for classifying operational signals (emails, Slack messages, Sheets changes)
 */
export const SignalClassificationSchema = z.object({
    type: z.enum(['email', 'slack', 'sheet'])
        .describe('Type of signal being classified'),

    urgency: z.enum(['critical', 'high', 'medium', 'low'])
        .describe('How quickly this signal requires attention'),

    importance: z.enum(['high', 'medium', 'low'])
        .describe('Overall importance/impact of this signal'),

    category: z.enum([
        'meeting',
        'task',
        'report',
        'question',
        'notification',
        'alert'
    ]).describe('Primary category of the signal'),

    confidence: z.number()
        .min(0, 'Confidence must be between 0 and 1')
        .max(1, 'Confidence must be between 0 and 1')
        .describe('Confidence score for the classification (0-1)'),

    reasoning: z.string()
        .min(10, 'Reasoning must be at least 10 characters')
        .max(500, 'Reasoning must not exceed 500 characters')
        .describe('Explanation for why this classification was chosen')
});

/**
 * TypeScript type derived from the schema
 */
export type SignalClassification = z.infer<typeof SignalClassificationSchema>;

// ============================================================================
// Action Decision Schema
// ============================================================================

/**
 * Schema for deciding what action to take based on a classified signal
 */
export const ActionDecisionSchema = z.object({
    action: z.enum([
        'create_task',
        'send_notification',
        'update_sheet',
        'file_document',
        'delegate',
        'ignore'
    ]).describe('Action to take in response to the signal'),

    target: z.enum(['notion', 'trello', 'slack', 'drive', 'sheets'])
        .describe('Target system/service where action should be executed'),

    params: z.record(z.string(), z.unknown())
        .describe('Parameters specific to the action being taken'),

    priority: z.number()
        .int('Priority must be an integer')
        .min(1, 'Priority must be between 1 and 5')
        .max(5, 'Priority must be between 1 and 5')
        .describe('Priority level (1 = highest, 5 = lowest)'),

    reasoning: z.string()
        .min(10, 'Reasoning must be at least 10 characters')
        .max(500, 'Reasoning must not exceed 500 characters')
        .describe('Explanation for why this action was chosen'),

    requiresApproval: z.boolean()
        .describe('Whether this action requires human approval before execution')
});

/**
 * TypeScript type derived from the schema
 */
export type ActionDecision = z.infer<typeof ActionDecisionSchema>;

// ============================================================================
// Task Details Schema
// ============================================================================

/**
 * Schema for task creation details (for Notion, Trello, etc.)
 */
export const TaskDetailsSchema = z.object({
    title: z.string()
        .min(3, 'Task title must be at least 3 characters')
        .max(200, 'Task title must not exceed 200 characters')
        .describe('Task title/summary'),

    description: z.string()
        .min(10, 'Task description must be at least 10 characters')
        .max(2000, 'Task description must not exceed 2000 characters')
        .describe('Detailed task description'),

    dueDate: z.string()
        .datetime({ message: 'Due date must be a valid ISO 8601 datetime string' })
        .optional()
        .describe('Optional due date in ISO 8601 format (e.g., 2025-10-20T14:30:00Z)'),

    assignee: z.string()
        .email({ message: 'Assignee must be a valid email address' })
        .optional()
        .describe('Optional email of person to assign task to'),

    labels: z.array(z.string())
        .min(0, 'Labels must be an array')
        .max(10, 'Cannot have more than 10 labels')
        .describe('Array of labels/tags for the task'),

    project: z.string()
        .min(1, 'Project name must not be empty')
        .max(100, 'Project name must not exceed 100 characters')
        .optional()
        .describe('Optional project or workspace to assign task to')
});

/**
 * TypeScript type derived from the schema
 */
export type TaskDetails = z.infer<typeof TaskDetailsSchema>;

// ============================================================================
// Combined Response Schema (for multi-step decisions)
// ============================================================================

/**
 * Schema for a complete signal processing response
 * (classification + action decision + task details if applicable)
 */
export const CompleteResponseSchema = z.object({
    classification: SignalClassificationSchema,
    decision: ActionDecisionSchema,
    taskDetails: TaskDetailsSchema.optional()
});

/**
 * TypeScript type for complete response
 */
export type CompleteResponse = z.infer<typeof CompleteResponseSchema>;

// ============================================================================
// Validation Error Types
// ============================================================================

/**
 * Custom error class for validation failures
 */
export class ValidationError extends Error {
    public errors: z.ZodIssue[];
    public schema: string;

    constructor(message: string, errors: z.ZodIssue[], schema: string) {
        super(message);
        this.name = 'ValidationError';
        this.errors = errors;
        this.schema = schema;
    }

    /**
     * Get a user-friendly error message
     */
    getUserFriendlyMessage(): string {
        const errorMessages = this.errors.map(err => {
            const path = err.path.join('.');
            return `  - ${path}: ${err.message}`;
        }).join('\n');

        return `Validation failed for ${this.schema}:\n${errorMessages}`;
    }

    /**
     * Get detailed error information for logging
     */
    getDetailedErrors(): Array<{ field: string; message: string; received: unknown }> {
        return this.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            received: (err as any).received
        }));
    }
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate output against a Zod schema
 * 
 * @param data - Data to validate (typically parsed JSON from LLM)
 * @param schema - Zod schema to validate against
 * @param schemaName - Name of schema for error messages
 * @returns Validated and typed data
 * @throws ValidationError if validation fails
 */
export function validateOutput<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    schemaName: string = 'Output'
): T {
    try {
        // Attempt to parse and validate
        const result = schema.parse(data);
        
        logger.info(`[Validator] Successfully validated ${schemaName}`);
        return result;
        
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.error(`[Validator] Validation failed for ${schemaName}:`, error.issues);
            
            throw new ValidationError(
                `Validation failed for ${schemaName}`,
                error.issues,
                schemaName
            );
        }
        
        // Re-throw non-Zod errors
        throw error;
    }
}

/**
 * Safely validate output without throwing
 * Returns { success: true, data } or { success: false, error }
 * 
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @param schemaName - Name of schema for error messages
 * @returns Result object with success flag
 */
export function safeValidateOutput<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    schemaName: string = 'Output'
): { success: true; data: T } | { success: false; error: ValidationError } {
    try {
        const validData = validateOutput(data, schema, schemaName);
        return { success: true, data: validData };
    } catch (error) {
        if (error instanceof ValidationError) {
            return { success: false, error };
        }
        
        // Unexpected error
        const validationError = new ValidationError(
            `Unexpected error during validation of ${schemaName}`,
            [],
            schemaName
        );
        return { success: false, error: validationError };
    }
}

/**
 * Parse and validate JSON string from LLM response
 * 
 * @param jsonString - JSON string to parse and validate
 * @param schema - Zod schema to validate against
 * @param schemaName - Name of schema for error messages
 * @returns Validated and typed data
 * @throws Error if JSON parsing fails
 * @throws ValidationError if validation fails
 */
export function parseAndValidate<T>(
    jsonString: string,
    schema: z.ZodSchema<T>,
    schemaName: string = 'Output'
): T {
    try {
        // Parse JSON
        const data = JSON.parse(jsonString);
        
        // Validate against schema
        return validateOutput(data, schema, schemaName);
        
    } catch (error) {
        if (error instanceof SyntaxError) {
            logger.error(`[Validator] JSON parsing failed for ${schemaName}:`, error);
            throw new Error(`Invalid JSON for ${schemaName}: ${error.message}`);
        }
        
        // Re-throw validation errors
        throw error;
    }
}

/**
 * Validate partial data (useful for progressive validation)
 * Allows missing fields that have defaults or are optional
 * 
 * @param data - Partial data to validate
 * @param schema - Zod schema to validate against
 * @param schemaName - Name of schema for error messages
 * @returns Validated partial data
 */
export function validatePartial<T>(
    data: unknown,
    schema: z.ZodSchema<T>,
    schemaName: string = 'Output'
): Partial<T> {
    try {
        // Use partial() to make all fields optional
        const partialSchema = schema instanceof z.ZodObject 
            ? schema.partial() 
            : schema;
        
        const result = partialSchema.parse(data);
        logger.info(`[Validator] Successfully validated partial ${schemaName}`);
        return result as Partial<T>;
        
    } catch (error) {
        if (error instanceof z.ZodError) {
            logger.error(`[Validator] Partial validation failed for ${schemaName}:`, error.issues);
            throw new ValidationError(
                `Partial validation failed for ${schemaName}`,
                error.issues,
                schemaName
            );
        }
        throw error;
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if data matches schema without throwing
 * 
 * @param data - Data to check
 * @param schema - Zod schema to check against
 * @returns true if valid, false otherwise
 */
export function isValidOutput<T>(
    data: unknown,
    schema: z.ZodSchema<T>
): boolean {
    const result = schema.safeParse(data);
    return result.success;
}

/**
 * Get validation errors without throwing
 * 
 * @param data - Data to validate
 * @param schema - Zod schema to validate against
 * @returns Array of validation errors, or null if valid
 */
export function getValidationErrors<T>(
    data: unknown,
    schema: z.ZodSchema<T>
): z.ZodIssue[] | null {
    const result = schema.safeParse(data);
    if (result.success) {
        return null;
    }
    return result.error.issues;
}

/**
 * Create a human-readable error message from validation errors
 * 
 * @param errors - Zod validation errors
 * @returns Formatted error message
 */
export function formatValidationErrors(errors: z.ZodIssue[]): string {
    return errors.map(err => {
        const path = err.path.length > 0 ? err.path.join('.') : 'root';
        return `• ${path}: ${err.message}`;
    }).join('\n');
}

// ============================================================================
// Schema Documentation
// ============================================================================

/**
 * Get schema documentation as JSON Schema
 * Useful for generating prompts or documentation
 */
export function getSchemaDocumentation(schemaName: 'signal' | 'action' | 'task'): object {
    const schemas = {
        signal: SignalClassificationSchema,
        action: ActionDecisionSchema,
        task: TaskDetailsSchema
    };

    // Note: Full JSON Schema generation would require additional library
    // This is a simplified version
    return {
        name: schemaName,
        description: `Schema for ${schemaName} classification`,
        fields: Object.keys((schemas[schemaName] as any).shape)
    };
}

/**
 * Generate example data that matches the schema
 * Useful for testing and documentation
 */
export function getSchemaExample(schemaName: 'signal' | 'action' | 'task'): object {
    const examples = {
        signal: {
            type: 'email',
            urgency: 'high',
            importance: 'high',
            category: 'alert',
            confidence: 0.92,
            reasoning: 'Email contains keywords indicating a production incident requiring immediate attention'
        },
        action: {
            action: 'create_task',
            target: 'notion',
            params: {
                database: 'incidents',
                status: 'urgent'
            },
            priority: 1,
            reasoning: 'High urgency incident requires task creation for tracking and resolution',
            requiresApproval: false
        },
        task: {
            title: 'Investigate Production Server Outage',
            description: 'Production server prod-app-01 is experiencing high CPU usage and slow response times. Need to investigate root cause and implement fix.',
            dueDate: '2025-10-17T18:00:00Z',
            assignee: 'ops-team@company.com',
            labels: ['incident', 'production', 'urgent'],
            project: 'Infrastructure Maintenance'
        }
    };

    return examples[schemaName];
}

// ============================================================================
// Exports
// ============================================================================

export default {
    // Schemas
    SignalClassificationSchema,
    ActionDecisionSchema,
    TaskDetailsSchema,
    CompleteResponseSchema,
    
    // Validation functions
    validateOutput,
    safeValidateOutput,
    parseAndValidate,
    validatePartial,
    
    // Helper functions
    isValidOutput,
    getValidationErrors,
    formatValidationErrors,
    
    // Documentation
    getSchemaDocumentation,
    getSchemaExample,
    
    // Error class
    ValidationError
};
