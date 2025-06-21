import { InvalidRequestError } from '@atproto/xrpc-server'
import { Server } from '../lexicon'
import { AppContext } from '../config'
import algos from '../algos'
import { validateAuth } from '../auth'
import { AtUri } from '@atproto/syntax'
import { runAlgo } from './algo-thread'

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
    const feedUri = new AtUri(params.feed)
    const algo = algos[feedUri.rkey]
    if (
      feedUri.host !== ctx.cfg.publisherDid ||
      !feedUri.pathname.startsWith('/app.bsky.feed.generator') ||
      !algo
    ) {
      throw new InvalidRequestError(
        'Unsupported algorithm',
        'UnsupportedAlgorithm',
      )
    }
    /**
     * Example of how to check auth if giving user-specific results:
     *
     * const requesterDid = await validateAuth(
     *   req,
     *   ctx.cfg.serviceDid,
     *   ctx.didResolver,
     * )
     */

    let pds = "";

    if (feedUri.rkey === "your-pds") {
      const requesterDid = await validateAuth(
        req,
        ctx.cfg.serviceDid,
        ctx.didResolver,
      )
  
      const resolved = await ctx.didResolver.resolveAtprotoData(requesterDid)
      pds = resolved.pds
      if (typeof pds !== "string") throw new InvalidRequestError('No service endpoint', 'NoServiceEndpoint')
    }

    //const pds = "https://oyster.us-east.host.bsky.network"

    const body = await runAlgo(feedUri.rkey, ctx, params, pds)
    return {
      encoding: 'application/json',
      body: body,
    }
  })
}
