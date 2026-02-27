/**
 * Compose server page
 * Why: Thin shell that renders instantly. In edit mode, the data fetch
 * runs inside a Suspense boundary so the compose UI appears immediately
 * while post data streams in.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ComposeClient } from './compose-client';
import { handleGetPost } from '@/app/api/posts/[id]/post-handlers';
import { Loader2 } from 'lucide-react';

interface ComposePageProps {
    searchParams?: Promise<{ edit?: string; date?: string; platforms?: string; title?: string; text?: string; url?: string }>;
}

/**
 * Why: Loading state shown while edit-mode post data is fetched server-side.
 * The compose UI skeleton appears instantly instead of the page hanging.
 */
function ComposeLoadingFallback() {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative flex h-[90vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-[var(--bg-primary)] shadow-2xl">
                <div className="flex flex-1 items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                        <p className="text-sm text-[var(--text-muted)]">Loading post...</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Server component that fetches edit-mode post data.
 * Wrapped in Suspense so ComposeClient renders its shell instantly.
 */
async function ComposeWithData({
    edit,
    organizationId,
    userId,
    userName,
}: {
    edit: string;
    organizationId: string;
    userId: string;
    userName: string;
}) {
    let initialPostData = null;

    try {
        const response = await handleGetPost({
            id: edit,
            organizationId,
            userId,
            userName,
        });
        if (response.status === 200) {
            initialPostData = await response.json();
        }
    } catch (error) {
        console.error('Failed to prefetch edit post:', error);
    }

    return <ComposeClient initialPostData={initialPostData} />;
}

export default async function ComposePage(props: ComposePageProps) {
    const searchParams = await props.searchParams;
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const { edit } = searchParams || {};

    // New post mode: render instantly (no data to fetch)
    if (!edit) {
        return <ComposeClient initialPostData={null} />;
    }

    // Edit mode: wrap data fetch in Suspense so the UI streams in
    return (
        <Suspense fallback={<ComposeLoadingFallback />}>
            <ComposeWithData
                edit={edit}
                organizationId={session.user.currentOrganizationId}
                userId={session.user.id}
                userName={session.user.name || 'Unknown'}
            />
        </Suspense>
    );
}
