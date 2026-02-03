---
name: canvas-image-editing
description: Master Canvas API, Konva.js, and image manipulation for building interactive image editors and designers. Use when implementing visual editors, image filters, or layered graphics.
---

# Canvas & Image Editing Patterns

Expert guide for building interactive image editors with HTML5 Canvas and Konva.js.

## When to Use This Skill

- Building image/design editors
- Implementing photo filters and effects
- Creating layered graphics systems
- Building signature or drawing tools
- Implementing undo/redo for canvas

## Konva.js React Setup

```bash
npm install konva react-konva
```

```typescript
// components/canvas-editor.tsx
import { Stage, Layer, Image, Rect, Text, Transformer } from 'react-konva';
import { useRef, useState, useEffect } from 'react';
import Konva from 'konva';

interface CanvasElement {
  id: string;
  type: 'image' | 'text' | 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
}

export function CanvasEditor({ width, height }: { width: number; height: number }) {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const stageRef = useRef<Konva.Stage>(null);

  // Update transformer when selection changes
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    
    const node = stageRef.current.findOne(`#${selectedId}`);
    if (node) {
      transformerRef.current.nodes([node]);
      transformerRef.current.getLayer()?.batchDraw();
    } else {
      transformerRef.current.nodes([]);
    }
  }, [selectedId]);

  const handleSelect = (id: string) => setSelectedId(id);
  const handleDeselect = () => setSelectedId(null);

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) handleDeselect();
      }}
    >
      <Layer>
        {elements.map((el) => (
          <CanvasNode
            key={el.id}
            element={el}
            isSelected={el.id === selectedId}
            onSelect={() => handleSelect(el.id)}
            onChange={(newProps) => {
              setElements((prev) =>
                prev.map((e) => (e.id === el.id ? { ...e, ...newProps } : e))
              );
            }}
          />
        ))}
        <Transformer ref={transformerRef} />
      </Layer>
    </Stage>
  );
}
```

## Draggable & Resizable Elements

```typescript
// components/canvas-node.tsx
import { Image, Text, Rect } from 'react-konva';
import useImage from 'use-image';

interface Props {
  element: CanvasElement;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (props: Partial<CanvasElement>) => void;
}

export function CanvasNode({ element, isSelected, onSelect, onChange }: Props) {
  const shapeRef = useRef<Konva.Shape>(null);

  const commonProps = {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onChange({ x: e.target.x(), y: e.target.y() });
    },
    onTransformEnd: () => {
      const node = shapeRef.current;
      if (!node) return;
      
      const scaleX = node.scaleX();
      const scaleY = node.scaleY();
      
      node.scaleX(1);
      node.scaleY(1);
      
      onChange({
        x: node.x(),
        y: node.y(),
        width: Math.max(5, node.width() * scaleX),
        height: Math.max(5, node.height() * scaleY),
      });
    },
  };

  if (element.type === 'text') {
    return <Text ref={shapeRef} {...commonProps} text={element.props.text as string} />;
  }

  if (element.type === 'image') {
    const [image] = useImage(element.props.src as string);
    return <Image ref={shapeRef} {...commonProps} image={image} />;
  }

  return <Rect ref={shapeRef} {...commonProps} fill={element.props.fill as string} />;
}
```

## Image Filters

```typescript
// lib/canvas/filters.ts
import Konva from 'konva';

export function applyBrightness(node: Konva.Image, value: number) {
  node.cache();
  node.filters([Konva.Filters.Brighten]);
  node.brightness(value); // -1 to 1
}

export function applyBlur(node: Konva.Image, value: number) {
  node.cache();
  node.filters([Konva.Filters.Blur]);
  node.blurRadius(value);
}

export function applyGrayscale(node: Konva.Image) {
  node.cache();
  node.filters([Konva.Filters.Grayscale]);
}

// Combine multiple filters
export function applyFilters(
  node: Konva.Image,
  filters: { brightness?: number; blur?: number; grayscale?: boolean }
) {
  const activeFilters: Konva.Filter[] = [];
  
  node.cache();
  
  if (filters.brightness !== undefined) {
    activeFilters.push(Konva.Filters.Brighten);
    node.brightness(filters.brightness);
  }
  if (filters.blur !== undefined) {
    activeFilters.push(Konva.Filters.Blur);
    node.blurRadius(filters.blur);
  }
  if (filters.grayscale) {
    activeFilters.push(Konva.Filters.Grayscale);
  }
  
  node.filters(activeFilters);
}
```

## Undo/Redo System

```typescript
// hooks/use-canvas-history.ts
import { useState, useCallback } from 'react';

export function useCanvasHistory<T>(initialState: T) {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [index, setIndex] = useState(0);

  const current = history[index];
  const canUndo = index > 0;
  const canRedo = index < history.length - 1;

  const push = useCallback((state: T) => {
    setHistory((prev) => [...prev.slice(0, index + 1), state]);
    setIndex((prev) => prev + 1);
  }, [index]);

  const undo = useCallback(() => {
    if (canUndo) setIndex((prev) => prev - 1);
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) setIndex((prev) => prev + 1);
  }, [canRedo]);

  return { current, push, undo, redo, canUndo, canRedo };
}

// Usage
const { current: elements, push, undo, redo } = useCanvasHistory<CanvasElement[]>([]);

const updateElements = (newElements: CanvasElement[]) => {
  push(newElements);
};
```

## Export to Image

```typescript
// lib/canvas/export.ts
import Konva from 'konva';

export function exportToPNG(stage: Konva.Stage): string {
  return stage.toDataURL({ pixelRatio: 2 });
}

export function exportToBlob(stage: Konva.Stage): Promise<Blob> {
  return new Promise((resolve) => {
    stage.toBlob({
      callback: (blob) => resolve(blob!),
      mimeType: 'image/png',
      pixelRatio: 2,
    });
  });
}

export async function downloadImage(stage: Konva.Stage, filename: string) {
  const dataUrl = exportToPNG(stage);
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}
```

## Layer Management

```typescript
// hooks/use-layers.ts
export function useLayers() {
  const [layers, setLayers] = useState<CanvasElement[]>([]);

  const moveUp = (id: string) => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index < prev.length - 1) {
        const updated = [...prev];
        [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
        return updated;
      }
      return prev;
    });
  };

  const moveDown = (id: string) => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      if (index > 0) {
        const updated = [...prev];
        [updated[index], updated[index - 1]] = [updated[index - 1], updated[index]];
        return updated;
      }
      return prev;
    });
  };

  const bringToFront = (id: string) => {
    setLayers((prev) => {
      const item = prev.find((l) => l.id === id);
      if (!item) return prev;
      return [...prev.filter((l) => l.id !== id), item];
    });
  };

  return { layers, setLayers, moveUp, moveDown, bringToFront };
}
```

## Best Practices

1. **Use caching** - Call `node.cache()` before applying filters
2. **Batch draws** - Use `layer.batchDraw()` for multiple changes
3. **Limit history** - Cap undo stack to prevent memory issues
4. **Export at 2x** - Use `pixelRatio: 2` for retina quality
5. **Debounce changes** - Don't save history on every drag frame
