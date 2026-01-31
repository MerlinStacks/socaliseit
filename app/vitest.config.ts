import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Vitest Configuration
 * Uses dynamic import for @vitejs/plugin-react to avoid ESM issues
 * when package.json doesn't have "type": "module"
 */
export default defineConfig(async () => {
    // Dynamic import avoids the ESM require() error
    const react = (await import('@vitejs/plugin-react')).default;

    return {
        plugins: [react()],
        test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: ['./src/test/setup.ts'],
            include: ['src/**/*.{test,spec}.{ts,tsx}'],
            exclude: ['node_modules', '.next', 'e2e'],
            coverage: {
                provider: 'v8',
                reporter: ['text', 'json', 'html'],
                include: ['src/lib/**/*.ts', 'src/components/**/*.tsx'],
                exclude: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
            },
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
    };
});
