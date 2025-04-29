import { BlobRef } from '@atproto/lexicon'
import { ids, lexicons } from '../lexicon/lexicons'
import type { Record as PostRecord } from '../lexicon/types/app/bsky/feed/post'
import type { Database } from '../db'
import type { DidResolver } from '@atproto/identity'
import { WebSocket, type MessageEvent } from 'ws'
import type { RedisClientType, RedisDefaultModules } from 'redis'

export abstract class FirehoseSubscriptionBase {
  public sock: WebSocket
  public baseUrl: URL

  constructor(public db: Database, public redis: RedisClientType<RedisDefaultModules, {}, {}>, public baseURL: string, public didResolver: DidResolver) {
    this.didResolver = didResolver
    this.baseUrl = new URL(baseURL)
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

  async updateCursor(cursor: bigint) {
    await this.db
      .updateTable('sub_state')
      .set({ cursor })
      .where('service', '=', this.baseUrl.toString())
      .execute()
  }

  async getCursor(): Promise<{ cursor?: bigint }> {
    const res = await this.db
      .selectFrom('sub_state')
      .selectAll()
      .where('service', '=', this.baseUrl.toString())
      .executeTakeFirst()
    return res ? { cursor: res.cursor } : {}
  }

  private async createUrl() {
    const { cursor } = await this.getCursor()
    const url = this.baseUrl
    url.searchParams.set("wantedCollections", ids.AppBskyFeedPost)
    if (cursor) url.searchParams.set("cursor", cursor.toString())
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
