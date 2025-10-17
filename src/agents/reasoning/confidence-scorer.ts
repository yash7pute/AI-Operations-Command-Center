/**
 * Confidence Scorer
 * 
 * Evaluates and enhances confidence scores for signal classifications and decisions.
 * Combines LLM confidence with signal quality, context factors, and applies penalties
 * for ambiguous or incomplete information.
 * 
 * @module agents/reasoning/confidence-scorer
 */

import logger from '../../utils/logger';

// ============================================================================
// Constants and Thresholds
// ============================================================================

/**
 * Confidence threshold for requiring human approval
 * Scores below this require manual review before action
 */
export const REQUIRE_APPROVAL_THRESHOLD = 0.7;

/**
 * Confidence threshold for automatic execution
 * Scores above this can proceed without human intervention
 */
export const AUTO_EXECUTE_THRESHOLD = 0.85;

/**
 * Confidence level categories
 */
export enum ConfidenceLevel {
    VERY_HIGH = 'very_high',
    HIGH = 'high',
    MEDIUM = 'medium',
    LOW = 'low',
    VERY_LOW = 'very_low',
}

// ============================================================================
// Types
// ============================================================================

/**
 * Signal data for confidence evaluation
 */
export interface SignalData {
    source: 'email' | 'slack' | 'sheets';
    subject?: string;
    body: string;
    sender?: string;
    timestamp: string;
    hasAttachments?: boolean;
    metadata?: Record<string, unknown>;
}

/**
 * Signal classification or decision result
 */
export interface ClassificationResult {
    type?: string;
    urgency?: 'critical' | 'high' | 'medium' | 'low';
    importance?: 'high' | 'medium' | 'low';
    category?: string;
    confidence?: number;
    reasoning?: string;
}

/**
 * Context information for confidence scoring
 */
export interface ConfidenceContext {
    similarPastSignals?: Array<{
        signal: string;
        classification: string;
        success: boolean;
    }>;
    expectedPatterns?: string[];
    knownSenders?: string[];
    knownChannels?: string[];
}

/**
 * Confidence calculation result
 */
export interface ConfidenceScore {
    score: number;
    level: ConfidenceLevel;
    baseScore: number;
    adjustments: {
        signalQuality: number;
        contextFactors: number;
        penalties: number;
    };
    factors: {
        hasSubject: boolean;
        hasStructuredContent: boolean;
        hasUrgencyKeywords: boolean;
        fromKnownSender: boolean;
        hasActionableLanguage: boolean;
        hasSimilarPastSignals: boolean;
        matchesExpectedPatterns: boolean;
        hasAmbiguousLanguage: boolean;
        hasMissingKeyInfo: boolean;
        hasConflictingSignals: boolean;
    };
    explanation: string;
    requiresApproval: boolean;
    canAutoExecute: boolean;
}

// ============================================================================
// Keyword Sets
// ============================================================================

const URGENCY_KEYWORDS = [
    'urgent',
    'asap',
    'critical',
    'emergency',
    'immediately',
    'now',
    'today',
    'eod',
    'cob',
    'priority',
    'important',
    'deadline',
    'time-sensitive',
    '🚨',
    '⚠️',
    '❗',
];

const ACTIONABLE_VERBS = [
    'review',
    'approve',
    'create',
    'update',
    'fix',
    'implement',
    'deploy',
    'investigate',
    'analyze',
    'schedule',
    'send',
    'prepare',
    'complete',
    'finish',
    'resolve',
    'address',
    'handle',
    'process',
];

const AMBIGUOUS_PHRASES = [
    'maybe',
    'might',
    'could be',
    'not sure',
    'possibly',
    'perhaps',
    'unclear',
    'ambiguous',
    'confusing',
    'i think',
    'i guess',
    'probably',
    'somewhat',
    'kind of',
    'sort of',
];

const STRUCTURED_CONTENT_INDICATORS = [
    '\n-',
    '\n*',
    '\n1.',
    '\n2.',
    'requirements:',
    'steps:',
    'details:',
    'context:',
    'background:',
    'action items:',
    'deliverables:',
];

// ============================================================================
// Confidence Scorer
// ============================================================================

/**
 * Calculate enhanced confidence score
 * 
 * @param signal - Signal data to evaluate
 * @param llmConfidence - Base confidence from LLM (0-1)
 * @param classification - Classification or decision result
 * @param context - Optional context information
 * @returns Confidence score with explanation
 */
export function calculateConfidence(
    signal: SignalData,
    llmConfidence: number,
    classification?: ClassificationResult,
    context?: ConfidenceContext
): ConfidenceScore {
    logger.debug('[ConfidenceScorer] Calculating confidence for signal', {
        source: signal.source,
        baseConfidence: llmConfidence,
    });

    // Initialize base score
    let score = Math.max(0, Math.min(1, llmConfidence));
    const baseScore = score;
    
    // Initialize adjustments
    let signalQualityAdjustment = 0;
    let contextAdjustment = 0;
    let penaltyAdjustment = 0;

    // Initialize factors
    const factors = {
        hasSubject: false,
        hasStructuredContent: false,
        hasUrgencyKeywords: false,
        fromKnownSender: false,
        hasActionableLanguage: false,
        hasSimilarPastSignals: false,
        matchesExpectedPatterns: false,
        hasAmbiguousLanguage: false,
        hasMissingKeyInfo: false,
        hasConflictingSignals: false,
    };

    // Build explanation parts
    const explanationParts: string[] = [];
    explanationParts.push(`Base LLM confidence: ${(baseScore * 100).toFixed(1)}%`);

    // ========================================================================
    // Signal Quality Factors (Positive)
    // ========================================================================

    // Factor 1: Has clear subject/title (+0.1)
    if (signal.subject && signal.subject.trim().length > 5) {
        factors.hasSubject = true;
        signalQualityAdjustment += 0.1;
        explanationParts.push('+ Clear subject line (+10%)');
    }

    // Factor 2: Has structured content (+0.1)
    const hasStructured = STRUCTURED_CONTENT_INDICATORS.some(indicator =>
        signal.body.toLowerCase().includes(indicator.toLowerCase())
    );
    if (hasStructured && signal.body.length > 50) {
        factors.hasStructuredContent = true;
        signalQualityAdjustment += 0.1;
        explanationParts.push('+ Structured content with details (+10%)');
    } else if (signal.body.length < 20 || signal.body.toLowerCase().includes('see attached')) {
        // Unstructured or minimal content
        explanationParts.push('• Minimal content structure');
    }

    // Factor 3: Includes explicit urgency keywords (+0.1)
    const bodyLower = signal.body.toLowerCase();
    const subjectLower = (signal.subject || '').toLowerCase();
    const hasUrgencyKeyword = URGENCY_KEYWORDS.some(keyword =>
        bodyLower.includes(keyword) || subjectLower.includes(keyword)
    );
    if (hasUrgencyKeyword) {
        factors.hasUrgencyKeywords = true;
        signalQualityAdjustment += 0.1;
        explanationParts.push('+ Explicit urgency indicators (+10%)');
    }

    // Factor 4: From known sender/channel (+0.05)
    if (signal.sender && context?.knownSenders) {
        const isKnownSender = context.knownSenders.some(known =>
            signal.sender?.toLowerCase().includes(known.toLowerCase())
        );
        if (isKnownSender) {
            factors.fromKnownSender = true;
            signalQualityAdjustment += 0.05;
            explanationParts.push('+ From recognized sender (+5%)');
        }
    }

    // Factor 5: Has actionable language (+0.05)
    const hasActionableVerb = ACTIONABLE_VERBS.some(verb =>
        bodyLower.includes(verb) || subjectLower.includes(verb)
    );
    if (hasActionableVerb) {
        factors.hasActionableLanguage = true;
        signalQualityAdjustment += 0.05;
        explanationParts.push('+ Actionable language with clear verbs (+5%)');
    }

    // ========================================================================
    // Context Factors (Positive)
    // ========================================================================

    // Factor 6: Similar past signals classified successfully (+0.05)
    if (context?.similarPastSignals && context.similarPastSignals.length > 0) {
        const successRate = context.similarPastSignals.filter(s => s.success).length /
            context.similarPastSignals.length;
        if (successRate >= 0.8) {
            factors.hasSimilarPastSignals = true;
            contextAdjustment += 0.05;
            explanationParts.push('+ Similar signals successfully classified (+5%)');
        }
    }

    // Factor 7: Signal matches expected patterns (+0.05)
    if (context?.expectedPatterns && context.expectedPatterns.length > 0) {
        const matchesPattern = context.expectedPatterns.some(pattern =>
            bodyLower.includes(pattern.toLowerCase()) ||
            subjectLower.includes(pattern.toLowerCase())
        );
        if (matchesPattern) {
            factors.matchesExpectedPatterns = true;
            contextAdjustment += 0.05;
            explanationParts.push('+ Matches expected signal patterns (+5%)');
        }
    }

    // ========================================================================
    // Penalties (Negative)
    // ========================================================================

    // Penalty 1: Ambiguous language (-0.1)
    const hasAmbiguous = AMBIGUOUS_PHRASES.some(phrase =>
        bodyLower.includes(phrase)
    );
    if (hasAmbiguous) {
        factors.hasAmbiguousLanguage = true;
        penaltyAdjustment -= 0.1;
        explanationParts.push('- Ambiguous or uncertain language (-10%)');
    }

    // Penalty 2: Missing key information (-0.15)
    const isMissingInfo = checkMissingKeyInfo(signal, classification);
    if (isMissingInfo) {
        factors.hasMissingKeyInfo = true;
        penaltyAdjustment -= 0.15;
        explanationParts.push('- Missing critical information (-15%)');
    }

    // Penalty 3: Conflicting signals (-0.1)
    const hasConflict = checkConflictingSignals(signal, classification);
    if (hasConflict) {
        factors.hasConflictingSignals = true;
        penaltyAdjustment -= 0.1;
        explanationParts.push('- Conflicting urgency/importance indicators (-10%)');
    }

    // ========================================================================
    // Calculate Final Score
    // ========================================================================

    score = baseScore + signalQualityAdjustment + contextAdjustment + penaltyAdjustment;
    score = Math.max(0, Math.min(1, score)); // Clamp to 0-1

    // Get confidence level
    const level = getConfidenceLevel(score);

    // Determine approval and execution requirements
    const requiresApproval = score < REQUIRE_APPROVAL_THRESHOLD;
    const canAutoExecute = score >= AUTO_EXECUTE_THRESHOLD;

    // Build final explanation
    const adjustmentSummary = `\nAdjustments: Signal Quality ${signalQualityAdjustment >= 0 ? '+' : ''}${(signalQualityAdjustment * 100).toFixed(1)}%, Context ${contextAdjustment >= 0 ? '+' : ''}${(contextAdjustment * 100).toFixed(1)}%, Penalties ${(penaltyAdjustment * 100).toFixed(1)}%`;
    const finalSummary = `\nFinal confidence: ${(score * 100).toFixed(1)}% (${level})`;
    const actionSummary = `\n${canAutoExecute ? '✓ Can auto-execute' : requiresApproval ? '⚠ Requires approval' : '• Manual review recommended'}`;
    
    const explanation = explanationParts.join('\n') + adjustmentSummary + finalSummary + actionSummary;

    logger.info('[ConfidenceScorer] Calculated confidence', {
        baseScore: (baseScore * 100).toFixed(1) + '%',
        finalScore: (score * 100).toFixed(1) + '%',
        level,
        requiresApproval,
        canAutoExecute,
    });

    return {
        score,
        level,
        baseScore,
        adjustments: {
            signalQuality: signalQualityAdjustment,
            contextFactors: contextAdjustment,
            penalties: penaltyAdjustment,
        },
        factors,
        explanation,
        requiresApproval,
        canAutoExecute,
    };
}

/**
 * Get confidence level category from score
 * 
 * @param score - Confidence score (0-1)
 * @returns Confidence level
 */
export function getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.9) {
        return ConfidenceLevel.VERY_HIGH;
    } else if (score >= 0.75) {
        return ConfidenceLevel.HIGH;
    } else if (score >= 0.6) {
        return ConfidenceLevel.MEDIUM;
    } else if (score >= 0.4) {
        return ConfidenceLevel.LOW;
    } else {
        return ConfidenceLevel.VERY_LOW;
    }
}

/**
 * Check if signal is missing key information
 * 
 * @param signal - Signal data
 * @param classification - Classification result
 * @returns True if missing critical info
 */
function checkMissingKeyInfo(
    signal: SignalData,
    classification?: ClassificationResult
): boolean {
    const bodyLower = signal.body.toLowerCase();
    const subjectLower = (signal.subject || '').toLowerCase();

    // Check for time-sensitive signals without dates
    const isTimeSensitive = classification?.urgency === 'critical' || classification?.urgency === 'high';
    const hasDateReference = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|eod|cob|asap|\d{1,2}\/\d{1,2}|deadline|due)\b/i.test(
        bodyLower + ' ' + subjectLower
    );

    if (isTimeSensitive && !hasDateReference) {
        return true;
    }

    // Check for action items without clear action
    const hasActionVerb = ACTIONABLE_VERBS.some(verb =>
        bodyLower.includes(verb) || subjectLower.includes(verb)
    );
    const isTaskLike = classification?.category === 'task' || 
        bodyLower.includes('can you') || 
        bodyLower.includes('please');

    if (isTaskLike && !hasActionVerb && signal.body.length < 30) {
        return true;
    }

    // Very short body with no attachments
    if (signal.body.length < 15 && !signal.hasAttachments) {
        return true;
    }

    return false;
}

/**
 * Check for conflicting signals in classification
 * 
 * @param signal - Signal data
 * @param classification - Classification result
 * @returns True if conflicting indicators
 */
function checkConflictingSignals(
    signal: SignalData,
    classification?: ClassificationResult
): boolean {
    if (!classification) {
        return false;
    }

    // Urgent but low importance
    if (
        (classification.urgency === 'critical' || classification.urgency === 'high') &&
        classification.importance === 'low'
    ) {
        return true;
    }

    // High importance but low urgency with urgent keywords
    const hasUrgentKeywords = URGENCY_KEYWORDS.slice(0, 7).some(keyword =>
        signal.body.toLowerCase().includes(keyword) ||
        (signal.subject || '').toLowerCase().includes(keyword)
    );
    if (
        classification.importance === 'high' &&
        classification.urgency === 'low' &&
        hasUrgentKeywords
    ) {
        return true;
    }

    return false;
}

/**
 * Get confidence level description
 * 
 * @param level - Confidence level
 * @returns Human-readable description
 */
export function getConfidenceLevelDescription(level: ConfidenceLevel): string {
    switch (level) {
        case ConfidenceLevel.VERY_HIGH:
            return 'Very High Confidence (90%+): Highly reliable classification, safe for automated actions';
        case ConfidenceLevel.HIGH:
            return 'High Confidence (75-90%): Reliable classification, minimal risk';
        case ConfidenceLevel.MEDIUM:
            return 'Medium Confidence (60-75%): Generally reliable, consider review for critical actions';
        case ConfidenceLevel.LOW:
            return 'Low Confidence (40-60%): Uncertain classification, human review recommended';
        case ConfidenceLevel.VERY_LOW:
            return 'Very Low Confidence (<40%): Unreliable classification, requires human review';
    }
}

/**
 * Get recommended action based on confidence score
 * 
 * @param score - Confidence score
 * @returns Recommended action
 */
export function getRecommendedAction(score: ConfidenceScore): {
    action: 'auto_execute' | 'review_and_execute' | 'manual_review';
    reason: string;
} {
    if (score.canAutoExecute) {
        return {
            action: 'auto_execute',
            reason: `Confidence ${(score.score * 100).toFixed(1)}% exceeds auto-execution threshold (${AUTO_EXECUTE_THRESHOLD * 100}%)`,
        };
    }

    if (score.requiresApproval) {
        return {
            action: 'manual_review',
            reason: `Confidence ${(score.score * 100).toFixed(1)}% below approval threshold (${REQUIRE_APPROVAL_THRESHOLD * 100}%)`,
        };
    }

    return {
        action: 'review_and_execute',
        reason: `Confidence ${(score.score * 100).toFixed(1)}% in moderate range, review before execution recommended`,
    };
}
