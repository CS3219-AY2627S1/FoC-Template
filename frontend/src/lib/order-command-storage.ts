import type { OrderCommandIntent } from "@/lib/order-commands"

/** Browser inputs/keys only. Never store tokens or credentials. Commit before POST. */
async function database(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) throw new Error("Persistent action storage is unavailable. No request was sent.")
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("foc-order-commands", 1)
    open.onupgradeneeded = () => open.result.createObjectStore("intents")
    open.onsuccess = () => resolve(open.result)
    open.onerror = () => reject(new Error("Could not open persistent action storage. No request was sent."))
  })
}

export async function readOrderIntent(account: string, scope: string): Promise<OrderCommandIntent | null> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("intents", "readonly")
    const read = tx.objectStore("intents").get(JSON.stringify([account, scope]))
    tx.oncomplete = () => { db.close(); resolve(read.result ?? null) }
    tx.onabort = () => { db.close(); reject(new Error("Could not read the saved action.")) }
  })
}

export async function writeOrderIntent(account: string, scope: string, intent: OrderCommandIntent): Promise<OrderCommandIntent> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("intents", "readwrite")
    const store = tx.objectStore("intents"), key = JSON.stringify([account, scope])
    const read = store.get(key)
    let saved = intent
    read.onsuccess = () => {
      if (read.result) saved = read.result // Another tab already owns this logical action.
      else store.put(intent, key)
    }
    tx.oncomplete = () => { db.close(); resolve(saved) }
    tx.onabort = () => { db.close(); reject(new Error("Could not save the action safely. No request was sent.")) }
  })
}

export async function removeOrderIntent(account: string, scope: string, expectedKey?: string): Promise<void> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction("intents", "readwrite")
    const store = tx.objectStore("intents"), key = JSON.stringify([account, scope])
    if (expectedKey === undefined) store.delete(key)
    else {
      const read = store.get(key)
      read.onsuccess = () => { if (read.result?.key === expectedKey) store.delete(key) }
    }
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onabort = () => { db.close(); reject(new Error("Could not clear the completed action.")) }
  })
}
