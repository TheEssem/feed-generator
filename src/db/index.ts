import SqliteDb from 'better-sqlite3'
import { Kysely, Migrator, PostgresDialect, SqliteDialect } from 'kysely'
import { Pool } from 'pg'
import { DatabaseSchema } from './schema'
import { migrationProvider } from './migrations'

export const createDb = (location: string, isPg: boolean): Database => {
  let dialect
  if (isPg) {
    dialect = new PostgresDialect({
      pool: new Pool({
        connectionString: location,
      })
    })
  } else {
    dialect = new SqliteDialect({
      database: new SqliteDb(location),
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
