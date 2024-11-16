import { FirehoseSubscriptionBase, isPost } from './util/subscription'
import { ids } from './lexicon/lexicons'
import type { MessageEvent } from 'ws'
import { type CommitEvent, type AccountEvent, type IdentityEvent, CommitType } from './util/types'
import type { Post } from './db/schema'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  public count = 0
  async handleEvent(evt: MessageEvent) {
    const event = JSON.parse(evt.data.toString()) as
					| CommitEvent<"app.bsky.feed.post">
					| AccountEvent
					| IdentityEvent;
    this.count++
    if (this.count === 1000) {
      await this.updateCursor(event.time_us)
      this.count = 0
    }
    if (event.kind !== "commit") return
    if (!event.commit?.collection || !event.commit.rkey || !event.commit.rev) return
    if (event.commit.collection !== ids.AppBskyFeedPost) return

    const atUri = `at://${event.did}/app.bsky.feed.post/${event.commit.rkey}`
    const resolved = await this.didResolver.resolveAtprotoData(event.did)
    const pds = resolved.pds

    if (event.commit.operation === CommitType.Create) {
      if (!event.commit.record) return
      if (!isPost(event.commit.record)) return
      const obj: Post = {
        uri: atUri,
        cid: event.commit.cid,
        pds: pds,
        indexedAt: new Date().toISOString(),
      }
      const dbResult = await this.db
        .insertInto('post')
        .values([obj])
        .onConflict((oc) => oc.doNothing())
        .execute()
      if ((dbResult[0].numInsertedOrUpdatedRows ?? 0) > 0) {
        const pdsKey = `posts:${pds}`
        await this.redis.lPush(pdsKey, atUri)
        const len = await this.redis.lLen(pdsKey)
        if (len >= 30000) {
          const last = await this.redis.lRange(pdsKey, 29999, -1)
          const indexed = await this.db
            .selectFrom('post')
            .select('indexedAt')
            .where('uri', '=', last[0])
            .execute()
          if (indexed[0]?.indexedAt) {
            await this.db
            .deleteFrom('post')
            .where('pds', '=', pds)
            .where('indexedAt', '<', indexed[0].indexedAt)
            .execute()
          }
        }
        await this.redis.lTrim(pdsKey, 0, 29999)
      }
    } else if (event.commit.operation === CommitType.Delete) {
      await this.redis.lRem(`posts:${pds}`, 0, atUri)
      await this.db
        .deleteFrom('post')
        .where('uri', '=', atUri)
        .execute()
    }
  }
}
