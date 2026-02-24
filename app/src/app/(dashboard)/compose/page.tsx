/**
 * Compose server page
 * Why: Server component to fetch the post data before rendering the client shell,
 * eliminating the slow client-side fetch on mount in edit mode.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { ComposeClient } from './compose-client';
import { handleGetPost } from '@/app/api/posts/[id]/post-handlers';

interface ComposePageProps {
    searchParams?: Promise<{ edit?: string; date?: string; platforms?: string; title?: string; text?: string; url?: string }>;
}

export default async function ComposePage(props: ComposePageProps) {
    const searchParams = await props.searchParams;
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const { edit } = searchParams || {};
    let initialPostData = null;

    if (edit) {
        try {
            // Re-use the existing handler, which returns a NextResponse
            const response = await handleGetPost({
                id: edit,
                organizationId: session.user.currentOrganizationId,
                userId: session.user.id,
                userName: session.user.name || 'Unknown',
            });
            if (response.status === 200) {
                initialPostData = await response.json();
            }
        } catch (error) {
            console.error('Failed to prefetch edit post:', error);
            // We gently ignore errors here and let the client handle missing data if it fails,
            // or the hook can show an error state
        }
    }

    // Why: We still render the client wrapper immediately. If we're not editing, it's instant.
    // If we're editing, we pass initialPostData down so it's populated on the first render.
    return (
        <ComposeClient initialPostData={initialPostData} />
    );
}
