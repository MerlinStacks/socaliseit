import { GRAPH_API_URL } from './constants';
import { metaFetch } from './meta-fetch';
import { logger } from '@/lib/logger';

const DEFAULT_AD_COUNTRIES = ['GB'];
const MAX_TERMS = 8;
const MAX_ADS_PER_TERM = 12;

export interface MetaAdLibraryAd {
    id: string;
    pageId?: string;
    pageName?: string;
    snapshotUrl?: string;
    creativeBodies: string[];
    creativeTitles: string[];
    creativeDescriptions: string[];
    creativeCaptions: string[];
    publisherPlatforms: string[];
    createdAt?: string;
    deliveryStart?: string;
    deliveryStop?: string | null;
}

export interface MetaAdLibraryTermResult {
    term: string;
    ads: MetaAdLibraryAd[];
    error?: string;
}

export interface MetaAdLibraryInsights {
    available: boolean;
    countries: string[];
    generatedAt: string;
    totalActiveAds: number;
    searches: MetaAdLibraryTermResult[];
    unavailableReason?: string;
}

type MetaAdArchiveResponse = {
    data?: Array<Record<string, unknown>>;
    error?: { message?: string; code?: number; error_subcode?: number };
};

export function getMetaAdLibraryFallbackAccessToken() {
    return process.env.META_AD_LIBRARY_ACCESS_TOKEN || process.env.FACEBOOK_AD_LIBRARY_ACCESS_TOKEN || '';
}

export function getMetaAdLibraryCountries() {
    const raw = process.env.META_AD_LIBRARY_COUNTRIES || '';
    const countries = raw
        .split(',')
        .map((country) => country.trim().toUpperCase())
        .filter(Boolean);

    return countries.length > 0 ? countries : DEFAULT_AD_COUNTRIES;
}

export async function fetchMetaAdLibraryInsights(searchTerms: string[], accessToken = getMetaAdLibraryFallbackAccessToken()): Promise<MetaAdLibraryInsights> {
    const countries = getMetaAdLibraryCountries();
    const terms = normalizeTerms(searchTerms).slice(0, MAX_TERMS);

    if (!accessToken) {
        return {
            available: false,
            countries,
            generatedAt: new Date().toISOString(),
            totalActiveAds: 0,
            searches: [],
            unavailableReason: 'No connected Meta account token or META_AD_LIBRARY_ACCESS_TOKEN is available.',
        };
    }

    if (terms.length === 0) {
        return {
            available: false,
            countries,
            generatedAt: new Date().toISOString(),
            totalActiveAds: 0,
            searches: [],
            unavailableReason: 'No competitor names available for Ad Library search.',
        };
    }

    const searches = await Promise.all(terms.map((term) => fetchAdsForTerm(accessToken, term, countries)));

    return {
        available: true,
        countries,
        generatedAt: new Date().toISOString(),
        totalActiveAds: searches.reduce((total, result) => total + result.ads.length, 0),
        searches,
    };
}

async function fetchAdsForTerm(accessToken: string, term: string, countries: string[]): Promise<MetaAdLibraryTermResult> {
    const params = new URLSearchParams({
        ad_active_status: 'ACTIVE',
        ad_reached_countries: JSON.stringify(countries),
        ad_type: 'ALL',
        fields: [
            'id',
            'page_id',
            'page_name',
            'ad_creation_time',
            'ad_creative_bodies',
            'ad_creative_link_captions',
            'ad_creative_link_descriptions',
            'ad_creative_link_titles',
            'ad_delivery_start_time',
            'ad_delivery_stop_time',
            'ad_snapshot_url',
            'publisher_platforms',
        ].join(','),
        limit: String(MAX_ADS_PER_TERM),
        search_terms: term,
    });

    try {
        const response = await metaFetch(accessToken, `${GRAPH_API_URL}/ads_archive?${params.toString()}`, {
            signal: AbortSignal.timeout(15_000),
        });
        const data = await response.json() as MetaAdArchiveResponse;

        if (data.error) {
            const error = data.error.message || 'Meta Ad Library request failed.';
            logger.warn({ term, code: data.error.code, subcode: data.error.error_subcode }, 'Meta Ad Library search failed');
            return { term, ads: [], error };
        }

        return { term, ads: (data.data || []).map(mapArchiveAd) };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn({ term, err: error }, 'Meta Ad Library search errored');
        return { term, ads: [], error: message };
    }
}

function mapArchiveAd(ad: Record<string, unknown>): MetaAdLibraryAd {
    return {
        id: String(ad.id || ''),
        pageId: stringValue(ad.page_id),
        pageName: stringValue(ad.page_name),
        snapshotUrl: stringValue(ad.ad_snapshot_url),
        creativeBodies: stringArray(ad.ad_creative_bodies),
        creativeTitles: stringArray(ad.ad_creative_link_titles),
        creativeDescriptions: stringArray(ad.ad_creative_link_descriptions),
        creativeCaptions: stringArray(ad.ad_creative_link_captions),
        publisherPlatforms: stringArray(ad.publisher_platforms),
        createdAt: stringValue(ad.ad_creation_time),
        deliveryStart: stringValue(ad.ad_delivery_start_time),
        deliveryStop: stringValue(ad.ad_delivery_stop_time),
    };
}

function normalizeTerms(terms: string[]) {
    return Array.from(new Set(terms
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
        .map((term) => term.slice(0, 80))));
}

function stringValue(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
