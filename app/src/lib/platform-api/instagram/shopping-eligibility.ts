import { GRAPH_API_URL } from './constants';

/** Read-only check before dispatch; never publish an untagged fallback silently. */
export async function assertInstagramShoppingEligibility(accountId: string, accessToken: string): Promise<void> {
    const response = await fetch(`${GRAPH_API_URL}/${encodeURIComponent(accountId)}?fields=shopping_product_tag_eligibility`, {
        headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    if (!response.ok || data.error || data.shopping_product_tag_eligibility !== true) {
        throw new Error('Instagram product tagging eligibility could not be confirmed. Check your approved Business Shop and shopping permissions, or remove product tags before retrying.');
    }
}
