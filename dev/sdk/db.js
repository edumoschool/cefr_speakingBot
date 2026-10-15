// Local stand-in for the platform's `sdk/db`, backed by node:sqlite. It covers
// the parts this project uses: the schema DSL (to create tables) and the raw
// db.run/all/get/values methods with the `sql` tag. Not a full implementation.
import { DatabaseSync } from 'node:sqlite';

// ---- sql tag
class Sql {
  constructor(strings, values) { this.strings = strings; this.values = values; }
}
export function sql(strings, ...values) { return new Sql(strings, values); }
sql.raw = (s) => new Sql([s], []);

function compile(q, params = []) {
  let text = '';
  q.strings.forEach((s, i) => {
    text += s;
    if (i < q.values.length) {
      const v = q.values[i];
      if (v instanceof Sql) text += compile(v, params);
      else if (v && v.__column) text += `"${v.name}"`;
      else { params.push(v); text += '?'; }
    }
  });
  return text;
}
const ddl = (q) => (q instanceof Sql ? q.strings.join('') : String(q));

// ---- schema DSL
function column(type) {
  return (name, opts = {}) => {
    const c = { __column: true, name, type, opts, mods: [] };
    const chain = {
      __column: true, get name() { return c.name; }, set name(v) { c.name = v; }, _c: c,
      primaryKey(o = {}) { c.mods.push(o.autoIncrement ? 'PRIMARY KEY AUTOINCREMENT' : 'PRIMARY KEY'); return chain; },
      notNull() { c.mods.push('NOT NULL'); return chain; },
      unique() { c.mods.push('UNIQUE'); return chain; },
      default(v) {
        c.mods.push(`DEFAULT ${v instanceof Sql ? ddl(v) : typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : typeof v === 'boolean' ? Number(v) : v}`);
        return chain;
      },
      deprecated() { c.deprecated = true; return chain; },
    };
    return chain;
  };
}
export const text = column('TEXT');
export const integer = column('INTEGER');
export const real = column('REAL');
export const blob = column('BLOB');
export const boolean = column('INTEGER');
export const json = column('TEXT');

function idx(unique) {
  return (name) => {
    const ix = { kind: 'index', unique, name, cols: [], where: null };
    const b = { on: (...cols) => { ix.cols = cols; return b; }, where: (w) => { ix.where = w; return b; }, _ix: ix };
    return b;
  };
}
export const index = idx(false);
export const uniqueIndex = idx(true);
export const primaryKey = ({ columns }) => ({ _pk: columns });

export function table(name, cols, extra) {
  for (const [k, c] of Object.entries(cols)) if (!c._c.name) c._c.name = k;
  return { __table: true, name, cols, extra: extra ? extra(cols) : {} };
}

export function createSchema(database, schemaModule) {
  for (const t of Object.values(schemaModule).filter((x) => x && x.__table)) {
    const defs = Object.values(t.cols).filter((c) => !c._c.deprecated).map((c) => `"${c._c.name}" ${c._c.type} ${c._c.mods.join(' ')}`.trim());
    const extras = Object.values(t.extra);
    for (const e of extras) if (e._pk) defs.push(`PRIMARY KEY (${e._pk.map((c) => `"${c.name}"`).join(', ')})`);
    database.exec(`CREATE TABLE IF NOT EXISTS "${t.name}" (${defs.join(', ')})`);
    for (const e of extras) {
      if (!e._ix) continue;
      const ix = e._ix;
      database.exec(`CREATE ${ix.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS "${ix.name}" ON "${t.name}" (${ix.cols.map((c) => `"${c.name}"`).join(', ')})${ix.where ? ' WHERE ' + ddl(ix.where) : ''}`);
    }
  }
}

// ---- database
let database = new DatabaseSync(process.env.LOCAL_DB ?? ':memory:');
export function _reset(file = ':memory:') { database = new DatabaseSync(file); return database; }
export function _database() { return database; }

function prepare(q, params) {
  let text;
  let args;
  if (q instanceof Sql) { args = []; text = compile(q, args); } else { text = q; args = params ?? []; }
  const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v);
  args = Array.isArray(args) ? args.map(norm) : Object.fromEntries(Object.entries(args).map(([k, v]) => [k.replace(/^[:@$]/, ''), norm(v)]));
  return { stmt: database.prepare(text), args, returns: /^\s*(SELECT|WITH)\b|\bRETURNING\b/i.test(text) };
}
const exec = (stmt, args, fn) => (Array.isArray(args) ? stmt[fn](...args) : stmt[fn](args));

const db = {
  async run(q, params) {
    const { stmt, args, returns } = prepare(q, params);
    if (returns) { const rows = exec(stmt, args, 'all'); return { rowsAffected: rows.length, lastInsertRowid: 0, rows }; }
    const r = exec(stmt, args, 'run');
    return { rowsAffected: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid), rows: [] };
  },
  async all(q, params) {
    const { stmt, args } = prepare(q, params);
    // Mirror the platform contract: db.all/get/values are for reads; writes go through db.run.
    if (!/^\s*(SELECT|WITH|PRAGMA)\b/i.test(stmt.sourceSQL)) throw new Error('db.all/get/values are for reads — use db.run for writes');
    return exec(stmt, args, 'all').map((r) => ({ ...r }));
  },
  async get(q, params) { const rows = await db.all(q, params); return rows[0] ?? null; },
  async values(q, params) { return (await db.all(q, params)).map((r) => Object.values(r)); },
};
export default db;
export { db };
