import type { Kysely, Migration, MigrationProvider } from 'kysely'
import type { DatabaseSchema } from './schema'

const migrations: Record<string, Migration> = {}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

migrations['001'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createTable('post')
      .addColumn('uri', 'varchar', (col) => col.primaryKey())
      .addColumn('cid', 'varchar', (col) => col.notNull())
      .addColumn('indexedAt', 'varchar', (col) => col.notNull())
      .addColumn('pds', 'varchar')
      .execute()
    await db.schema
      .createTable('sub_state')
      .addColumn('service', 'varchar', (col) => col.primaryKey())
      .addColumn('cursor', 'bigint', (col) => col.notNull())
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema.dropTable('post').execute()
    await db.schema.dropTable('sub_state').execute()
  },
}

migrations['002'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createIndex('idx_post_pds_indexedAt')
      .on('post')
      .columns(['pds', 'indexedAt'])
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema
      .dropIndex('idx_post_pds_indexedAt')
      .execute()
  },
}

migrations['003'] = {
  async up(db: Kysely<Omit<DatabaseSchema, "pdsBase">>) {
    await db.schema
      .alterTable('post')
      .addColumn('pdsBase', 'varchar')
      .execute()
    const pdsLinks = await db
      .selectFrom('post')
      .select(['uri', 'pds'])
      .execute()
    for (const link of pdsLinks) {
      if (!link.pds) continue
      const url = new URL(link.pds)
      const splitDomain = url.hostname.split(".")
      const pdsBase = `${splitDomain[splitDomain.length - 2]}.${splitDomain[splitDomain.length - 1]}`
      await db
        .updateTable('post')
        .set({
          pdsBase
        })
        .where('uri', '=', link.uri)
        .execute()
    }
  },
  async down(db: Kysely<Omit<DatabaseSchema, "pdsBase">>) {
    await db.schema
      .alterTable('post')
      .dropColumn('pdsBase')
      .execute()
  },
}

migrations['004'] = {
  async up(db: Kysely<unknown>) {
    await db.schema
      .createIndex('idx_post_pdsBase_indexedAt')
      .on('post')
      .columns(['pdsBase', 'indexedAt'])
      .execute()
    await db.schema
      .dropIndex('idx_post_pds_indexedAt')
      .execute()
  },
  async down(db: Kysely<unknown>) {
    await db.schema
      .createIndex('idx_post_pds_indexedAt')
      .on('post')
      .columns(['pds', 'indexedAt'])
      .execute()
    await db.schema
      .dropIndex('idx_post_pdsBase_indexedAt')
      .execute()
  },
}
