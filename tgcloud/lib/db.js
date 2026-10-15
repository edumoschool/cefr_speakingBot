import { db } from 'sdk';

/**
 * Runs a write with a RETURNING clause and returns its rows. Writes go through
 * db.run (db.all is for reads); the run result carries RETURNING rows in `.rows`.
 */
export async function returning(query) {
  const res = await db.run(query);
  return res?.rows ?? [];
}
