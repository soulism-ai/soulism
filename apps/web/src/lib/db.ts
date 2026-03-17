import { Pool } from 'pg';

// Using a global variable to maintain a single pool across hot reloads in Next.js development
const globalForPg = global as unknown as { pgPool: Pool };

export const pool =
  globalForPg.pgPool ||
  new Pool({
    connectionString: process.env.DB,
    ssl: {
      rejectUnauthorized: false,
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPg.pgPool = pool;
