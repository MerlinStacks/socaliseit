export async function downloadMediaFile(url: string, filename: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Download failed (${response.status})`);
    }

    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (contentType.includes('application/json') || contentType.startsWith('text/')) {
        throw new Error('The server did not return a media file');
    }

    const blob = await response.blob();
    if (blob.size === 0) {
        throw new Error('The downloaded media file is empty');
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}
