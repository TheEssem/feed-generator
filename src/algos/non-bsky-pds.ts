import type { QueryParams } from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import type { AppContext } from '../config'

// max 15 chars
export const shortname = 'non-bsky-pds'

export const handler = async (ctx: AppContext, params: QueryParams, pds: string) => {
  let builder = ctx.db
    .selectFrom('post')
    .selectAll()
    .where('pdsBase', '!=', 'bsky.network')
    .where('pdsBase', '!=', 'brid.gy')
    .where('pdsBase', '!=', 'extwitter.link')
    .orderBy('indexedAt', 'desc')
    .orderBy('cid', 'desc')
    .limit(params.limit)

  if (params.cursor) {
    const timeStr = new Date(parseInt(params.cursor, 10)).toISOString()
    builder = builder.where('post.indexedAt', '<', timeStr)
  }
  const res = await builder.execute()

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
