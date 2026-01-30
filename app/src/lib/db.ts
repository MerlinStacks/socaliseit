/**
 * Prisma database client singleton
 * Prevents multiple instances in development due to hot reloading
 * Uses Prisma 7 adapter pattern for database connection
 * 
 * Uses lazy initialization to prevent build-time errors when
 * DATABASE_URL is not available (e.g., during Docker builds)
 */

import { PrismaClient } from '@/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined;
};

/**
 * Get the Prisma client instance (lazy initialization)
 * This ensures DATABASE_URL is only required at runtime, not build time
 */
function createPrismaClient(): PrismaClient {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set');
    }

    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);

    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
}

/**
 * Get the singleton Prisma client
 * Client is created on first access (true lazy initialization)
 */
function getDb(): PrismaClient {
    if (!globalForPrisma.prisma) {
        globalForPrisma.prisma = createPrismaClient();
    }
    return globalForPrisma.prisma;
}

/**
 * Singleton Prisma client - accessed via getter for lazy initialization
 * This prevents DATABASE_URL validation during build time
 */
export const db = new Proxy({} as PrismaClient, {
    get(_target, prop) {
        return Reflect.get(getDb(), prop);
    },
});

