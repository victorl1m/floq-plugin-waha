// Test database: PGlite (in-memory, default) or, with WAHA_TEST_PG=<postgres url>, a real Postgres. Each database gets its own
// schema on the search path, like Floq's "schema" plugin storage mode, and is dropped on close.
import { PGlite } from "@electric-sql/pglite";

export async function newDb() {
  const url = process.env.WAHA_TEST_PG;
  if (!url) return new PGlite();
  const { default: pg } = await import(process.env.WAHA_TEST_PG_MODULE || "pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const schema = "plugin_waha_t" + Math.random().toString(36).slice(2, 10);
  await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
  return {
    exec: (sql) => client.query(sql),
    query: async (sql, params) => { const r = await client.query(sql, params); return { rows: r.rows, affectedRows: r.rowCount ?? 0 }; },
    close: async () => { await client.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => undefined); await client.end(); },
  };
}
