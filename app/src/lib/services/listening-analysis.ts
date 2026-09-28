/** Deterministic, Unicode-aware relevance shared by both ingestion paths. */
export function normalizeListeningText(value: string): string {
    return value.normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

export function normalizeTerms(terms: string[]): string[] {
    return [...new Set(terms.map(normalizeListeningText).filter(Boolean))];
}

function phrasePattern(term: string): RegExp {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu');
}

export function matchTerms(content: string, keywords: string[], excludedTerms: string[], mode = 'phrase'): string[] {
    const text = normalizeListeningText(content);
    const matches = (term: string) => mode === 'substring' ? text.includes(term) : phrasePattern(term).test(text);
    if (normalizeTerms(excludedTerms).some(matches)) return [];
    return normalizeTerms(keywords).filter(matches);
}

const POSITIVE = ['love', 'great', 'amazing', 'excellent', 'happy', 'best', 'recommend', 'perfect', 'thanks', 'thank you'];
const NEGATIVE = ['hate', 'bad', 'awful', 'terrible', 'angry', 'broken', 'issue', 'problem', 'refund', 'disappointed'];

export function analyzeListeningContent(content: string) {
    const text = normalizeListeningText(content);
    // Suppress a locally negated signal rather than guessing opposite polarity.
    const hasSignal = (terms: string[]) => terms.some((term) => [...text.matchAll(phrasePattern(term))].some((match) => {
        const prefix = text.slice(0, match.index);
        return !/(?:\b(?:not|no|never|without)|\b\w+n['’]t)\s+(?:(?:very|really|so|a|an|any)\s+){0,2}$/u.test(prefix);
    }));
    const positive = hasSignal(POSITIVE);
    const negative = hasSignal(NEGATIVE);
    const sentiment: 'positive' | 'neutral' | 'negative' = positive === negative ? 'neutral' : positive ? 'positive' : 'negative';
    return { sentiment, isQuestion: text.includes('?') };
}
