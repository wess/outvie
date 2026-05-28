import { mkdir, rename, unlink } from "node:fs/promises"
import { dirname, extname, join } from "node:path"
import { detectSystem, type Game, type System } from "@outvie/core"
import { paths, romPath } from "../paths/index.ts"
import type { Store } from "../store/index.ts"
import { titleFromFilename } from "../title/index.ts"

export type IngestResult =
  | { ok: true; game: Game; deduped: boolean }
  | { ok: false; reason: "unsupported" | "duplicate" | "empty" | "io" }

const HEADER_SAMPLE_BYTES = 16

export const sniffSystem = (filename: string, head?: Uint8Array): System | null => detectSystem(filename, head)

const toHex = (buf: ArrayBuffer): string => {
  let out = ""
  for (const b of new Uint8Array(buf)) out += b.toString(16).padStart(2, "0")
  return out
}

const randomId = (): string => {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let out = ""
  for (const b of bytes) out += b.toString(36).padStart(2, "0").slice(-2)
  return out.slice(0, 16)
}

export type IngestInput = {
  filename: string
  stream: ReadableStream<Uint8Array>
  dataRoot: string
  store: Store
  ownerId?: number | null
}

export const ingestRom = async ({
  filename,
  stream,
  dataRoot,
  store,
  ownerId = null,
}: IngestInput): Promise<IngestResult> => {
  const tmpDir = join(paths(dataRoot).roms, "tmp")
  await mkdir(tmpDir, { recursive: true })

  const tmpPath = join(tmpDir, `${randomId()}${extname(filename) || ".bin"}`)
  const hasher = new Bun.CryptoHasher("sha1")
  let bytesWritten = 0
  let head: Uint8Array | undefined

  const writer = Bun.file(tmpPath).writer()
  const reader = stream.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue
      if (!head) head = value.slice(0, HEADER_SAMPLE_BYTES)
      hasher.update(value)
      writer.write(value)
      bytesWritten += value.length
    }
    await writer.end()
  } catch (err) {
    console.error("[outvie] ingest io error:", err)
    try {
      reader.releaseLock()
    } catch {}
    await Promise.resolve(writer.end()).catch(() => {})
    await unlink(tmpPath).catch(() => {})
    return { ok: false, reason: "io" }
  }

  if (bytesWritten === 0) {
    await unlink(tmpPath).catch(() => {})
    return { ok: false, reason: "empty" }
  }

  const system = sniffSystem(filename, head)
  if (!system) {
    await unlink(tmpPath).catch(() => {})
    return { ok: false, reason: "unsupported" }
  }

  const sha1 = toHex(hasher.digest().buffer as ArrayBuffer)
  const existing = await store.getBySha1(sha1)
  if (existing) {
    await unlink(tmpPath).catch(() => {})
    return { ok: true, game: existing, deduped: true }
  }

  const id = randomId()
  const ext = extname(filename).toLowerCase() || ".bin"
  const finalPath = romPath(dataRoot, system, id, ext)
  await mkdir(dirname(finalPath), { recursive: true })
  await rename(tmpPath, finalPath)

  const game: Game = {
    id,
    title: titleFromFilename(filename),
    system,
    filename,
    size: bytesWritten,
    sha1,
    addedAt: new Date().toISOString(),
  }
  await store.insert(game, ownerId)
  return { ok: true, game, deduped: false }
}
