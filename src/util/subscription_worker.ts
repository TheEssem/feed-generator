import type { RedisClientType, RedisDefaultModules } from "redis"
import { createDb } from "../db/new"
import { createRedis } from '../db/redis'

import type { Database, Statement } from "bun:sqlite"
import type { Post } from "../db/schema"
import { isPost } from "./subscription"

// prevents TS errors
declare var self: Worker;

let db: Database
let redis: RedisClientType<RedisDefaultModules, {}, {}>

let lock = false

let insertPost: Statement<Post, string[]>
let insertPosts: CallableFunction & { immediate: (...args: any) => void; }
let removePostByURL: Statement<Post, string[]>
let removePostByPDS: Statement<Post, string[]>

const postQueue: Post[] = []

self.onmessage = async (event: MessageEvent) => {
  if (event.data.op === 0) {
    db = createDb(event.data.sqliteLocation)
    insertPost = db.query(`INSERT INTO "post" ("uri", "cid", "pds", "pdsBase", "indexedAt") VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING;`)
    insertPosts = db.transaction(async posts => {
      for (const post of posts) {
        const dbResult = insertPost.run(post.uri, post.cid, post.pds, post.pdsBase, post.indexedAt)
        if ((dbResult.changes ?? 0) > 0) {
          const pdsKey = `posts:${event.data.pds}`
          const length = await redis.lPush(pdsKey, `${event.data.atUri};${post.indexedAt}`)
          if (length > 30000) {
            const last = await redis.rPop(pdsKey)
            await redis.lTrim(pdsKey, 0, 29999)
            if (last && !lock) {
              lock = true
              const indexTime = last.split(';')[1]
              if (indexTime?.trim()) {
                removePostByPDS.run(event.data.pds, indexTime)
              }
              lock = false
            }
          }
        }
      }
    })
    removePostByURL = db.query(`DELETE FROM "post" WHERE "uri" = ?1 RETURNING "indexedAt";`)
    removePostByPDS = db.query(`DELETE FROM "post" WHERE "pds" = ?1 AND "indexedAt" < ?2;`)
    redis = await createRedis()
    postMessage({ op: 0 })
  } else if (event.data.op === 1) {
    if (!event.data.commit.record) return
    if (!isPost(event.data.commit.record)) return
    const url = new URL(event.data.pds)
    const splitDomain = url.hostname.split(".")
    const pdsBase = `${splitDomain[splitDomain.length - 2]}.${splitDomain[splitDomain.length - 1]}`
    const indexedAt = new Date().toISOString()
    postQueue.push({
      uri: event.data.atUri,
      cid: event.data.commit.cid,
      pds: event.data.pds,
      pdsBase,
      indexedAt,
    })
    // Estimated number of events coming through the jetstream per second is closer to 64 as of this commit
    if (postQueue.length > 127) {
      insertPosts.immediate(postQueue.splice(0, 1024))
    }
    //console.log("added")
  } else if (event.data.op === 2) {
    const post = removePostByURL.get(event.data.atUri)
    //console.log("removed")
    if (post) await redis.lRem(`posts:${event.data.pds}`, 0, `${event.data.atUri};${post.indexedAt}`)
  }
}
