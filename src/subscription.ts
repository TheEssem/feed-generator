import { FirehoseSubscriptionBase, isPost } from './util/subscription'
import { ids } from './lexicon/lexicons'
import type { MessageEvent } from 'ws'
import { type CommitEvent, type AccountEvent, type IdentityEvent, CommitType } from './util/types'
import type { Post } from './db/schema'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  public count = 0
  public lock = false
  async handleEvent(evt: MessageEvent) {
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
      if (!event.commit.record) return
      if (!isPost(event.commit.record)) return
      const url = new URL(pds)
      const splitDomain = url.hostname.split(".")
      const pdsBase = `${splitDomain[splitDomain.length - 2]}.${splitDomain[splitDomain.length - 1]}`
      const indexedAt = new Date().toISOString()
      /*const obj: Post = {
        uri: atUri,
        cid: event.commit.cid,
        pds,
        pdsBase,
        indexedAt,
      }*/
      /*const dbQuery = this.db
        .insertInto('post')
        .values([obj])
        .onConflict((oc) => oc.doNothing())
      console.log(dbQuery.compile().sql)
      const dbResult = await dbQuery.execute()*/
      const dbResult = this.insertPost.run(atUri, event.commit.cid, pds, pdsBase, indexedAt)
      //console.log("added")
      if ((dbResult.changes ?? 0) > 0) {
        const pdsKey = `posts:${pds}`
        const length = await this.redis.lPush(pdsKey, `${atUri};${indexedAt}`)
        if (length > 30000) {
          const last = await this.redis.rPop(pdsKey)
          await this.redis.lTrim(pdsKey, 0, 29999)
          if (last && !this.lock) {
            this.lock = true
            const indexTime = last.split(';')[1]
            if (indexTime?.trim()) {
              /*await this.db
                .deleteFrom('post')
                .where('pds', '=', pds)
                .where('indexedAt', '<', indexTime)
                .execute()*/
              this.removePostByPDS.run(pds, indexTime)
            }
            this.lock = false
          }
        }
      }
    } else if (event.commit.operation === CommitType.Delete) {
      /*const query = this.db
        .deleteFrom('post')
        .where('uri', '=', atUri)
        .returning('indexedAt')
      console.log(query.compile().sql)
      const post = await query.executeTakeFirst()*/
      const post = this.removePostByURL.get(atUri)
      //console.log("removed")
      if (post) await this.redis.lRem(`posts:${pds}`, 0, `${atUri};${post.indexedAt}`)
    }
  }
}
