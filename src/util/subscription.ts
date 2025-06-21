import { BlobRef } from '@atproto/lexicon'
import { ids, lexicons } from '../lexicon/lexicons'
import type { Record as PostRecord } from '../lexicon/types/app/bsky/feed/post'
import type { Database, Statement } from 'bun:sqlite'
import type { DidResolver } from '@atproto/identity'
import { WebSocket, type MessageEvent } from 'ws'
import type { RedisClientType, RedisDefaultModules } from 'redis'
import { Post } from '../db/schema'

export abstract class FirehoseSubscriptionBase {
  public sock: WebSocket
  public baseUrl: URL
  public connUrl: URL
  public insertPost: Statement<Post, string[]>
  public removePostByURL: Statement<Post, string[]>
  public removePostByPDS: Statement<Post, string[]>

  constructor(public db: Database, public redis: RedisClientType<RedisDefaultModules, {}, {}>, public baseURL: string, public didResolver: DidResolver) {
    this.didResolver = didResolver
    this.baseUrl = new URL(baseURL)
    this.connUrl = new URL(baseURL)
    this.insertPost = db.query(`INSERT INTO "post" ("uri", "cid", "pds", "pdsBase", "indexedAt") VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING;`)
    this.removePostByURL = db.query(`DELETE FROM "post" WHERE "uri" = ?1 RETURNING "indexedAt";`)
    this.removePostByPDS = db.query(`DELETE FROM "post" WHERE "pds" = ?1 AND "indexedAt" < ?2;`)
  }

  abstract handleEvent(evt: MessageEvent): Promise<void>

  async run(subscriptionReconnectDelay: number) {
    const url = await this.createUrl()
    this.sock = new WebSocket(url)
    this.sock.onclose = () => {
      setTimeout(
        () => this.run(subscriptionReconnectDelay),
        subscriptionReconnectDelay,
      )
    }
    this.sock.onerror = ({ error }) => {
      console.error('repo subscription errored', error)
      setTimeout(
        () => this.run(subscriptionReconnectDelay),
        subscriptionReconnectDelay,
      )
    }
    this.sock.onmessage = (evt) => this.handleEvent(evt)
  }

  /*async updateCursor(cursor: bigint) {
    const state = await this.db
      .selectFrom('sub_state')
      .select(['service', 'cursor'])
      .where('service', '=', this.baseUrl.toString())
      .executeTakeFirst()

    if (state) {
      await this.db
        .updateTable('sub_state')
        .set({ cursor })
        .where('service', '=', this.baseUrl.toString())
        .execute()
    } else {
      await this.db
        .insertInto('sub_state')
        .values({ cursor, service: this.baseUrl.toString() })
        .execute()
    }
  }

  async getCursor(): Promise<{ cursor?: bigint }> {
    const res = await this.db
      .selectFrom('sub_state')
      .select('cursor')
      .where('service', '=', this.baseUrl.toString())
      .executeTakeFirst()
    return res ? { cursor: res.cursor } : {}
  }*/

  private async createUrl() {
    const url = this.connUrl
    url.searchParams.set("wantedCollections", ids.AppBskyFeedPost)
    /*const { cursor } = await this.getCursor()
    if (cursor) url.searchParams.set("cursor", cursor.toString())*/
    return url.toString()
  }
}

export const isPost = (obj: unknown): obj is PostRecord => {
  return isType(obj, ids.AppBskyFeedPost)
}

const isType = (obj: unknown, nsid: string) => {
  try {
    lexicons.assertValidRecord(nsid, fixBlobRefs(obj))
    return true
  } catch (err) {
    return false
  }
}

// @TODO right now record validation fails on BlobRefs
// simply because multiple packages have their own copy
// of the BlobRef class, causing instanceof checks to fail.
// This is a temporary solution.
const fixBlobRefs = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(fixBlobRefs)
  }
  if (obj && typeof obj === 'object') {
    if (obj.constructor.name === 'BlobRef') {
      const blob = obj as BlobRef
      return new BlobRef(blob.ref, blob.mimeType, blob.size, blob.original)
    }
    return Object.entries(obj).reduce((acc, [key, val]) => {
      return Object.assign(acc, { [key]: fixBlobRefs(val) })
    }, {} as Record<string, unknown>)
  }
  return obj
}
