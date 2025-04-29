import http from 'http'
import events from 'events'
import express from 'express'
import { DidResolver, MemoryCache } from '@atproto/identity'
import { createServer } from './lexicon'
import feedGeneration from './methods/feed-generation'
import describeGenerator from './methods/describe-generator'
import { createDb, Database, migrateToLatest } from './db'
import { FirehoseSubscription } from './subscription'
import { AppContext, Config } from './config'
import wellKnown from './well-known'
import { createRedis } from './db/redis'
import type { RedisClientType, RedisDefaultModules } from 'redis'

export class FeedGenerator {
  public app: express.Application
  public server?: http.Server
  public db: Database
  public redis: RedisClientType<RedisDefaultModules, {}, {}>
  public firehose: FirehoseSubscription
  public cfg: Config

  constructor(
    app: express.Application,
    db: Database,
    redis: RedisClientType<RedisDefaultModules, {}, {}>,
    firehose: FirehoseSubscription,
    cfg: Config,
  ) {
    this.app = app
    this.db = db
    this.redis = redis
    this.firehose = firehose
    this.cfg = cfg
  }

  static async create(cfg: Config) {
    const app = express()
    let db: Database
    if (cfg.dbType === "pg" && cfg.pgUrl) {
      db = createDb(cfg.pgUrl, true)
    } else {
      db = createDb(cfg.sqliteLocation, false)
    }
    const redis = await createRedis()

    const didCache = new MemoryCache(900000, 1800000)
    const didResolver = new DidResolver({
      plcUrl: cfg.plcDir,
      didCache,
    })

    const firehose = new FirehoseSubscription(db, redis, cfg.subscriptionEndpoint, didResolver)

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    })
    const ctx: AppContext = {
      db,
      redis,
      didResolver,
      cfg,
    }
    feedGeneration(server, ctx)
    describeGenerator(server, ctx)
    app.use(server.xrpc.router)
    app.use(wellKnown(ctx))

    return new FeedGenerator(app, db, redis, firehose, cfg)
  }

  async start(): Promise<http.Server> {
    await migrateToLatest(this.db)
    this.firehose.run(this.cfg.subscriptionReconnectDelay)
    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost)
    await events.once(this.server, 'listening')
    return this.server
  }
}

export default FeedGenerator
