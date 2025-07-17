import algos from "../algos"

// prevents TS errors
declare var self: Worker;

self.onmessage = async (event: MessageEvent) => {
  const { createDb } = await import("../db/new")
  const db = await createDb(event.data.sqliteLocation)
  const algo = algos[event.data.algo]
  const body = await algo({ db }, event.data.params, event.data.pds)
  postMessage(body)
}
