import { Database } from "bun:sqlite";

export const createDb = (location: string): Database => {
  const db = new Database(location, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec(`CREATE INDEX IF NOT EXISTS cid_index_idx ON post(indexedAt, cid);`);
  return db;
}
