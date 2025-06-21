import { FirehoseSubscriptionBase } from './util/subscription'
import { ids } from './lexicon/lexicons'
import type { MessageEvent } from 'ws'
import { type CommitEvent, type AccountEvent, type IdentityEvent, CommitType } from './util/types'
import type { Post } from './db/schema'
import type { DidResolver } from '@atproto/identity'
import type { Database, Statement } from 'bun:sqlite'
import { join } from 'node:path'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  public count = 0
  public lock = false
  public dbWorker: Worker
  public insertPost: Statement<Post, string[]>
  public removePostByURL: Statement<Post, string[]>
  public removePostByPDS: Statement<Post, string[]>
  private workerReady = false

  constructor(public db: Database, public sqliteLocation: string, public baseURL: string, public didResolver: DidResolver) {
    super(db, baseURL, didResolver)
    const workerName = join(__dirname, "util", "subscription_worker.ts")
    this.dbWorker = new Worker(workerName)
    this.dbWorker.addEventListener("open", () => {
      this.dbWorker.postMessage({ op: 0, sqliteLocation })
    })
    this.dbWorker.addEventListener("message", (ev) => {
      if (ev.data?.op === 0) this.workerReady = true
    })
    this.insertPost = db.query(`INSERT INTO "post" ("uri", "cid", "pds", "pdsBase", "indexedAt") VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING;`)
    this.removePostByURL = db.query(`DELETE FROM "post" WHERE "uri" = ?1 RETURNING "indexedAt";`)
    this.removePostByPDS = db.query(`DELETE FROM "post" WHERE "pds" = ?1 AND "indexedAt" < ?2;`)
  }

  async handleEvent(evt: MessageEvent) {
    if (!this.workerReady) return
    const event = JSON.parse(evt.data.toString()) as
					| CommitEvent<"app.bsky.feed.post">
					| AccountEvent
					| IdentityEvent;
    /*this.count++
    if (this.count >= 1000) {
      await this.updateCursor(BigInt(event.time_us))
      this.count = 0
    }*/
    if (event.kind !== "commit") return
    if (!event.commit?.collection || !event.commit.rkey || !event.commit.rev) return
    if (event.commit.collection !== ids.AppBskyFeedPost) return

    const atUri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`
    const resolved = await this.didResolver.resolveAtprotoData(event.did)
    const pds = resolved.pds

    if (event.commit.operation === CommitType.Create) {
      this.dbWorker.postMessage({
        op: 1,
        atUri,
        pds,
        commit: event.commit,
      })
    } else if (event.commit.operation === CommitType.Delete) {
      this.dbWorker.postMessage({
        op: 2,
        atUri,
        pds,
      })
    }
  }
}
