/**
 * Intercepting route for compose page
 * Why: When navigating from within the app (e.g. calendar, dashboard),
 * this intercepts the /compose route and renders the compose page
 * as a modal overlay on top of the current page instead of navigating away.
 * Direct URL visits still render the standalone compose/page.tsx.
 *
 * Suspense: Wrapping in Suspense ensures the modal skeleton (loading.tsx)
 * appears immediately while the server fetches post data for edits.
 */

import { Suspense } from 'react';
import ComposePage from '../../compose/page';
import ComposeInterceptLoading from './loading';

export default function ComposeInterceptPage(props: any) {
    return (
        <Suspense fallback={<ComposeInterceptLoading />}>
            <ComposePage {...props} />
        </Suspense>
    );
}
