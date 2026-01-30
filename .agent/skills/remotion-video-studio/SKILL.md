---
name: remotion-video-studio
description: Expert guide for creating programmatic videos using Remotion. Covers composition architecture, robust prop validation with Zod, dynamic rendering, and player integration in Next.js applications.
---

# Remotion Video Studio Skill

This skill empowers you to build professional-grade programmatic videos using Remotion. Use this when the user needs to create new video templates, modify existing compositions, or integrate video rendering capabilities.

## Core Capabilities

1.  **Composition Architecture**: Designing reusable, modular video components.
2.  **Prop Validation**: Using Zod to strictly type and validate video inputs.
3.  **Player Integration**: Embedding the Remotion Player for real-time previews.
4.  **Rendering Pipelines**: setting up server-side rendering logic.

## 1. Composition Architecture

All Remotion projects should follow a strict structure to keep video logic separate from application logic.

### Directory Structure
```
src/remotion/
├── Root.tsx              # Main entry point registering all compositions
├── compositions/         # Folder per composition
│   ├── MyComposition/
│   │   ├── index.tsx     # Composition main component
│   │   ├── Sequence.tsx  # Internal sequencing/timing logic
│   │   └── assets/       # Composition-specific assets
└── types/                # Shared Zod schemas
```

### Creating a New Composition

When creating a new video template:
1.  Define the Zod schema for its props.
2.  Create the React component.
3.  Register it in `Root.tsx`.

**Example: `src/remotion/compositions/WelcomeVideo/index.tsx`**
```tsx
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { z } from 'zod';
import { Title } from './Title';

export const WelcomeVideoSchema = z.object({
  username: z.string(),
  accentColor: z.string().default('#3b82f6'),
});

export const WelcomeVideo: React.FC<z.infer<typeof WelcomeVideoSchema>> = ({ username, accentColor }) => {
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill className="bg-white">
      <Sequence durationInFrames={fps * 3}>
        <Title text={`Welcome, ${username}!`} color={accentColor} />
      </Sequence>
    </AbsoluteFill>
  );
};
```

**Example: Registering in `Root.tsx`**
```tsx
import { Composition } from 'remotion';
import { WelcomeVideo, WelcomeVideoSchema } from './compositions/WelcomeVideo';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="WelcomeVideo"
        component={WelcomeVideo}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        schema={WelcomeVideoSchema}
        defaultProps={{
          username: "User",
        }}
      />
    </>
  );
};
```

## 2. Dynamic Animation Strategy

Use `spring` and `interpolate` for fluid, professional animations. Avoid hardcoded CSS keyframes where possible.

```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const scale = spring({
  frame,
  fps,
  config: { damping: 200 },
});

return <div style={{ transform: `scale(${scale})` }}>Hello</div>;
```

## 3. Deployment & Rendering

When setting up rendering endpoints (e.g., in Next.js API routes), always ensure:
1.  **Bundling**: Use `bundle` from `@remotion/bundler` to package the code.
2.  **Composition Selection**: Explicitly select the composition ID.
3.  **Input Props**: Pass validated props to the `renderMedia` function.

## Checklist for New Compositions

- [ ] Defined clear Zod schema for ALL props?
- [ ] Registered in `Root.tsx` with sensible default props?
- [ ] Used `AbsoluteFill` to ensure full coverage?
- [ ] Tested with varying text lengths (visual regression)?
- [ ] Verified smooth playback in the Remotion Player?
