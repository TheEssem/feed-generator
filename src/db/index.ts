import { Kysely, Migrator, SqliteDialect } from 'kysely'
import { PostgresJSDialect } from 'kysely-postgres-js'
import postgres from 'postgres'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'

let sqlite

if (process.versions.bun) {
  const { BunWorkerDialect } = require('kysely-bun-worker')
  sqlite = BunWorkerDialect
} else {
  sqlite = require('better-sqlite3')
}

export const createDb = (location: string, isPg: boolean): Database => {
  let dialect
  if (isPg) {
    dialect = new PostgresJSDialect({
      postgres: postgres(location, { onnotice: () => {} }),
    })
  } else if (process.versions.bun) {
    dialect = new sqlite({
      url: location,
    })
  } else {
    dialect = new SqliteDialect({
      database: new sqlite(location),
    })
  }
  return new Kysely<DatabaseSchema>({
    dialect,
  })
}

export const migrateToLatest = async (db: Database) => {
  const migrator = new Migrator({ db, provider: migrationProvider })
  const { error } = await migrator.migrateToLatest()
  if (error) throw error
}

export type Database = Kysely<DatabaseSchema>
