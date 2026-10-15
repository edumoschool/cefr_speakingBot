import { neon } from '@neondatabase/serverless';
import pg from 'pg';
import { env } from './env.js';

type Row = Record<string, any>;
type QueryFn = (text: string, params?: unknown[]) => Promise<Row[]>;

let queryFn: QueryFn | undefined;

/**
 * Neon URLs go over Neon's HTTP driver (no connection to keep warm between
 * serverless invocations); any other Postgres URL uses a small `pg` pool.
 */
function client(): QueryFn {
  if (queryFn) return queryFn;
  const url = env.databaseUrl;
  if (/\.neon\.tech/.test(url) && !process.env.DB_FORCE_PG) {
    const sql = neon(url);
    queryFn = (text, params = []) => sql.query(text, params) as Promise<Row[]>;
  } else {
    const pool = new pg.Pool({ connectionString: url, max: 3 });
    queryFn = async (text, params = []) => (await pool.query(text, params as any[])).rows;
  }
  return queryFn;
}

export function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return client()(text, params) as Promise<T[]>;
}

export async function one<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}
