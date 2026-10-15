// Applies db/schema.sql (idempotent). Usage: DATABASE_URL=... npm run db:migrate
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { query } from '../lib/db.js';

const sql = readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8')
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// The Neon HTTP driver runs one statement per request, so apply them one by one.
for (const stmt of sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean)) {
  await query(stmt);
}
console.log('Schema applied.');
process.exit(0);
