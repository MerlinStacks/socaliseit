import type { SebJsonSchema } from './seb-transport';

/** Object roots work across providers that reject top-level array schemas. */
export const WRITING_LIST_SCHEMA: SebJsonSchema = {
    name: 'writing_list',
    schema: { type: 'object', properties: { items: { type: 'array', items: { type: 'string' } } }, required: ['items'], additionalProperties: false },
};
export const ADVISOR_SCHEMA: SebJsonSchema = {
    name: 'analytics_advisor',
    schema: {
        type: 'object',
        properties: {
            headline: { type: 'string' }, summary: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
        },
        required: ['headline', 'summary', 'bullets', 'recommendations'], additionalProperties: false,
    },
};
