import { BlobRef } from '@atproto/lexicon'
import { ids, lexicons } from '../lexicon/lexicons'
import type { Record as PostRecord } from '../lexicon/types/app/bsky/feed/post'
import type { Database, Statement } from 'bun:sqlite'
import type { DidResolver } from '@atproto/identity'
import { WebSocket, type MessageEvent } from 'ws'
import type { SubState } from '../db/schema'

export abstract class FirehoseSubscriptionBase {
  public sock: WebSocket
  public baseUrl: URL
  public connUrl: URL
  public subStateQuery: Statement<SubState, string[]>

  constructor(public db: Database, public baseURL: string, public didResolver: DidResolver) {
    this.didResolver = didResolver
    this.baseUrl = new URL(baseURL)
    this.connUrl = new URL(baseURL)
    this.subStateQuery = this.db.query("SELECT service, cursor FROM sub_state WHERE service = ?")
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
    const state = this.subStateQuery.get(this.baseUrl.toString())

    if (state) {
      this.updateSubState.run(cursor, this.baseUrl.toString())
    } else {
      this.db.prepare("INSERT INTO sub_state (cursor, service) VALUES (?, ?)").run(cursor, this.baseUrl.toString())
    }
  }*/

  async getCursor(): Promise<{ cursor?: bigint }> {
    const res = this.subStateQuery.get(this.baseUrl.toString())
    return res ? { cursor: res.cursor } : {}
  }

  private async createUrl() {
    const url = this.connUrl
    url.searchParams.set("wantedCollections", ids.AppBskyFeedPost)
    const { cursor } = await this.getCursor()
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
