import { NextResponse } from 'next/server';
import { listeningApi } from '@/lib/services/listening-api';
import { syncListeningItems } from '@/lib/services/social-listening';
import { crawlListeningSources } from '@/lib/services/social-listening-crawler';
import { syncWorkspaceEngagement } from '@/lib/services/engagement-sync-service';
import { logger } from '@/lib/logger';

export async function POST() {
    return listeningApi(true, async (organizationId) => {
        const errors: { stage: string; message: string }[] = [];
        let completed = 0;
        async function stage<T>(name: string, run: () => Promise<T>): Promise<T | null> {
            try {
                const result = await run();
                completed++;
                if (result && typeof result === 'object' && 'errors' in result && Array.isArray(result.errors) && result.errors.length) {
                    errors.push({ stage: name, message: `${result.errors.length} sync error(s); see stage result` });
                }
                return result;
            } catch (error) {
                logger.error({ error, organizationId, stage: name }, 'Listening sync stage failed');
                errors.push({ stage: name, message: `${name} sync failed` });
                return null;
            }
        }
        const engagement = await stage('engagement', () => syncWorkspaceEngagement(organizationId, 30));
        const crawler = await stage('crawler', () => crawlListeningSources(organizationId));
        // Ingest available data even when an upstream stage fails.
        const listening = await stage('listening', () => syncListeningItems(organizationId));
        return NextResponse.json({
            success: errors.length === 0, partial: errors.length > 0 && completed > 0,
            engagement, crawler, listening, errors,
        }, { status: completed === 0 ? 500 : 200 });
    });
}
