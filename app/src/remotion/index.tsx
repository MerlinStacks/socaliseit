/**
 * Remotion Composition Registry
 * Root entry point for all video templates available in the editor.
 * 
 * Why this exists: Remotion requires a central registry of compositions
 * that can be bundled for server-side rendering.
 */
import { Composition } from 'remotion';
import { SocialPost, socialPostSchema } from './compositions/SocialPost';
import { VideoSlideshow, slideshowSchema } from './compositions/VideoSlideshow';
import { EditedVideo, editedVideoSchema } from './compositions/EditedVideo';

/**
 * Available aspect ratio presets for social media
 */
export const ASPECT_RATIOS = {
    SQUARE: { width: 1080, height: 1080, label: 'Square (1:1)' },
    STORY: { width: 1080, height: 1920, label: 'Story (9:16)' },
    LANDSCAPE: { width: 1920, height: 1080, label: 'Landscape (16:9)' },
    PORTRAIT: { width: 1080, height: 1350, label: 'Portrait (4:5)' },
} as const;

export const RemotionRoot: React.FC = () => {
    return (
        <>
            {/* Social Post Template - Text overlays, images, animations */}
            <Composition
                id="SocialPost"
                component={SocialPost}
                durationInFrames={150}
                fps={30}
                width={1080}
                height={1080}
                schema={socialPostSchema}
                defaultProps={{
                    title: 'Your Title Here',
                    subtitle: '',
                    backgroundColor: '#1a1a2e',
                    textColor: '#ffffff',
                    accentColor: '#e94560',
                    mediaUrl: null,
                    animationStyle: 'fade',
                }}
            />

            {/* Video Slideshow Template - Photo/video montage with transitions */}
            <Composition
                id="VideoSlideshow"
                component={VideoSlideshow}
                durationInFrames={300}
                fps={30}
                width={1920}
                height={1080}
                schema={slideshowSchema}
                defaultProps={{
                    slides: [],
                    transitionDuration: 30,
                    transitionStyle: 'crossfade',
                    backgroundColor: '#000000',
                }}
            />

            {/* Edited Video - User-created video compositions */}
            <Composition
                id="EditedVideo"
                component={EditedVideo}
                durationInFrames={300}
                fps={30}
                width={1920}
                height={1080}
                schema={editedVideoSchema}
                defaultProps={{
                    clips: [],
                    textOverlays: [],
                    backgroundColor: '#000000',
                }}
                calculateMetadata={({ props }) => {
                    // Dynamic duration based on clips
                    const maxFrame = props.clips.reduce(
                        (max, clip) => Math.max(max, clip.startFrame + clip.durationFrames),
                        150 // Minimum 5 seconds
                    );
                    return { durationInFrames: maxFrame };
                }}
            />
        </>
    );
};
