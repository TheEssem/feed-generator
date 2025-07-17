import type { Database } from "bun:sqlite";

export const createDb = async (location: string): Promise<Database> => {
  const { Database } = await import(process.versions.deno ? "jsr:@db/sqlite@0.11" : "bun:sqlite")
  const db = new Database(location, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec(`CREATE INDEX IF NOT EXISTS cid_index_idx ON post(indexedAt, cid);`);
  db.exec(`CREATE INDEX IF NOT EXISTS pds_index_idx ON post (pds, indexedAt);`);
  return db;
}
