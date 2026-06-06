import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Game } from "@outvie/core"
import type { Store } from "../store/index.ts"
import { ingestRom } from "./index.ts"

const streamOf = (chunks: Uint8Array[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(c)
      controller.close()
    },
  })

const nesBytes = (extra = 0): Uint8Array => {
  const buf = new Uint8Array(4 + extra)
  buf.set([0x4e, 0x45, 0x53, 0x1a], 0)
  return buf
}

type FakeStore = Store & { inserted: Game[] }

const fakeStore = (existing: Game | null = null): FakeStore => {
  const inserted: Game[] = []
  return {
    inserted,
    list: async () => inserted,
    get: async (id) => inserted.find((g) => g.id === id) ?? null,
    getBySha1: async () => existing,
    insert: async (g) => {
      inserted.push(g)
    },
    update: async (id) => inserted.find((g) => g.id === id) ?? null,
    remove: async () => {},
  }
}

let dataRoot: string

beforeEach(async () => {
  dataRoot = await mkdtemp(join(tmpdir(), "outvie-ingest-"))
})

afterEach(async () => {
  await rm(dataRoot, { recursive: true, force: true })
})

describe("ingestRom", () => {
  test("rejects an empty stream", async () => {
    const store = fakeStore()
    const result = await ingestRom({
      filename: "empty.nes",
      stream: streamOf([]),
      dataRoot,
      store,
    })
    expect(result).toEqual({ ok: false, reason: "empty" })
    expect(store.inserted).toHaveLength(0)
  })

  test("rejects an unsupported file (no magic, unknown extension)", async () => {
    const store = fakeStore()
    const result = await ingestRom({
      filename: "notes.txt",
      stream: streamOf([Uint8Array.from([1, 2, 3, 4])]),
      dataRoot,
      store,
    })
    expect(result).toEqual({ ok: false, reason: "unsupported" })
    expect(store.inserted).toHaveLength(0)
  })

  test("ingests a valid NES rom and inserts a game", async () => {
    const store = fakeStore()
    const result = await ingestRom({
      filename: "Super Mario Bros (USA).nes",
      stream: streamOf([nesBytes(32)]),
      dataRoot,
      store,
      ownerId: 7,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    expect(result.deduped).toBe(false)
    expect(result.game.system).toBe("nes")
    expect(result.game.title).toBe("Super Mario Bros")
    expect(result.game.size).toBe(36)
    expect(result.game.sha1).toMatch(/^[0-9a-f]{40}$/)
    expect(store.inserted).toHaveLength(1)
  })

  test("dedupes by sha1 without inserting a second row", async () => {
    const existing: Game = {
      id: "existing",
      title: "Already Here",
      system: "nes",
      filename: "dup.nes",
      size: 4,
      sha1: "deadbeef",
      addedAt: "2026-01-01T00:00:00.000Z",
    }
    const store = fakeStore(existing)
    const result = await ingestRom({
      filename: "dup.nes",
      stream: streamOf([nesBytes()]),
      dataRoot,
      store,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("expected ok")
    expect(result.deduped).toBe(true)
    expect(result.game).toEqual(existing)
    expect(store.inserted).toHaveLength(0)
  })
})
