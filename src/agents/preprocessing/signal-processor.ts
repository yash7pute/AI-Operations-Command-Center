/**
 * Signal Preprocessor
 * 
 * Cleans and normalizes signals before classification by:
 * - Removing excessive whitespace and formatting
 * - Extracting structured data (dates, emails, URLs, etc.)
 * - Detecting quoted replies and email chains
 * - Identifying attachments
 * - Language detection and translation support
 * - Removing signatures and disclaimers
 * - Normalizing date/time mentions
 * - Extracting key entities
 * 
 * @module agents/preprocessing/signal-processor
 */

import logger from '../../utils/logger';
import { type Signal } from '../reasoning/context-builder';

// ============================================================================
// Types
// ============================================================================

/**
 * Extracted structured data from signal
 */
export interface ExtractedData {
    emails: string[];
    phoneNumbers: string[];
    urls: string[];
    dates: Array<{ original: string; normalized: string }>;
    times: string[];
    monetaryAmounts: Array<{ amount: number; currency: string; original: string }>;
    fileReferences: string[];
    mentions: string[]; // @mentions
}

/**
 * Signal metadata
 */
export interface SignalMetadata {
    language: string;
    detectedLanguageConfidence: number;
    hasAttachments: boolean;
    wordCount: number;
    sentenceCount: number;
    hasQuotedReply: boolean;
    hasSignature: boolean;
    cleaningApplied: string[];
}

/**
 * Extracted key entities
 */
export interface ExtractedEntities {
    people: Array<{ name: string; role?: string; context: string }>;
    dates: Array<{ original: string; normalized: string; context: string }>;
    monetaryAmounts: Array<{ amount: number; currency: string; context: string }>;
    urls: Array<{ url: string; context: string }>;
    fileReferences: Array<{ filename: string; context: string }>;
    actionItems: Array<{ text: string; priority: 'high' | 'medium' | 'low' }>;
}

/**
 * Preprocessed signal result
 */
export interface PreprocessedSignal {
    original: Signal;
    cleaned: {
        subject: string;
        body: string;
        extractedData: ExtractedData;
    };
    metadata: SignalMetadata;
    entities?: ExtractedEntities;
}

// ============================================================================
// Constants & Patterns
// ============================================================================

// Email patterns
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;

// Phone number patterns (US format)
const PHONE_REGEX = /(\+?1[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g;

// URL patterns
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

// File reference patterns
const FILE_REGEX = /[\w-]+\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|png|jpg|jpeg|gif)/gi;

// Mention patterns
const MENTION_REGEX = /@[\w.-]+/g;

// Monetary amount patterns
const MONEY_REGEX = /[$€£¥₹]\s?\d+(?:,\d{3})*(?:\.\d{2})?|\d+(?:,\d{3})*(?:\.\d{2})?\s?(?:USD|EUR|GBP|JPY|INR)/gi;

// Date patterns (various formats)
const DATE_PATTERNS = {
    iso: /\b\d{4}-\d{2}-\d{2}\b/g,
    slashDate: /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
    writtenDate: /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}\b/gi,
    relativeDate: /\b(?:today|tomorrow|yesterday|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|last\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi,
    eod: /\bEOD\b|\bCOB\b|\bend of (?:day|business)\b/gi,
};

// Time patterns
const TIME_REGEX = /\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b/g;

// Quoted reply patterns
const QUOTED_REPLY_PATTERNS = [
    /^On .+ wrote:$/gm,
    /^From:.+$/gm,
    /^Sent:.+$/gm,
    /^To:.+$/gm,
    /^Subject:.+$/gm,
    /^[-_]{3,}$/gm, // Separator lines
    /^>+.*/gm, // Quoted lines with >
];

// Signature patterns
const SIGNATURE_PATTERNS = [
    /(?:^|\n)--\s*\n[\s\S]*/m, // Standard email signature delimiter
    /(?:^|\n)_{3,}\n[\s\S]*/m,
    /(?:^|\n)Best regards,?\s*\n[\s\S]*/mi,
    /(?:^|\n)(?:Thanks|Thank you|Regards|Sincerely|Cheers),?\s*\n[\s\S]*/mi,
    /(?:^|\n)Sent from my (?:iPhone|iPad|Android|mobile device)[\s\S]*/mi,
];

// Disclaimer patterns
const DISCLAIMER_PATTERNS = [
    /This email (?:and any attachments )?(?:is|are) confidential[\s\S]*/mi,
    /CONFIDENTIAL[\s\S]*intended recipient/mi,
    /(?:^|\n)NOTICE:[\s\S]*/mi,
];

// Action verb patterns
const ACTION_VERBS = [
    'please', 'need to', 'must', 'should', 'have to', 'required to',
    'can you', 'could you', 'would you', 'will you',
    'let\'s', 'we need', 'we should', 'we must',
    'todo', 'action item', 'follow up', 'asap', 'urgent',
];

// Common name titles
const NAME_TITLES = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sir', 'Madam'];

// Role keywords
const ROLE_KEYWORDS = ['CEO', 'CTO', 'CFO', 'COO', 'VP', 'Director', 'Manager', 'Lead', 'Engineer', 'Developer', 'Designer', 'Analyst'];

// Language detection patterns
const LANGUAGE_PATTERNS = {
    en: /\b(the|is|are|was|were|have|has|been|will|would|could|should|can|may|might)\b/gi,
    es: /\b(el|la|los|las|es|está|son|están|de|que|en)\b/gi,
    fr: /\b(le|la|les|est|sont|de|que|je|tu|nous|vous)\b/gi,
    de: /\b(der|die|das|ist|sind|hat|haben|ein|eine)\b/gi,
};

// ============================================================================
// Signal Processor Class
// ============================================================================

export class SignalProcessor {
    private static instance: SignalProcessor;

    private constructor() {
        logger.info('[SignalProcessor] Initialized');
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): SignalProcessor {
        if (!SignalProcessor.instance) {
            SignalProcessor.instance = new SignalProcessor();
        }
        return SignalProcessor.instance;
    }

    /**
     * Preprocess a signal
     * 
     * @param rawSignal - Raw signal to preprocess
     * @param options - Processing options
     * @returns Preprocessed signal with cleaned data and metadata
     */
    public preprocessSignal(
        rawSignal: Signal,
        options?: {
            extractEntities?: boolean;
            translateIfNeeded?: boolean;
            removeQuotedReplies?: boolean;
            removeSignatures?: boolean;
        }
    ): PreprocessedSignal {
        const startTime = Date.now();
        const cleaningApplied: string[] = [];

        try {
            logger.debug('[SignalProcessor] Starting preprocessing', {
                signalId: rawSignal.id,
                source: rawSignal.source,
            });

            // Initialize cleaned data
            let cleanedSubject = rawSignal.subject || '';
            let cleanedBody = rawSignal.body;

            // Step 1: Remove quoted replies (email chains)
            if (options?.removeQuotedReplies !== false && rawSignal.source === 'email') {
                const { text, hasQuotedReply } = this.removeQuotedReplies(cleanedBody);
                if (hasQuotedReply) {
                    cleanedBody = text;
                    cleaningApplied.push('quoted_replies_removed');
                }
            }

            // Step 2: Remove signatures and disclaimers
            if (options?.removeSignatures !== false) {
                const { text, hasSignature, hasDisclaimer } = this.removeSignaturesAndDisclaimers(cleanedBody);
                cleanedBody = text;
                if (hasSignature) cleaningApplied.push('signature_removed');
                if (hasDisclaimer) cleaningApplied.push('disclaimer_removed');
            }

            // Step 3: Clean whitespace and formatting
            cleanedSubject = this.cleanWhitespace(cleanedSubject);
            cleanedBody = this.cleanWhitespace(cleanedBody);
            cleaningApplied.push('whitespace_cleaned');

            // Step 4: Extract structured data
            const extractedData = this.extractStructuredData(cleanedBody, cleanedSubject);

            // Step 5: Detect language
            const { language, confidence } = this.detectLanguage(cleanedBody);

            // Step 6: Calculate metadata
            const wordCount = cleanedBody.split(/\s+/).filter(w => w.length > 0).length;
            const sentenceCount = cleanedBody.split(/[.!?]+/).filter(s => s.trim().length > 0).length;

            const metadata: SignalMetadata = {
                language,
                detectedLanguageConfidence: confidence,
                hasAttachments: this.detectAttachments(rawSignal),
                wordCount,
                sentenceCount,
                hasQuotedReply: cleaningApplied.includes('quoted_replies_removed'),
                hasSignature: cleaningApplied.includes('signature_removed'),
                cleaningApplied,
            };

            // Step 7: Extract entities (optional, computationally expensive)
            let entities: ExtractedEntities | undefined;
            if (options?.extractEntities) {
                entities = this.extractKeyEntities(cleanedBody, cleanedSubject);
            }

            const processingTime = Date.now() - startTime;

            logger.info('[SignalProcessor] Preprocessing complete', {
                signalId: rawSignal.id,
                language,
                wordCount,
                cleaningApplied: cleaningApplied.join(', '),
                processingTime: `${processingTime}ms`,
            });

            return {
                original: rawSignal,
                cleaned: {
                    subject: cleanedSubject,
                    body: cleanedBody,
                    extractedData,
                },
                metadata,
                entities,
            };

        } catch (error) {
            logger.error('[SignalProcessor] Preprocessing failed, returning original', {
                signalId: rawSignal.id,
                error: error instanceof Error ? error.message : String(error),
            });

            // Return original signal with minimal metadata on error
            return {
                original: rawSignal,
                cleaned: {
                    subject: rawSignal.subject || '',
                    body: rawSignal.body,
                    extractedData: this.getEmptyExtractedData(),
                },
                metadata: {
                    language: 'en',
                    detectedLanguageConfidence: 0,
                    hasAttachments: false,
                    wordCount: rawSignal.body.split(/\s+/).length,
                    sentenceCount: rawSignal.body.split(/[.!?]+/).length,
                    hasQuotedReply: false,
                    hasSignature: false,
                    cleaningApplied: ['error_fallback'],
                },
            };
        }
    }

    /**
     * Extract key entities from text
     * 
     * @param text - Text to extract entities from
     * @param subject - Optional subject line
     * @returns Extracted entities
     */
    public extractKeyEntities(text: string, subject?: string): ExtractedEntities {
        const combinedText = subject ? `${subject}\n${text}` : text;

        return {
            people: this.extractPeople(combinedText),
            dates: this.extractDatesWithContext(combinedText),
            monetaryAmounts: this.extractMoneyWithContext(combinedText),
            urls: this.extractUrlsWithContext(combinedText),
            fileReferences: this.extractFileReferencesWithContext(combinedText),
            actionItems: this.extractActionItems(combinedText),
        };
    }

    // ========================================================================
    // Private Helper Methods
    // ========================================================================

    /**
     * Clean excessive whitespace
     */
    private cleanWhitespace(text: string): string {
        return text
            .replace(/\r\n/g, '\n') // Normalize line breaks
            .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
            .replace(/[ \t]+/g, ' ') // Normalize spaces and tabs
            .replace(/^\s+|\s+$/g, '') // Trim start and end
            .trim();
    }

    /**
     * Remove quoted replies from email
     */
    private removeQuotedReplies(text: string): { text: string; hasQuotedReply: boolean } {
        let cleaned = text;
        let hasQuotedReply = false;

        // Remove quoted reply sections
        for (const pattern of QUOTED_REPLY_PATTERNS) {
            if (pattern.test(cleaned)) {
                hasQuotedReply = true;
                cleaned = cleaned.replace(pattern, '');
            }
        }

        // Remove everything after "On ... wrote:" or "From:"
        const quoteStartPatterns = [
            /\n\nOn .+wrote:\n/i,
            /\n\nFrom: .+\n/i,
            /\n-+Original Message-+\n/i,
        ];

        for (const pattern of quoteStartPatterns) {
            const match = cleaned.match(pattern);
            if (match && match.index !== undefined) {
                hasQuotedReply = true;
                cleaned = cleaned.substring(0, match.index);
                break;
            }
        }

        return { text: cleaned.trim(), hasQuotedReply };
    }

    /**
     * Remove signatures and disclaimers
     */
    private removeSignaturesAndDisclaimers(text: string): {
        text: string;
        hasSignature: boolean;
        hasDisclaimer: boolean;
    } {
        let cleaned = text;
        let hasSignature = false;
        let hasDisclaimer = false;

        // Remove signatures
        for (const pattern of SIGNATURE_PATTERNS) {
            if (pattern.test(cleaned)) {
                hasSignature = true;
                cleaned = cleaned.replace(pattern, '');
            }
        }

        // Remove disclaimers
        for (const pattern of DISCLAIMER_PATTERNS) {
            if (pattern.test(cleaned)) {
                hasDisclaimer = true;
                cleaned = cleaned.replace(pattern, '');
            }
        }

        return { text: cleaned.trim(), hasSignature, hasDisclaimer };
    }

    /**
     * Extract structured data from text
     */
    private extractStructuredData(body: string, subject: string): ExtractedData {
        const combinedText = `${subject}\n${body}`;

        return {
            emails: Array.from(new Set(combinedText.match(EMAIL_REGEX) || [])),
            phoneNumbers: Array.from(new Set(combinedText.match(PHONE_REGEX) || [])),
            urls: Array.from(new Set(combinedText.match(URL_REGEX) || [])),
            dates: this.extractAndNormalizeDates(combinedText),
            times: Array.from(new Set(combinedText.match(TIME_REGEX) || [])),
            monetaryAmounts: this.parseMonetaryAmounts(combinedText),
            fileReferences: Array.from(new Set(combinedText.match(FILE_REGEX) || [])),
            mentions: Array.from(new Set(combinedText.match(MENTION_REGEX) || [])),
        };
    }

    /**
     * Extract and normalize dates
     */
    private extractAndNormalizeDates(text: string): Array<{ original: string; normalized: string }> {
        const dates: Array<{ original: string; normalized: string }> = [];
        const now = new Date();

        // ISO dates
        const isoDates = text.match(DATE_PATTERNS.iso) || [];
        isoDates.forEach(date => {
            dates.push({ original: date, normalized: date });
        });

        // Relative dates
        const relativeDates = text.match(DATE_PATTERNS.relativeDate) || [];
        relativeDates.forEach(relative => {
            const normalized = this.normalizeRelativeDate(relative.toLowerCase(), now);
            dates.push({ original: relative, normalized });
        });

        // EOD/COB
        const eodMatches = text.match(DATE_PATTERNS.eod) || [];
        eodMatches.forEach(eod => {
            const todayEOD = new Date(now);
            todayEOD.setHours(17, 0, 0, 0);
            dates.push({ original: eod, normalized: todayEOD.toISOString() });
        });

        return dates;
    }

    /**
     * Normalize relative date to ISO format
     */
    private normalizeRelativeDate(relative: string, baseDate: Date): string {
        const result = new Date(baseDate);

        if (relative.includes('today')) {
            // Keep today's date
        } else if (relative.includes('tomorrow')) {
            result.setDate(result.getDate() + 1);
        } else if (relative.includes('yesterday')) {
            result.setDate(result.getDate() - 1);
        } else if (relative.includes('next week')) {
            result.setDate(result.getDate() + 7);
        } else if (relative.includes('next month')) {
            result.setMonth(result.getMonth() + 1);
        } else if (relative.includes('last week')) {
            result.setDate(result.getDate() - 7);
        } else if (relative.includes('last month')) {
            result.setMonth(result.getMonth() - 1);
        }

        result.setHours(9, 0, 0, 0); // Default to 9 AM
        return result.toISOString().split('T')[0]; // Return date only
    }

    /**
     * Parse monetary amounts
     */
    private parseMonetaryAmounts(text: string): Array<{ amount: number; currency: string; original: string }> {
        const matches = text.match(MONEY_REGEX) || [];
        const amounts: Array<{ amount: number; currency: string; original: string }> = [];

        matches.forEach(match => {
            // Extract currency
            let currency = 'USD'; // Default
            if (match.includes('$')) currency = 'USD';
            else if (match.includes('€')) currency = 'EUR';
            else if (match.includes('£')) currency = 'GBP';
            else if (match.includes('¥')) currency = 'JPY';
            else if (match.includes('₹')) currency = 'INR';
            else if (match.includes('EUR')) currency = 'EUR';
            else if (match.includes('GBP')) currency = 'GBP';
            else if (match.includes('JPY')) currency = 'JPY';
            else if (match.includes('INR')) currency = 'INR';

            // Extract number
            const numStr = match.replace(/[^\d.,]/g, '');
            const amount = parseFloat(numStr.replace(/,/g, ''));

            if (!isNaN(amount)) {
                amounts.push({ amount, currency, original: match });
            }
        });

        return amounts;
    }

    /**
     * Detect language
     */
    private detectLanguage(text: string): { language: string; confidence: number } {
        const scores: Record<string, number> = {};

        for (const [lang, pattern] of Object.entries(LANGUAGE_PATTERNS)) {
            const matches = text.match(pattern) || [];
            scores[lang] = matches.length;
        }

        const maxLang = Object.entries(scores).reduce((max, [lang, score]) => 
            score > max.score ? { lang, score } : max,
            { lang: 'en', score: 0 }
        );

        const totalWords = text.split(/\s+/).length;
        const confidence = totalWords > 0 ? Math.min(maxLang.score / totalWords, 1) : 0;

        return {
            language: maxLang.lang,
            confidence,
        };
    }

    /**
     * Detect attachments
     */
    private detectAttachments(signal: Signal): boolean {
        // Check signal metadata
        if (signal.body.includes('attachment') || signal.body.includes('attached')) {
            return true;
        }

        // Check for file references
        const fileMatches = signal.body.match(FILE_REGEX);
        return fileMatches !== null && fileMatches.length > 0;
    }

    /**
     * Extract people mentions
     */
    private extractPeople(text: string): Array<{ name: string; role?: string; context: string }> {
        const people: Array<{ name: string; role?: string; context: string }> = [];
        const lines = text.split('\n');

        // Look for title + name patterns
        const titlePattern = new RegExp(`\\b(${NAME_TITLES.join('|')})\\.?\\s+([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)?)`, 'g');
        const matches = text.match(titlePattern) || [];

        matches.forEach(match => {
            const context = this.getContext(text, match);
            people.push({ name: match, context });
        });

        // Look for role mentions
        const rolePattern = new RegExp(`\\b(${ROLE_KEYWORDS.join('|')})\\b`, 'gi');
        const roleMatches = text.match(rolePattern) || [];

        roleMatches.forEach(role => {
            const context = this.getContext(text, role);
            people.push({ name: role, role, context });
        });

        return people;
    }

    /**
     * Extract dates with context
     */
    private extractDatesWithContext(text: string): Array<{ original: string; normalized: string; context: string }> {
        const dates = this.extractAndNormalizeDates(text);
        return dates.map(date => ({
            ...date,
            context: this.getContext(text, date.original),
        }));
    }

    /**
     * Extract monetary amounts with context
     */
    private extractMoneyWithContext(text: string): Array<{ amount: number; currency: string; context: string }> {
        const amounts = this.parseMonetaryAmounts(text);
        return amounts.map(amount => ({
            ...amount,
            context: this.getContext(text, amount.original),
        }));
    }

    /**
     * Extract URLs with context
     */
    private extractUrlsWithContext(text: string): Array<{ url: string; context: string }> {
        const urls = text.match(URL_REGEX) || [];
        return urls.map(url => ({
            url,
            context: this.getContext(text, url),
        }));
    }

    /**
     * Extract file references with context
     */
    private extractFileReferencesWithContext(text: string): Array<{ filename: string; context: string }> {
        const files = text.match(FILE_REGEX) || [];
        return files.map(filename => ({
            filename,
            context: this.getContext(text, filename),
        }));
    }

    /**
     * Extract action items
     */
    private extractActionItems(text: string): Array<{ text: string; priority: 'high' | 'medium' | 'low' }> {
        const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
        const actionItems: Array<{ text: string; priority: 'high' | 'medium' | 'low' }> = [];

        sentences.forEach(sentence => {
            const lowerSentence = sentence.toLowerCase();
            
            // Check if sentence contains action verbs
            const hasActionVerb = ACTION_VERBS.some(verb => lowerSentence.includes(verb));
            
            if (hasActionVerb) {
                // Determine priority based on urgency keywords
                let priority: 'high' | 'medium' | 'low' = 'medium';
                
                if (lowerSentence.includes('urgent') || lowerSentence.includes('asap') || 
                    lowerSentence.includes('immediately') || lowerSentence.includes('must')) {
                    priority = 'high';
                } else if (lowerSentence.includes('should') || lowerSentence.includes('could')) {
                    priority = 'low';
                }

                actionItems.push({ text: sentence, priority });
            }
        });

        return actionItems;
    }

    /**
     * Get context around a match (50 chars before and after)
     */
    private getContext(text: string, match: string, contextSize: number = 50): string {
        const index = text.indexOf(match);
        if (index === -1) return match;

        const start = Math.max(0, index - contextSize);
        const end = Math.min(text.length, index + match.length + contextSize);
        
        let context = text.substring(start, end);
        if (start > 0) context = '...' + context;
        if (end < text.length) context = context + '...';

        return context;
    }

    /**
     * Get empty extracted data structure
     */
    private getEmptyExtractedData(): ExtractedData {
        return {
            emails: [],
            phoneNumbers: [],
            urls: [],
            dates: [],
            times: [],
            monetaryAmounts: [],
            fileReferences: [],
            mentions: [],
        };
    }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Get singleton signal processor instance
 */
export function getSignalProcessor(): SignalProcessor {
    return SignalProcessor.getInstance();
}

/**
 * Re-export Signal type from context-builder
 */
export type { Signal } from '../reasoning/context-builder';

/**
 * Export default instance
 */
export default getSignalProcessor();
