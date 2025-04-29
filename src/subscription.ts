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
      await this.updateCursor(BigInt(event.time_us))
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
      const url = new URL(pds)
      const splitDomain = url.hostname.split(".")
      const pdsBase = `${splitDomain[splitDomain.length - 2]}.${splitDomain[splitDomain.length - 1]}`
      const obj: Post = {
        uri: atUri,
        cid: event.commit.cid,
        pds,
        pdsBase,
        indexedAt: new Date().toISOString(),
      }
      const dbResult = await this.db
        .insertInto('post')
        .values([obj])
        .onConflict((oc) => oc.doNothing())
        .execute()
      if ((dbResult[0].numInsertedOrUpdatedRows ?? 0) > 0) {
        const pdsKey = `posts:${pds}`
        const length = await this.redis.lPush(pdsKey, atUri)
        if (length > 30000) {
          const last = await this.redis.rPop(pdsKey)
          await this.redis.lTrim(pdsKey, 0, 29999)
          if (last) {
            await this.db
              .deleteFrom('post')
              .where('pds', '=', pds)
              .where('indexedAt', '<', (eb) =>
                eb.selectFrom('post')
                  .select('indexedAt')
                  .where('uri', '=', last)
              )
              .execute()
          }
        }
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
