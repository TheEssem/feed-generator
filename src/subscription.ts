import { FirehoseSubscriptionBase } from './util/subscription'
import { ids } from './lexicon/lexicons'
import type { MessageEvent } from 'ws'
import { type CommitEvent, type AccountEvent, type IdentityEvent, CommitType } from './util/types'
import type { DidResolver } from '@atproto/identity'
import type { Database } from 'bun:sqlite'
import { join } from 'node:path'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  public count = 0
  public dbWorker: Worker
  private workerReady = false

  constructor(public db: Database, public sqliteLocation: string, public baseURL: string, public didResolver: DidResolver) {
    super(db, baseURL, didResolver)
    const workerName = join(import.meta?.dirname ?? __dirname, "util", "subscription_worker.ts")
    this.dbWorker = new Worker(`file://${workerName}`, { type: "module" })
    this.dbWorker.addEventListener("message", (ev) => {
      if (ev.data?.op === 0) this.workerReady = true
    })
    this.dbWorker.addEventListener("error", (ev) => console.error(ev))
    this.dbWorker.postMessage({ op: 0, sqliteLocation })
  }

  async handleEvent(evt: MessageEvent) {
    if (!this.workerReady) return
    const event = JSON.parse(evt.data.toString()) as
					| CommitEvent<"app.bsky.feed.post">
					| AccountEvent
					| IdentityEvent;
    this.count++
    if (this.count >= 1024) {
      this.count = 0
      this.dbWorker.postMessage({
        op: 3,
        baseUrl: this.baseUrl.toString(),
        cursor: BigInt(event.time_us),
      })
    }
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
