import { AppContext } from '../config'
import {
  QueryParams,
  OutputSchema as AlgoOutput,
} from '../lexicon/types/app/bsky/feed/getFeedSkeleton'
import * as yourPds from './your-pds'
import * as nonBskyPds from './non-bsky-pds'

type AlgoHandler = (ctx: AppContext, params: QueryParams, pds: string) => Promise<AlgoOutput>

const algos: Record<string, AlgoHandler> = {
  [yourPds.shortname]: yourPds.handler,
  [nonBskyPds.shortname]: nonBskyPds.handler,
}

export default algos
