/**
 * Prisma configuration for Prisma 7+
 * Database URL is configured here for CLI commands
 */

import path from 'node:path';
import type { PrismaConfig } from 'prisma';

// Load environment variables
import 'dotenv/config';

const config: PrismaConfig = {
    schema: path.join(__dirname, 'prisma', 'schema.prisma'),
    datasource: {
        url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/socialiseit',
    },
};

export default config;
