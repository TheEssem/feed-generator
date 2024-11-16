import type { Database } from './db'
import type { RedisClientType, RedisDefaultModules } from 'redis'
import type { DidResolver } from '@atproto/identity'

export type AppContext = {
  db: Database
  redis: RedisClientType<RedisDefaultModules, {}, {}>
  didResolver: DidResolver
  cfg: Config
}

export type Config = {
  port: number
  listenhost: string
  hostname: string
  sqliteLocation: string
  subscriptionEndpoint: string
  serviceDid: string
  publisherDid: string
  subscriptionReconnectDelay: number
}
