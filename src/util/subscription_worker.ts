import type { RedisClientType, RedisDefaultModules } from "redis"
import { createDb } from "../db/new"
import { createRedis } from '../db/redis'

import type { Database, Statement } from "bun:sqlite"
import type { Post } from "../db/schema"
import { isPost } from "./subscription"

let db: Database
let redis: RedisClientType<RedisDefaultModules, {}, {}>

let lock = false

let insertPost: Statement<Post, string[]>
let removePostByURL: Statement<Post, string[]>
let removePostByPDS: Statement<Post, string[]>

self.onmessage = async (event: MessageEvent) => {
  if (event.data.op === 0) {
    db = createDb(event.data.sqliteLocation)
    insertPost = db.query(`INSERT INTO "post" ("uri", "cid", "pds", "pdsBase", "indexedAt") VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING;`)
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
    const dbResult = insertPost.run(event.data.atUri, event.data.commit.cid, event.data.pds, pdsBase, indexedAt)
    //console.log("added")
    if ((dbResult.changes ?? 0) > 0) {
      const pdsKey = `posts:${event.data.pds}`
      const length = await redis.lPush(pdsKey, `${event.data.atUri};${indexedAt}`)
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
  } else if (event.data.op === 2) {
    const post = removePostByURL.get(event.data.atUri)
    //console.log("removed")
    if (post) await redis.lRem(`posts:${event.data.pds}`, 0, `${event.data.atUri};${post.indexedAt}`)
  }
}
