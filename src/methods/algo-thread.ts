import { join } from "node:path";
import type { AppContext } from "../config";
import type { QueryParams, OutputSchema as AlgoOutput } from "../lexicon/types/app/bsky/feed/getFeedSkeleton";

const workerName = join(__dirname, "worker.ts")

export function runAlgo(algo: string, ctx: AppContext, params: QueryParams, pds?: string): Promise<AlgoOutput> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerName)

    worker.addEventListener("open", () => {
      worker.postMessage({
        algo,
        sqliteLocation: ctx.cfg.sqliteLocation,
        params,
        pds,
      })
    })
    worker.addEventListener("message", event => {
      resolve(event.data)
      worker.terminate()
    })

    worker.onerror = (ev) => {
      reject(ev)
      worker.terminate()
    }
  })
}
