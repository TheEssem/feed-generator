import { FirehoseSubscriptionBase, isPost } from './util/subscription'
import { ids } from './lexicon/lexicons'
import type { MessageEvent } from 'ws'
import { type CommitEvent, type AccountEvent, type IdentityEvent, CommitType } from './util/types'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  public count = 0
  async handleEvent(evt: MessageEvent) {
    const event = JSON.parse(evt.data.toString()) as
					| CommitEvent<"app.bsky.feed.post">
					| AccountEvent
					| IdentityEvent;
    this.count++
    if (this.count === 20) {
      await this.updateCursor(event.time_us)
      this.count = 0
    }
    if (event.kind !== "commit") return
    if (!event.commit?.collection || !event.commit.rkey || !event.commit.rev) return
    if (event.commit.collection !== ids.AppBskyFeedPost) return

    if (event.commit.operation === CommitType.Create) {
      if (!event.commit.record) return
      if (!isPost(event.commit.record)) return
      const resolved = await this.didResolver.resolve(event.did)
      const pds = resolved?.service?.[0].serviceEndpoint
      if (typeof pds !== "string") return
      await this.db
        .insertInto('post')
        .values([{
          uri: `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`,
          cid: event.commit.cid,
          pds: pds,
          indexedAt: new Date().toISOString(),
        }])
        .onConflict((oc) => oc.doNothing())
        .execute()
    } else if (event.commit.operation === CommitType.Delete) {
      await this.db
        .deleteFrom('post')
        .where('uri', '=', `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`)
        .execute()
    }
  }
}
