import type { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import type { AppContext } from '../config'

import type { Statement } from 'bun:sqlite'
import type { Post } from '../db/schema'

// max 15 chars
export const shortname = 'non-bsky-pds'

let dbQuery: Statement<Post, [number]>
let dbQueryWhere: Statement<Post, [string, number]>

export const handler = async (ctx: AppContext, params: QueryParams, pds: string) => {
  /*let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('pdsBase', '!=', 'bsky.network')
    .where('pdsBase', '!=', 'brid.gy')
    .where('pdsBase', '!=', 'extwitter.link')
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)*/
  if (!dbQuery) {
    dbQuery = ctx.db.query(`SELECT uri, indexedAt FROM "post"
      WHERE "pdsBase" != 'bsky.network'
      AND "pdsBase" != 'brid.gy'
      AND "pdsBase" != 'extwitter.link'
      ORDER BY "indexedAt" DESC, "cid" DESC LIMIT ?1;`)
    dbQueryWhere = ctx.db.query(`SELECT uri, indexedAt FROM "post"
      WHERE "pdsBase" != 'bsky.network'
      AND "pdsBase" != 'brid.gy'
      AND "pdsBase" != 'extwitter.link'
      AND "indexedAt" < ?1
      ORDER BY "indexedAt" DESC, "cid" DESC LIMIT ?2;`)
  }

  let res: Post[]
  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    res = dbQueryWhere.all(timeStr, params.limit)
  } else {
    res = dbQuery.all(params.limit)
  }

  /*if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    builder = builder.where('post.indexedAt', '<', timeStr)
  }
  const res = await builder.execute()*/

  const feed = res.map((row) => ({
    post: row.uri,
  }))

  let cursor: string | undefined
  const last = res.at(-1)
  if (last) {
    cursor = new Date(last.indexedAt).getTime().toString(10)
  }

  return {
    cursor,
    feed,
  }
}
