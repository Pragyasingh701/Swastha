// A small in-memory stand-in for the Supabase client, so route tests can run the real
// db/ and routes/ code without a network or the live project. It implements only the
// query methods the backend uses (select, insert, update, delete, eq, neq, in, is, not,
// lt/lte/gt/gte, order, limit, single, maybeSingle) and answers in the same shape,
// including the error codes the code under test branches on:
//   PGRST116  .single() / .maybeSingle() matched zero (or several) rows
//   23505     a unique constraint was violated
//
//   const db = createFakeSupabase({ patients: [{ id: 'p1', email: 'a@b.c' }] });
//   db.client                      -> hand this to mock.module as config/supabase.js
//   db.rows('patients')            -> current rows (copies)
//   db.failNext('doctor_patient', 'select', { code: 'XX000', message: 'boom' })
//   db.removedFiles                -> storage paths removed via storage.from().remove()
import { randomUUID } from 'node:crypto';

// Unique constraints the code relies on (a duplicate insert must fail with 23505).
const UNIQUE_KEYS = {
  doctor_patient: [['doctor_id', 'patient_id']],
  pending_registrations: [['email']],
  patients: [['email']],
  doctors: [['email']],
  clinic_checkin_codes: [['doctor_id', 'valid_date'], ['code', 'valid_date']],
};

function toComparable(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).getTime();
  return value;
}

function matchesFilter(row, filter) {
  const actual = row[filter.column];
  switch (filter.op) {
    case 'eq': return actual === filter.value;
    case 'neq': return actual !== filter.value;
    case 'in': return filter.value.includes(actual);
    case 'is': return (actual ?? null) === filter.value;
    case 'not-is': return (actual ?? null) !== filter.value;
    case 'not-eq': return actual !== filter.value;
    case 'lt': return actual != null && toComparable(actual) < toComparable(filter.value);
    case 'lte': return actual != null && toComparable(actual) <= toComparable(filter.value);
    case 'gt': return actual != null && toComparable(actual) > toComparable(filter.value);
    case 'gte': return actual != null && toComparable(actual) >= toComparable(filter.value);
    default: throw new Error(`fakeSupabase: unsupported filter ${filter.op}`);
  }
}

class Query {
  constructor(store, table) {
    this.store = store;
    this.table = table;
    this.op = 'select';
    this.filters = [];
    this.orders = [];
    this.limitCount = null;
    this.wantRows = true;
    this.shape = 'many';
    this.countMode = null;
    this.payload = null;
  }

  select(_columns, options = {}) {
    this.wantRows = true;
    if (options.count) this.countMode = options.count;
    return this;
  }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; this.wantRows = false; return this; }
  update(patch) { this.op = 'update'; this.payload = patch; this.wantRows = false; return this; }
  delete(options = {}) { this.op = 'delete'; this.wantRows = false; if (options.count) this.countMode = options.count; return this; }
  eq(column, value) { this.filters.push({ op: 'eq', column, value }); return this; }
  neq(column, value) { this.filters.push({ op: 'neq', column, value }); return this; }
  in(column, value) { this.filters.push({ op: 'in', column, value }); return this; }
  is(column, value) { this.filters.push({ op: 'is', column, value }); return this; }
  not(column, operator, value) { this.filters.push({ op: `not-${operator}`, column, value }); return this; }
  lt(column, value) { this.filters.push({ op: 'lt', column, value }); return this; }
  lte(column, value) { this.filters.push({ op: 'lte', column, value }); return this; }
  gt(column, value) { this.filters.push({ op: 'gt', column, value }); return this; }
  gte(column, value) { this.filters.push({ op: 'gte', column, value }); return this; }
  order(column, { ascending = true } = {}) { this.orders.push({ column, ascending }); return this; }
  limit(count) { this.limitCount = count; return this; }
  single() { this.shape = 'single'; return this; }
  maybeSingle() { this.shape = 'maybe'; return this; }

  then(resolve, reject) {
    return Promise.resolve().then(() => this.execute()).then(resolve, reject);
  }

  execute() {
    const injected = this.store.takeFailure(this.table, this.op);
    if (injected) return { data: null, error: injected, count: null };

    const rows = this.store.tables.get(this.table) || [];
    let affected;

    if (this.op === 'insert') {
      affected = [];
      for (const input of this.payload) {
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...input };
        const clash = (UNIQUE_KEYS[this.table] || []).some((cols) =>
          rows.some((existing) => cols.every((c) => existing[c] === row[c] && row[c] != null)));
        if (clash) {
          return { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${this.table}` }, count: null };
        }
        rows.push(row);
        affected.push(row);
      }
      this.store.tables.set(this.table, rows);
    } else {
      affected = rows.filter((row) => this.filters.every((f) => matchesFilter(row, f)));
      if (this.op === 'update') {
        for (const row of affected) Object.assign(row, this.payload);
      } else if (this.op === 'delete') {
        this.store.tables.set(this.table, rows.filter((row) => !affected.includes(row)));
      }
    }

    let result = affected.map((row) => ({ ...row }));
    for (const { column, ascending } of [...this.orders].reverse()) {
      result.sort((a, b) => {
        const x = toComparable(a[column]);
        const y = toComparable(b[column]);
        if (x === y) return 0;
        return (x > y ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (this.limitCount != null) result = result.slice(0, this.limitCount);
    const count = this.countMode ? affected.length : null;

    if (this.shape === 'single' || this.shape === 'maybe') {
      if (result.length === 1) return { data: result[0], error: null, count };
      if (result.length === 0 && this.shape === 'maybe') return { data: null, error: null, count };
      return {
        data: null,
        error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
        count,
      };
    }
    return { data: this.wantRows ? result : null, error: null, count };
  }
}

export function createFakeSupabase(seed = {}) {
  const store = {
    tables: new Map(Object.entries(seed).map(([name, rows]) => [name, rows.map((row) => ({ ...row }))])),
    failures: [],
    takeFailure(table, op) {
      const index = this.failures.findIndex((f) => f.table === table && f.op === op);
      return index === -1 ? null : this.failures.splice(index, 1)[0].error;
    },
  };
  const removedFiles = [];

  const client = {
    from: (table) => new Query(store, table),
    storage: {
      from: () => ({
        remove: async (paths) => { removedFiles.push(...paths); return { data: paths, error: null }; },
        createSignedUrl: async (path) => ({ data: { signedUrl: `https://signed.invalid/${path}` }, error: null }),
      }),
    },
  };

  return {
    client,
    removedFiles,
    rows: (table) => (store.tables.get(table) || []).map((row) => ({ ...row })),
    insert(table, row) {
      const rows = store.tables.get(table) || [];
      const full = { id: randomUUID(), created_at: new Date().toISOString(), ...row };
      rows.push(full);
      store.tables.set(table, rows);
      return { ...full };
    },
    clear() {
      store.tables.clear();
      store.failures.length = 0;
      removedFiles.length = 0;
    },
    // The next query of this kind on this table fails once with `error`.
    failNext(table, op, error = { code: 'XX000', message: 'injected failure' }) {
      store.failures.push({ table, op, error });
    },
  };
}
