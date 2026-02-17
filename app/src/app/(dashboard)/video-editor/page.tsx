'use client';

/**
 * Video Editor Page (dynamic wrapper)
 * Why: Wraps the heavy video editor client behind next/dynamic so that
 * @remotion/player and its dependencies are only downloaded when the
 * user navigates to /video-editor, not during initial app load.
 */

import dynamic from 'next/dynamic';
import VideoEditorLoading from './loading';

const VideoEditorClient = dynamic(
    () => import('./video-editor-client'),
    { ssr: false, loading: () => <VideoEditorLoading /> }
);

export default function VideoEditorPage() {
    return <VideoEditorClient />;
}
