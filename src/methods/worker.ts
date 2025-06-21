import algos from "../algos"
import { createDb } from "../db/new"

// prevents TS errors
declare var self: Worker;

self.onmessage = async (event: MessageEvent) => {
  const db = createDb(event.data.sqliteLocation)
  const algo = algos[event.data.algo]
  const body = await algo({ db }, event.data.params, event.data.pds)
  postMessage(body)
}
