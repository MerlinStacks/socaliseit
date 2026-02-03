/**
 * Video Project State Management
 * Zustand store for managing the entire video editor state.
 *
 * Why Zustand: Lightweight, no boilerplate, works well with React 18+
 * concurrent features and Next.js App Router.
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { useMemo } from 'react';

// ============================================================================
// TYPES
// ============================================================================

export type AspectRatioKey = 'SQUARE' | 'STORY' | 'LANDSCAPE' | 'PORTRAIT';

export interface Clip {
    id: string;
    mediaId: string;
    mediaUrl: string;
    thumbnailUrl: string | null;
    type: 'video' | 'image';
    /** Position on timeline (frame number) */
    startFrame: number;
    /** Duration on timeline (frames) */
    durationFrames: number;
    /** Trim from start of source media (frames) */
    trimStart: number;
    /** Trim from end of source media (frames) */
    trimEnd: number;
    /** Original source duration (frames) */
    sourceDurationFrames: number;
    /** Volume 0-1 (for video clips with audio) */
    volume: number;
    /** Display name */
    name: string;
}

export interface TextOverlay {
    id: string;
    text: string;
    startFrame: number;
    durationFrames: number;
    position: { x: number; y: number };
    style: {
        fontSize: number;
        fontFamily: string;
        color: string;
        backgroundColor: string | null;
        fontWeight: 'normal' | 'bold';
    };
    animation: 'none' | 'fade' | 'slide' | 'typewriter';
}

export interface AudioClip {
    id: string;
    mediaId: string;
    mediaUrl: string;
    name: string;
    startFrame: number;
    durationFrames: number;
    trimStart: number;
    volume: number;
}

export interface VideoProject {
    id: string;
    name: string;
    aspectRatio: AspectRatioKey;
    fps: number;
    clips: Clip[];
    textOverlays: TextOverlay[];
    audioClips: AudioClip[];
}

export interface VideoProjectState {
    // Project data
    project: VideoProject;

    // Editor state
    currentFrame: number;
    isPlaying: boolean;
    isLooping: boolean;
    selectedClipId: string | null;
    selectedTextId: string | null;
    selectedAudioId: string | null;
    zoom: number; // Timeline zoom level (1 = 1 frame per pixel)

    // Computed
    totalDurationFrames: number;

    // Actions - Project
    setProjectName: (name: string) => void;
    setAspectRatio: (ratio: AspectRatioKey) => void;
    resetProject: () => void;

    // Actions - Playback
    setCurrentFrame: (frame: number) => void;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    setIsLooping: (loop: boolean) => void;

    // Actions - Clips
    addClip: (clip: Omit<Clip, 'id' | 'startFrame'>) => void;
    updateClip: (id: string, updates: Partial<Clip>) => void;
    removeClip: (id: string) => void;
    moveClip: (id: string, newStartFrame: number) => void;
    selectClip: (id: string | null) => void;
    trimClipStart: (id: string, trimFrames: number) => void;
    trimClipEnd: (id: string, trimFrames: number) => void;
    /** Split a clip at a specific frame, creating two clips */
    splitClip: (id: string, splitAtFrame: number) => void;
    /** Split a clip at multiple points, removing sections between points (for silence removal) */
    splitClipAtPoints: (id: string, keepRanges: Array<{ start: number; end: number }>) => void;

    // Actions - Text
    addTextOverlay: (text: Omit<TextOverlay, 'id'>) => void;
    updateTextOverlay: (id: string, updates: Partial<TextOverlay>) => void;
    removeTextOverlay: (id: string) => void;
    selectText: (id: string | null) => void;

    // Actions - Audio
    addAudioClip: (clip: Omit<AudioClip, 'id'>) => void;
    updateAudioClip: (id: string, updates: Partial<AudioClip>) => void;
    removeAudioClip: (id: string) => void;
    selectAudioClip: (id: string | null) => void;

    // Actions - Timeline
    setZoom: (zoom: number) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

const generateId = () => Math.random().toString(36).substring(2, 9);

const calculateTotalDuration = (clips: Clip[]): number => {
    if (clips.length === 0) return 150; // Default 5 seconds at 30fps
    return Math.max(...clips.map(c => c.startFrame + c.durationFrames));
};

const createDefaultProject = (): VideoProject => ({
    id: generateId(),
    name: 'Untitled Project',
    aspectRatio: 'LANDSCAPE',
    fps: 30,
    clips: [],
    textOverlays: [],
    audioClips: [],
});

// ============================================================================
// STORE
// ============================================================================

export const useVideoProject = create<VideoProjectState>()(
    immer((set, get) => ({
        // Initial state
        project: createDefaultProject(),
        currentFrame: 0,
        isPlaying: false,
        isLooping: true,
        selectedClipId: null,
        selectedTextId: null,
        selectedAudioId: null,
        zoom: 2, // 2 pixels per frame
        totalDurationFrames: 150,

        // Project actions
        setProjectName: (name) =>
            set((state) => {
                state.project.name = name;
            }),

        setAspectRatio: (ratio) =>
            set((state) => {
                state.project.aspectRatio = ratio;
            }),

        resetProject: () =>
            set((state) => {
                state.project = createDefaultProject();
                state.currentFrame = 0;
                state.isPlaying = false;
                state.selectedClipId = null;
                state.selectedTextId = null;
                state.totalDurationFrames = 150;
            }),

        // Playback actions
        setCurrentFrame: (frame) =>
            set((state) => {
                state.currentFrame = Math.max(0, Math.min(frame, state.totalDurationFrames));
            }),

        play: () =>
            set((state) => {
                state.isPlaying = true;
            }),

        pause: () =>
            set((state) => {
                state.isPlaying = false;
            }),

        togglePlay: () =>
            set((state) => {
                state.isPlaying = !state.isPlaying;
            }),

        setIsLooping: (loop) =>
            set((state) => {
                state.isLooping = loop;
            }),

        // Clip actions
        addClip: (clipData) =>
            set((state) => {
                const clips = state.project.clips;
                // Add new clip at end of timeline
                const lastClipEnd = clips.length > 0
                    ? Math.max(...clips.map(c => c.startFrame + c.durationFrames))
                    : 0;

                const newClip: Clip = {
                    ...clipData,
                    id: generateId(),
                    startFrame: lastClipEnd,
                };

                state.project.clips.push(newClip);
                state.totalDurationFrames = calculateTotalDuration(state.project.clips);
                state.selectedClipId = newClip.id;
            }),

        updateClip: (id, updates) =>
            set((state) => {
                const index = state.project.clips.findIndex(c => c.id === id);
                if (index !== -1) {
                    Object.assign(state.project.clips[index], updates);
                    state.totalDurationFrames = calculateTotalDuration(state.project.clips);
                }
            }),

        removeClip: (id) =>
            set((state) => {
                state.project.clips = state.project.clips.filter(c => c.id !== id);
                if (state.selectedClipId === id) {
                    state.selectedClipId = null;
                }
                state.totalDurationFrames = calculateTotalDuration(state.project.clips);
            }),

        moveClip: (id, newStartFrame) =>
            set((state) => {
                const clip = state.project.clips.find(c => c.id === id);
                if (clip) {
                    clip.startFrame = Math.max(0, newStartFrame);
                    state.totalDurationFrames = calculateTotalDuration(state.project.clips);
                }
            }),

        selectClip: (id) =>
            set((state) => {
                state.selectedClipId = id;
                state.selectedTextId = null; // Deselect text when selecting clip
            }),

        trimClipStart: (id, trimFrames) =>
            set((state) => {
                const clip = state.project.clips.find(c => c.id === id);
                if (clip) {
                    const maxTrim = clip.sourceDurationFrames - clip.trimEnd - 30; // Min 1 second
                    clip.trimStart = Math.max(0, Math.min(trimFrames, maxTrim));
                    clip.durationFrames = clip.sourceDurationFrames - clip.trimStart - clip.trimEnd;
                    state.totalDurationFrames = calculateTotalDuration(state.project.clips);
                }
            }),

        trimClipEnd: (id, trimFrames) =>
            set((state) => {
                const clip = state.project.clips.find(c => c.id === id);
                if (clip) {
                    const maxTrim = clip.sourceDurationFrames - clip.trimStart - 30; // Min 1 second
                    clip.trimEnd = Math.max(0, Math.min(trimFrames, maxTrim));
                    clip.durationFrames = clip.sourceDurationFrames - clip.trimStart - clip.trimEnd;
                    state.totalDurationFrames = calculateTotalDuration(state.project.clips);
                }
            }),

        /**
         * Split a clip at a specific frame, creating two clips.
         * The splitAtFrame is relative to the clip's startFrame.
         */
        splitClip: (id, splitAtFrame) =>
            set((state) => {
                const clipIndex = state.project.clips.findIndex(c => c.id === id);
                if (clipIndex === -1) return;

                const clip = state.project.clips[clipIndex];
                const relativeFrame = splitAtFrame - clip.startFrame;

                // Validate split point is within clip
                if (relativeFrame <= 0 || relativeFrame >= clip.durationFrames) return;

                // Calculate the split point in source media
                const splitInSource = clip.trimStart + relativeFrame;

                // First clip: from original start to split point
                const clip1: Clip = {
                    ...clip,
                    id: generateId(),
                    durationFrames: relativeFrame,
                    trimEnd: clip.sourceDurationFrames - splitInSource,
                };

                // Second clip: from split point to original end
                const clip2: Clip = {
                    ...clip,
                    id: generateId(),
                    startFrame: clip.startFrame + relativeFrame,
                    durationFrames: clip.durationFrames - relativeFrame,
                    trimStart: splitInSource,
                };

                // Replace original clip with two new clips
                state.project.clips.splice(clipIndex, 1, clip1, clip2);
                state.totalDurationFrames = calculateTotalDuration(state.project.clips);
                state.selectedClipId = clip2.id;
            }),

        /**
         * Split a clip at multiple points, keeping only specified ranges.
         * Used for silence removal - keepRanges are in absolute frame positions.
         */
        splitClipAtPoints: (id, keepRanges) =>
            set((state) => {
                const clipIndex = state.project.clips.findIndex(c => c.id === id);
                if (clipIndex === -1 || keepRanges.length === 0) return;

                const clip = state.project.clips[clipIndex];
                const newClips: Clip[] = [];
                let timelinePosition = clip.startFrame;

                for (const range of keepRanges) {
                    // Convert absolute frame to relative-to-clip frame
                    const relStart = Math.max(0, range.start - clip.startFrame);
                    const relEnd = Math.min(clip.durationFrames, range.end - clip.startFrame);

                    if (relEnd <= relStart) continue;

                    // Calculate source trim points
                    const newTrimStart = clip.trimStart + relStart;
                    const newTrimEnd = clip.sourceDurationFrames - (clip.trimStart + relEnd);

                    newClips.push({
                        ...clip,
                        id: generateId(),
                        startFrame: timelinePosition,
                        durationFrames: relEnd - relStart,
                        trimStart: newTrimStart,
                        trimEnd: newTrimEnd,
                    });

                    timelinePosition += (relEnd - relStart);
                }

                if (newClips.length > 0) {
                    // Replace original clip with new clips
                    state.project.clips.splice(clipIndex, 1, ...newClips);
                    state.totalDurationFrames = calculateTotalDuration(state.project.clips);
                    state.selectedClipId = newClips[0].id;
                }
            }),

        // Text overlay actions
        addTextOverlay: (textData) =>
            set((state) => {
                const newText: TextOverlay = {
                    ...textData,
                    id: generateId(),
                };
                state.project.textOverlays.push(newText);
                state.selectedTextId = newText.id;
                state.selectedClipId = null;
            }),

        updateTextOverlay: (id, updates) =>
            set((state) => {
                const index = state.project.textOverlays.findIndex(t => t.id === id);
                if (index !== -1) {
                    Object.assign(state.project.textOverlays[index], updates);
                }
            }),

        removeTextOverlay: (id) =>
            set((state) => {
                state.project.textOverlays = state.project.textOverlays.filter(t => t.id !== id);
                if (state.selectedTextId === id) {
                    state.selectedTextId = null;
                }
            }),

        selectText: (id) =>
            set((state) => {
                state.selectedTextId = id;
                state.selectedClipId = null;
                state.selectedAudioId = null;
            }),

        // Actions - Audio
        addAudioClip: (clipData) =>
            set((state) => {
                const newClip: AudioClip = {
                    ...clipData,
                    id: generateId(),
                };
                state.project.audioClips.push(newClip);
                state.selectedAudioId = newClip.id;
                state.selectedClipId = null;
                state.selectedTextId = null;
            }),

        updateAudioClip: (id, updates) =>
            set((state) => {
                const index = state.project.audioClips.findIndex(c => c.id === id);
                if (index !== -1) {
                    Object.assign(state.project.audioClips[index], updates);
                }
            }),

        removeAudioClip: (id) =>
            set((state) => {
                state.project.audioClips = state.project.audioClips.filter(c => c.id !== id);
                if (state.selectedAudioId === id) {
                    state.selectedAudioId = null;
                }
            }),

        selectAudioClip: (id) =>
            set((state) => {
                state.selectedAudioId = id;
                state.selectedClipId = null;
                state.selectedTextId = null;
            }),

        // Timeline actions
        setZoom: (zoom) =>
            set((state) => {
                state.zoom = Math.max(0.5, Math.min(10, zoom));
            }),
    }))
);

/**
 * Selector for getting the currently selected clip
 */
export const useSelectedClip = () => {
    return useVideoProject((state) => {
        if (!state.selectedClipId) return null;
        return state.project.clips.find(c => c.id === state.selectedClipId) ?? null;
    });
};

/**
 * Selector for getting clips sorted by start frame
 * Why useMemo: The Zustand selector returns the clips array reference (stable from Immer).
 * We memoize the sort operation to avoid creating new arrays on every render.
 */
export const useSortedClips = () => {
    const clips = useVideoProject((state) => state.project.clips);
    return useMemo(
        () => [...clips].sort((a, b) => a.startFrame - b.startFrame),
        [clips]
    );
};
