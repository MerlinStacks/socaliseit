---
name: media-processing-patterns
description: FFmpeg, Sharp, video transcoding, and thumbnail generation for media libraries.
---

# Media Processing Patterns

## Image Processing with Sharp

```typescript
import sharp from 'sharp';

// Resize and optimize images
export async function processImage(
  input: Buffer,
  options: { width?: number; height?: number; quality?: number }
): Promise<Buffer> {
  return sharp(input)
    .resize(options.width, options.height, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: options.quality || 80 })
    .toBuffer();
}

// Generate thumbnail
export async function generateThumbnail(input: Buffer, size = 200): Promise<Buffer> {
  return sharp(input)
    .resize(size, size, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 70 })
    .toBuffer();
}

// Generate blur hash placeholder
export async function generateBlurDataURL(input: Buffer): Promise<string> {
  const { data, info } = await sharp(input)
    .resize(10, 10, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true });
  
  return `data:image/${info.format};base64,${data.toString('base64')}`;
}

// Extract metadata
export async function getImageMetadata(input: Buffer) {
  const metadata = await sharp(input).metadata();
  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    size: input.length,
  };
}
```

## Video Processing with FFmpeg

```typescript
import { spawn } from 'child_process';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

// Get video metadata
export async function getVideoMetadata(filePath: string) {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
  );
  return JSON.parse(stdout);
}

// Generate video thumbnail
export async function generateVideoThumbnail(
  inputPath: string,
  outputPath: string,
  timestamp = '00:00:01'
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-ss', timestamp,
      '-vframes', '1',
      '-vf', 'scale=400:-1',
      '-y',
      outputPath,
    ]);
    ffmpeg.on('close', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with ${code}`)));
  });
}

// Transcode video for web
export async function transcodeForWeb(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inputPath,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ]);
    ffmpeg.on('close', (code) => code === 0 ? resolve() : reject());
  });
}
```

## Upload Processing Pipeline

```typescript
// app/api/media/route.ts
export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const buffer = Buffer.from(await file.arrayBuffer());
  
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  
  let processed: ProcessedMedia;
  
  if (isImage) {
    const [optimized, thumbnail, blurHash] = await Promise.all([
      processImage(buffer, { width: 1920, quality: 85 }),
      generateThumbnail(buffer),
      generateBlurDataURL(buffer),
    ]);
    
    processed = { type: 'image', optimized, thumbnail, blurHash };
  } else if (isVideo) {
    // Save to temp, process, upload
    const tempPath = `/tmp/${crypto.randomUUID()}`;
    await fs.writeFile(tempPath, buffer);
    
    const thumbnailPath = `${tempPath}_thumb.jpg`;
    await generateVideoThumbnail(tempPath, thumbnailPath);
    
    processed = { type: 'video', thumbnail: await fs.readFile(thumbnailPath) };
    await fs.unlink(tempPath);
    await fs.unlink(thumbnailPath);
  }
  
  // Upload to storage
  const urls = await uploadToStorage(processed);
  return Response.json(urls);
}
```

## Docker Setup for FFmpeg

```dockerfile
FROM node:20-slim

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm ci
CMD ["npm", "start"]
```
