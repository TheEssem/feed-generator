import type { RedisClientType, RedisDefaultModules } from "redis"
import { createRedis } from '../db/redis'

import type { Database, Statement } from "bun:sqlite"
import type { Post, SubState } from "../db/schema"
import { isPost } from "./subscription"

// prevents TS errors
declare var self: Worker;

let db: Database
let redis: RedisClientType<RedisDefaultModules, {}, {}>

let insertPost: Statement<Post, string[]>
let insertPosts: CallableFunction & { immediate: (...args: any) => void; }
let removePostByURL: Statement<Post, string[]>
let removePostByPDS: Statement<Post, string[]>
let removePosts: CallableFunction & { immediate: (...args: any) => void; }
let subStateQuery: Statement<SubState, string[]>
let updateSubState: Statement<SubState, [bigint, string]>

const postQueue: Post[] = []
const delQueue: {
  uri: string;
  pds: string;
}[] = []

self.onmessage = async (event: MessageEvent) => {
  if (event.data.op === 0) {
    const { createDb } = await import("../db/new")
    db = await createDb(event.data.sqliteLocation)
    insertPost = db.query(`INSERT INTO "post" ("uri", "cid", "pds", "pdsBase", "indexedAt") VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT DO NOTHING;`)
    insertPosts = db.transaction(async posts => {
      for (const post of posts) {
        const dbResult = insertPost.run(post.uri, post.cid, post.pds, post.pdsBase, post.indexedAt)
        if ((dbResult.changes ?? 0) > 0) {
          const pdsKey = `posts:${post.pds}`
          const length = await redis.lPush(pdsKey, `${post.uri};${post.indexedAt}`)
          if (length > 30000) {
            const last = await redis.rPop(pdsKey)
            await redis.lTrim(pdsKey, 0, 29999)
            if (last) {
              const indexTime = last.split(';')[1]
              if (indexTime?.trim()) {
                removePostByPDS.run(post.pds, indexTime)
              }
            }
          }
        }
      }
    })
    removePostByURL = db.query(`DELETE FROM "post" WHERE "uri" = ?1 RETURNING "indexedAt";`)
    removePostByPDS = db.query(`DELETE FROM "post" WHERE "pds" = ?1 AND "indexedAt" < ?2;`)
    removePosts = db.transaction(async posts => {
      for (const post of posts) {
        const dbResult = removePostByURL.get(post.uri)
        if (dbResult) await redis.lRem(`posts:${post.pds}`, 0, `${post.uri};${dbResult.indexedAt}`)
      }
    })
    subStateQuery = db.query("SELECT service, cursor FROM sub_state WHERE service = ?")
    updateSubState = db.query("UPDATE sub_state SET cursor = ? WHERE service = ?")
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
    // Estimated number of total events coming through the jetstream per second is closer to 64 as of this commit
    if (postQueue.length > 127) {
      insertPosts.immediate(postQueue.splice(0, 128))
    }
    //console.log("added")
  } else if (event.data.op === 2) {
    delQueue.push({
      uri: event.data.atUri,
      pds: event.data.pds,
    })
    if (delQueue.length > 63) {
      removePosts.immediate(delQueue.splice(0, 64))
    }
    //console.log("removed")
  } else if (event.data.op === 3) {
    const state = subStateQuery.get(event.data.baseUrl)

    if (state) {
      updateSubState.run(event.data.cursor, event.data.baseUrl)
    } else {
      db.prepare("INSERT INTO sub_state (cursor, service) VALUES (?, ?)").run(event.data.cursor, event.data.baseUrl)
    }
  }
}
