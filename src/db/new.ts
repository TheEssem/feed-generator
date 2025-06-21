import { Database } from "bun:sqlite";

export const createDb = (location: string): Database => {
  const db = new Database(location, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  return db;
}
