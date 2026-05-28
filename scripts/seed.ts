import { mkdir, readdir, stat } from "node:fs/promises"
import { extname, join } from "node:path"
import { ingestRom, openStore, paths } from "@outvie/library"
import { systemFromExtension } from "@outvie/core"

const source = process.argv[2] ?? `${process.env.HOME}/Downloads/roms`
const dataDir = process.env.DATA_DIR ?? "./data"
const dbPath = process.env.DATABASE_PATH ?? "./outvie.db"

const walk = async function* (root: string): AsyncGenerator<string> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (entry.isFile()) {
      if (systemFromExtension(entry.name)) yield full
    }
  }
}

const formatPct = (n: number, total: number) => `${((n / total) * 100).toFixed(1)}%`

const main = async () => {
  const srcInfo = await stat(source).catch(() => null)
  if (!srcInfo?.isDirectory()) {
    console.error(`source folder not found: ${source}`)
    process.exit(1)
  }

  const p = paths(dataDir)
  await mkdir(p.roms, { recursive: true })
  await mkdir(p.saves, { recursive: true })
  await mkdir(p.states, { recursive: true })

  const store = openStore(dbPath)

  const files: string[] = []
  for await (const f of walk(source)) files.push(f)
  console.log(`found ${files.length} rom file${files.length === 1 ? "" : "s"} under ${source}`)
  if (files.length === 0) return

  let added = 0
  let deduped = 0
  let skipped = 0
  let failed = 0
  const start = Date.now()
  const reasons = new Map<string, number>()

  for (let i = 0; i < files.length; i++) {
    const path = files[i]!
    const filename = path.slice(path.lastIndexOf("/") + 1)
    const ext = extname(filename).toLowerCase()
    if (!systemFromExtension(filename)) {
      skipped++
      continue
    }

    const file = Bun.file(path)
    if (file.size === 0) {
      skipped++
      reasons.set("empty source", (reasons.get("empty source") ?? 0) + 1)
      continue
    }

    try {
      const result = await ingestRom({
        filename,
        stream: file.stream(),
        dataRoot: dataDir,
        store,
      })
      if (result.ok) {
        if (result.deduped) deduped++
        else added++
      } else {
        failed++
        reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1)
      }
    } catch (err) {
      failed++
      reasons.set("exception", (reasons.get("exception") ?? 0) + 1)
      console.error(`  ! ${filename}: ${err}`)
    }

    if ((i + 1) % 25 === 0 || i === files.length - 1) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1)
      process.stdout.write(
        `\r  ${i + 1}/${files.length} (${formatPct(i + 1, files.length)})  +${added} =${deduped} ~${skipped} !${failed}  ${elapsed}s   `,
      )
    }
    void ext
  }

  process.stdout.write("\n")
  console.log(
    `done: ${added} added, ${deduped} deduped, ${skipped} skipped, ${failed} failed in ${((Date.now() - start) / 1000).toFixed(1)}s`,
  )
  if (reasons.size > 0) {
    console.log("reasons:")
    for (const [r, n] of reasons) console.log(`  ${r}: ${n}`)
  }
  store.close()
}

await main()
