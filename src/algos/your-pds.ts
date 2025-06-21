import type { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import type { AppContext } from '../config'

import type { Statement } from 'bun:sqlite'
import type { Post } from '../db/schema'

// max 15 chars
export const shortname = 'your-pds'

let dbQuery: Statement<Post, [string, number]>
let dbQueryWhere: Statement<Post, [string, string, number]>

export const handler = async (ctx: AppContext, params: QueryParams, pds: string) => {
  /*let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('pds', '=', pds)
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)*/
  if (!dbQuery) {
    dbQuery = ctx.db.query(`SELECT uri, indexedAt FROM "post" WHERE "pds" = ?1 ORDER BY "indexedAt" DESC, "cid" DESC LIMIT ?2;`)
    dbQueryWhere = ctx.db.query(`SELECT uri, indexedAt FROM "post" WHERE "pds" = ?1 AND "indexedAt" < ?2 ORDER BY "indexedAt" DESC, "cid" DESC LIMIT ?3;`)
  }

  let res: Post[]
  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    res = dbQueryWhere.all(pds, timeStr, params.limit)
    //builder = builder.where('post.indexedAt', '<', timeStr)
  } else {
    res = dbQuery.all(pds, params.limit)
  }
  //const res = await builder.execute()

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
