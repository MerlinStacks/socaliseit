// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { processSocialListeningCrawler } from '@/workers/social-listening-crawler-worker';
import { crawlListeningSources } from '@/lib/services/social-listening-crawler';
import { syncListeningItems } from '@/lib/services/social-listening';
import { flushListeningAlerts } from '@/lib/services/listening-alerts';

const log = vi.hoisted(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/bullmq/connection', () => ({ getBullMQConnection: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createJobLogger: () => log }));
vi.mock('@/lib/services/social-listening-crawler', () => ({ crawlListeningSources: vi.fn() }));
vi.mock('@/lib/services/social-listening', () => ({ syncListeningItems: vi.fn() }));
vi.mock('@/lib/services/listening-alerts', () => ({ flushListeningAlerts: vi.fn(async () => ({ notifications: 0 })) }));

const job = { id: 'job-1', data: { organizationId: 'org-1' } } as Job<{ organizationId: string }>;

describe('processSocialListeningCrawler', () => {
    beforeEach(() => vi.clearAllMocks());

    it('logs a zero-source and zero-monitor run as a quiet no-op', async () => {
        vi.mocked(crawlListeningSources).mockResolvedValue({ sources: 0, documents: 0, matched: 0, errors: [] });
        vi.mocked(syncListeningItems).mockResolvedValue({ synced: 0, monitors: 0 });

        await processSocialListeningCrawler(job);
        expect(flushListeningAlerts).toHaveBeenCalledWith('org-1');

        expect(log.debug).toHaveBeenCalledWith(
            { organizationId: 'org-1' },
            'Social listening crawler skipped: no sources or monitors'
        );
        expect(log.info).not.toHaveBeenCalled();
    });

    it('reports source errors as a partial completion', async () => {
        vi.mocked(crawlListeningSources).mockResolvedValue({
            sources: 2, documents: 1, matched: 0, errors: ['Feed: HTTP 500'],
        });
        vi.mocked(syncListeningItems).mockResolvedValue({ synced: 0, monitors: 1 });

        await processSocialListeningCrawler(job);

        expect(log.warn).toHaveBeenCalledWith(
            expect.objectContaining({ errorCount: 1, errors: ['Feed: HTTP 500'] }),
            'Social listening crawler completed with errors'
        );
    });
    it('flushes pending alerts even when ingestion fails and exposes failure', async () => {
        vi.mocked(crawlListeningSources).mockRejectedValueOnce(new Error('crawl failed'));
        await expect(processSocialListeningCrawler(job)).rejects.toThrow('crawl failed');
        expect(flushListeningAlerts).toHaveBeenCalledWith('org-1');
    });
    it('exposes alert delivery failure for worker retry', async () => {
        vi.mocked(flushListeningAlerts).mockRejectedValueOnce(new Error('transaction failed'));
        await expect(processSocialListeningCrawler(job)).rejects.toThrow('transaction failed');
    });
});
