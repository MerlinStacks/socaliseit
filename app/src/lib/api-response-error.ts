/** Read API errors without losing field-level validation details or failing on HTML responses. */
export async function readApiError(response: Response, fallback: string): Promise<string> {
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') return fallback;
    if (typeof data.message === 'string' && data.message) return data.message;

    const messages: string[] = [];
    if (Array.isArray(data.details?.formErrors)) {
        messages.push(...data.details.formErrors.filter((value: unknown) => typeof value === 'string'));
    }
    if (data.details?.fieldErrors && typeof data.details.fieldErrors === 'object') {
        for (const [field, errors] of Object.entries(data.details.fieldErrors)) {
            if (Array.isArray(errors)) {
                messages.push(...errors.filter((value: unknown) => typeof value === 'string').map((value: string) => `${field}: ${value}`));
            }
        }
    }
    if (messages.length) return messages.join('; ');
    return typeof data.error === 'string' && data.error ? data.error : fallback;
}
